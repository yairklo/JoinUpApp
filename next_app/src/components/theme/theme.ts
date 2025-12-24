// src/theme/theme.ts
"use client";
import { createTheme } from "@mui/material/styles";

// 1. הגדרת פלטת צבעים מודרנית
const theme = createTheme({
  palette: {
    mode: "light", // הכנה ל-Dark Mode
    primary: {
      main: "#6366f1", // Indigo - צבע מודרני ונעים (במקום הכחול ברירת מחדל)
      light: "#818cf8",
      dark: "#4f46e5",
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#10b981", // Emerald - ירוק רענן לפעולות חיוביות (כמו Join)
      light: "#34d399",
      dark: "#059669",
    },
    background: {
      default: "#f8fafc", // רקע אפור-כחלחל בהיר מאוד (לא לבן משעמם)
      paper: "#ffffff",
    },
    text: {
      primary: "#1e293b", // שחור-כחול כהה (יותר נעים לקריאה משחור מוחלט)
      secondary: "#64748b",
    },
  },
  
  // 2. עיצוב גלובלי לרכיבים (Components)
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12, // כפתורים עגולים יותר
          textTransform: "none", // ביטול ה-CAPSLOCK המעצבן של MUI
          fontWeight: 600,
          padding: "10px 24px",
          boxShadow: "none",
          "&:hover": {
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)", // צללית עדינה בהובר
          },
        },
        containedPrimary: {
           background: "linear-gradient(45deg, #6366f1 30%, #818cf8 90%)", // גרדיאנט לכפתורים ראשיים
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16, // כרטיסים עגולים
          boxShadow: "0 4px 20px rgba(0,0,0,0.05)", // צללית רכה ומודרנית (במקום הצל הגס של ברירת המחדל)
          border: "1px solid rgba(255, 255, 255, 0.3)", // אפקט עדין
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        rounded: {
          borderRadius: 16,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            borderRadius: 12, // שדות קלט עגולים
          },
        },
      },
    },
  },
  
  // 3. טיפוגרפיה (אופציונלי - אפשר לשנות פונט בהמשך)
  typography: {
    fontFamily: "inherit", // יורש מהגדרות ה-CSS הגלובליות שלך
    h1: { fontWeight: 700 },
    h2: { fontWeight: 700 },
    h3: { fontWeight: 700 },
    button: { fontWeight: 600 },
  },
});

export default theme;