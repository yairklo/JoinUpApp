"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { usersApi, FlaggedMessage, AdminFieldComment, AdminFieldIssue, AdminFieldCommentFlag, AdminFieldIssueFlag } from "@/services/api/users";
import type { FieldFlagReason } from "@/services/api/fields";

import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import LoadingMotif from "@/components/motion/LoadingMotif";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import { fieldsApi } from "@/services/api/fields";

const FLAG_REASON_LABELS: Record<FieldFlagReason, string> = {
  OFFENSIVE: "תוכן פוגעני",
  FALSE_INFO: "מידע שקרי",
  SPAM: "ספאם",
  OTHER: "אחר",
};

export default function AdminModerationPage() {
  const { getToken } = useAuth();
  const [rows, setRows] = useState<FlaggedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [comments, setComments] = useState<AdminFieldComment[]>([]);
  const [issues, setIssues] = useState<AdminFieldIssue[]>([]);
  const [loadingFieldSocial, setLoadingFieldSocial] = useState(true);

  const [commentFlags, setCommentFlags] = useState<AdminFieldCommentFlag[]>([]);
  const [issueFlags, setIssueFlags] = useState<AdminFieldIssueFlag[]>([]);
  const [loadingFlags, setLoadingFlags] = useState(true);

  const load = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setLoading(false);
      setLoadingFieldSocial(false);
      setLoadingFlags(false);
      return;
    }
    const list = await usersApi.listFlaggedMessages(token);
    setRows(Array.isArray(list) ? list : []);
    setLoading(false);

    const [commentRows, issueRows] = await Promise.all([
      usersApi.listFieldComments(token),
      usersApi.listFieldIssues(token),
    ]);
    setComments(Array.isArray(commentRows) ? commentRows : []);
    setIssues(Array.isArray(issueRows) ? issueRows : []);
    setLoadingFieldSocial(false);

    const [commentFlagRows, issueFlagRows] = await Promise.all([
      usersApi.listFieldCommentFlags(token),
      usersApi.listFieldIssueFlags(token),
    ]);
    setCommentFlags(Array.isArray(commentFlagRows) ? commentFlagRows : []);
    setIssueFlags(Array.isArray(issueFlagRows) ? issueFlagRows : []);
    setLoadingFlags(false);
  }, [getToken]);

  useEffect(() => {
    load().catch(() => {
      setLoading(false);
      setLoadingFieldSocial(false);
      setLoadingFlags(false);
    });
  }, [load]);

  const withToken = useCallback(async (fn: (token: string) => Promise<unknown>) => {
    const token = await getToken();
    if (!token) return;
    await fn(token);
  }, [getToken]);

  const handleDismiss = useCallback(async (id: string) => {
    setActingId(id);
    setError(null);
    try {
      await withToken((token) => usersApi.dismissFlaggedMessage(id, token));
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch {
      setError("הפעולה נכשלה, נסה שוב.");
    } finally {
      setActingId(null);
    }
  }, [withToken]);

  const handleRemoveMessage = useCallback(async (id: string) => {
    setActingId(id);
    setError(null);
    try {
      await withToken((token) => usersApi.removeFlaggedMessage(id, token));
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch {
      setError("הפעולה נכשלה, נסה שוב.");
    } finally {
      setActingId(null);
    }
  }, [withToken]);

  const handleBanUser = useCallback(async (row: FlaggedMessage) => {
    if (!confirm(`להשעות את המשתמש ${row.userId}?`)) return;
    setActingId(row.id);
    setError(null);
    try {
      await withToken((token) => usersApi.banUser(row.userId, token, `flagged-message:${row.id}`));
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch {
      setError("הפעולה נכשלה, נסה שוב.");
    } finally {
      setActingId(null);
    }
  }, [withToken]);

  const handleDeleteComment = useCallback(async (row: AdminFieldComment) => {
    if (!confirm("למחוק את התגובה?")) return;
    setActingId(row.id);
    setError(null);
    try {
      await withToken((token) => fieldsApi.deleteComment(row.fieldId, row.id, token));
      setComments((prev) => prev.filter((c) => c.id !== row.id && c.parentId !== row.id));
    } catch {
      setError("הפעולה נכשלה, נסה שוב.");
    } finally {
      setActingId(null);
    }
  }, [withToken]);

  const handleDeleteIssue = useCallback(async (row: AdminFieldIssue) => {
    if (!confirm("למחוק את הדיווח?")) return;
    setActingId(row.id);
    setError(null);
    try {
      await withToken((token) => fieldsApi.deleteIssue(row.fieldId, row.id, token));
      setIssues((prev) => prev.filter((i) => i.id !== row.id && i.parentId !== row.id));
    } catch {
      setError("הפעולה נכשלה, נסה שוב.");
    } finally {
      setActingId(null);
    }
  }, [withToken]);

  const handleToggleFieldBlock = useCallback(async (userId: string, currentlyBlocked: boolean) => {
    const confirmMsg = currentlyBlocked
      ? `לבטל את החסימה של ${userId} מתגובות/דיווחים על מגרשים?`
      : `לחסום את ${userId} מתגובות/דיווחים על מגרשים?`;
    if (!confirm(confirmMsg)) return;
    setActingId(userId);
    setError(null);
    try {
      await withToken((token) =>
        currentlyBlocked
          ? usersApi.unblockUserFromFieldSocial(userId, token)
          : usersApi.blockUserFromFieldSocial(userId, token)
      );
      const patchUser = (u: AdminFieldComment["user"]) =>
        u.id === userId ? { ...u, blockedFromFieldSocial: !currentlyBlocked } : u;
      setComments((prev) => prev.map((c) => ({ ...c, user: patchUser(c.user) })));
      setIssues((prev) => prev.map((i) => ({ ...i, user: patchUser(i.user) })));
    } catch {
      setError("הפעולה נכשלה, נסה שוב.");
    } finally {
      setActingId(null);
    }
  }, [withToken]);

  const handleDismissCommentFlag = useCallback(async (flagId: string) => {
    setActingId(flagId);
    setError(null);
    try {
      await withToken((token) => usersApi.dismissFieldCommentFlag(flagId, token));
      setCommentFlags((prev) => prev.filter((f) => f.id !== flagId));
    } catch {
      setError("הפעולה נכשלה, נסה שוב.");
    } finally {
      setActingId(null);
    }
  }, [withToken]);

  const handleDeleteFlaggedComment = useCallback(async (flag: AdminFieldCommentFlag) => {
    if (!confirm("למחוק את התגובה?")) return;
    setActingId(flag.id);
    setError(null);
    try {
      await withToken((token) => fieldsApi.deleteComment(flag.comment.fieldId, flag.comment.id, token));
      setCommentFlags((prev) => prev.filter((f) => f.comment.id !== flag.comment.id));
      setComments((prev) => prev.filter((c) => c.id !== flag.comment.id && c.parentId !== flag.comment.id));
    } catch {
      setError("הפעולה נכשלה, נסה שוב.");
    } finally {
      setActingId(null);
    }
  }, [withToken]);

  const handleDismissIssueFlag = useCallback(async (flagId: string) => {
    setActingId(flagId);
    setError(null);
    try {
      await withToken((token) => usersApi.dismissFieldIssueFlag(flagId, token));
      setIssueFlags((prev) => prev.filter((f) => f.id !== flagId));
    } catch {
      setError("הפעולה נכשלה, נסה שוב.");
    } finally {
      setActingId(null);
    }
  }, [withToken]);

  const handleDeleteFlaggedIssue = useCallback(async (flag: AdminFieldIssueFlag) => {
    if (!confirm("למחוק את הדיווח?")) return;
    setActingId(flag.id);
    setError(null);
    try {
      await withToken((token) => fieldsApi.deleteIssue(flag.issue.fieldId, flag.issue.id, token));
      setIssueFlags((prev) => prev.filter((f) => f.issue.id !== flag.issue.id));
      setIssues((prev) => prev.filter((i) => i.id !== flag.issue.id && i.parentId !== flag.issue.id));
    } catch {
      setError("הפעולה נכשלה, נסה שוב.");
    } finally {
      setActingId(null);
    }
  }, [withToken]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" py={8}><LoadingMotif id="brand-pulse" label="טוען ניהול…" /></Box>
    );
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" fontWeight={800}>הודעות שסומנו</Typography>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
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
              <Stack direction="row" spacing={1} mt={2}>
                <Button
                  size="small"
                  disabled={actingId === row.id}
                  onClick={() => handleDismiss(row.id)}
                >
                  סמן כטופל
                </Button>
                <Button
                  size="small"
                  color="warning"
                  disabled={actingId === row.id}
                  onClick={() => handleRemoveMessage(row.id)}
                >
                  הסר הודעה
                </Button>
                <Button
                  size="small"
                  color="error"
                  disabled={actingId === row.id}
                  onClick={() => handleBanUser(row)}
                >
                  השעה משתמש
                </Button>
              </Stack>
            </CardContent>
          </Card>
        ))
      )}

      <Divider sx={{ my: 2 }} />

      <Typography variant="h5" fontWeight={800}>תוכן מדווח על מגרשים</Typography>
      {loadingFlags ? (
        <Box display="flex" justifyContent="center" py={4}><LoadingMotif id="brand-pulse" label="טוען…" /></Box>
      ) : (
        <>
          <Typography variant="subtitle1" fontWeight={700}>תגובות שדווחו</Typography>
          {commentFlags.length === 0 ? (
            <Alert severity="success">אין תגובות מדווחות.</Alert>
          ) : (
            commentFlags.map((flag) => (
              <Card key={flag.id} sx={{ borderColor: "warning.main", borderWidth: 1, borderStyle: "solid" }}>
                <CardContent>
                  <Stack direction="row" spacing={1} alignItems="center" mb={1} flexWrap="wrap" useFlexGap>
                    <Chip size="small" color="warning" label={FLAG_REASON_LABELS[flag.reason]} />
                    <Typography variant="caption" color="text.secondary">{flag.comment.fieldName}</Typography>
                    <Typography variant="caption" fontWeight={700}>{flag.comment.user.name || flag.comment.user.id}</Typography>
                    {flag.comment.user.blockedFromFieldSocial && <Chip size="small" color="error" label="חסום" />}
                  </Stack>
                  <Typography sx={{ whiteSpace: "pre-wrap" }}>{flag.comment.text}</Typography>
                  <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                    דווח ע&quot;י {flag.reporter.name || flag.reporter.id}
                    {flag.details ? ` — ${flag.details}` : ""}
                  </Typography>
                  <Stack direction="row" spacing={1} mt={2}>
                    <Button size="small" disabled={actingId === flag.id} onClick={() => handleDismissCommentFlag(flag.id)}>
                      התעלם
                    </Button>
                    <Button size="small" color="warning" disabled={actingId === flag.id} onClick={() => handleDeleteFlaggedComment(flag)}>
                      מחק תגובה
                    </Button>
                    <Button
                      size="small"
                      color={flag.comment.user.blockedFromFieldSocial ? "success" : "error"}
                      disabled={actingId === flag.comment.user.id}
                      onClick={() => handleToggleFieldBlock(flag.comment.user.id, flag.comment.user.blockedFromFieldSocial)}
                    >
                      {flag.comment.user.blockedFromFieldSocial ? "בטל חסימה" : "חסום משתמש"}
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            ))
          )}

          <Typography variant="subtitle1" fontWeight={700} sx={{ mt: 2 }}>דיווחי ליקויים שדווחו</Typography>
          {issueFlags.length === 0 ? (
            <Alert severity="success">אין דיווחים מדווחים.</Alert>
          ) : (
            issueFlags.map((flag) => (
              <Card key={flag.id} sx={{ borderColor: "warning.main", borderWidth: 1, borderStyle: "solid" }}>
                <CardContent>
                  <Stack direction="row" spacing={1} alignItems="center" mb={1} flexWrap="wrap" useFlexGap>
                    <Chip size="small" color="warning" label={FLAG_REASON_LABELS[flag.reason]} />
                    <Typography variant="caption" color="text.secondary">{flag.issue.fieldName}</Typography>
                    <Typography variant="caption" fontWeight={700}>{flag.issue.user.name || flag.issue.user.id}</Typography>
                    {flag.issue.category && <Chip size="small" label={flag.issue.category} />}
                    {flag.issue.user.blockedFromFieldSocial && <Chip size="small" color="error" label="חסום" />}
                  </Stack>
                  {flag.issue.description && <Typography sx={{ whiteSpace: "pre-wrap" }}>{flag.issue.description}</Typography>}
                  <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                    דווח ע&quot;י {flag.reporter.name || flag.reporter.id}
                    {flag.details ? ` — ${flag.details}` : ""}
                  </Typography>
                  <Stack direction="row" spacing={1} mt={2}>
                    <Button size="small" disabled={actingId === flag.id} onClick={() => handleDismissIssueFlag(flag.id)}>
                      התעלם
                    </Button>
                    <Button size="small" color="warning" disabled={actingId === flag.id} onClick={() => handleDeleteFlaggedIssue(flag)}>
                      מחק דיווח
                    </Button>
                    <Button
                      size="small"
                      color={flag.issue.user.blockedFromFieldSocial ? "success" : "error"}
                      disabled={actingId === flag.issue.user.id}
                      onClick={() => handleToggleFieldBlock(flag.issue.user.id, flag.issue.user.blockedFromFieldSocial)}
                    >
                      {flag.issue.user.blockedFromFieldSocial ? "בטל חסימה" : "חסום משתמש"}
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            ))
          )}
        </>
      )}

      <Divider sx={{ my: 2 }} />

      <Typography variant="h5" fontWeight={800}>תגובות ודיווחים על מגרשים</Typography>
      {loadingFieldSocial ? (
        <Box display="flex" justifyContent="center" py={4}><LoadingMotif id="brand-pulse" label="טוען…" /></Box>
      ) : (
        <>
          <Typography variant="subtitle1" fontWeight={700}>תגובות אחרונות</Typography>
          {comments.length === 0 ? (
            <Alert severity="success">אין תגובות.</Alert>
          ) : (
            comments.map((row) => (
              <Card key={row.id}>
                <CardContent>
                  <Stack direction="row" spacing={1} alignItems="center" mb={1} flexWrap="wrap" useFlexGap>
                    <Typography variant="caption" color="text.secondary">{row.fieldName}</Typography>
                    <Typography variant="caption" fontWeight={700}>{row.user.name || row.user.id}</Typography>
                    {row.parentId && <Chip size="small" label="תגובה לתגובה" />}
                    {row.user.blockedFromFieldSocial && <Chip size="small" color="error" label="חסום" />}
                  </Stack>
                  <Typography sx={{ whiteSpace: "pre-wrap" }}>{row.text}</Typography>
                  <Stack direction="row" spacing={1} mt={2}>
                    <Button size="small" color="warning" disabled={actingId === row.id} onClick={() => handleDeleteComment(row)}>
                      מחק תגובה
                    </Button>
                    <Button
                      size="small"
                      color={row.user.blockedFromFieldSocial ? "success" : "error"}
                      disabled={actingId === row.user.id}
                      onClick={() => handleToggleFieldBlock(row.user.id, row.user.blockedFromFieldSocial)}
                    >
                      {row.user.blockedFromFieldSocial ? "בטל חסימה" : "חסום משתמש"}
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            ))
          )}

          <Typography variant="subtitle1" fontWeight={700} sx={{ mt: 2 }}>דיווחי ליקויים אחרונים</Typography>
          {issues.length === 0 ? (
            <Alert severity="success">אין דיווחים.</Alert>
          ) : (
            issues.map((row) => (
              <Card key={row.id}>
                <CardContent>
                  <Stack direction="row" spacing={1} alignItems="center" mb={1} flexWrap="wrap" useFlexGap>
                    <Typography variant="caption" color="text.secondary">{row.fieldName}</Typography>
                    <Typography variant="caption" fontWeight={700}>{row.user.name || row.user.id}</Typography>
                    {row.category && <Chip size="small" label={row.category} />}
                    <Chip size="small" color={row.status === "OPEN" ? "default" : "success"} label={row.status} />
                    {row.parentId && <Chip size="small" label="תגובה לדיווח" />}
                    {row.user.blockedFromFieldSocial && <Chip size="small" color="error" label="חסום" />}
                  </Stack>
                  {row.description && <Typography sx={{ whiteSpace: "pre-wrap" }}>{row.description}</Typography>}
                  <Stack direction="row" spacing={1} mt={2}>
                    <Button size="small" color="warning" disabled={actingId === row.id} onClick={() => handleDeleteIssue(row)}>
                      מחק דיווח
                    </Button>
                    <Button
                      size="small"
                      color={row.user.blockedFromFieldSocial ? "success" : "error"}
                      disabled={actingId === row.user.id}
                      onClick={() => handleToggleFieldBlock(row.user.id, row.user.blockedFromFieldSocial)}
                    >
                      {row.user.blockedFromFieldSocial ? "בטל חסימה" : "חסום משתמש"}
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            ))
          )}
        </>
      )}
    </Stack>
  );
}
