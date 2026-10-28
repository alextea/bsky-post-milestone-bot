import pg from 'pg';
const { Pool } = pg;

let pool;

export function initDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  return pool;
}

export async function createTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS followers (
      did TEXT PRIMARY KEY,
      handle TEXT NOT NULL,
      followed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      last_post_count INTEGER,
      next_milestone INTEGER,
      welcomed_at TIMESTAMPTZ,
      last_weekly_at TIMESTAMPTZ,
      last_anniversary_year INTEGER,
      last_posted_at TIMESTAMPTZ
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_posts (
      id SERIAL PRIMARY KEY,
      did TEXT NOT NULL,
      post_type TEXT NOT NULL,
      milestone INTEGER,
      post_uri TEXT,
      posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function getFollowers() {
  const result = await pool.query('SELECT * FROM followers');
  return result.rows;
}

export async function insertFollower(follower) {
  await pool.query(
    `INSERT INTO followers (did, handle, last_post_count, next_milestone)
     VALUES ($1, $2, $3, $4)`,
    [follower.did, follower.handle, follower.last_post_count, follower.next_milestone]
  );
}

export async function setFollowersActive(dids, active) {
  if (dids.length === 0) {
    return;
  }

  await pool.query(
    'UPDATE followers SET active = $1 WHERE did = ANY($2)',
    [active, dids]
  );
}

const UPDATABLE_COLUMNS = [
  'handle', 'last_post_count', 'next_milestone', 'welcomed_at',
  'last_weekly_at', 'last_anniversary_year', 'last_posted_at'
];

export async function updateFollower(did, fields) {
  const columns = Object.keys(fields).filter(column => UPDATABLE_COLUMNS.includes(column));
  if (columns.length === 0) {
    return;
  }

  const assignments = columns.map((column, i) => `${column} = $${i + 2}`).join(', ');
  await pool.query(
    `UPDATE followers SET ${assignments} WHERE did = $1`,
    [did, ...columns.map(column => fields[column])]
  );
}

export async function recordPost(did, postType, milestone, postUri) {
  await pool.query(
    'INSERT INTO bot_posts (did, post_type, milestone, post_uri) VALUES ($1, $2, $3, $4)',
    [did, postType, milestone, postUri]
  );
}

export async function closeDatabase() {
  if (pool) {
    await pool.end();
  }
}
