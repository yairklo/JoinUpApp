"use client";

import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import EmojiEventsOutlined from "@mui/icons-material/EmojiEventsOutlined";

/** Kind info card shown instead of register/join forms for minors (spec 4.7). Not an error. */
export default function MinorsCard() {
    return (
        <Paper
            variant="outlined"
            data-testid="tournament-minors-card"
            sx={{ p: 2.5, borderRadius: 3, bgcolor: "action.hover", borderColor: "transparent" }}
        >
            <Stack direction="row" spacing={2} alignItems="flex-start">
                <EmojiEventsOutlined sx={{ color: "text.secondary" }} />
                <Stack spacing={0.5}>
                    <Typography fontWeight={700} component="h2">הטורניר הזה פתוח לבני 18 ומעלה</Typography>
                    <Typography variant="body2" color="text.secondary">
                        בינתיים טורנירים פתוחים רק למבוגרים. אפשר לעקוב אחרי המשחקים והתוצאות כאן.
                    </Typography>
                </Stack>
            </Stack>
        </Paper>
    );
}
