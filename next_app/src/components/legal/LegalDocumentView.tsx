import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Alert from "@mui/material/Alert";
import Divider from "@mui/material/Divider";
import { LEGAL_IS_DRAFT, LEGAL_LAST_UPDATED, type LegalDocument } from "@joinup/shared/legal";

/** Renders a Terms / Privacy document from shared/legal.js (same text as the mobile app). */
export default function LegalDocumentView({ doc }: { doc: LegalDocument }) {
  return (
    <Container maxWidth="md" sx={{ py: 6 }} dir="rtl">
      <Stack spacing={2.5}>
        <Typography variant="h4" component="h1" fontWeight={800}>{doc.title}</Typography>
        <Typography variant="body2" color="text.secondary">עדכון אחרון: {LEGAL_LAST_UPDATED}</Typography>
        {LEGAL_IS_DRAFT && (
          <Alert severity="info">נוסח המסמך נמצא בבדיקה משפטית ועשוי להתעדכן.</Alert>
        )}

        {doc.intro.map((p, i) => (
          <Typography key={i}>{p}</Typography>
        ))}

        <Divider />

        {doc.sections.map((section) => (
          <Stack key={section.heading} spacing={1.25} component="section">
            <Typography variant="h6" component="h2" fontWeight={700}>{section.heading}</Typography>
            {section.blocks.map((block, i) =>
              "ul" in block ? (
                <Typography key={i} component="ul" sx={{ pr: 3, pl: 0, my: 0, "& li": { mb: 0.75 } }}>
                  {block.ul.map((item, j) => <li key={j}>{item}</li>)}
                </Typography>
              ) : (
                <Typography key={i}>{block.p}</Typography>
              )
            )}
          </Stack>
        ))}
      </Stack>
    </Container>
  );
}
