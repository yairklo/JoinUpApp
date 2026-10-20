import { buildCsp, sentryCspReportUri } from "./csp";
import { isIndexable } from "./siteUrl";

const directive = (csp: string, name: string) =>
  csp.split("; ").find((d) => d.startsWith(`${name} `))?.split(" ").slice(1) ?? [];

describe("buildCsp", () => {
  const env = {
    NODE_ENV: "production",
    NEXT_PUBLIC_API_URL: "https://joinup-api.duckdns.org",
    NEXT_PUBLIC_SENTRY_DSN: "https://abc123@o451.ingest.de.sentry.io/4512",
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: "production",
  };

  test("allows the API over https and wss (REST + Socket.IO)", () => {
    const connect = directive(buildCsp(env), "connect-src");
    expect(connect).toEqual(expect.arrayContaining(["https://joinup-api.duckdns.org", "wss://joinup-api.duckdns.org"]));
  });

  test("allows the origins the live site loads", () => {
    const csp = buildCsp(env);
    expect(directive(csp, "script-src")).toEqual(expect.arrayContaining(["https://maps.googleapis.com", "https://www.googletagmanager.com"]));
    expect(directive(csp, "connect-src")).toEqual(
      expect.arrayContaining(["https://o451.ingest.de.sentry.io", "https://*.googleapis.com", "https://*.google-analytics.com"])
    );
    expect(directive(csp, "img-src")).toEqual(expect.arrayContaining(["https:", "data:", "blob:"]));
  });

  test("locks down framing, plugins and base", () => {
    const csp = buildCsp(env);
    expect(directive(csp, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(csp, "object-src")).toEqual(["'none'"]);
    expect(directive(csp, "base-uri")).toEqual(["'self'"]);
  });

  test("unsafe-eval only in development", () => {
    expect(directive(buildCsp(env), "script-src")).not.toContain("'unsafe-eval'");
    expect(directive(buildCsp({ ...env, NODE_ENV: "development" }), "script-src")).toContain("'unsafe-eval'");
  });

  test("reports to Sentry's security endpoint, and omits report-uri without a DSN", () => {
    expect(directive(buildCsp(env), "report-uri")).toEqual([
      "https://o451.ingest.de.sentry.io/api/4512/security/?sentry_key=abc123&sentry_environment=production",
    ]);
    expect(buildCsp({ NODE_ENV: "production" })).not.toContain("report-uri");
  });

  test("ignores malformed URLs instead of throwing", () => {
    expect(() => buildCsp({ NEXT_PUBLIC_API_URL: "not a url", NEXT_PUBLIC_SENTRY_DSN: "::" })).not.toThrow();
    expect(sentryCspReportUri("https://o1.ingest.sentry.io/1")).toBeNull(); // no public key
  });
});

describe("isIndexable", () => {
  test("only the production Vercel deployment, or an explicit opt-in", () => {
    expect(isIndexable({ VERCEL_ENV: "production" })).toBe(true);
    expect(isIndexable({ VERCEL_ENV: "preview" })).toBe(false);
    expect(isIndexable({})).toBe(false);
    expect(isIndexable({ ALLOW_INDEXING: "true" })).toBe(true);
  });
});
