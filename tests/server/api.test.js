// @vitest-environment node
import express from 'express';
import request from 'supertest';
import { vi } from 'vitest';

// Replace the Neon pool with an in-memory Postgres (PGlite) so the REAL SQL in server/api.js runs.
// `control.failOn` makes matching statements fail, to exercise error handling and rollback.
// PGlite is single-connection, so true concurrent races cannot be tested here (verify on real Postgres).
vi.mock('../../server/db.js', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { schema } = await import('../../server/schema.js');
  const { resources } = await import('../../server/seed.js');
  const db = new PGlite();
  await db.exec(schema);
  for (const r of resources)
    await db.query(
      'INSERT INTO resources (id,name,category,price,emoji,color,rating,description,work_start,work_end,work_days) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
      [r.id, r.name, r.category, r.price, r.emoji, r.color, r.rating, r.description, r.workStart, r.workEnd, r.workDays]
    );
  // Doctors 1 and 2 work every day (08:00-16:00 / 12:00-20:00) so tests may use any future date;
  // working-day rules are tested on doctor 3 (Mon/Wed/Fri 09:00-15:00).
  await db.query("UPDATE resources SET work_days = '{0,1,2,3,4,5,6}' WHERE id IN (1, 2)");
  const control = { failOn: null };
  const run = async (text, params) => {
    if (control.failOn?.test(text)) throw new Error('simulated db failure');
    const r = await db.query(text, params);
    return { ...r, rowCount: r.affectedRows ?? r.rows.length };
  };
  return {
    control,
    query: run,
    pool: { query: run, connect: async () => ({ query: run, release() {} }) },
  };
});

const { api, SLOT_HOURS } = await import('../../server/api.js');
const { control } = await import('../../server/db.js');

const app = express().use('/api', api);
let n = 0;
const newClient = () => `client-${String(++n).padStart(4, '0')}-test`;
const as = (id) => ({
  get: (u) => request(app).get(u).set('X-Client-Id', id),
  post: (u, b) => request(app).post(u).set('X-Client-Id', id).send(b),
});
const customer = { name: 'Ann Lee', email: 'ann@example.com' };
// A date safely in the future, built from UTC parts so it never depends on the machine timezone.
const future = (days = 30) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const book = (c, over = {}) => c.post('/api/bookings', { resourceId: 1, day: future(), hours: [9], customer, ...over });

// First date >= `from` days ahead that falls on weekday `dow` (0=Sun .. 6=Sat), as YYYY-MM-DD.
const onWeekday = (dow, from = 60) => {
  for (let i = from; ; i++) {
    const d = future(i);
    if (new Date(`${d}T00:00:00Z`).getUTCDay() === dow) return d;
  }
};

afterEach(() => { control.failOn = null; });
vi.spyOn(console, 'error').mockImplementation(() => {});

describe('health', () => {
  it('reports ok when the database answers', async () => {
    const res = await request(app).get('/api/health');
    expect(res.body).toEqual({ ok: true });
  });

  it('returns 500 with a generic message when the database fails (no leak)', async () => {
    control.failOn = /SELECT 1/;
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });
});

describe('resources', () => {
  it('lists resources with numeric price and rating', async () => {
    const res = await request(app).get('/api/resources');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(typeof res.body[0].price).toBe('number');
    expect(typeof res.body[0].rating).toBe('number');
  });

  it('returns one resource, 404s unknown ids and 400s malformed ids', async () => {
    expect((await request(app).get('/api/resources/1')).body).toMatchObject({ id: 1 });
    expect((await request(app).get('/api/resources/999')).status).toBe(404);
    expect((await request(app).get('/api/resources/abc')).status).toBe(400);
  });

  it('reports availability and marks booked slots', async () => {
    const c = as(newClient());
    const day = future(31);
    let res = await request(app).get(`/api/resources/1/availability?day=${day}`);
    expect(res.body.day).toBe(day);
    expect(res.body.slots.map((s) => s.hour)).toEqual(SLOT_HOURS.filter((h) => h < 16)); // doctor 1: 08:00-16:00
    expect(res.body.slots.every((s) => !s.booked)).toBe(true);

    await book(c, { day, hours: [10] });
    res = await request(app).get(`/api/resources/1/availability?day=${day}`);
    expect(res.body.slots.filter((s) => s.booked).map((s) => s.hour)).toEqual([10]);
  });

  it('validates availability input', async () => {
    expect((await request(app).get('/api/resources/1/availability')).status).toBe(400);
    expect((await request(app).get('/api/resources/1/availability?day=2030-02-31')).status).toBe(400);
    expect((await request(app).get(`/api/resources/999/availability?day=${future()}`)).status).toBe(404);
  });
});

