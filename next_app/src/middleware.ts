import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
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

// /dev/* holds internal design pickers that must only exist in local development.
// This has to be enforced here rather than only in app/dev/layout.tsx: the root
// app/loading.tsx wraps every route in a Suspense boundary, so a notFound() thrown
// from a nested layout streams the not-found UI with HTTP 200. Rewriting to a path no
// route matches makes Next render its not-found page with a real 404 status.
function isDevOnlyPath(pathname: string): boolean {
  return pathname === "/dev" || pathname.startsWith("/dev/");
}

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  if (process.env.NODE_ENV === "production" && isDevOnlyPath(request.nextUrl.pathname)) {
    return NextResponse.rewrite(new URL("/__dev-routes-disabled", request.url));
  }

  // Short-circuit before Clerk auth so /__clerk/* is never a Next.js HTML 404.
  // Required for live keys on *.vercel.app (cannot CNAME clerk.*.vercel.app).
  // pk_test_ resolves no proxy URL, so those deploys do not forward /__clerk
  // to the production Frontend API.
  // @clerk/nextjs@6.39.x has no built-in frontendApiProxy — handle it here.
  if (proxyUrl && matchClerkProxyPath(request.nextUrl.pathname, DEFAULT_CLERK_PROXY_PATH)) {
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
