// server/db.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://postgres@localhost:5432/notescape', // <- adjust if your DB/port differ
});

export default {
  query: (text, params) => pool.query(text, params),
};
