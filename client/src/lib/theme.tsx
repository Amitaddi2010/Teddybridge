import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const isDashboard = location.startsWith("/dashboard");
  
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("teddybridge-theme") as Theme;
      if (stored) return stored;
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return "light";
  });

  // Force light mode on non-dashboard pages
  const effectiveTheme = isDashboard ? theme : "light";

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(effectiveTheme);
    // Only save theme preference if on dashboard
    if (isDashboard) {
    localStorage.setItem("teddybridge-theme", theme);
    }
  }, [effectiveTheme, theme, isDashboard]);

  const toggleTheme = () => {
    // Only allow theme toggle on dashboard pages
    if (isDashboard) {
    setTheme(theme === "light" ? "dark" : "light");
    }
  };

  return (
    <ThemeContext.Provider value={{ theme: effectiveTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
