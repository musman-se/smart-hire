import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";

import { useLocalStorage } from "./useLocalStorage";
import { useMediaQuery } from "./useMediaQuery";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const THEME_PREFERENCES: readonly ThemePreference[] = ["light", "dark", "system"];

function isThemePreference(value: unknown): value is ThemePreference {
  return THEME_PREFERENCES.includes(value as ThemePreference);
}

/** Must match the inline script in index.html, which applies the theme before paint. */
export const THEME_STORAGE_KEY = "smarthire.theme";

/** The browser chrome colour (mobile address bar), per theme: --color-bg's value. */
const THEME_COLOR: Record<ResolvedTheme, string> = { light: "#f5f7f7", dark: "#0b1011" };

interface ThemeContextValue {
  /** What the user chose. */
  preference: ThemePreference;
  /** What is showing — "system" resolved against prefers-color-scheme. */
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  /** Flip between light and dark, leaving "system" for an explicit choice. */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [stored, setPreference] = useLocalStorage<unknown>(THEME_STORAGE_KEY, "system");
  // Storage is outside our control: anything unexpected means "system", as the inline
  // script in index.html already assumes, so the first paint and React agree.
  const preference: ThemePreference = isThemePreference(stored) ? stored : "system";
  const systemDark = useMediaQuery("(prefers-color-scheme: dark)");
  const resolved: ResolvedTheme =
    preference === "system" ? (systemDark ? "dark" : "light") : preference;

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[resolved]);
  }, [resolved]);

  const toggle = useCallback(
    () => setPreference(resolved === "dark" ? "light" : "dark"),
    [resolved, setPreference],
  );

  const value = useMemo(
    () => ({ preference, resolved, setPreference, toggle }),
    [preference, resolved, setPreference, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside <ThemeProvider>");
  return context;
}
