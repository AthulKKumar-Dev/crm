// Print the database a script is about to hit, loudly.
//
// `prisma db execute` does NOT echo the "Datasource ..." line that `migrate`
// commands print, so there is no feedback about which database a data-fixing
// script ran against. On 2026-08-03 that gap let a dedupe script intended for
// a dev database run against production (server/.env had been repointed for a
// deploy) and cancel five live GST invoices.
//
// Chained ahead of any destructive db:fix:* script so the target is always on
// screen before the change happens.

// Optional: dotenv is a devDependency, and the runtime image builds with
// `npm ci --omit=dev`, so the module is absent inside the container. It isn't
// needed there — server/docker-compose.yml passes `env_file: .env`, so
// DATABASE_URL is already a real environment variable. Only a developer shell
// needs the .env load. Do NOT make this require unconditional: it would throw
// MODULE_NOT_FOUND in the container and, because the npm script chains with
// `&&`, the SQL would silently never run.
try {
  require('dotenv/config');
} catch {
  // Running without dotenv — env vars are expected to be set already.
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('\n  DATABASE_URL is not set — refusing to continue.\n');
  process.exit(1);
}

let host;
try {
  host = new URL(url).host;
} catch {
  console.error('\n  DATABASE_URL is not a valid URL — refusing to continue.\n');
  process.exit(1);
}

const bar = '='.repeat(60);
console.log(`\n${bar}`);
console.log(`  TARGET DATABASE: ${host}`);
console.log('  This script MODIFIES data. Ctrl-C now if that is not the');
console.log('  database you intended.');
console.log(`${bar}\n`);
