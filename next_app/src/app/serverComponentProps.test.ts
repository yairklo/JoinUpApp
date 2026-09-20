import fs from "fs";
import path from "path";

/**
 * Regression guard for the guest crash on /games/[id]: an `sx` theme callback such as
 * `zIndex: (t) => t.zIndex.appBar - 1` written inline in a Server Component is a function passed
 * across the server/client boundary, which throws at render time (redacted in production as
 * "An error occurred in the Server Components render"). Such styles must live in a
 * "use client" component.
 */
function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.tsx$/.test(entry.name) ? [full] : [];
  });
}

const THEME_CALLBACK = /\(\s*(t|theme)\s*\)\s*=>/;

describe("server components", () => {
  const appDir = __dirname;
  const serverPages = walk(appDir).filter((file) => {
    const head = fs.readFileSync(file, "utf8").split(/\r?\n/).slice(0, 5).join("\n");
    return !/["']use client["']/.test(head);
  });

  test("finds the server components it is meant to guard", () => {
    expect(serverPages.some((f) => f.endsWith(path.join("games", "[id]", "page.tsx")))).toBe(true);
  });

  test.each(serverPages.map((f) => [path.relative(appDir, f), f]))(
    "%s passes no sx theme callbacks",
    (_rel, file) => {
      const source = fs.readFileSync(file as string, "utf8");
      expect(source).not.toMatch(THEME_CALLBACK);
    }
  );
});
