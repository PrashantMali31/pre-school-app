'use client';
import { useId, useState } from 'react';
import { motion } from 'framer-motion';

export interface TrendPoint {
  label: string;
  value: number; // 0-100
  sub?: string;
}

function smoothPath(pts: { x: number; y: number }[]) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x},${p2.y}`;
  }
  return d;
}

/** Signature attendance-trend area chart: animated draw, gradient wash, hover dots. */
export default function TrendChart({ data }: { data: TrendPoint[] }) {
  const gid = useId().replace(/:/g, '');
  const [active, setActive] = useState<number | null>(null);

  const W = 600;
  const H = 240;
  const padL = 34;
  const padR = 14;
  const padT = 16;
  const padB = 30;
  const iw = W - padL - padR;
  const ih = H - padT - padB;

  const pts = data.map((p, i) => ({
    x: padL + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw),
    y: padT + ih - (Math.max(0, Math.min(100, p.value)) / 100) * ih,
  }));

  const line = smoothPath(pts);
  const area = `${line} L ${pts[pts.length - 1].x},${padT + ih} L ${pts[0].x},${padT + ih} Z`;
  const avg = data.length ? Math.round(data.reduce((a, b) => a + b.value, 0) / data.length) : 0;

  return (
    <div className="relative mt-2" onMouseLeave={() => setActive(null)}>
      <div className="mb-1 flex items-baseline justify-between">
        <p className="text-[12px] font-bold text-[#8A84A0]">Daily attendance rate · last {data.length} days</p>
        <p className="rounded-full bg-[#EAFBEF] px-2.5 py-1 text-[11px] font-black text-[#16A34A] dark:bg-[#16A34A]/15 dark:text-[#4ADE80]">
          {avg}% avg
        </p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Attendance trend, ${avg} percent average`}>
        <defs>
          <linearGradient id={`wash${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7C9DFF" stopOpacity="0.35" />
            <stop offset="60%" stopColor="#FF8FB1" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#FF8FB1" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`stroke${gid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#FF8FB1" />
            <stop offset="100%" stopColor="#7C9DFF" />
          </linearGradient>
        </defs>

        {[0, 25, 50, 75, 100].map((g) => {
          const y = padT + ih - (g / 100) * ih;
          return (
            <g key={g}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="currentColor" strokeOpacity="0.1" strokeDasharray="4 5" />
              <text x={padL - 7} y={y + 4} textAnchor="end" fontSize="10" fontWeight="800" fill="currentColor" opacity="0.4">
                {g}
              </text>
            </g>
          );
        })}

        <motion.path
          d={area}
          fill={`url(#wash${gid})`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.9, delay: 0.5 }}
        />
        <motion.path
          d={line}
          fill="none"
          stroke={`url(#stroke${gid})`}
          strokeWidth="3.5"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
        />

        {pts.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r={active === i ? 7 : 4.5}
              fill={active === i ? '#7C9DFF' : '#fff'}
              stroke="#7C9DFF"
              strokeWidth="3"
              style={{ cursor: 'pointer', transition: 'r .2s' }}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              tabIndex={0}
              aria-label={`${data[i].label}: ${data[i].value}%${data[i].sub ? `, ${data[i].sub}` : ''}`}
            />
            <text x={p.x} y={H - 10} textAnchor="middle" fontSize="11" fontWeight="800" fill="currentColor" opacity="0.45">
              {data[i].label}
            </text>
          </g>
        ))}
      </svg>

      {active !== null && data[active] && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-2xl bg-[#1E1B2E] px-3.5 py-2 text-center text-white shadow-xl dark:bg-white dark:text-[#1E1B2E]"
          style={{
            left: `${(pts[active].x / W) * 100}%`,
            top: `${(pts[active].y / H) * 100}%`,
            marginTop: -10,
          }}
        >
          <p className="text-[15px] font-black leading-none">{data[active].value}%</p>
          <p className="mt-1 text-[10.5px] font-bold opacity-70">{data[active].label}{data[active].sub ? ` · ${data[active].sub}` : ''}</p>
        </div>
      )}
    </div>
  );
}
