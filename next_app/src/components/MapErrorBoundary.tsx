"use client";

import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";

type Props = { children: React.ReactNode };

type State = { error: Error | null };

/**
 * Isolates Google Maps / AdvancedMarker crashes so they cannot take down the
 * whole /search (or fields) route via `app/error.tsx`.
 */
export default class MapErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[MapErrorBoundary] Uncaught map exception:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <Box
          dir="rtl"
          sx={{
            width: "100%",
            height: "100%",
            minHeight: 180,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 1,
            p: 3,
            textAlign: "center",
            bgcolor: "action.hover",
          }}
        >
          <Typography variant="subtitle1" fontWeight={800}>
            המפה לא נטענה
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 360 }}>
            אפשר להמשיך לחפש ברשימה. אם הבעיה נמשכת, רעננו את העמוד או בדקו חיבור לרשת.
          </Typography>
          <Button
            size="small"
            variant="outlined"
            onClick={() => this.setState({ error: null })}
            sx={{ mt: 1 }}
          >
            נסה שוב את המפה
          </Button>
        </Box>
      );
    }
    return this.props.children;
  }
}
