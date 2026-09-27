import 'dotenv/config';
import { buildApp } from './app';

const port = Number(process.env.PORT ?? 4000);

async function main() {
  const app = buildApp();
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`preschool-api listening on :${port}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
