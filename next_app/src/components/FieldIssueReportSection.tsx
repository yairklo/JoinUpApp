"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { fieldsApi, FieldIssueCategory, FieldIssueReport } from "@/services/api/fields";
import type { FieldFlagReason } from "@/services/api/fields";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { formatJerusalemDate, formatJerusalemTime } from "@/utils/timezone";
import { getActionErrorMessage } from "@/utils/apiError";
import Avatar from "@/components/Avatar";
import Card from "@mui/material/Card";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Divider from "@mui/material/Divider";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import ThumbUpOutlinedIcon from "@mui/icons-material/ThumbUpOutlined";
import ThumbUpIcon from "@mui/icons-material/ThumbUp";
import ThumbDownOutlinedIcon from "@mui/icons-material/ThumbDownOutlined";
import ThumbDownIcon from "@mui/icons-material/ThumbDown";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import FlagOutlinedIcon from "@mui/icons-material/FlagOutlined";

const FLAG_REASON_LABELS: Record<FieldFlagReason, string> = {
  OFFENSIVE: "תוכן פוגעני",
  FALSE_INFO: "מידע שקרי",
  SPAM: "ספאם",
  OTHER: "אחר",
};

const CATEGORY_LABELS: Record<FieldIssueCategory, string> = {
  POTHOLE: "בור במגרש",
  LIGHTING: "תאורה לקויה",
  SURFACE: "משטח פגום",
  GOAL_NET: "שער/רשת פגומים",
  FENCE: "גדר פגומה",
  OTHER: "אחר",
};

const CATEGORIES = Object.keys(CATEGORY_LABELS) as FieldIssueCategory[];

function replaceInTree(list: FieldIssueReport[], id: string, next: FieldIssueReport): FieldIssueReport[] {
  return list.map((i) => {
    if (i.id === id) return next;
    if (i.replies?.some((r) => r.id === id)) {
      return { ...i, replies: i.replies.map((r) => (r.id === id ? next : r)) };
    }
    return i;
  });
}

function removeFromTree(list: FieldIssueReport[], id: string): FieldIssueReport[] {
  return list
    .filter((i) => i.id !== id)
    .map((i) => ({ ...i, replies: (i.replies || []).filter((r) => r.id !== id) }));
}

