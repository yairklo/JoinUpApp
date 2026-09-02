"use client";
import Link from "next/link";
import { SignUp } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
      <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />
      <p className="text-xs text-gray-500 text-center max-w-sm" dir="rtl">
        בהמשך ההרשמה אתה מאשר שקראת ומסכים{" "}
        <Link href="/legal/terms" className="underline">לתנאי השימוש</Link>
        {" "}ול
        <Link href="/legal/privacy" className="underline">מדיניות הפרטיות</Link>
        {" "}שלנו.
      </p>
    </div>
  );
}


