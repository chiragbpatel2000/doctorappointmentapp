import { randomBytes } from 'node:crypto';
import express from 'express';
import { pool, query } from './db.js';

export const api = express.Router();
api.use(express.json());

const RESOURCE_COLS = `r.id, r.name, r.category, r.price::float8 AS price, r.emoji, r.color,
                       r.rating::float8 AS rating, r.description,
                       r.work_start AS "workStart", r.work_end AS "workEnd", r.work_days AS "workDays"`;

// Outer bounds of bookable start hours (08:00 .. 19:00). Each doctor narrows this with
// work_start/work_end/work_days. The client never hardcodes hours: it reads them from
// /resources/:id/availability, so the server is the single source of truth.
export const SLOT_HOURS = Array.from({ length: 12 }, (_, i) => i + 8);

// Hours a doctor can be booked on a given YYYY-MM-DD day ([] when they don't work that weekday).
const slotsFor = (r, day) => {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  return r.work_days.includes(dow) ? SLOT_HOURS.filter((h) => h >= r.work_start && h < r.work_end) : [];
};

const round2 = (n) => Math.round(n * 100) / 100;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Wrap async handlers so rejections reach the error middleware (Express 5 does this too; explicit for clarity).
const h = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const parseId = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Invalid id');
  return n;
};

// Days are plain 'YYYY-MM-DD' strings end to end. NEVER let pg turn a DATE into a JS Date (timezone
// shifts the day): select `day::text`. Past days are rejected, with one day of slack for timezones.
const parseDay = (v) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v)
    throw new HttpError(400, 'Invalid date');
  return v;
};
const assertNotPast = (day) => {
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  if (day < cutoff) throw new HttpError(400, 'Date is in the past');
};

// Identify the user. Anonymous for now; replace with the authenticated user later.
api.use((req, _res, next) => {
  const id = req.get('x-client-id');
  req.clientId = id && /^[\w-]{8,64}$/.test(id) ? id : null;
  next();
});
const needClient = (req, _res, next) =>
  req.clientId ? next() : next(new HttpError(400, 'Missing or invalid X-Client-Id header'));

api.get('/health', h(async (_req, res) => {
  await query('SELECT 1');
  res.json({ ok: true });
}));

/* ---------- resources ---------- */
api.get('/resources', h(async (_req, res) => {
  const { rows } = await query(`SELECT ${RESOURCE_COLS} FROM resources r ORDER BY r.id`);
  res.json(rows);
}));

api.get('/resources/:id', h(async (req, res) => {
  const { rows } = await query(`SELECT ${RESOURCE_COLS} FROM resources r WHERE r.id = $1`, [parseId(req.params.id)]);
  if (!rows[0]) throw new HttpError(404, 'Resource not found');
  res.json(rows[0]);
}));

api.get('/resources/:id/availability', h(async (req, res) => {
  const id = parseId(req.params.id);
  const day = parseDay(req.query.day);
  const { rows: found } = await query('SELECT price::float8 AS price, work_start, work_end, work_days FROM resources WHERE id = $1', [id]);
  if (!found[0]) throw new HttpError(404, 'Resource not found');
  const { rows } = await query('SELECT hour FROM booking_slots WHERE resource_id = $1 AND day = $2', [id, day]);
  const taken = new Set(rows.map((r) => r.hour));
  res.json({ day, price: found[0].price, slots: slotsFor(found[0], day).map((hour) => ({ hour, booked: taken.has(hour) })) });
}));

/* ---------- bookings ---------- */
const BOOKING_COLS = `id, resource_id, resource_name, resource_emoji, day::text AS day, hours,
                      total::float8 AS total, customer, status, created_at`;

const shapeBooking = (b) => ({
  id: b.id,
  resource: { id: b.resource_id, name: b.resource_name, emoji: b.resource_emoji },
  day: b.day,
  hours: b.hours,
  total: b.total,
  customer: b.customer,
  status: b.status,
  createdAt: b.created_at,
});

