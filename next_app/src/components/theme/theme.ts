"use client";
import { createTheme, ThemeOptions } from "@mui/material/styles";

// ─── Soft, modern shadow scale (replaces harsh MUI defaults) ───
const softShadows = [
  "none",
  "0 1px 2px rgba(15,23,42,0.06)",
  "0 1px 3px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.04)",
  "0 4px 12px rgba(15,23,42,0.08), 0 1px 3px rgba(15,23,42,0.05)",
  "0 8px 20px rgba(15,23,42,0.10), 0 2px 6px rgba(15,23,42,0.05)",
  "0 12px 28px rgba(15,23,42,0.12), 0 4px 8px rgba(15,23,42,0.06)",
  ...Array.from({ length: 19 }, (_, i) => `0 ${12 + i}px ${30 + i * 2}px rgba(15,23,42,0.14)`),
] as unknown as ThemeOptions["shadows"];

const typographyOptions: ThemeOptions["typography"] = {
  fontFamily: "var(--font-heebo), 'Heebo', 'Segoe UI', system-ui, sans-serif",
  h1: { fontWeight: 800, letterSpacing: "-0.02em" },
  h2: { fontWeight: 800, letterSpacing: "-0.02em" },
  h3: { fontWeight: 700, letterSpacing: "-0.01em" },
  h4: { fontWeight: 700 },
  h5: { fontWeight: 700 },
  h6: { fontWeight: 700 },
  subtitle1: { fontWeight: 600 },
  subtitle2: { fontWeight: 600 },
  button: { fontWeight: 700 },
};

// Component overrides shared by both modes
const componentOverrides: ThemeOptions["components"] = {
  MuiButton: {
    defaultProps: { disableElevation: true },
    styleOverrides: {
      root: {
        borderRadius: 999,
        textTransform: "none",
        fontWeight: 700,
      },
      sizeSmall: { paddingInline: 14 },
      sizeLarge: { paddingBlock: 10, paddingInline: 26 },
    },
  },
  MuiCard: {
    styleOverrides: {
      root: ({ theme }) => ({
        borderRadius: 20,
        border: `1px solid ${theme.palette.divider}`,
        backgroundImage: "none",
      }),
    },
  },
  MuiPaper: {
    styleOverrides: {
      root: { backgroundImage: "none" },
      rounded: { borderRadius: 16 },
    },
  },
  MuiChip: {
    styleOverrides: {
      root: { fontWeight: 600 },
    },
  },
  MuiOutlinedInput: {
    styleOverrides: {
      root: { borderRadius: 12 },
    },
  },
  MuiDialog: {
    styleOverrides: {
      paper: { borderRadius: 20 },
      paperFullScreen: { borderRadius: 0 },
    },
  },
  MuiLinearProgress: {
    styleOverrides: {
      root: { borderRadius: 999, height: 6 },
      bar: { borderRadius: 999 },
    },
  },
  MuiTooltip: {
    styleOverrides: {
      tooltip: { borderRadius: 8, fontWeight: 500 },
    },
  },
  MuiAvatar: {
    styleOverrides: {
      root: { fontWeight: 700 },
    },
  },
};

// --- LIGHT THEME ---
const lightTheme = createTheme({
  direction: "rtl",
  shape: { borderRadius: 14 },
  shadows: softShadows as never,
  palette: {
    mode: "light",
    primary: {
      main: "#059669",
      light: "#34d399",
      dark: "#047857",
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#6366f1",
      light: "#a5b4fc",
      dark: "#4f46e5",
      contrastText: "#ffffff",
    },
    success: { main: "#059669", light: "#6ee7b7", dark: "#047857" },
    warning: { main: "#f59e0b" },
    error: { main: "#ef4444" },
    background: {
      default: "#f6f8fa",
      paper: "#ffffff",
    },
    text: {
      primary: "#0f172a",
      secondary: "#64748b",
    },
    divider: "rgba(15, 23, 42, 0.08)",
  },
  typography: typographyOptions,
  components: {
    ...componentOverrides,
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundImage: "linear-gradient(180deg, #ecfdf5 0%, #f6f8fa 420px)",
          backgroundAttachment: "fixed",
          backgroundRepeat: "no-repeat",
        },
      },
    },
  },
});

// --- DARK THEME ---
const darkTheme = createTheme({
  direction: "rtl",
  shape: { borderRadius: 14 },
  shadows: softShadows as never,
  palette: {
    mode: "dark",
    primary: {
      main: "#34d399",
      light: "#6ee7b7",
      dark: "#10b981",
      contrastText: "#052e16",
    },
    secondary: {
      main: "#818cf8",
      light: "#a5b4fc",
      dark: "#6366f1",
      contrastText: "#0f172a",
    },
    success: { main: "#34d399", dark: "#10b981" },
    warning: { main: "#fbbf24" },
    error: { main: "#f87171" },
    background: {
      default: "#0b1220",
      paper: "#111a2c",
    },
    text: {
      primary: "#f1f5f9",
      secondary: "#94a3b8",
    },
    divider: "rgba(148, 163, 184, 0.14)",
  },
  typography: typographyOptions,
  components: {
    ...componentOverrides,
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundImage: "linear-gradient(180deg, #0c1a16 0%, #0b1220 420px)",
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
