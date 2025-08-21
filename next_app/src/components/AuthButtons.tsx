"use client";
import { SignedIn, SignedOut, SignInButton, ClerkLoaded, UserButton } from "@clerk/nextjs";

export default function AuthButtons() {
  return (
    <div>
      <SignedOut>
        <SignInButton mode="modal">
          <button className="px-3 py-1 text-sm rounded bg-blue-600 text-white">Sign in</button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <ClerkLoaded>
          <UserButton afterSignOutUrl="/" />
        </ClerkLoaded>
      </SignedIn>
    </div>
  );
}


