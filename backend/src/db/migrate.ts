import 'dotenv/config';
import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db } from './client';

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set (e.g. postgres://preschool:preschool@localhost:5434/preschool)');
  }
  // Resolve relative to this file so `npm run db:migrate` works from any cwd.
  const migrationsFolder = path.join(__dirname, '../../drizzle');
  await migrate(db, { migrationsFolder });
  console.log('migrations applied');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
