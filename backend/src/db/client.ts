import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://preschool:preschool@localhost:5434/preschool',
  max: 10,
});

export const db = drizzle(pool, { schema });
export type DB = typeof db;
