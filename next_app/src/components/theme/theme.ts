"use client";
import { createTheme, ThemeOptions } from "@mui/material/styles";

// Common component overrides (Buttons, Cards, etc.)
const componentOverrides: ThemeOptions["components"] = {
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
};

// Common typography
const typographyOptions: ThemeOptions["typography"] = {
  fontFamily: "inherit",
  h1: { fontWeight: 700 },
  h2: { fontWeight: 700 },
  h3: { fontWeight: 700 },
  button: { fontWeight: 600 },
};

// --- LIGHT THEME ---
const lightTheme = createTheme({
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
  typography: typographyOptions,
  components: {
    ...componentOverrides,
    // Define the Light Mode Gradient here
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundImage: "linear-gradient(135deg, #f8fafc 0%, #e0e7ff 100%)",
          backgroundAttachment: "fixed",
          backgroundRepeat: "no-repeat",
        },
      },
    },
  },
});

// --- DARK THEME ---
const darkTheme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#818cf8",
      contrastText: "#0f172a",
    },
    secondary: {
      main: "#34d399",
    },
    background: {
      default: "#0f172a", // Fallback color
      paper: "#1e293b",
    },
    text: {
      primary: "#f8fafc",
      secondary: "#94a3b8",
    },
  },
  typography: typographyOptions,
  components: {
    ...componentOverrides,
    // Define the Dark Mode Gradient here
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundImage: "linear-gradient(135deg, #0f172a 0%, #312e81 100%)",
          backgroundAttachment: "fixed",
          backgroundRepeat: "no-repeat",
        },
      },
    },
  },
});

export const getAppTheme = (mode: "light" | "dark") => {
  return mode === "light" ? lightTheme : darkTheme;
};