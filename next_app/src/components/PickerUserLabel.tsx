"use client";

import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Avatar from "@/components/Avatar";

/** Avatar + name row used inside the add-member / add-to-game picker options and chips. */
export default function PickerUserLabel({ name, imageUrl }: { name: string; imageUrl?: string | null }) {
    return (
        <Stack direction="row" dir="rtl" alignItems="center" gap={1} sx={{ flex: 1, minWidth: 0 }}>
            <Avatar src={imageUrl} alt={name} name={name} size="sm" />
            <Typography variant="body2" noWrap>
                {name}
            </Typography>
        </Stack>
    );
}
