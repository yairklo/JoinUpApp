import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";

export default function FieldsLoading() {
  return (
    <Box display="flex" justifyContent="center" p={6}>
      <CircularProgress size={28} />
    </Box>
  );
}
