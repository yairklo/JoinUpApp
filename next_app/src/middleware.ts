import { clerkMiddleware } from "@clerk/nextjs/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import {
  clerkFrontendApiProxy,
  DEFAULT_CLERK_PROXY_PATH,
  matchClerkProxyPath,
  resolveClerkProxyUrl,
} from "@/lib/clerkFrontendApiProxy";

const proxyUrl = resolveClerkProxyUrl();

const clerkHandler = clerkMiddleware(
  proxyUrl
    ? {
        // Handshake + satellite flows must use the same proxy path as the browser.
        proxyUrl,
      }
    : undefined,
);

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  // Short-circuit before Clerk auth so /__clerk/* is never a Next.js HTML 404.
  // Required for live keys on *.vercel.app (cannot CNAME clerk.*.vercel.app).
  // @clerk/nextjs@6.39.x has no built-in frontendApiProxy — handle it here.
  if (matchClerkProxyPath(request.nextUrl.pathname, DEFAULT_CLERK_PROXY_PATH)) {
    return clerkFrontendApiProxy(request, {
      proxyPath: DEFAULT_CLERK_PROXY_PATH,
      publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      secretKey: process.env.CLERK_SECRET_KEY,
    });
  }

  return clerkHandler(request, event);
}

export const config = {
  matcher: [
    "/((?!.+\\.[\\w]+$|_next).*)",
    "/(api|trpc)(.*)",
    // Explicit Clerk FAPI proxy path (Dashboard: /__clerk)
    "/__clerk/(.*)",
  ],
};
