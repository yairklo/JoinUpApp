"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { fieldsApi, Field } from "@/services/api/fields";
import { usePaginatedFields } from "@/hooks/usePaginatedFields";
import InfiniteScrollSentinel from "@/components/InfiniteScrollSentinel";
import { SPORT_MAPPING } from "@/utils/sports";
import FieldEditorDialog from "@/components/admin/FieldEditorDialog";

import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import SearchIcon from "@mui/icons-material/Search";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import LoadingMotif from "@/components/motion/LoadingMotif";
import Alert from "@mui/material/Alert";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import Divider from "@mui/material/Divider";
import Chip from "@mui/material/Chip";
import Avatar from "@mui/material/Avatar";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import CircularProgress from "@mui/material/CircularProgress";

export default function AdminFieldsPage() {
  const { getToken } = useAuth();
  const [token, setToken] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingField, setEditingField] = useState<Field | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Field | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    getToken().then((t) => setToken(t || undefined));
  }, [getToken]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const {
    fields,
    total,
    loading,
    isInitialLoad,
    loadingMore,
    hasMore,
    error: loadError,
    loadMore,
    reload,
  } = usePaginatedFields({
    q: debouncedSearch,
    includeUnavailable: true,
    token,
    enabled: !!token,
  });

  const openCreate = () => {
    setEditingField(null);
    setEditorOpen(true);
  };

  const openEdit = (field: Field) => {
    setEditingField(field);
    setEditorOpen(true);
  };

  const toggleAvailable = async (field: Field) => {
    try {
      const t = await getToken();
      if (!t) return;
      await fieldsApi.update(field.id, { available: !field.available }, t);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "עדכון המגרש נכשל");
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const t = await getToken();
      if (!t) return;
      await fieldsApi.delete(deleteTarget.id, t);
      setDeleteTarget(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "מחיקת המגרש נכשלה");
    } finally {
      setDeleting(false);
    }
  };

  if (!token || isInitialLoad) {
    return (
      <Box display="flex" justifyContent="center" py={8}>
        <LoadingMotif id="pin-drop" label="טוען מגרשים…" />
      </Box>
    );
  }

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
        <Typography variant="h5" fontWeight={800}>ניהול מגרשים</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          מגרש חדש
        </Button>
      </Stack>

      {(error || loadError) && (
        <Alert severity="error" onClose={() => setError(null)}>{error || loadError}</Alert>
      )}

      <TextField
        placeholder="חיפוש לפי שם, עיר או כתובת…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        fullWidth
        size="small"
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        }}
      />

      <Card>
        <CardContent>
          <Stack direction="row" alignItems="center" spacing={1} mb={2}>
            <Typography fontWeight={700}>
              {debouncedSearch ? `תוצאות (${fields.length} מתוך ${total})` : `כל המגרשים (${total})`}
            </Typography>
            {loading && <CircularProgress size={16} />}
          </Stack>
          <Divider sx={{ mb: 2 }} />
          {!loading && fields.length === 0 ? (
            <Typography color="text.secondary" textAlign="center" py={4}>
              {debouncedSearch ? "לא נמצאו מגרשים התואמים את החיפוש" : "אין עדיין מגרשים"}
            </Typography>
          ) : (
            <Stack spacing={1.5} sx={{ opacity: loading ? 0.6 : 1, transition: "opacity 150ms ease" }}>
              {fields.map((field) => (
                <Stack
                  key={field.id}
                  direction={{ xs: "column", sm: "row" }}
                  justifyContent="space-between"
                  alignItems={{ sm: "center" }}
                  spacing={1.5}
                  sx={{ py: 1.5, borderBottom: 1, borderColor: "divider" }}
                >
                  <Stack direction="row" spacing={1.5} alignItems="center" flex={1} minWidth={0}>
                    <Avatar src={field.image || undefined} variant="rounded">
                      {field.name?.[0]}
                    </Avatar>
                    <Box minWidth={0}>
                      <Typography fontWeight={700} noWrap>{field.name}</Typography>
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {field.city || field.location}
                      </Typography>
                      <Stack direction="row" spacing={0.5} mt={0.5} flexWrap="wrap" useFlexGap>
                        {(field.supportedSports || []).map((s) => (
                          <Chip key={s} label={SPORT_MAPPING[s as keyof typeof SPORT_MAPPING] || s} size="small" />
                        ))}
                        {(field.lat == null || field.lng == null) && (
                          <Chip
                            label="ללא מיקום במפה"
                            size="small"
                            color="warning"
                            icon={<WarningAmberIcon />}
                            onClick={() => openEdit(field)}
                          />
                        )}
                      </Stack>
                    </Box>
                  </Stack>

                  <Stack direction="row" spacing={1} alignItems="center">
                    <FormControlLabel
                      control={<Switch checked={field.available !== false} onChange={() => toggleAvailable(field)} />}
                      label={field.available === false ? "מוסתר" : "גלוי"}
                    />
                    <IconButton onClick={() => openEdit(field)} aria-label="עריכה">
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton onClick={() => setDeleteTarget(field)} aria-label="מחיקה" color="error">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </Stack>
              ))}
            </Stack>
          )}
          <InfiniteScrollSentinel hasMore={hasMore} loading={loadingMore} onVisible={loadMore} />
        </CardContent>
      </Card>

      <FieldEditorDialog
        open={editorOpen}
        field={editingField}
        onClose={() => setEditorOpen(false)}
        onSaved={() => reload()}
      />

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} dir="rtl">
        <DialogTitle>מחיקת מגרש</DialogTitle>
        <DialogContent>
          <DialogContentText>
            האם למחוק את המגרש &quot;{deleteTarget?.name}&quot;? פעולה זו אינה הפיכה.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>ביטול</Button>
          <Button color="error" variant="contained" onClick={handleDeleteConfirm} disabled={deleting}>
            {deleting ? "מוחק…" : "מחק"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
