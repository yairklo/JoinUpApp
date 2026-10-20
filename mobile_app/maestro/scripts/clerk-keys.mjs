// Loads the Clerk DEVELOPMENT keys without ever printing them.
// Source order: env vars -> file named by E2E_CLERK_KEYS_FILE -> maestro/local/.env.e2e.
// A file may be KEY=VALUE lines, or bare lines whose values are recognised by prefix
// (pk_test_... = publishable, sk_test_... = secret).
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const LOCAL_FILE = join(resolve(here, '..', 'local'), '.env.e2e');
// This machine's shared file (outside the repo); other machines use E2E_CLERK_KEYS_FILE or the local file.
const MACHINE_FILE = 'C:/JoinUpApp/server/.env.maestro';
export const DEFAULT_KEYS_FILE = process.env.E2E_CLERK_KEYS_FILE
  || (existsSync(LOCAL_FILE) ? LOCAL_FILE : MACHINE_FILE);

export function loadClerkKeys() {
  let pub = process.env.CLERK_PUBLISHABLE_KEY || process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
  let secret = process.env.CLERK_SECRET_KEY || '';
  if ((!pub || !secret) && existsSync(DEFAULT_KEYS_FILE)) {
    for (const raw of readFileSync(DEFAULT_KEYS_FILE, 'utf8').split(/\r?\n/)) {
      const v = raw.trim().replace(/^[A-Z0-9_]+\s*=\s*/, '').replace(/^['"]|['"]$/g, '');
      if (v.startsWith('pk_test_') && !pub) pub = v;
      if (v.startsWith('sk_test_') && !secret) secret = v;
    }
  }
  if (!pub.startsWith('pk_test_') || !secret.startsWith('sk_test_')) {
    console.error(`Need Clerk DEVELOPMENT keys (pk_test_/sk_test_) via env or ${DEFAULT_KEYS_FILE} (override with E2E_CLERK_KEYS_FILE). `
      + 'Refusing to use live keys.');
    process.exit(1);
  }
  return { pub, secret };
}
