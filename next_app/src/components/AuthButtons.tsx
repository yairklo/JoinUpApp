"use client";
import { useState } from "react";
import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, ClerkLoaded, useClerk, useUser } from "@clerk/nextjs";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import LoginIcon from "@mui/icons-material/Login";
import LogoutIcon from "@mui/icons-material/Logout";
import ManageAccountsOutlinedIcon from "@mui/icons-material/ManageAccountsOutlined";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import Avatar from "@/components/Avatar";
import { useMyAvatar } from "@/hooks/useMyAvatar";

// Replaces Clerk's <UserButton>, which can only render Clerk's own image and so never showed the
// avatar stored in our DB. Same menu entries, rendered from our imageUrl.
function UserMenu() {
  const { signOut, openUserProfile } = useClerk();
  const { user } = useUser();
  const avatarUrl = useMyAvatar();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const close = () => setAnchorEl(null);
  const name = user?.fullName || user?.primaryEmailAddress?.emailAddress || "";

  return (
    <>
      <IconButton
        onClick={(e) => setAnchorEl(e.currentTarget)}
        aria-label="פתח תפריט משתמש"
        aria-haspopup="menu"
        aria-expanded={!!anchorEl}
        size="small"
        sx={{ p: 0.25 }}
      >
        <Avatar src={avatarUrl} name={name} alt={name} size="md" />
      </IconButton>
      <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={close}>
        <MenuItem component={Link} href="/profile" onClick={close}>
          <ListItemIcon><PersonOutlineIcon fontSize="small" /></ListItemIcon>
          <ListItemText>הפרופיל שלי</ListItemText>
        </MenuItem>
        <MenuItem component={Link} href="/profile/settings" onClick={close}>
          <ListItemIcon><LockOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>הגדרות פרטיות</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { close(); openUserProfile(); }}>
          <ListItemIcon><ManageAccountsOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>ניהול חשבון</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { close(); signOut({ redirectUrl: "/" }); }}>
          <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
          <ListItemText>התנתקות</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}

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
          <UserMenu />
        </ClerkLoaded>
      </SignedIn>
    </div>
  );
}