api.get('/bookings', needClient, h(async (req, res) => {
  const { rows } = await query(
    `SELECT ${BOOKING_COLS} FROM bookings WHERE client_id = $1 ORDER BY created_at DESC, id`,
    [req.clientId]
  );
  res.json(rows.map(shapeBooking));
}));

const CUSTOMER_FIELDS = ['name', 'email'];

// One transaction: validate -> insert booking -> insert slots. The booking_slots PRIMARY KEY is the
// real guard against double-booking; we translate its violation (23505) into a friendly 409.
api.post('/bookings', needClient, h(async (req, res) => {
  const resourceId = parseId(req.body?.resourceId);
  const day = parseDay(req.body?.day);
  assertNotPast(day);

  const hours = req.body?.hours;
  // An appointment is exactly one slot. The payload keeps the `hours` array shape for compatibility.
  if (!Array.isArray(hours) || hours.length !== 1 || !SLOT_HOURS.includes(hours[0]))
    throw new HttpError(400, 'Choose one valid time slot');

  const customer = {};
  for (const f of CUSTOMER_FIELDS) {
    const v = req.body?.customer?.[f];
    if (typeof v !== 'string' || !v.trim() || v.length > 200) throw new HttpError(400, `Customer ${f} is required`);
    customer[f] = v.trim();
  }
  if (!/^\S+@\S+\.\S+$/.test(customer.email)) throw new HttpError(400, 'Enter a valid email');

  const sorted = [...hours].sort((a, b) => a - b);
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const { rows } = await db.query('SELECT id, name, emoji, price::float8 AS price, work_start, work_end, work_days FROM resources WHERE id = $1', [resourceId]);
    const resource = rows[0];
    if (!resource) throw new HttpError(404, 'Resource not found');
    if (!slotsFor(resource, day).includes(sorted[0])) throw new HttpError(400, 'The doctor is not available at that time');

    const total = round2(resource.price * sorted.length); // price is always recomputed server-side
    const id = 'BKG-' + randomBytes(4).toString('hex').toUpperCase();
    const ins = await db.query(
      `INSERT INTO bookings (id, client_id, resource_id, resource_name, resource_emoji, day, hours, total, customer)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING created_at`,
      [id, req.clientId, resource.id, resource.name, resource.emoji, day, sorted, total, customer]
    );
    for (const hour of sorted)
      await db.query('INSERT INTO booking_slots (booking_id, resource_id, day, hour) VALUES ($1,$2,$3,$4)', [id, resource.id, day, hour]);
    await db.query('COMMIT');

    res.status(201).json(shapeBooking({
      id, resource_id: resource.id, resource_name: resource.name, resource_emoji: resource.emoji,
      day, hours: sorted, total, customer, status: 'confirmed', created_at: ins.rows[0].created_at,
    }));
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {});
    if (e.code === '23505') throw new HttpError(409, 'Sorry, one of those slots was just booked. Pick another time.');
    throw e;
  } finally {
    db.release();
  }
}));

// Cancel frees the slots (deletes booking_slots rows) and keeps the booking as history.
api.post('/bookings/:id/cancel', needClient, h(async (req, res) => {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const { rows } = await db.query(
      `UPDATE bookings SET status = 'cancelled'
        WHERE id = $1 AND client_id = $2 AND status = 'confirmed' RETURNING ${BOOKING_COLS}`,
      [String(req.params.id), req.clientId]
    );
    if (!rows[0]) throw new HttpError(404, 'Booking not found or already cancelled');
    await db.query('DELETE FROM booking_slots WHERE booking_id = $1', [rows[0].id]);
    await db.query('COMMIT');
    res.json(shapeBooking(rows[0]));
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    db.release();
  }
}));

/* ---------- errors ---------- */
api.use((_req, _res, next) => next(new HttpError(404, 'Not found')));
// eslint-disable-next-line no-unused-vars
api.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') err = new HttpError(400, 'Invalid JSON');
  const status = err.status ?? 500;
  if (status >= 500) console.error(err);
  // Never leak SQL/driver errors: 5xx always returns a generic message.
  res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
});