export default function FieldIssueReportSection({ fieldId }: { fieldId: string }) {
  const { getToken, userId } = useAuth();
  const { isAdmin } = useIsAdmin();
  const [issues, setIssues] = useState<FieldIssueReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<FieldIssueCategory>("POTHOLE");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flagMenu, setFlagMenu] = useState<{ el: HTMLElement; issueId: string } | null>(null);
  const [flagSent, setFlagSent] = useState(false);

  useEffect(() => {
    let ignore = false;
    (async () => {
      const token = await getToken().catch(() => null);
      fieldsApi
        .getIssues(fieldId, token || undefined)
        .then((data) => {
          if (!ignore) setIssues(data);
        })
        .catch(() => {
          if (!ignore) setIssues([]);
        })
        .finally(() => {
          if (!ignore) setLoading(false);
        });
    })();
    return () => {
      ignore = true;
    };
  }, [fieldId, getToken]);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        setError("יש להתחבר כדי לדווח על ליקוי");
        return;
      }
      const created = await fieldsApi.addIssue(fieldId, { category, description: description.trim() || undefined }, token);
      setIssues((prev) => [created, ...prev]);
      setDescription("");
      setShowSuccess(true);
    } catch (e) {
      setError(getActionErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const submitReply = async (parentId: string) => {
    const trimmed = replyText.trim();
    if (!trimmed) return;
    setBusyId(parentId);
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        setError("יש להתחבר כדי להגיב");
        return;
      }
      const created = await fieldsApi.addIssue(fieldId, { description: trimmed, parentId }, token);
      setIssues((prev) => prev.map((i) => (i.id === parentId ? { ...i, replies: [...i.replies, created] } : i)));
      setReplyingTo(null);
      setReplyText("");
    } catch (e) {
      setError(getActionErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const saveEdit = async (issue: FieldIssueReport) => {
    const trimmed = editText.trim();
    if (!trimmed) return;
    setBusyId(issue.id);
    setError(null);
    try {
      const token = await getToken();
      if (!token) return;
      const updated = await fieldsApi.editIssue(fieldId, issue.id, trimmed, token);
      setIssues((prev) => replaceInTree(prev, issue.id, updated));
      setEditingId(null);
    } catch (e) {
      setError(getActionErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (issueId: string) => {
    if (!confirm("למחוק את הדיווח?")) return;
    setBusyId(issueId);
    setError(null);
    try {
      const token = await getToken();
      if (!token) return;
      await fieldsApi.deleteIssue(fieldId, issueId, token);
      setIssues((prev) => removeFromTree(prev, issueId));
    } catch (e) {
      setError(getActionErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const react = async (issue: FieldIssueReport, type: "LIKE" | "DISLIKE") => {
    setBusyId(issue.id);
    try {
      const token = await getToken();
      if (!token) {
        setError("יש להתחבר כדי להגיב");
        return;
      }
      const result = await fieldsApi.reactToIssue(fieldId, issue.id, type, token);
      setIssues((prev) => replaceInTree(prev, issue.id, { ...issue, ...result }));
    } catch (e) {
      setError(getActionErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const toggleStatus = async (issue: FieldIssueReport) => {
    setBusyId(issue.id);
    setError(null);
    try {
      const token = await getToken();
      if (!token) return;
      const nextStatus = issue.status === "OPEN" ? "RESOLVED" : "OPEN";
      const updated = await fieldsApi.setIssueStatus(fieldId, issue.id, nextStatus, token);
      setIssues((prev) => replaceInTree(prev, issue.id, updated));
    } catch (e) {
      setError(getActionErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const submitFlag = async (reason: FieldFlagReason) => {
    if (!flagMenu) return;
    const issueId = flagMenu.issueId;
    setFlagMenu(null);
    try {
      const token = await getToken();
      if (!token) {
        setError("יש להתחבר כדי לדווח");
        return;
      }
      await fieldsApi.flagIssue(fieldId, issueId, reason, undefined, token);
      setFlagSent(true);
    } catch (e) {
      setError(getActionErrorMessage(e));
    }
  };

  const renderRow = (issue: FieldIssueReport, isReply: boolean) => {
    const isOwn = !!userId && issue.user.id === userId;
    const canModify = isOwn || isAdmin;
    const isEditing = editingId === issue.id;
    const isBusy = busyId === issue.id;

    return (
      <Box key={issue.id} sx={{ display: "flex", gap: 1.5, alignItems: "flex-start" }}>
        <Avatar src={issue.user.imageUrl} alt={issue.user.name || "משתמש"} name={issue.user.name || "?"} size="sm" />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="subtitle2" fontWeight={700}>
                {issue.user.name || "משתמש"}
              </Typography>
              {!isReply && issue.category && (
                <Chip size="small" label={CATEGORY_LABELS[issue.category]} color="warning" variant="outlined" />
              )}
              {!isReply && (
                <Chip
                  size="small"
                  label={issue.status === "OPEN" ? "פתוח" : "טופל"}
                  color={issue.status === "OPEN" ? "default" : "success"}
                />
              )}
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {formatJerusalemDate(issue.createdAt)} {formatJerusalemTime(issue.createdAt)}
              {issue.edited ? " · נערך" : ""}
            </Typography>
          </Box>

          {isEditing ? (
            <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
              <TextField
                fullWidth
                size="small"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                disabled={isBusy}
                inputProps={{ maxLength: 1000 }}
              />
              <Button size="small" variant="contained" disabled={isBusy || !editText.trim()} onClick={() => saveEdit(issue)}>
                שמור
              </Button>
              <Button size="small" onClick={() => setEditingId(null)} disabled={isBusy}>
                ביטול
              </Button>
            </Stack>
          ) : (
            issue.description && (
              <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: "pre-wrap" }}>
                {issue.description}
              </Typography>
            )
          )}

          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5 }} flexWrap="wrap">
            <IconButton size="small" onClick={() => react(issue, "LIKE")} disabled={isBusy} color={issue.viewerReaction === "LIKE" ? "primary" : "default"}>
              {issue.viewerReaction === "LIKE" ? <ThumbUpIcon fontSize="inherit" /> : <ThumbUpOutlinedIcon fontSize="inherit" />}
            </IconButton>
            <Typography variant="caption" color="text.secondary">{issue.likeCount || ""}</Typography>
            <IconButton size="small" onClick={() => react(issue, "DISLIKE")} disabled={isBusy} color={issue.viewerReaction === "DISLIKE" ? "error" : "default"}>
              {issue.viewerReaction === "DISLIKE" ? <ThumbDownIcon fontSize="inherit" /> : <ThumbDownOutlinedIcon fontSize="inherit" />}
            </IconButton>
            <Typography variant="caption" color="text.secondary">{issue.dislikeCount || ""}</Typography>

            {!isReply && (
              <Button size="small" onClick={() => { setReplyingTo(issue.id); setReplyText(""); }} sx={{ ml: 1 }}>
                הגיבו
              </Button>
            )}
            {isOwn && !isEditing && (
              <IconButton size="small" onClick={() => { setEditingId(issue.id); setEditText(issue.description || ""); }}>
                <EditOutlinedIcon fontSize="inherit" />
              </IconButton>
            )}
            {canModify && (
              <IconButton size="small" onClick={() => remove(issue.id)} disabled={isBusy} color="error">
                <DeleteOutlineIcon fontSize="inherit" />
              </IconButton>
            )}
            {!isOwn && userId && (
              <IconButton
                size="small"
                onClick={(e) => setFlagMenu({ el: e.currentTarget, issueId: issue.id })}
                title="דיווח על תוכן"
              >
                <FlagOutlinedIcon fontSize="inherit" />
              </IconButton>
            )}
            {!isReply && isAdmin && (
              <Button size="small" color={issue.status === "OPEN" ? "success" : "inherit"} disabled={isBusy} onClick={() => toggleStatus(issue)}>
                {issue.status === "OPEN" ? "סמן כטופל" : "פתח מחדש"}
              </Button>
            )}
          </Stack>

          {replyingTo === issue.id && (
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <TextField
                fullWidth
                size="small"
                placeholder="כתבו תגובה..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                disabled={busyId === issue.id}
                inputProps={{ maxLength: 1000 }}
              />
              <Button size="small" variant="contained" disabled={busyId === issue.id || !replyText.trim()} onClick={() => submitReply(issue.id)}>
                שלח
              </Button>
              <Button size="small" onClick={() => setReplyingTo(null)}>
                ביטול
              </Button>
            </Stack>
          )}

          {!isReply && issue.replies.length > 0 && (
            <Stack spacing={1.5} sx={{ mt: 1.5, pl: 3, borderRight: "2px solid", borderColor: "divider", pr: 1 }}>
              {issue.replies.map((r) => renderRow(r, true))}
            </Stack>
          )}
        </Box>
      </Box>
    );
  };

  return (
    <Card sx={{ mb: 3, p: 3 }} dir="rtl">
      <Typography variant="h6" fontWeight={700} sx={{ mb: 0.5 }}>
        דיווח על ליקויים במגרש
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
        בורות, תאורה לקויה, ציוד שבור וכו&apos; — הדיווחים נשמרים ומוצגים כאן לכולם
      </Typography>

      {userId ? (
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "flex-start", mb: 2 }}>
          <Select
            size="small"
            value={category}
            onChange={(e) => setCategory(e.target.value as FieldIssueCategory)}
            disabled={submitting}
            sx={{ minWidth: 160 }}
          >
            {CATEGORIES.map((c) => (
              <MenuItem key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </MenuItem>
            ))}
          </Select>
          <TextField
            size="small"
            placeholder="תיאור (לא חובה)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={submitting}
            inputProps={{ maxLength: 1000 }}
            sx={{ flex: 1, minWidth: 200 }}
          />
          <Button variant="contained" color="warning" onClick={submit} disabled={submitting} sx={{ minWidth: 96 }}>
            {submitting ? <CircularProgress size={20} color="inherit" /> : "דווח"}
          </Button>
        </Box>
      ) : (
        <Alert severity="info" sx={{ mb: 2 }}>יש להתחבר כדי לדווח על ליקוי.</Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Typography variant="body2" color="text.secondary">טוען דיווחים…</Typography>
      ) : issues.length === 0 ? (
        <Typography variant="body2" color="text.secondary">לא דווחו ליקויים במגרש זה.</Typography>
      ) : (
        <Stack spacing={2} divider={<Divider />}>
          {issues.map((i) => renderRow(i, false))}
        </Stack>
      )}

      <Snackbar
        open={showSuccess}
        autoHideDuration={3000}
        onClose={() => setShowSuccess(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="success" variant="filled" onClose={() => setShowSuccess(false)}>
          הדיווח נשלח ונשמר, תודה!
        </Alert>
      </Snackbar>

      <Menu anchorEl={flagMenu?.el} open={!!flagMenu} onClose={() => setFlagMenu(null)}>
        {(Object.keys(FLAG_REASON_LABELS) as FieldFlagReason[]).map((reason) => (
          <MenuItem key={reason} onClick={() => submitFlag(reason)}>
            {FLAG_REASON_LABELS[reason]}
          </MenuItem>
        ))}
      </Menu>

      <Snackbar
        open={flagSent}
        autoHideDuration={3000}
        onClose={() => setFlagSent(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="success" variant="filled" onClose={() => setFlagSent(false)}>
          הדיווח נשלח לבדיקת הצוות, תודה!
        </Alert>
      </Snackbar>
    </Card>
  );
}
