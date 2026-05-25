"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

// MUI
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import MenuItem from "@mui/material/MenuItem";
import Grid from "@mui/material/Grid";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import Collapse from "@mui/material/Collapse";
import Paper from "@mui/material/Paper";

// Icons
import EditIcon from "@mui/icons-material/Edit";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";

import { SPORT_MAPPING } from "@/utils/sports";
import { useGameEditor, GameEditorProps } from "@/hooks/useGameEditor";

export const SPORTS = Object.entries(SPORT_MAPPING).map(([value, label]) => ({
  value,
  label,
}));

// Extend the props to include canManage, which isn't in the hook props but is in the component props
interface ComponentProps extends GameEditorProps {
  canManage: boolean;
}

export default function GameDetailsEditor(props: ComponentProps) {
  const { canManage } = props;

  // Use the custom hook
  const { state, actions } = useGameEditor(props);

  if (!canManage) return null;

  return (
    <>
      <Button
        variant="outlined"
        size="small"
        startIcon={<EditIcon />}
        onClick={actions.handleOpen}
        sx={{ mt: 2, borderRadius: 2 }}
        fullWidth
      >
        ערוך פרטי משחק
      </Button>

      <Dialog open={state.open} onClose={actions.handleClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, direction: "rtl" }}>
          <EditIcon color="primary" />
          עריכת פרטי משחק
        </DialogTitle>
        <DialogContent dir="rtl">
          <Alert severity="info" sx={{ mb: 2 }}>
            שינויים אלו יחולו על המשחק הנוכחי בלבד.
          </Alert>
          <Box py={1}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12 }}>
                <TextField
                  label="כותרת המשחק (אופציונלי)"
                  fullWidth
                  value={state.title}
                  onChange={(e) => actions.setTitle(e.target.value)}
                  placeholder="למשל: כדורגל שישי בצהריים"
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  label="תאריך"
                  type="date"
                  fullWidth
                  value={state.date}
                  onChange={(e) => actions.setDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  label="שעה"
                  type="time"
                  fullWidth
                  value={state.time}
                  onChange={(e) => actions.setTime(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  label="כמות שחקנים מקסימלית"
                  type="number"
                  fullWidth
                  value={state.maxPlayers}
                  onChange={(e) => actions.setMaxPlayers(parseInt(e.target.value))}
                  InputProps={{ inputProps: { min: 2 } }}
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  label='גודל קבוצה (למשל 5 ל "5X5")'
                  type="number"
                  fullWidth
                  value={state.teamSize || ""}
                  onChange={(e) => actions.setTeamSize(e.target.value ? parseInt(e.target.value) : null)}
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  label="מחיר (₪)"
                  type="number"
                  fullWidth
                  value={state.price || ""}
                  onChange={(e) => actions.setPrice(e.target.value ? parseInt(e.target.value) : null)}
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  select
                  label="סוג ספורט"
                  fullWidth
                  value={state.sport}
                  onChange={(e) => actions.setSport(e.target.value)}
                >
                  {SPORTS.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              {/* Future Registration Section */}
              <Grid size={{ xs: 12 }} mt={2}>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <FormControlLabel
                    control={<Switch checked={state.futureRegEnabled} onChange={(e) => actions.setFutureRegEnabled(e.target.checked)} />}
                    label="פתיחת רישום עתידית"
                    sx={{ flexDirection: 'row-reverse', width: '100%', justifyContent: 'flex-end', mr: 0 }}
                  />
                  <Collapse in={state.futureRegEnabled}>
                    <Grid container spacing={2} mt={1}>
                      <Grid size={{ xs: 6 }}>
                        <TextField
                          label="תאריך פתיחה"
                          type="date"
                          fullWidth
                          value={state.regDate}
                          onChange={(e) => actions.setRegDate(e.target.value)}
                          InputLabelProps={{ shrink: true }}
                        />
                      </Grid>
                      <Grid size={{ xs: 6 }}>
                        <TextField
                          label="שעה"
                          type="time"
                          fullWidth
                          value={state.regTime}
                          onChange={(e) => actions.setRegTime(e.target.value)}
                          InputLabelProps={{ shrink: true }}
                        />
                      </Grid>
                    </Grid>
                  </Collapse>
                </Paper>
              </Grid>

              {/* Friends Only / Private Section */}
              <Grid size={{ xs: 12 }} mt={2}>
                <Paper variant="outlined" sx={{ p: 2, borderColor: state.isFriendsOnly ? 'primary.main' : 'divider' }}>
                  <FormControlLabel
                    control={<Switch checked={state.isFriendsOnly} onChange={(e) => actions.setIsFriendsOnly(e.target.checked)} />}
                    label="משחק פרטי (לחברים בלבד)"
                    sx={{ flexDirection: 'row-reverse', width: '100%', justifyContent: 'flex-end', mr: 0 }}
                  />

                  <Collapse in={state.isFriendsOnly}>
                    <Box mt={2} p={2} bgcolor="grey.50" borderRadius={1} border={1} borderColor="divider">
                      <FormControlLabel
                        control={<Switch checked={state.makePublicLater} onChange={(e) => actions.setMakePublicLater(e.target.checked)} />}
                        label="פתח לציבור במועד מאוחר יותר"
                        sx={{ flexDirection: 'row-reverse', width: '100%', justifyContent: 'flex-end', mr: 0 }}
                      />
                      <Collapse in={state.makePublicLater}>
                        <Grid container spacing={2} mt={1}>
                          <Grid size={{ xs: 6 }}>
                            <TextField
                              label="תאריך פתיחה לציבור"
                              type="date"
                              fullWidth
                              value={state.publicDate}
                              onChange={(e) => actions.setPublicDate(e.target.value)}
                              InputLabelProps={{ shrink: true }}
                            />
                          </Grid>
                          <Grid size={{ xs: 6 }}>
                            <TextField
                              label="שעת פתיחה"
                              type="time"
                              fullWidth
                              value={state.publicTime}
                              onChange={(e) => actions.setPublicTime(e.target.value)}
                              InputLabelProps={{ shrink: true }}
                            />
                          </Grid>
                        </Grid>
                      </Collapse>
                    </Box>
                  </Collapse>
                </Paper>
              </Grid>

            </Grid>
          </Box>
        </DialogContent>
        <DialogActions sx={{ direction: "ltr", display: "flex", justifyContent: "space-between" }}>
          <Button
            color="error"
            onClick={actions.deleteGame}
            startIcon={<DeleteForeverIcon />}
            disabled={state.loading}
          >
            מחק משחק
          </Button>
          <Box>
            <Button onClick={actions.handleClose} color="inherit" sx={{ mr: 1 }}>ביטול</Button>
            <Button
              onClick={actions.saveGame}
              variant="contained"
              disabled={state.loading}
            >
              {state.loading ? <CircularProgress size={24} color="inherit" /> : "שמור שינויים"}
            </Button>
          </Box>
        </DialogActions>
      </Dialog>
    </>
  );
}