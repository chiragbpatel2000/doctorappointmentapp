# DocBook – doctor appointment booking

React 19 + Vite SPA served by one Express process; Neon Postgres via `pg`; Vitest tests. Deployed as one Render web service (`render.yaml`).

## Commands
- `npm run dev` – server + Vite middleware (`--dev` flag, not NODE_ENV). Needs `DATABASE_URL` in `.env` (see `.env.example`).
- `npm run lint` · `npm test` · `npm run test:coverage` (thresholds in `vite.config.js`) · `npm run build` · `npm start`

## Domain model
- "resource" = a doctor (`category` = specialty, `price` = fee per 1-hour slot). Table/route names kept generic (`resources`, `bookings`) on purpose; UI copy says doctor/appointment.
- An appointment is exactly one slot (`hours` array of length 1, enforced in `POST /bookings`; the UI is single-select). Existing multi-hour rows, if any, still display.
- Slots are hourly. `SLOT_HOURS` (08:00–19:00) in `server/api.js` is the outer bound; each doctor narrows it with `work_start`/`work_end` (end exclusive) and `work_days` (0=Sun..6=Sat) on `resources`. `slotsFor()` is the single source of truth: the availability endpoint returns `[]` on a day off, and `POST /bookings` rejects times outside it (400). The client never hardcodes hours.
- Schema upgrade: `schema.js` adds the working-hours columns with idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (defaults 08–20, Mon–Fri). Seed only runs on an empty table, so for an existing database set each doctor's hours with a one-off `UPDATE` (done on Neon on 2026-11-25).
- Server tests set doctors 1 and 2 to work every day so tests can use any future date; working-day rules are tested on doctor 3.
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
- 30-minute slots, per-doctor lunch breaks and time-off/holidays are not implemented.
