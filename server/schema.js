// Idempotent DDL, run on every start. There is no migration tool: changing an EXISTING table
// needs manual SQL on Neon (ALTER TABLE ...), so get the columns right up front.
export const schema = `
-- The bookable thing: doctor (category = specialty). price is the fee PER 1-HOUR APPOINTMENT SLOT.
CREATE TABLE IF NOT EXISTS resources (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL,
  price       NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  emoji       TEXT NOT NULL,
  color       TEXT NOT NULL,
  rating      NUMERIC(2,1) NOT NULL,
  description TEXT NOT NULL,
  work_start  INTEGER NOT NULL DEFAULT 8  CHECK (work_start BETWEEN 0 AND 23),   -- first bookable hour
  work_end    INTEGER NOT NULL DEFAULT 20 CHECK (work_end BETWEEN 1 AND 24),     -- exclusive
  work_days   INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5}'                           -- 0=Sun .. 6=Sat
);
-- Idempotent upgrade for databases created before working hours existed (CREATE IF NOT EXISTS
-- does not add columns to an existing table).
ALTER TABLE resources ADD COLUMN IF NOT EXISTS work_start INTEGER NOT NULL DEFAULT 8  CHECK (work_start BETWEEN 0 AND 23);
ALTER TABLE resources ADD COLUMN IF NOT EXISTS work_end   INTEGER NOT NULL DEFAULT 20 CHECK (work_end BETWEEN 1 AND 24);
ALTER TABLE resources ADD COLUMN IF NOT EXISTS work_days  INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5}';

-- client_id is an anonymous browser id for now; swap for a user id when auth is added.
-- resource_name/emoji and total are snapshots so history survives catalog edits.
CREATE TABLE IF NOT EXISTS bookings (
  id             TEXT PRIMARY KEY,
  client_id      TEXT NOT NULL,
  resource_id    INTEGER NOT NULL REFERENCES resources(id),
  resource_name  TEXT NOT NULL,
  resource_emoji TEXT NOT NULL,
  day            DATE NOT NULL,
  hours          INTEGER[] NOT NULL,
  total          NUMERIC(10,2) NOT NULL,
  customer       JSONB NOT NULL,
  status         TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bookings_client_idx ON bookings (client_id, created_at DESC);

-- One row per occupied slot. The PRIMARY KEY is what makes double-booking impossible, even under
-- concurrent requests: the second insert fails with 23505 and the whole transaction rolls back.
-- Cancelling deletes these rows (frees the slot) but keeps the bookings row as history.
CREATE TABLE IF NOT EXISTS booking_slots (
  booking_id  TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  resource_id INTEGER NOT NULL REFERENCES resources(id),
  day         DATE NOT NULL,
  hour        INTEGER NOT NULL CHECK (hour BETWEEN 0 AND 23),
  PRIMARY KEY (resource_id, day, hour)
);
`;
