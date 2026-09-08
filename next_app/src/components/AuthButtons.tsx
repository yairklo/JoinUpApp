"use client";
import { SignedIn, SignedOut, SignInButton, ClerkLoaded, UserButton } from "@clerk/nextjs";
import Button from "@mui/material/Button";
import LoginIcon from "@mui/icons-material/Login";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";

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
