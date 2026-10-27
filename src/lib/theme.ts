import { useEffect, useState } from "react";

const KEY = "neuronaut:theme"; // index.html reads the same key before first paint

// Light or dark, remembered per browser. Light is the default.
export function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next ? "#000000" : "#f7f5f0");
    localStorage.setItem(KEY, next ? "dark" : "light");
    setDark(next);
  };
  return { dark, toggle };
}

// The how-to-play card opens by itself on a first visit, once.
const SEEN = "neuronaut:seen-howto";
export const firstVisit = () => !localStorage.getItem(SEEN);
export const markSeen = () => localStorage.setItem(SEEN, "1");

// Whether dark mode is on, for things that can't read CSS variables (Clerk's modal, canvases).
export function useIsDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const o = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    o.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => o.disconnect();
  }, []);
  return dark;
}
