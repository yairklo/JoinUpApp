"use client";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function ThemeToggle(){
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    <button className="btn btn-secondary w-10 h-10 p-0" onClick={()=>setTheme(isDark?"light":"dark")} aria-label="Toggle theme">
      {isDark ? <Sun className="h-4 w-4"/> : <Moon className="h-4 w-4"/>}
    </button>
  );
}


