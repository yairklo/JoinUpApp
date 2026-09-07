"use client";

import { PageLoading } from "@/components/motion/LoadingMotif";
import type { LoadingMotifId } from "@joinup/shared";

/** Next.js `loading.tsx` helper — one motif per route so we can compare them in-app. */
export default function RouteLoading({
  id,
  label = "טוען…",
}: {
  id: LoadingMotifId;
  label?: string;
}) {
  return (
    <main>
      <PageLoading id={id} label={label} />
    </main>
  );
}
