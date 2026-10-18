import NextLink from "next/link";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Alert from "@mui/material/Alert";
import Divider from "@mui/material/Divider";
import Link from "@mui/material/Link";
import { LEGAL_IS_DRAFT, getLegalTexts } from "@joinup/shared/legal";

type Props = {
  /** Which document; the text comes from shared/legal.js (same as the mobile app). */
  kind: "terms" | "privacy";
  /** Route path of this page, used for the language switch. */
  path: string;
  lang?: string;
};

/** Renders the Terms / Privacy document in Hebrew (default) or English (?lang=en). */
export default function LegalDocumentView({ kind, path, lang }: Props) {
  const texts = getLegalTexts(lang);
  const doc = texts[kind];
  const isEn = texts.lang === "en";

  return (
    <Container maxWidth="md" sx={{ py: 6 }} dir={texts.dir} lang={texts.lang}>
      <Stack spacing={2.5}>
        <Stack direction="row" justifyContent="space-between" alignItems="baseline" gap={2} flexWrap="wrap">
          <Typography variant="h4" component="h1" fontWeight={800}>{doc.title}</Typography>
          <Link component={NextLink} href={isEn ? path : `${path}?lang=en`} underline="hover" lang={isEn ? "he" : "en"}>
            {isEn ? "עברית" : "English"}
          </Link>
        </Stack>
        <Typography variant="body2" color="text.secondary">{texts.lastUpdatedLabel}: {texts.lastUpdated}</Typography>
        {LEGAL_IS_DRAFT && (
          <Alert severity="info">
            {isEn ? "This document is under legal review and may change." : "נוסח המסמך נמצא בבדיקה משפטית ועשוי להתעדכן."}
          </Alert>
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
                <Typography key={i} component="ul" sx={{ paddingInlineStart: 3, my: 0, "& li": { mb: 0.75 } }}>
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
