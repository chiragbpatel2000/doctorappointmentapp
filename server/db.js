import pg from 'pg';
import { resources } from './seed.js';
import { schema } from './schema.js';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and add your Neon connection string.');
  process.exit(1);
}

// node-postgres (not @neondatabase/serverless): booking needs real multi-statement transactions.
// Neon connection strings already include sslmode=require.
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
// Neon suspends idle compute; a dropped idle client must not crash the process.
pool.on('error', (err) => console.error('Idle pg client error:', err.message));

export const query = (text, params) => pool.query(text, params);

// The DDL lives in schema.js (not here) so tests can load the real schema into PGlite without DATABASE_URL.
export async function initDb() {
  await pool.query(schema);
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM resources');
  if (rows[0].n === 0) {
    for (const r of resources) {
      await pool.query(
        `INSERT INTO resources (id,name,category,price,emoji,color,rating,description)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
        [r.id, r.name, r.category, r.price, r.emoji, r.color, r.rating, r.description]
      );
    }
    console.log(`Seeded ${resources.length} resources`);
  }
}