describe('bookings', () => {
  it('requires a valid X-Client-Id', async () => {
    expect((await request(app).get('/api/bookings')).status).toBe(400);
    expect((await request(app).get('/api/bookings').set('X-Client-Id', 'bad id!')).status).toBe(400);
  });

  it('creates a booking with a server-computed total and a YYYY-MM-DD day', async () => {
    const c = as(newClient());
    const day = future(40);
    const res = await book(c, { day, hours: [11] });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      resource: { id: 1, name: 'Dr. Priya Sharma' }, day, hours: [11], total: 60, status: 'confirmed',
    });
    expect(res.body.id).toMatch(/^BKG-[0-9A-F]{8}$/);

    const list = (await c.get('/api/bookings')).body;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: res.body.id, day, hours: [11], total: 60 });
  });

  it('scopes bookings to the client', async () => {
    const a = as(newClient());
    await book(a, { day: future(41) });
    expect((await as(newClient()).get('/api/bookings')).body).toEqual([]);
  });

  it('409s when a slot is already taken and leaves nothing behind (rollback)', async () => {
    const day = future(42);
    expect((await book(as(newClient()), { day, hours: [9] })).status).toBe(201);
    const other = as(newClient());
    const res = await book(other, { day, hours: [9] }); // already taken
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/just booked/);
    expect((await other.get('/api/bookings')).body).toEqual([]);
    const avail = (await request(app).get(`/api/resources/1/availability?day=${day}`)).body;
    expect(avail.slots.find((s) => s.hour === 8).booked).toBe(false); // slot 8 was rolled back
  });

  it('allows the same hour on another day or another resource', async () => {
    const c = as(newClient());
    const day = future(43);
    await book(c, { day, hours: [9] });
    expect((await book(c, { day: future(44), hours: [9] })).status).toBe(201);
    expect((await book(c, { day, hours: [12], resourceId: 2 })).status).toBe(201);
  });

  it.each([
    ['unknown resource', { resourceId: 999 }, 404],
    ['bad resource id', { resourceId: 'x' }, 400],
    ['no hours', { hours: [] }, 400],
    ['hours not an array', { hours: 9 }, 400],
    ['hour outside opening times', { hours: [3] }, 400],
    ['duplicate hours', { hours: [9, 9] }, 400],
    ['more than one slot', { hours: [9, 10] }, 400],
    ['bad day', { day: 'tomorrow' }, 400],
    ['day in the past', { day: '2020-01-01' }, 400],
    ['missing name', { customer: { email: 'a@b.co' } }, 400],
    ['bad email', { customer: { name: 'Ann', email: 'nope' } }, 400],
  ])('rejects %s', async (_label, over, status) => {
    const res = await book(as(newClient()), over);
    expect(res.status).toBe(status);
    expect(res.body.error).toBeTruthy();
  });

  it('rolls back everything when a later statement fails and hides the SQL error', async () => {
    const c = as(newClient());
    control.failOn = /INSERT INTO booking_slots/;
    const res = await book(c, { day: future(45) });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
    control.failOn = null;
    expect((await c.get('/api/bookings')).body).toEqual([]);
  });

  it('cancels a booking, frees the slots and keeps the history', async () => {
    const c = as(newClient());
    const day = future(46);
    const { body: b } = await book(c, { day, hours: [9] });
    const res = await c.post(`/api/bookings/${b.id}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
    expect((await c.get('/api/bookings')).body[0].status).toBe('cancelled');
    expect((await book(as(newClient()), { day, hours: [9] })).status).toBe(201); // slot is free again
  });

  it('404s cancelling twice, someone else\'s booking, or an unknown id', async () => {
    const c = as(newClient());
    const { body: b } = await book(c, { day: future(47) });
    expect((await as(newClient()).post(`/api/bookings/${b.id}/cancel`)).status).toBe(404);
    await c.post(`/api/bookings/${b.id}/cancel`);
    expect((await c.post(`/api/bookings/${b.id}/cancel`)).status).toBe(404);
    expect((await c.post('/api/bookings/NOPE/cancel')).status).toBe(404);
  });

  it('rolls back a cancel when freeing the slots fails', async () => {
    const c = as(newClient());
    const { body: b } = await book(c, { day: future(48) });
    control.failOn = /DELETE FROM booking_slots/;
    expect((await c.post(`/api/bookings/${b.id}/cancel`)).status).toBe(500);
    control.failOn = null;
    expect((await c.get('/api/bookings')).body[0].status).toBe('confirmed');
  });
});

describe('errors', () => {
  it('404s unknown routes and 400s malformed JSON', async () => {
    expect((await request(app).get('/api/nope')).status).toBe(404);
    const res = await request(app).post('/api/bookings').set('X-Client-Id', newClient()).set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid JSON');
  });
});

describe('working hours', () => {
  // Doctor 3: Mon/Wed/Fri, 09:00-15:00 (last bookable start 14:00).
  const doc3 = (over = {}) => book(as(newClient()), { resourceId: 3, ...over });

  it('exposes working hours on the doctor', async () => {
    expect((await request(app).get('/api/resources/3')).body).toMatchObject({ workStart: 9, workEnd: 15, workDays: [1, 3, 5] });
  });

  it('offers only the working hours on a working day and nothing on a day off', async () => {
    const mon = (await request(app).get(`/api/resources/3/availability?day=${onWeekday(1)}`)).body;
    expect(mon.slots.map((x) => x.hour)).toEqual([9, 10, 11, 12, 13, 14]);
    const tue = (await request(app).get(`/api/resources/3/availability?day=${onWeekday(2)}`)).body;
    expect(tue.slots).toEqual([]);
  });

  it('books inside working hours, including the last slot', async () => {
    expect((await doc3({ day: onWeekday(1, 61), hours: [14] })).status).toBe(201);
  });

  it.each([
    ['before opening', 1, 8],
    ['at closing time', 1, 15],
    ['on a day off', 2, 10],
  ])('rejects a booking %s', async (_label, dow, hour) => {
    const res = await doc3({ day: onWeekday(dow, 68), hours: [hour] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('The doctor is not available at that time');
  });
});
