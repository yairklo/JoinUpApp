"use client";
import { SignedIn, SignedOut, SignInButton, ClerkLoaded, UserButton } from "@clerk/nextjs";

export default function AuthButtons() {
  return (
    <div>
      <label className="visually-hidden" htmlFor="navbar-signin-btn">Sign in</label>
      <SignedOut>
        <SignInButton mode="modal">
          <button id="navbar-signin-btn" className="btn btn-primary btn-sm">Sign in</button>
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


