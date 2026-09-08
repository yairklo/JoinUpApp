"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { fieldsApi, FieldComment } from "@/services/api/fields";
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
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Snackbar from "@mui/material/Snackbar";
import ThumbUpOutlinedIcon from "@mui/icons-material/ThumbUpOutlined";
import ThumbUpIcon from "@mui/icons-material/ThumbUp";
import ThumbDownOutlinedIcon from "@mui/icons-material/ThumbDownOutlined";
import ThumbDownIcon from "@mui/icons-material/ThumbDown";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import FlagOutlinedIcon from "@mui/icons-material/FlagOutlined";
import type { FieldFlagReason } from "@/services/api/fields";

const FLAG_REASON_LABELS: Record<FieldFlagReason, string> = {
  OFFENSIVE: "תוכן פוגעני",
  FALSE_INFO: "מידע שקרי",
  SPAM: "ספאם",
  OTHER: "אחר",
};

function replaceInTree(list: FieldComment[], id: string, next: FieldComment): FieldComment[] {
  return list.map((c) => {
    if (c.id === id) return next;
    if (c.replies?.some((r) => r.id === id)) {
      return { ...c, replies: c.replies.map((r) => (r.id === id ? next : r)) };
    }
    return c;
  });
}

function removeFromTree(list: FieldComment[], id: string): FieldComment[] {
  return list
    .filter((c) => c.id !== id)
    .map((c) => ({ ...c, replies: (c.replies || []).filter((r) => r.id !== id) }));
}

