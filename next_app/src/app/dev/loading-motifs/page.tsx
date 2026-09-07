"use client";

import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import LoadingMotif from "@/components/motion/LoadingMotif";
import { LOADING_MOTIFS, LOADING_MOTIF_FAMILY_LABELS } from "@joinup/shared";

/**
 * Internal picker: preview every loading motif on web so we can choose which
 * screen gets which animation. Not linked from nav. Mobile twin: /dev/loading-motifs.
 */
export default function LoadingMotifsPreviewPage() {
  return (
    <main>
      <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }} dir="rtl">
        <Typography variant="h4" fontWeight={800} sx={{ mb: 1 }}>
          אנימציות טעינה
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 2, maxWidth: 640 }}>
          אותם מזהים רצים גם בווב וגם באפליקציית המובייל. דף המשחק כבר משתמש ב־
          <Box component="span" sx={{ fontWeight: 700 }}>
            bouncing-ball
          </Box>
          . בחרו מוטיב למסכים אחרים — עוד לא חיברנו אותם.
        </Typography>
        <Alert severity="info" sx={{ mb: 3 }}>
          ווב: <strong>/dev/loading-motifs</strong>
          {" · "}
          מובייל: אותו נתיב. כדי לחבר מסך, העבירו את ה־id ל־
          <Box component="code" sx={{ fontSize: 13 }}>
            {"<LoadingMotif id=\"…\" />"}
          </Box>
          .
        </Alert>

        <Grid container spacing={2.5}>
          {LOADING_MOTIFS.map((motif) => (
            <Grid key={motif.id} size={{ xs: 12, sm: 6, md: 4 }}>
              <Card elevation={0} sx={{ p: 2.5, height: "100%", display: "flex", flexDirection: "column" }}>
                <Box
                  sx={{
                    height: 168,
                    borderRadius: 3,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    mb: 2,
                    bgcolor: (t) =>
                      t.palette.mode === "dark" ? "rgba(148,163,184,0.06)" : "rgba(15,23,42,0.035)",
                  }}
                >
                  <LoadingMotif id={motif.id} />
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.75 }}>
                  <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>
                    {motif.labelHe}
                  </Typography>
                  <Chip
                    size="small"
                    label={LOADING_MOTIF_FAMILY_LABELS[motif.family].he}
                    sx={{ fontWeight: 600 }}
                  />
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace", display: "block", mb: 1 }}>
                  {motif.id}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {motif.suggestedHe}
                </Typography>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>
    </main>
  );
}
