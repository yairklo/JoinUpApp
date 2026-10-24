"use client";

import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import LockOutlined from "@mui/icons-material/LockOutlined";
import { useState } from "react";
import { teamBanners, type BannerInput } from "./teamModel";

export type TeamStatusBannersProps = BannerInput;

/** Status + roster banners for the team page (spec 4.5). APPROVED collapses to a small chip once dismissed. */
export default function TeamStatusBanners(props: TeamStatusBannersProps) {
    const [dismissed, setDismissed] = useState(false);
    const banners = teamBanners(props);
    if (!banners.length) return null;
    return (
        <Stack spacing={1} data-testid="team-status-banner">
            {banners.map((b) => {
                if (b.key === "approved" && dismissed) {
                    return <Chip key={b.key} color="success" size="small" label="מאושרת" sx={{ alignSelf: "flex-start" }} data-testid="team-approved-chip" />;
                }
                return (
                    <Alert
                        key={b.key}
                        severity={b.severity}
                        icon={b.key === "locked" ? <LockOutlined fontSize="inherit" /> : undefined}
                        onClose={b.key === "approved" ? () => setDismissed(true) : undefined}
                        sx={{ borderRadius: 3 }}
                        data-testid={`team-banner-${b.key}`}
                    >
                        {b.text}
                    </Alert>
                );
            })}
        </Stack>
    );
}
