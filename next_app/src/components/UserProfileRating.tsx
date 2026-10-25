"use client";

import Typography from "@mui/material/Typography";
import Rating from "@mui/material/Rating";
import Stack from "@mui/material/Stack";
import { RATINGS_COPY, ratingsAverage } from "@joinup/shared/ratingsCopy";

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
                {RATINGS_COPY.noRatings}
            </Typography>
        );
    }

    return (
        <Stack direction="row" alignItems="center" justifyContent="center" spacing={1} sx={{ mt: 1 }}>
            <Rating value={ratingAverage} readOnly precision={0.1} size="small" />
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
                {ratingsAverage(ratingAverage.toFixed(1), count)}
            </Typography>
        </Stack>
    );
}
