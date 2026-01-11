"use client";
import { createTheme, ThemeOptions } from "@mui/material/styles";
import { Inter } from "next/font/google";

const inter = Inter({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

// Common typography
const typographyOptions: ThemeOptions["typography"] = {
  fontFamily: inter.style.fontFamily,
  h1: { fontWeight: 700 },
  h2: { fontWeight: 700 },
  h3: { fontWeight: 700 },
  button: { fontWeight: 600, textTransform: "none" },
};

// Common component styling
const commonComponents: ThemeOptions["components"] = {
  MuiButton: {
    styleOverrides: {
      root: {
        borderRadius: 50, // Pill-shaped as requested
        fontWeight: 600,
        textTransform: "none",
        padding: "10px 24px", // Ensure good clickable area without changing "size" drastically
      },
      containedPrimary: {
        boxShadow: "none",
        "&:hover": {
          boxShadow: "0px 4px 12px rgba(0,0,0,0.2)",
        },
      },
    },
  },
  MuiTypography: {
    styleOverrides: {
      root: {
        // ensuring text colors are respected if not overridden
      }
    }
  }
};

// --- LIGHT THEME (Cyber Pop) ---
const lightTheme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#2979FF", // Electric Blue
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#7C4DFF", // Deep Purple
    },
    background: {
      default: "#F8F5FF", // Very Pale Lavender
      paper: "#FFFFFF",   // Pure white
    },
    text: {
      primary: "#1A1B2E", // Dark Purple-Grey
      secondary: "#474966", // Slightly lighter for contrast
    },
  },
  typography: typographyOptions,
  components: {
    ...commonComponents,
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: "0px 8px 24px rgba(149, 157, 165, 0.1)", // Soft shadows
          border: "none",
        },
      },
    },
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: "#F8F5FF",
        },
      },
    },
  },
});

// --- DARK THEME (Stealth Sport) ---
const darkTheme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#C6FF00", // Neon Volt/Yellow
      contrastText: "#000000",
    },
    secondary: {
      main: "#2979FF", // Electric Blue accent
    },
    background: {
      default: "#0F172A", // Deep Midnight Blue
      paper: "#1E293B",   // Lighter Navy
    },
    text: {
      primary: "#F8FAFC", // White-Blue
      secondary: "#94A3B8", // Slate
    },
  },
  typography: typographyOptions,
  components: {
    ...commonComponents,
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          backgroundColor: "#1E293B",
          border: "1px solid #334155", // Subtle border
          boxShadow: "none",
        },
      },
    },
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: "#0F172A",
        },
      },
    },
  },
});

export const getAppTheme = (mode: "light" | "dark") => {
  return mode === "light" ? lightTheme : darkTheme;
};