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

// prisma.config.ts sends CLI commands (including `db execute`) to DIRECT_URL
// when it is set, so that is the URL a script actually hits. DATABASE_URL is
// what the app uses. If the two name different hosts, somebody repointed only
// one of them for a deploy and the "target" printed here could lie — refuse.
const directUrl = process.env.DIRECT_URL;
const appUrl = process.env.DATABASE_URL;
const url = directUrl || appUrl;
if (!url) {
  console.error('\n  Neither DIRECT_URL nor DATABASE_URL is set — refusing to continue.\n');
  process.exit(1);
}

function hostOf(value, name) {
  try {
    return new URL(value).host;
  } catch {
    console.error(`\n  ${name} is not a valid URL — refusing to continue.\n`);
    process.exit(1);
  }
}

const host = hostOf(url, directUrl ? 'DIRECT_URL' : 'DATABASE_URL');
if (directUrl && appUrl) {
  const appHost = hostOf(appUrl, 'DATABASE_URL');
  if (new URL(url).hostname !== new URL(appUrl).hostname) {
    console.error(
      `\n  DIRECT_URL (${host}) and DATABASE_URL (${appHost}) point at different` +
        ' hosts — refusing to continue until both name the same database.\n',
    );
    process.exit(1);
  }
}

const bar = '='.repeat(60);
console.log(`\n${bar}`);
console.log(`  TARGET DATABASE: ${host}`);
console.log('  This script MODIFIES data. Ctrl-C now if that is not the');
console.log('  database you intended.');
console.log(`${bar}\n`);
