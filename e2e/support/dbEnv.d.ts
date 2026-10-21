export function hostOf(databaseUrl: string): string;
export function canonicalHost(host: string): string;
export function databaseNameOf(databaseUrl: string): string;
export function shellDatabaseProblems(env?: NodeJS.ProcessEnv): string[];
export function assertShellDatabaseUrls(env?: NodeJS.ProcessEnv): void;
export function explicitProcessEnv(
  source: NodeJS.ProcessEnv,
  overrides?: Record<string, string | undefined>
): NodeJS.ProcessEnv;
