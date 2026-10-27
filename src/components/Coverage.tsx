import { useEffect, useRef } from "react";

// The dex board: one cell per (layer, slice of neurons), lit by how many neurons in it are caught. Drawn once per
// update, nothing animates.
export function Coverage({ coverage, layers, bins }: { coverage: number[]; layers: number; bins: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cell = 8;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = bins * cell * dpr;
    c.height = layers * cell * dpr;
    const g = c.getContext("2d")!;
    g.scale(dpr, dpr);
    g.fillStyle = "#000";
    g.fillRect(0, 0, bins * cell, layers * cell);
    const max = Math.max(1, ...coverage);
    for (let l = 0; l < layers; l++)
      for (let b = 0; b < bins; b++) {
        const v = coverage[l * bins + b] ?? 0;
        g.fillStyle = v ? `rgba(255,255,255,${0.25 + 0.75 * Math.sqrt(v / max)})` : "#121212";
        g.fillRect(b * cell, l * cell, cell - 1, cell - 1);
      }
  }, [coverage, layers, bins]);
  return (
    <div className="flex gap-2">
      <div className="flex flex-col justify-between py-[1px] font-mono text-[10px] leading-none text-faint">
        <span>L0</span>
        <span>L{layers - 1}</span>
      </div>
      <canvas ref={ref} style={{ width: bins * cell, height: layers * cell }} className="max-w-full" />
    </div>
  );
}