export default function FieldCommentsSection({ fieldId }: { fieldId: string }) {
  const { getToken, userId } = useAuth();
  const { isAdmin } = useIsAdmin();
  const [comments, setComments] = useState<FieldComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flagMenu, setFlagMenu] = useState<{ el: HTMLElement; commentId: string } | null>(null);
  const [flagSent, setFlagSent] = useState(false);

  useEffect(() => {
    let ignore = false;
    (async () => {
      const token = await getToken().catch(() => null);
      fieldsApi
        .getComments(fieldId, token || undefined)
        .then((data) => {
          if (!ignore) setComments(data);
        })
        .catch(() => {
          if (!ignore) setComments([]);
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
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        setError("יש להתחבר כדי להוסיף תגובה");
        return;
      }
      const created = await fieldsApi.addComment(fieldId, trimmed, token);
      setComments((prev) => [created, ...prev]);
      setText("");
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
      const created = await fieldsApi.addComment(fieldId, trimmed, token, parentId);
      setComments((prev) =>
        prev.map((c) => (c.id === parentId ? { ...c, replies: [...c.replies, created] } : c))
      );
      setReplyingTo(null);
      setReplyText("");
    } catch (e) {
      setError(getActionErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const saveEdit = async (comment: FieldComment) => {
    const trimmed = editText.trim();
    if (!trimmed) return;
    setBusyId(comment.id);
    setError(null);
    try {
      const token = await getToken();
      if (!token) return;
      const updated = await fieldsApi.editComment(fieldId, comment.id, trimmed, token);
      setComments((prev) => replaceInTree(prev, comment.id, updated));
      setEditingId(null);
    } catch (e) {
      setError(getActionErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (commentId: string) => {
    if (!confirm("למחוק את התגובה?")) return;
    setBusyId(commentId);
    setError(null);
    try {
      const token = await getToken();
      if (!token) return;
      await fieldsApi.deleteComment(fieldId, commentId, token);
      setComments((prev) => removeFromTree(prev, commentId));
    } catch (e) {
      setError(getActionErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const react = async (comment: FieldComment, type: "LIKE" | "DISLIKE") => {
    setBusyId(comment.id);
    try {
      const token = await getToken();
      if (!token) {
        setError("יש להתחבר כדי להגיב");
        return;
      }
      const result = await fieldsApi.reactToComment(fieldId, comment.id, type, token);
      setComments((prev) => replaceInTree(prev, comment.id, { ...comment, ...result }));
    } catch (e) {
      setError(getActionErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const submitFlag = async (reason: FieldFlagReason) => {
    if (!flagMenu) return;
    const commentId = flagMenu.commentId;
    setFlagMenu(null);
    try {
      const token = await getToken();
      if (!token) {
        setError("יש להתחבר כדי לדווח על תגובה");
        return;
      }
      await fieldsApi.flagComment(fieldId, commentId, reason, undefined, token);
      setFlagSent(true);
    } catch (e) {
      setError(getActionErrorMessage(e));
    }
  };

  const renderRow = (comment: FieldComment, isReply: boolean) => {
    const isOwn = !!userId && comment.user.id === userId;
    const canModify = isOwn || isAdmin;
    const isEditing = editingId === comment.id;
    const isBusy = busyId === comment.id;

    return (
      <Box key={comment.id} sx={{ display: "flex", gap: 1.5, alignItems: "flex-start" }}>
        <Avatar src={comment.user.imageUrl} alt={comment.user.name || "משתמש"} name={comment.user.name || "?"} size="sm" />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
            <Typography variant="subtitle2" fontWeight={700}>
              {comment.user.name || "משתמש"}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {formatJerusalemDate(comment.createdAt)} {formatJerusalemTime(comment.createdAt)}
              {comment.edited ? " · נערך" : ""}
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
              <Button size="small" variant="contained" disabled={isBusy || !editText.trim()} onClick={() => saveEdit(comment)}>
                שמור
              </Button>
              <Button size="small" onClick={() => setEditingId(null)} disabled={isBusy}>
                ביטול
              </Button>
            </Stack>
          ) : (
            <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: "pre-wrap" }}>
              {comment.text}
            </Typography>
          )}

          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5 }}>
            <IconButton size="small" onClick={() => react(comment, "LIKE")} disabled={isBusy} color={comment.viewerReaction === "LIKE" ? "primary" : "default"}>
              {comment.viewerReaction === "LIKE" ? <ThumbUpIcon fontSize="inherit" /> : <ThumbUpOutlinedIcon fontSize="inherit" />}
            </IconButton>
            <Typography variant="caption" color="text.secondary">{comment.likeCount || ""}</Typography>
            <IconButton size="small" onClick={() => react(comment, "DISLIKE")} disabled={isBusy} color={comment.viewerReaction === "DISLIKE" ? "error" : "default"}>
              {comment.viewerReaction === "DISLIKE" ? <ThumbDownIcon fontSize="inherit" /> : <ThumbDownOutlinedIcon fontSize="inherit" />}
            </IconButton>
            <Typography variant="caption" color="text.secondary">{comment.dislikeCount || ""}</Typography>

            {!isReply && (
              <Button size="small" onClick={() => { setReplyingTo(comment.id); setReplyText(""); }} sx={{ ml: 1 }}>
                הגיבו
              </Button>
            )}
            {isOwn && !isEditing && (
              <IconButton size="small" onClick={() => { setEditingId(comment.id); setEditText(comment.text); }}>
                <EditOutlinedIcon fontSize="inherit" />
              </IconButton>
            )}
            {canModify && (
              <IconButton size="small" onClick={() => remove(comment.id)} disabled={isBusy} color="error">
                <DeleteOutlineIcon fontSize="inherit" />
              </IconButton>
            )}
            {!isOwn && userId && (
              <IconButton
                size="small"
                onClick={(e) => setFlagMenu({ el: e.currentTarget, commentId: comment.id })}
                title="דיווח על תגובה"
              >
                <FlagOutlinedIcon fontSize="inherit" />
              </IconButton>
            )}
          </Stack>

          {replyingTo === comment.id && (
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <TextField
                fullWidth
                size="small"
                placeholder="כתבו תגובה..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                disabled={busyId === comment.id}
                inputProps={{ maxLength: 1000 }}
              />
              <Button size="small" variant="contained" disabled={busyId === comment.id || !replyText.trim()} onClick={() => submitReply(comment.id)}>
                שלח
              </Button>
              <Button size="small" onClick={() => setReplyingTo(null)}>
                ביטול
              </Button>
            </Stack>
          )}

          {!isReply && comment.replies.length > 0 && (
            <Stack spacing={1.5} sx={{ mt: 1.5, pl: 3, borderRight: "2px solid", borderColor: "divider", pr: 1 }}>
              {comment.replies.map((r) => renderRow(r, true))}
            </Stack>
          )}
        </Box>
      </Box>
    );
  };

  return (
    <Card sx={{ mb: 3, p: 3 }} dir="rtl">
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
        תגובות על המגרש
      </Typography>

      {userId ? (
        <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
          <TextField
            fullWidth
            size="small"
            placeholder="כתבו תגובה על המגרש..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={submitting}
            inputProps={{ maxLength: 1000 }}
          />
          <Button
            variant="contained"
            onClick={submit}
            disabled={submitting || !text.trim()}
            sx={{ minWidth: 96 }}
          >
            {submitting ? <CircularProgress size={20} color="inherit" /> : "שלח"}
          </Button>
        </Box>
      ) : (
        <Alert severity="info" sx={{ mb: 2 }}>
          יש להתחבר כדי להוסיף תגובה.
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Typography variant="body2" color="text.secondary">
          טוען תגובות…
        </Typography>
      ) : comments.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          אין עדיין תגובות על המגרש הזה.
        </Typography>
      ) : (
        <Stack spacing={2} divider={<Divider />}>
          {comments.map((c) => renderRow(c, false))}
        </Stack>
      )}

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
