import type { Rarity } from "../../convex/rules";

export const RARITY_COLOR: Record<Rarity, string> = {
  legendary: "text-legendary",
  epic: "text-epic",
  rare: "text-rare",
  uncommon: "text-uncommon",
  common: "text-common",
  glitch: "text-glitch",
};

export const RARITY_MARKS: Record<Rarity, number> = { legendary: 4, epic: 3, rare: 2, uncommon: 1, common: 0, glitch: 1 };

// "14·2742": layer and neuron, the dex number.
export function dexNo(layer: number, n: number) {
  return `${String(layer).padStart(2, "0")}·${String(n).padStart(4, "0")}`;
}

export function ago(ms: number) {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function until(ms: number) {
  const s = Math.max(0, (ms - Date.now()) / 1000);
  if (s < 3600) return `${Math.ceil(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}

export function heatColor(heat: number | null, correct = false) {
  if (correct) return "text-good";
  if (heat === null) return "text-faint";
  if (heat >= 70) return "text-hot";
  if (heat >= 45) return "text-warm";
  if (heat >= 20) return "text-fg";
  return "text-cool";
}
