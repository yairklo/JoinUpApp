"use client";

import { useCallback, useEffect, useState } from "react";
import { SignedIn, SignedOut, SignInButton, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { usersApi, FlaggedMessage } from "@/services/api/users";

import Container from "@mui/material/Container";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";

export default function AdminModerationPage() {
  const { getToken } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [rows, setRows] = useState<FlaggedMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setAllowed(false);
      setLoading(false);
      return;
    }
    const me = await usersApi.getMe(token);
    if (!me.isAdmin) {
      setAllowed(false);
      setLoading(false);
      return;
    }
    setAllowed(true);
    const list = await usersApi.listFlaggedMessages(token);
    setRows(Array.isArray(list) ? list : []);
    setLoading(false);
  }, [getToken]);

  useEffect(() => {
    load().catch(() => {
      setAllowed(false);
      setLoading(false);
    });
  }, [load]);

  return (
    <Container maxWidth="md" sx={{ py: 6 }} dir="rtl">
      <SignedOut>
        <Card>
          <CardContent sx={{ textAlign: "center", py: 6 }}>
            <Typography gutterBottom>עליך להתחבר כדי לצפות בתור המודרציה.</Typography>
            <SignInButton mode="modal">
              <Button variant="contained">התחברות</Button>
            </SignInButton>
          </CardContent>
        </Card>
      </SignedOut>
      <SignedIn>
        {loading || allowed === null ? (
          <Box display="flex" justifyContent="center" py={8}><CircularProgress /></Box>
        ) : !allowed ? (
          <Alert severity="warning">אין הרשאת מפעיל.</Alert>
        ) : (
          <Stack spacing={2}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="h5" fontWeight={800}>הודעות שסומנו</Typography>
              <Button component={Link} href="/admin/fields">ניהול מגרשים</Button>
            </Stack>
            {rows.length === 0 ? (
              <Alert severity="success">אין פריטים ממתינים.</Alert>
            ) : (
              rows.map((row) => (
                <Card key={row.id}>
                  <CardContent>
                    <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                      <Chip size="small" label={row.status} />
                      <Typography variant="caption" color="text.secondary">{row.userId}</Typography>
                    </Stack>
                    <Typography sx={{ whiteSpace: "pre-wrap" }}>{row.content}</Typography>
                    {row.failureReason && (
                      <Typography variant="body2" color="error" mt={1}>{row.failureReason}</Typography>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </Stack>
        )}
      </SignedIn>
    </Container>
  );
}
