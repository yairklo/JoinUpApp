import { appleAppSiteAssociation, jsonResponse } from "@/lib/appLinks";

export const dynamic = "force-static";

export function GET() {
  return jsonResponse(appleAppSiteAssociation());
}
