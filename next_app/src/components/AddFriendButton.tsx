"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";

import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import CheckIcon from "@mui/icons-material/Check";
import ErrorIcon from "@mui/icons-material/Error";
import Tooltip from "@mui/material/Tooltip";
import { mapFriendRequestError } from "@/utils/apiError";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

type AddFriendButtonProps = {
  receiverId: string;
  // Whether the caller already knows a friend request to this user is pending (e.g. the
  // parent fetched /api/users/:id/requests/outgoing). Without this, the button always starts
  // as "not sent" on every mount/reload, even for a receiver with a real pending request.
  initialSent?: boolean;
};

export default function AddFriendButton({ receiverId, initialSent = false }: AddFriendButtonProps) {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(initialSent);

  // The parent's outgoing-requests fetch can resolve after this button has already mounted
  // (it starts as `false` and is patched in once the fetch completes), so sync on change too.
  useEffect(() => {
    if (initialSent) setSent(true);
  }, [initialSent]);

  const send = async () => {
    setError(null);
    setLoading(true);
    try {
      const token = await getToken({ template: undefined }).catch(() => "");
      if (!token) {
        setError(mapFriendRequestError(new Error("Sign in required")));
        return;
      }
      const res = await fetch(`${API_BASE}/api/users/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ receiverId })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const err = new Error(body.error || 'Failed') as Error & { status?: number };
        err.status = res.status;
        throw err;
      }
      setSent(true);
    } catch (e: unknown) {
      // Never render error.message (raw English from the server/network) directly —
      // always translate to Hebrew copy via mapFriendRequestError.
      setError(mapFriendRequestError(e));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <Button
        size="small"
        variant="text"
        color="success"
        startIcon={<CheckIcon />}
        disabled
        aria-label="בקשה נשלחה"
      >
        בקשה נשלחה
      </Button>
    );
  }

  return (
    <>
      <Tooltip title={error || ""}>
        <Button
          onClick={send}
          disabled={loading}
          size="small"
          variant="contained"
          color={error ? "error" : "primary"}
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <PersonAddIcon />}
          aria-label={loading ? "שולח..." : "הוסף חבר"}
        >
          {loading ? "שולח..." : "הוסף חבר"}
        </Button>
      </Tooltip>
    </>
  );
}


