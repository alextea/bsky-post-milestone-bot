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

  // The post a reply was made to
  await pool.query('ALTER TABLE bot_posts ADD COLUMN IF NOT EXISTS subject_uri TEXT');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
}

export async function getState(key) {
  const result = await pool.query('SELECT value FROM bot_state WHERE key = $1', [key]);
  return result.rows.length > 0 ? result.rows[0].value : null;
}

export async function setState(key, value) {
  await pool.query(
    `INSERT INTO bot_state (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value]
  );
}

export async function hasRepliedTo(subjectUri) {
  const result = await pool.query('SELECT 1 FROM bot_posts WHERE subject_uri = $1 LIMIT 1', [subjectUri]);
  return result.rows.length > 0;
}

export async function countRecentReplies(did, hours) {
  const result = await pool.query(
    `SELECT COUNT(*) AS count FROM bot_posts
     WHERE did = $1 AND post_type = 'reply' AND posted_at > NOW() - INTERVAL '1 hour' * $2`,
    [did, hours]
  );
  return parseInt(result.rows[0].count, 10);
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

export async function recordPost(did, postType, milestone, postUri, subjectUri = null) {
  await pool.query(
    'INSERT INTO bot_posts (did, post_type, milestone, post_uri, subject_uri) VALUES ($1, $2, $3, $4, $5)',
    [did, postType, milestone, postUri, subjectUri]
  );
}

export async function closeDatabase() {
  if (pool) {
    await pool.end();
  }
}
