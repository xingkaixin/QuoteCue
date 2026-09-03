import { MoonIcon } from "@phosphor-icons/react/dist/csr/Moon";
import { SunIcon } from "@phosphor-icons/react/dist/csr/Sun";
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
        <MoonIcon aria-hidden="true" size={14} weight="bold" />
      ) : (
        <SunIcon aria-hidden="true" size={14} weight="bold" />
      )}
    </Button>
  );
}
