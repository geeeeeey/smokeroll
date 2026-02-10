import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type Theme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getTelegramScheme(): Theme | null {
  const tg = (window as any).Telegram?.WebApp;
  const s = tg?.colorScheme;
  if (s === "dark" || s === "light") return s;
  return null;
}

function getSystemScheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getInitialTheme(): Theme {
  const stored = localStorage.getItem("theme");
  if (stored === "dark" || stored === "light") return stored;
  return getTelegramScheme() ?? getSystemScheme();
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => getInitialTheme());

  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem("theme", t);
  };

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      // Keep Telegram header/footer colors consistent with selected theme.
      const tg = (window as any).Telegram?.WebApp;
      tg?.setHeaderColor?.(theme === "dark" ? "#0B0B0F" : "#FFFFFF");
      tg?.setBackgroundColor?.(theme === "dark" ? "#0B0B0F" : "#FFFFFF");
    } catch {
      // ignore
    }
  }, [theme]);

  const value = useMemo<ThemeContextValue>(() => ({ theme, setTheme, toggleTheme }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
