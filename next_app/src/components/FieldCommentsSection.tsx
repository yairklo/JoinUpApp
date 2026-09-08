"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { fieldsApi, FieldComment } from "@/services/api/fields";
import { formatJerusalemDate, formatJerusalemTime } from "@/utils/timezone";
import { getActionErrorMessage } from "@/utils/apiError";
import Avatar from "@/components/Avatar";
import Card from "@mui/material/Card";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Divider from "@mui/material/Divider";

export default function FieldCommentsSection({ fieldId }: { fieldId: string }) {
  const { getToken, userId } = useAuth();
  const [comments, setComments] = useState<FieldComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    fieldsApi
      .getComments(fieldId)
      .then((data) => {
        if (!ignore) setComments(data);
      })
      .catch(() => {
        if (!ignore) setComments([]);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [fieldId]);

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
        comments.map((c, idx) => (
          <Box key={c.id}>
            {idx > 0 && <Divider sx={{ my: 1.5 }} />}
            <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start" }}>
              <Avatar src={c.user.imageUrl} alt={c.user.name || "משתמש"} name={c.user.name || "?"} size="sm" />
              <Box sx={{ flex: 1 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
                  <Typography variant="subtitle2" fontWeight={700}>
                    {c.user.name || "משתמש"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatJerusalemDate(c.createdAt)} {formatJerusalemTime(c.createdAt)}
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: "pre-wrap" }}>
                  {c.text}
                </Typography>
              </Box>
            </Box>
          </Box>
        ))
      )}
    </Card>
  );
}
