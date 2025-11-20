// src/hooks/useTheme.ts
import { useEffect } from "react";

export const useDefaultLightMode = () => {
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (!savedTheme) {
      // First-time user → set light mode
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
      localStorage.setItem("theme", "light");
    }
  }, []);
};
