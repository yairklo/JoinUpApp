"use client";
import { useState } from "react";
import { useAuth } from "@clerk/nextjs";

import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import CheckIcon from "@mui/icons-material/Check";
import ErrorIcon from "@mui/icons-material/Error";
import Tooltip from "@mui/material/Tooltip";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

export default function AddFriendButton({ receiverId }: { receiverId: string }) {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const send = async () => {
    setError(null);
    setLoading(true);
    try {
      const token = await getToken({ template: undefined }).catch(() => "");
      if (!token) {
        setError("Sign in required");
        return;
      }
      const res = await fetch(`${API_BASE}/api/users/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ receiverId })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed');
      }
      setSent(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
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
      >
        Request Sent
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
        >
          {loading ? "Sending..." : "Add Friend"}
        </Button>
      </Tooltip>
    </>
  );
}


