import { defineConfig } from 'drizzle-kit';

const fallbackUrl = 'postgres://preschool:preschool@localhost:5434/preschool';
if (!process.env.DATABASE_URL) {
  console.warn(`[drizzle-kit] DATABASE_URL not set, using fallback ${fallbackUrl}`);
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? fallbackUrl,
  },
});
