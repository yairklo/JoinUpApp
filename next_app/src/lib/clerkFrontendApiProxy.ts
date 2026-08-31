/**
 * Clerk Frontend API proxy for @clerk/nextjs v6 (no built-in frontendApiProxy).
 * Mirrors Clerk's official proxy contract:
 * forward /__clerk/* → https://frontend-api.clerk.dev/* with
 * Clerk-Proxy-Url, Clerk-Secret-Key, and X-Forwarded-For.
 *
 * @see https://clerk.com/docs/guides/dashboard/dns-domains/proxy-fapi
 */

export const DEFAULT_CLERK_PROXY_PATH = "/__clerk";
const PROD_FAPI_URL = "https://frontend-api.clerk.dev";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const RESPONSE_HEADERS_TO_STRIP = new Set(["content-encoding", "content-length"]);

function stripTrailingSlashes(str: string): string {
  let out = str;
  while (out.endsWith("/")) {
    out = out.slice(0, -1);
  }
  return out;
}

function getDynamicHopByHopHeaders(headers: Headers): Set<string> {
  const connectionValue = headers.get("connection");
  if (!connectionValue) return new Set();
  return new Set(
    connectionValue
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter((h) => h.length > 0),
  );
}

function createErrorResponse(code: string, message: string, status: number): Response {
  return new Response(JSON.stringify({ errors: [{ code, message }] }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function derivePublicOrigin(request: Request, requestUrl: URL): string {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  return requestUrl.origin;
}

function getClientIp(request: Request): string | undefined {
  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  if (cfConnectingIp) return cfConnectingIp;

  const xRealIp = request.headers.get("x-real-ip");
  if (xRealIp) return xRealIp;

  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (xForwardedFor) return xForwardedFor.split(",")[0]?.trim();

  return undefined;
}

/** Relative proxy path for live keys; env override wins. Dev (pk_test_) returns undefined. */
export function resolveClerkProxyUrl(): string | undefined {
  const fromEnv = process.env.NEXT_PUBLIC_CLERK_PROXY_URL?.trim();
  if (fromEnv) return fromEnv;

  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "";
  if (publishableKey.startsWith("pk_live_")) {
    return DEFAULT_CLERK_PROXY_PATH;
  }
  return undefined;
}

export function matchClerkProxyPath(
  pathname: string,
  proxyPath: string = DEFAULT_CLERK_PROXY_PATH,
): boolean {
  const normalized = stripTrailingSlashes(proxyPath);
  return pathname === normalized || pathname.startsWith(`${normalized}/`);
}

export async function clerkFrontendApiProxy(
  request: Request,
  options?: {
    proxyPath?: string;
    publishableKey?: string;
    secretKey?: string;
    fapiUrl?: string;
  },
): Promise<Response> {
  const proxyPath = stripTrailingSlashes(options?.proxyPath || DEFAULT_CLERK_PROXY_PATH);
  const publishableKey =
    options?.publishableKey ||
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
    process.env.CLERK_PUBLISHABLE_KEY;
  const secretKey = options?.secretKey || process.env.CLERK_SECRET_KEY;

  if (!publishableKey) {
    return createErrorResponse(
      "proxy_configuration_error",
      "Missing publishableKey. Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.",
      500,
    );
  }
  if (!secretKey) {
    return createErrorResponse(
      "proxy_configuration_error",
      "Missing secretKey. Set CLERK_SECRET_KEY.",
      500,
    );
  }

  const requestUrl = new URL(request.url);
  if (!matchClerkProxyPath(requestUrl.pathname, proxyPath)) {
    return createErrorResponse(
      "proxy_path_mismatch",
      `Request path "${requestUrl.pathname}" does not match proxy path "${proxyPath}"`,
      400,
    );
  }

  const fapiBaseUrl = stripTrailingSlashes(options?.fapiUrl || PROD_FAPI_URL);
  const fapiHost = new URL(fapiBaseUrl).host;
  const targetPath = requestUrl.pathname.slice(proxyPath.length) || "/";
  const targetUrl = new URL(`${fapiBaseUrl}${targetPath}`);
  targetUrl.search = requestUrl.search;

  if (targetUrl.host !== fapiHost) {
    return createErrorResponse("proxy_request_failed", "Resolved target does not match the expected host", 400);
  }

  const headers = new Headers();
  const dynamicHopByHop = getDynamicHopByHopHeaders(request.headers);
  request.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (!HOP_BY_HOP_HEADERS.has(lower) && !dynamicHopByHop.has(lower)) {
      headers.set(key, value);
    }
  });

  const publicOrigin = derivePublicOrigin(request, requestUrl);
  const proxyUrl = `${publicOrigin}${proxyPath}`;
  headers.set("Clerk-Proxy-Url", proxyUrl);
  headers.set("Clerk-Secret-Key", secretKey);
  headers.set("Host", fapiHost);
  headers.set("Accept-Encoding", "identity");

  if (!headers.has("X-Forwarded-Host")) {
    headers.set("X-Forwarded-Host", requestUrl.host);
  }
  if (!headers.has("X-Forwarded-Proto")) {
    headers.set("X-Forwarded-Proto", requestUrl.protocol.replace(":", ""));
  }

  const clientIp = getClientIp(request);
  if (clientIp) {
    headers.set("X-Forwarded-For", clientIp);
  }

  const hasBody = request.body !== null && request.method !== "GET" && request.method !== "HEAD";

  try {
    const fetchOptions: RequestInit & { duplex?: "half" } = {
      method: request.method,
      headers,
      redirect: "manual",
    };
    if (hasBody) {
      fetchOptions.duplex = "half";
      fetchOptions.body = request.body;
    }

    const response = await fetch(targetUrl.toString(), fetchOptions);
    const responseDynamicHopByHop = getDynamicHopByHopHeaders(response.headers);
    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (
        !HOP_BY_HOP_HEADERS.has(lower) &&
        !RESPONSE_HEADERS_TO_STRIP.has(lower) &&
        !responseDynamicHopByHop.has(lower)
      ) {
        if (lower === "set-cookie") {
          responseHeaders.append(key, value);
        } else {
          responseHeaders.set(key, value);
        }
      }
    });

    const locationHeader = response.headers.get("location");
    if (locationHeader) {
      try {
        const locationUrl = new URL(locationHeader, fapiBaseUrl);
        if (locationUrl.host === fapiHost) {
          responseHeaders.set(
            "Location",
            `${proxyUrl}${locationUrl.pathname}${locationUrl.search}${locationUrl.hash}`,
          );
        }
      } catch {
        // keep upstream Location as-is
      }
    }

    const proxyResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
    for (const header of RESPONSE_HEADERS_TO_STRIP) {
      proxyResponse.headers.delete(header);
    }
    return proxyResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return createErrorResponse("proxy_request_failed", `Failed to proxy request to Clerk FAPI: ${message}`, 502);
  }
}
