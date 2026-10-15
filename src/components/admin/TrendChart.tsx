"use client";

import { useState } from "react";

// A current-vs-previous line chart with a hover crosshair. Two series only, and
// they are told apart by stroke style as well as tone (solid ink against a
// dashed grey), so the comparison never rests on colour alone.

export interface TrendPoint {
  label: string; // the x-axis date for the current period
  value: number;
  prev?: number;
}

const W = 720;
const H = 220;
const PAD = { top: 12, right: 12, bottom: 24, left: 44 };

const fmt = (n: number) => n.toLocaleString("en-AU", { maximumFractionDigits: 0 });
const day = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" });

// A "nice" axis ceiling, so gridlines land on round numbers.
function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((c) => c >= v) ?? v;
}

export default function TrendChart({
  points,
  unit,
  prevLabel = "Previous period",
}: {
  points: TrendPoint[];
  unit: string;
  prevLabel?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const hasPrev = points.some((p) => p.prev !== undefined);

  if (points.length < 2) {
    return <p className="py-16 text-center text-sm text-ash">Not enough data in this range yet.</p>;
  }

  const max = niceMax(Math.max(...points.map((p) => Math.max(p.value, p.prev ?? 0))));
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (i / (points.length - 1)) * iw;
  const y = (v: number) => PAD.top + ih - (v / max) * ih;
  const path = (get: (p: TrendPoint) => number) =>
    points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(get(p)).toFixed(1)}`).join("");
  const area = `${path((p) => p.value)}L${x(points.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const every = Math.ceil(points.length / 7);

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const rel = ((e.clientX - box.left) / box.width) * iw;
    setHover(Math.max(0, Math.min(points.length - 1, Math.round((rel / iw) * (points.length - 1)))));
  };

  const h = hover === null ? null : points[hover];

  return (
    <div>
      <div className="mb-2 flex items-center gap-5 text-xs text-ash">
        <span className="flex items-center gap-2">
          <svg width="18" height="4" aria-hidden><line x1="0" y1="2" x2="18" y2="2" stroke="var(--color-ink)" strokeWidth="2" /></svg>
          This period
        </span>
        {hasPrev && (
          <span className="flex items-center gap-2">
            <svg width="18" height="4" aria-hidden><line x1="0" y1="2" x2="18" y2="2" stroke="#a1a1a6" strokeWidth="2" strokeDasharray="4 3" /></svg>
            {prevLabel}
          </span>
        )}
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`${unit} per day`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--color-line)" />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ash text-[10px] tabular-nums">
                {fmt(t)}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            i % every === 0 ? (
              <text key={p.label} x={x(i)} y={H - 6} textAnchor="middle" className="fill-ash text-[10px]">
                {day(p.label)}
              </text>
            ) : null,
          )}
          <path d={area} fill="var(--color-ink)" opacity={0.06} />
          {hasPrev && (
            <path d={path((p) => p.prev ?? 0)} fill="none" stroke="#a1a1a6" strokeWidth={2} strokeDasharray="4 3" />
          )}
          <path d={path((p) => p.value)} fill="none" stroke="var(--color-ink)" strokeWidth={2} strokeLinejoin="round" />
          {h && hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + ih} stroke="var(--color-ash)" strokeDasharray="2 2" />
              <circle cx={x(hover)} cy={y(h.value)} r={4} fill="var(--color-ink)" stroke="#fff" strokeWidth={2} />
            </g>
          )}
          <rect
            x={PAD.left}
            y={PAD.top}
            width={iw}
            height={ih}
            fill="transparent"
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
          />
        </svg>
        {h && hover !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 border border-line bg-white px-3 py-2 text-xs shadow-sm"
            style={{
              left: `${(x(hover) / W) * 100}%`,
              transform: hover > points.length / 2 ? "translateX(calc(-100% - 8px))" : "translateX(8px)",
            }}
          >
            <div className="font-mono text-[0.65rem] uppercase tracking-wider text-ash">{day(h.label)}</div>
            <div className="mt-1 tabular-nums text-ink">
              <strong>{fmt(h.value)}</strong> {unit}
            </div>
            {h.prev !== undefined && (
              <div className="tabular-nums text-ash">
                {fmt(h.prev)} {prevLabel.toLowerCase()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
