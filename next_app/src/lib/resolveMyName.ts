/** Our DB name is the source of truth; Clerk's name is only a fallback while loading or when empty. */
export function resolveMyName(dbName: string | null | undefined, clerkName: string | null | undefined): string {
    return dbName?.trim() || clerkName?.trim() || '';
}
