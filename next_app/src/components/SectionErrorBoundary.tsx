"use client";

import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";

type Props = { label: string; children: React.ReactNode };

type State = { error: Error | null };

/**
 * Isolates a crash in one section of a page (e.g. a widget on the game page) so the rest of
 * the page -- and the guest "sign in to join" bar -- keeps rendering instead of falling back to
 * the route-level `app/error.tsx`. Only catches client render errors; a failed server render is
 * still handled by the route's error.tsx.
 */
export default class SectionErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[SectionErrorBoundary:${this.props.label}] Uncaught exception:`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <Box
          dir="rtl"
          role="alert"
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 1,
            p: 3,
            textAlign: "center",
            border: 1,
            borderColor: "divider",
            borderRadius: 2,
            bgcolor: "action.hover",
          }}
        >
          <Typography variant="subtitle1" fontWeight={800}>
            {this.props.label} לא נטען
          </Typography>
          <Typography variant="body2" color="text.secondary">
            שאר העמוד ממשיך לעבוד. אפשר לנסות שוב או לרענן.
          </Typography>
          <Button size="small" variant="outlined" onClick={() => this.setState({ error: null })}>
            נסה שוב
          </Button>
        </Box>
      );
    }
    return this.props.children;
  }
}
