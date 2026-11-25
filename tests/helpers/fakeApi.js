import { vi } from 'vitest';

export const RESOURCES = [
  { id: 1, name: 'Dr. Priya Sharma', category: 'General Practice', price: 40, emoji: '🩺', color: '#dcfce7', rating: 4.8, description: 'Family doctor.' },
  { id: 2, name: 'Dr. Aisha Khan', category: 'Cardiology', price: 35, emoji: '❤️', color: '#fed7aa', rating: 4.6, description: 'Heart health.' },
  { id: 3, name: 'Dr. Mei Tan', category: 'Paediatrics', price: 45, emoji: '🧸', color: '#dbeafe', rating: 4.7, description: 'Child care.' },
];
export const HOURS = [8, 9, 10, 11];

const clone = (x) => JSON.parse(JSON.stringify(x));
const makeState = (over = {}) => ({
  resources: clone(RESOURCES), bookings: [],
  taken: [], // [{ resourceId, day, hour }]
  failures: [], // regexes tested against "METHOD /path"; a match makes the call throw
  ...over,
});

/** In-memory fake of the whole backend. Mirror every route and error message the real API has. */
function handle(state, path, { method = 'GET', body } = {}) {
  const key = `${method} ${path}`;
  if (state.failures.some((re) => re.test(key))) throw new Error('Server exploded');
  let m;

  if (key === 'GET /resources') return clone(state.resources);
  if ((m = path.match(/^\/resources\/([^/?]+)\/availability\?day=(.+)$/))) {
    const r = state.resources.find((x) => x.id === Number(m[1]));
    if (!r) throw new Error('Resource not found');
    const day = decodeURIComponent(m[2]);
    return {
      day, price: r.price,
      slots: HOURS.map((hour) => ({ hour, booked: state.taken.some((t) => t.resourceId === r.id && t.day === day && t.hour === hour) })),
    };
  }
  if ((m = path.match(/^\/resources\/([^/]+)$/)) && method === 'GET') {
    const n = Number(m[1]);
    if (!Number.isInteger(n)) throw new Error('Invalid id');
    const r = state.resources.find((x) => x.id === n);
    if (!r) throw new Error('Resource not found');
    return clone(r);
  }

  if (key === 'GET /bookings') return clone(state.bookings);
  if (key === 'POST /bookings') {
    const r = state.resources.find((x) => x.id === body.resourceId);
    if (!r) throw new Error('Resource not found');
    if (!Array.isArray(body.hours) || body.hours.length !== 1) throw new Error('Choose one valid time slot');
    if (body.hours.some((hour) => state.taken.some((t) => t.resourceId === r.id && t.day === body.day && t.hour === hour)))
      throw new Error('Sorry, one of those slots was just booked. Pick another time.');
    body.hours.forEach((hour) => state.taken.push({ resourceId: r.id, day: body.day, hour }));
    const booking = {
      id: 'BKG-TEST1', resource: { id: r.id, name: r.name, emoji: r.emoji }, day: body.day,
      hours: [...body.hours].sort((a, b) => a - b), total: r.price * body.hours.length,
      customer: body.customer, status: 'confirmed', createdAt: '2026-11-24T12:00:00.000Z',
    };
    state.bookings.unshift(booking);
    return clone(booking);
  }
  if ((m = path.match(/^\/bookings\/([^/]+)\/cancel$/)) && method === 'POST') {
    const b = state.bookings.find((x) => x.id === m[1]);
    if (!b || b.status !== 'confirmed') throw new Error('Booking not found or already cancelled');
    b.status = 'cancelled';
    state.taken = state.taken.filter((t) => !(t.resourceId === b.resource.id && t.day === b.day && b.hours.includes(t.hour)));
    return clone(b);
  }
  throw new Error(`Unhandled fake route: ${key}`);
}

export const fake = {
  state: makeState(),
  request: vi.fn(),
  /** Reset to a clean backend; pass e.g. { bookings: [...] } to preload state. */
  reset(over) {
    this.state = makeState(over);
    this.request.mockReset();
    this.request.mockImplementation(async (path, opts) => handle(this.state, path, opts));
  },
};
fake.reset();

export const booking = (over = {}) => ({
  id: 'BKG-OLD1', resource: { id: 1, name: 'Dr. Priya Sharma', emoji: '🩺' }, day: '2030-01-02',
  hours: [9, 10], total: 80, customer: { name: 'Ann', email: 'ann@example.com' },
  status: 'confirmed', createdAt: '2026-11-20T10:00:00.000Z', ...over,
});
