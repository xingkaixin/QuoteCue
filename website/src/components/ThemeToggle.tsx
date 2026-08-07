import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type Theme = "dark" | "light";

interface ThemeToggleProps {
  label: string;
}

function readTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function ThemeToggle({ label }: ThemeToggleProps) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setTheme(readTheme());
  }, []);

  function toggleTheme() {
    const nextTheme = readTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem("quotecue-theme", nextTheme);
    setTheme(nextTheme);
  }

  return (
    <Button aria-label={label} onClick={toggleTheme} size="icon" variant="ghost">
      {theme === "dark" ? (
        <Moon aria-hidden="true" size={14} />
      ) : (
        <Sun aria-hidden="true" size={14} />
      )}
    </Button>
  );
}
