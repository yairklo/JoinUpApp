import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Skeleton from "@mui/material/Skeleton";

export default function GameCardSkeletonRow({ count = 3 }: { count?: number }) {
  return (
    <Stack direction="row" spacing={1.5} px={1} sx={{ overflow: "hidden" }}>
      {Array.from({ length: count }).map((_, i) => (
        <Box
          key={i}
          sx={{
            minWidth: { xs: 252, sm: 300 },
            maxWidth: { xs: 268, sm: 320 },
            flexShrink: 0,
            borderRadius: { xs: 4, sm: 5 },
            overflow: "hidden",
            border: "1px solid",
            borderColor: "rgba(148,163,184,0.16)",
          }}
        >
          <Skeleton variant="rectangular" height={132} animation="wave" />
          <Box sx={{ p: 2, pt: 1.75 }}>
            <Skeleton variant="text" width="70%" height={28} animation="wave" />
            <Skeleton variant="text" width="45%" height={20} animation="wave" />
            <Skeleton variant="rounded" height={6} sx={{ mt: 1.5, borderRadius: 999 }} animation="wave" />
          </Box>
        </Box>
      ))}
    </Stack>
  );
}
