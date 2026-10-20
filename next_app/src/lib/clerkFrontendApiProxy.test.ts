import { DEFAULT_CLERK_PROXY_PATH, resolveClerkProxyUrl } from "./clerkFrontendApiProxy";

const ENV_KEYS = ["NEXT_PUBLIC_CLERK_PROXY_URL", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] as const;

describe("resolveClerkProxyUrl", () => {
  const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  test("pk_test_ ignores NEXT_PUBLIC_CLERK_PROXY_URL", () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_example";
    process.env.NEXT_PUBLIC_CLERK_PROXY_URL = "/__clerk";
    expect(resolveClerkProxyUrl()).toBeUndefined();
  });

  test("pk_test_ without the env var stays off the proxy", () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_example";
    expect(resolveClerkProxyUrl()).toBeUndefined();
  });

  test("pk_live_ defaults to /__clerk", () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_live_example";
    expect(resolveClerkProxyUrl()).toBe(DEFAULT_CLERK_PROXY_PATH);
  });

  test("pk_live_ still honors an explicit proxy URL", () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_live_example";
    process.env.NEXT_PUBLIC_CLERK_PROXY_URL = "https://joinup.example/__clerk";
    expect(resolveClerkProxyUrl()).toBe("https://joinup.example/__clerk");
  });

  test("a blank proxy URL does not override the live-key default", () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_live_example";
    process.env.NEXT_PUBLIC_CLERK_PROXY_URL = "   ";
    expect(resolveClerkProxyUrl()).toBe(DEFAULT_CLERK_PROXY_PATH);
  });
});
