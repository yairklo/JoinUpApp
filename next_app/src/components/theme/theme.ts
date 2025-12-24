"use client";
import { createTheme, ThemeOptions } from "@mui/material/styles";

// Common settings (typography, shape, etc.)
const baseOptions: ThemeOptions = {
  typography: {
    fontFamily: "inherit",
    h1: { fontWeight: 700 },
    h2: { fontWeight: 700 },
    h3: { fontWeight: 700 },
    button: { fontWeight: 600 },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          textTransform: "none",
          fontWeight: 600,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
        },
      },
    },
  },
};

// Light Mode Palette
const lightTheme = createTheme({
  ...baseOptions,
  palette: {
    mode: "light",
    primary: {
      main: "#6366f1",
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#10b981",
    },
    background: {
      default: "#f8fafc",
      paper: "#ffffff",
    },
    text: {
      primary: "#1e293b",
      secondary: "#64748b",
    },
  },
});

// Dark Mode Palette
const darkTheme = createTheme({
  ...baseOptions,
  palette: {
    mode: "dark",
    primary: {
      main: "#818cf8", // Lighter shade for dark mode visibility
      contrastText: "#0f172a",
    },
    secondary: {
      main: "#34d399",
    },
    background: {
      default: "#0f172a", // Dark Navy
      paper: "#1e293b",   // Slightly lighter navy for cards
    },
    text: {
      primary: "#f8fafc",
      secondary: "#94a3b8",
    },
  },
});

// Function to get the correct theme
export const getAppTheme = (mode: "light" | "dark") => {
  return mode === "light" ? lightTheme : darkTheme;
};