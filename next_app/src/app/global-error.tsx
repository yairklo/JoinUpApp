"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="he" dir="rtl">
      <body>
        <div style={{ padding: 40, textAlign: "center" }}>
          <h2>משהו השתבש</h2>
          <p>המערכת נתקלה בשגיאה. ניסינו לתעד אותה, אנא רעננו את הדף.</p>
        </div>
      </body>
    </html>
  );
}
