"use client";
import { SignedIn, SignedOut, SignInButton, ClerkLoaded, UserButton } from "@clerk/nextjs";
import Button from "@mui/material/Button";
import LoginIcon from "@mui/icons-material/Login";

export default function AuthButtons() {
  return (
    <div>
      <SignedOut>
        <SignInButton mode="modal">
          <Button
            variant="contained"
            size="small"
            startIcon={<LoginIcon fontSize="small" />}
            sx={{ px: 2, whiteSpace: "nowrap" }}
          >
            התחברות
          </Button>
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
