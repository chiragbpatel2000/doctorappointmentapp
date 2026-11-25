# DocBook – doctor appointment booking

React 19 + Vite SPA served by one Express process; Neon Postgres via `pg`; Vitest tests. Deployed as one Render web service (`render.yaml`).

## Commands
- `npm run dev` – server + Vite middleware (`--dev` flag, not NODE_ENV). Needs `DATABASE_URL` in `.env` (see `.env.example`).
- `npm run lint` · `npm test` · `npm run test:coverage` (thresholds in `vite.config.js`) · `npm run build` · `npm start`

## Domain model
- "resource" = a doctor (`category` = specialty, `price` = fee per 1-hour slot). Table/route names kept generic (`resources`, `bookings`) on purpose; UI copy says doctor/appointment.
- Slots are hourly, 08:00–19:00, defined by `SLOT_HOURS` in `server/api.js` and served via the availability endpoint (the client never hardcodes them).
- Double-booking is prevented by `PRIMARY KEY (resource_id, day, hour)` on `booking_slots`; API maps 23505 to 409.
- Identity is an anonymous `X-Client-Id` (localStorage UUID). Demo-grade: real patient data needs auth and HIPAA/GDPR review.

## Rules easy to break
- DDL is in `server/schema.js`, idempotent, no migrations: changing an existing Neon table needs manual SQL.
- `tests/helpers/fakeApi.js` must mirror `server/api.js` routes and error strings exactly.
- Totals/prices are recomputed server-side. 5xx returns only `Internal server error`.
- Coverage excludes `server/db.js`, `server/index.js`, `src/main.jsx`.

## Testing
Frontend tests mock `src/api/client.js` with the fake API. Server tests run real SQL on PGlite (single connection: real concurrency races are not testable there).

## Known gaps
- An appointment can still span several consecutive hours (template behaviour); per-doctor working hours and 30-minute slots are not implemented.
