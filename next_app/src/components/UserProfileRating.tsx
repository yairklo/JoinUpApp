"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Rating from "@mui/material/Rating";
import Stack from "@mui/material/Stack";

export default function UserProfileRating({
    ratingAverage,
    totalRatings,
}: {
    ratingAverage?: number | null;
    totalRatings?: number;
}) {
    const count = totalRatings ?? 0;
    if (count === 0 || ratingAverage == null) {
        return (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                אין דירוגים עדיין
            </Typography>
        );
    }

    return (
        <Stack direction="row" alignItems="center" justifyContent="center" spacing={1} sx={{ mt: 1 }}>
            <Rating value={ratingAverage} readOnly precision={0.1} size="small" />
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
                {ratingAverage.toFixed(1)} ({count} דירוגים)
            </Typography>
        </Stack>
    );
}
