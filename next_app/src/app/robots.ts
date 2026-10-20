import type { MetadataRoute } from "next";
import { SITE_URL, isIndexable } from "@/lib/siteUrl";

// Signed-in, personal or internal areas. User profiles and chats stay out of search on purpose:
// they belong to real people, minors included.
const PRIVATE_PATHS = [
  "/admin",
  "/api/",
  "/__clerk/",
  "/chat",
  "/chats",
  "/dev",
  "/games/new",
  "/games/*/team-management",
  "/home",
  "/manage",
  "/profile",
  "/series/new",
  "/settings",
  "/sign-in",
  "/users/",
];

export default function robots(): MetadataRoute.Robots {
  if (!isIndexable()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
