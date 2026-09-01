"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError] Uncaught exception in root layout:", error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="he" dir="rtl">
      <body>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            gap: 16,
            padding: 32,
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>משהו השתבש</h1>
          <p style={{ color: "#555", maxWidth: 420, margin: 0 }}>
            קרתה תקלה בלתי צפויה. נסו לרענן את הדף — אם זה ממשיך לקרות, חזרו בעוד כמה דקות.
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "none",
              background: "#059669",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            נסה שוב
          </button>
        </div>
      </body>
    </html>
  );
}
