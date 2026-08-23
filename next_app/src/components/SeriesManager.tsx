"use client";

import Link from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import CircularProgress from "@mui/material/CircularProgress";

// Icons
import EventRepeatIcon from "@mui/icons-material/EventRepeat";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import AddIcon from "@mui/icons-material/Add";
import EditCalendarIcon from "@mui/icons-material/EditCalendar";
import UpdateIcon from "@mui/icons-material/Update";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import CloseIcon from "@mui/icons-material/Close";
import { ACCEPTED_IMAGE_TYPES } from "@joinup/shared/upload";

import DeleteSeriesDialog from "./DeleteSeriesDialog";
import Avatar from "./Avatar";
import { useSeriesLogic } from "@/hooks/useSeriesLogic";

interface SeriesManagerProps {
  gameId: string;
  seriesId: string | null;
  canManage: boolean;
  gameData: {
    time: string;
    date: string;
  };
}

export default function SeriesManager({ gameId, seriesId, canManage, gameData }: SeriesManagerProps) {
  const { state, actions } = useSeriesLogic({
    gameId,
    seriesId,
    initialTime: gameData.time
  });

  if (seriesId) {
    return (
      <Box mt={2} p={2} border="1px dashed" borderColor="primary.main" borderRadius={2} bgcolor="primary.50">
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
          <Box display="flex" alignItems="center" gap={1}>
            <EventRepeatIcon color="primary" />
            <Box>
              <Typography variant="subtitle2" fontWeight="bold">משחק חוזר (קבוצה)</Typography>
              <Typography variant="caption" color="text.secondary">חלק מקבוצה קבועה</Typography>
            </Box>
          </Box>

          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={state.isSubscribed}
                onChange={actions.handleToggleSubscribe}
                disabled={state.subLoading}
              />
            }
            label={<Typography variant="caption">חברות בקבוצה</Typography>}
          />
        </Stack>

        <Box mt={2} display="flex" gap={1}>
          <Button
            component={Link}
            href={`/series/${seriesId}`}
            size="small"
            variant="text"
            endIcon={<ArrowForwardIcon />}
            fullWidth={!canManage}
            sx={{ justifyContent: canManage ? "flex-start" : "center" }}
          >
            לעמוד הקבוצה
          </Button>
        </Box>

        {canManage && (
          <Button
            startIcon={<EditCalendarIcon />}
            size="small"
            variant="outlined"
            fullWidth
            sx={{ mt: 1 }}
            onClick={() => actions.setOpen(true)}
          >
            הגדרות קבוצה
          </Button>
        )}

        <Dialog open={state.open} onClose={() => actions.setOpen(false)} fullWidth maxWidth="xs">
          <DialogTitle>הגדרות קבוצה</DialogTitle>
          <DialogContent>
            <Alert severity="info" sx={{ mb: 2 }}>
              השינויים יחולו על כל המשחקים העתידיים בקבוצה זו.
            </Alert>

            <TextField
              label="שעה קבועה"
              type="time"
              fullWidth
              margin="normal"
              value={state.editData.time}
              onChange={(e) => actions.setEditData({ ...state.editData, time: e.target.value })}
            />

            <FormControlLabel
              control={
                <Switch
                  checked={state.editData.updateFutureGames}
                  onChange={(e) => actions.setEditData({ ...state.editData, updateFutureGames: e.target.checked })}
                />
              }
              label="עדכן גם משחקים עתידיים קיימים"
            />

            <Box mt={4}>
              <Button
                color="error"
                startIcon={<DeleteForeverIcon />}
                onClick={() => actions.setDeleteDialogOpen(true)}
              >
                מחק קבוצה ומשחקים עתידיים
              </Button>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => actions.setOpen(false)}>ביטול</Button>
            <Button variant="contained" onClick={actions.handleUpdateSeries} disabled={state.loading}>
              {state.loading ? "שומר..." : "שמור שינויים"}
            </Button>
          </DialogActions>
        </Dialog>

        <DeleteSeriesDialog
          open={state.deleteDialogOpen}
          onClose={() => actions.setDeleteDialogOpen(false)}
          seriesId={seriesId}
          seriesName="קבוצה"
          onSuccess={actions.handleDeleteSeriesSuccess}
        />
      </Box>
    );
  }

  if (!canManage) return null;

  return (
    <>
      <Button
        variant="text"
        color="secondary"
        startIcon={<UpdateIcon />}
        onClick={() => actions.setOpen(true)}
        fullWidth
        sx={{ mt: 1, justifyContent: "flex-start" }}
      >
        הפוך לקבוצה שבועית
      </Button>

      <Dialog open={state.open} onClose={actions.handleCloseCreateDialog} fullWidth maxWidth="sm">
        <DialogTitle>יצירת קבוצה</DialogTitle>
        <DialogContent>
          <Tabs value={state.tabValue} onChange={(e, v) => actions.setTabValue(v)} sx={{ mb: 2 }}>
            <Tab label="אוטומטי שבועי" />
            <Tab label="תאריכים מותאמים" />
          </Tabs>

          {state.tabValue === 0 ? (
            <Box>
              <Alert severity="success" sx={{ mb: 2 }}>
                פעולה זו תיצור משחקים אוטומטית <b>כל שבוע</b> בשעה <b>{gameData.time}</b>.
              </Alert>
              <Typography variant="body2">
                • המערכת תיצור את 4 המשחקים הבאים מיד.<br />
                • שחקנים נוכחיים ירשמו אוטומטית אם הם חברים בקבוצה.<br />
                • ניתן לבטל או לערוך בכל עת.
              </Typography>
            </Box>
          ) : (
            <Box>
              <Alert severity="info" sx={{ mb: 2 }}>
                בחר תאריכים ספציפיים ליצירת קבוצה מרוכזת.
              </Alert>

              <Stack direction="row" spacing={1} alignItems="center" mb={2}>
                <TextField
                  type="datetime-local"
                  size="small"
                  fullWidth
                  value={state.tempDate}
                  onChange={(e) => actions.setTempDate(e.target.value)}
                />
                <Button variant="contained" onClick={actions.addCustomDate} disabled={!state.tempDate}>
                  <AddIcon />
                </Button>
              </Stack>

              <Box display="flex" flexWrap="wrap" gap={1}>
                {state.customDates.map((date) => (
                  <Chip
                    key={date}
                    label={new Date(date).toLocaleString()}
                    onDelete={() => actions.removeCustomDate(date)}
                  />
                ))}
                {state.customDates.length === 0 && <Typography variant="caption" color="text.secondary">לא נבחרו תאריכים</Typography>}
              </Box>
            </Box>
          )}

          <Box mt={3}>
            <Typography variant="subtitle2" gutterBottom>תמונת קבוצה (אופציונלי)</Typography>
            <Box display="flex" alignItems="center" gap={2}>
              <Avatar src={state.pendingImagePreview} name="קבוצה" alt="קבוצה" size="lg" />
              <Box display="flex" gap={1}>
                <Button size="small" variant="outlined" component="label" startIcon={<CloudUploadIcon />}>
                  {state.pendingImagePreview ? "החלף תמונה" : "בחר תמונה"}
                  <input
                    type="file"
                    hidden
                    accept={ACCEPTED_IMAGE_TYPES.join(",")}
                    onChange={(e) => {
                      actions.handlePendingImageChange(e.target.files?.[0] || null);
                      e.target.value = "";
                    }}
                  />
                </Button>
                {state.pendingImagePreview && (
                  <Button
                    size="small"
                    variant="text"
                    color="error"
                    startIcon={<CloseIcon />}
                    onClick={() => actions.handlePendingImageChange(null)}
                  >
                    הסר
                  </Button>
                )}
              </Box>
            </Box>
            {state.pendingImageError && (
              <Typography variant="caption" color="error">{state.pendingImageError}</Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={actions.handleCloseCreateDialog}>ביטול</Button>
          <Button
            variant="contained"
            onClick={actions.handleMakeRecurring}
            disabled={state.loading || (state.tabValue === 1 && state.customDates.length === 0)}
          >
            {state.loading ? <CircularProgress size={24} /> : "צור קבוצה"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}