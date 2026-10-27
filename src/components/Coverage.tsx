import { useEffect, useRef } from "react";
import { useIsDark } from "../lib/theme";

// The dex board: one cell per (layer, slice of neurons), lit by how many neurons in it are caught. Drawn once per
// update, nothing animates.
export function Coverage({ coverage, layers, bins }: { coverage: number[]; layers: number; bins: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dark = useIsDark(); // a canvas can't use CSS variables, so redraw when the theme flips
  const cell = 8;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const css = getComputedStyle(document.documentElement);
    const [empty, lit] = [css.getPropertyValue("--raised").trim(), css.getPropertyValue("--good").trim()];
    const dpr = window.devicePixelRatio || 1;
    c.width = bins * cell * dpr;
    c.height = layers * cell * dpr;
    const g = c.getContext("2d")!;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, bins * cell, layers * cell);
    const max = Math.max(1, ...coverage);
    for (let l = 0; l < layers; l++)
      for (let b = 0; b < bins; b++) {
        const v = coverage[l * bins + b] ?? 0;
        g.globalAlpha = v ? 0.35 + 0.65 * Math.sqrt(v / max) : 1;
        g.fillStyle = v ? lit : empty;
        g.fillRect(b * cell, l * cell, cell - 1, cell - 1);
      }
  }, [coverage, layers, bins, dark]);
  return (
    <div className="flex gap-2">
      <div className="flex flex-col justify-between py-[1px] font-mono text-xs leading-none text-faint">
        <span>L0</span>
        <span>L{layers - 1}</span>
      </div>
      <canvas ref={ref} style={{ width: bins * cell, height: layers * cell }} className="max-w-full" aria-label="Caught neurons by layer" role="img" />
    </div>
  );
}
