"use client";
import { useEffect, useRef } from "react";
import { SignedIn, SignedOut, SignInButton, ClerkLoaded, UserButton } from "@clerk/nextjs";
import Button from "@mui/material/Button";
import LoginIcon from "@mui/icons-material/Login";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";

export default function AuthButtons() {
  const containerRef = useRef<HTMLDivElement>(null);

  // Clerk's UserButton trigger ships a hardcoded "Open user menu" aria-label that isn't exposed
  // through @clerk/localizations' heIL pack, so there's no supported way to translate it via
  // props. Patch the attribute directly instead -- scoped to this component's own subtree, and
  // a MutationObserver re-applies it if Clerk re-renders the trigger (the label only ever
  // matches the English string once, so this can't loop on its own mutation).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const relabel = () => {
      const trigger = container.querySelector('button[aria-label="Open user menu"]');
      if (trigger) trigger.setAttribute("aria-label", "פתח תפריט משתמש");
    };
    relabel();
    const observer = new MutationObserver(relabel);
    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-label"],
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef}>
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
          <UserButton afterSignOutUrl="/">
            <UserButton.MenuItems>
              <UserButton.Link
                label="הפרופיל שלי"
                href="/profile"
                labelIcon={<PersonOutlineIcon sx={{ fontSize: 16 }} />}
              />
              <UserButton.Link
                label="הגדרות פרטיות"
                href="/profile/settings"
                labelIcon={<LockOutlinedIcon sx={{ fontSize: 16 }} />}
              />
              <UserButton.Action label="manageAccount" />
            </UserButton.MenuItems>
          </UserButton>
        </ClerkLoaded>
      </SignedIn>
    </div>
  );
}
