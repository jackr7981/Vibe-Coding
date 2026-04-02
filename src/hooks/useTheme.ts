import { useEffect, useState } from "react";

const STORAGE_KEY = "crewtracker-theme";

export function useTheme() {
  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored !== "light"; // default: dark
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", "light");
    }
    localStorage.setItem(STORAGE_KEY, isDark ? "dark" : "light");
  }, [isDark]);

  return {
    isDark,
    toggle: () => setIsDark((v) => !v),
  };
}
