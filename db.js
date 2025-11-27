// db.js
import 'dotenv/config';
import pkg from 'pg';

const { Pool } = pkg;

export const pool = new Pool(); // uses PG* env vars

export async function query(text, params) {
    const res = await pool.query(text, params);
    return res.rows;
}
