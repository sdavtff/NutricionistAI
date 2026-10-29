// Gráficos leves em SVG (sem dependências), acessíveis e adaptados ao tema.
import type { ReactNode } from 'react';

export function Ring({
  value, max, size = 132, stroke = 12, color = 'var(--primary)', children, label,
}: { value: number; max: number; size?: number; stroke?: number; color?: string; children?: ReactNode; label: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div style={{ position: 'relative', width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.12} strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>{children}</div>
    </div>
  );
}

export function Donut({ parts, size = 120, label }: { parts: { value: number; color: string; name: string }[]; size?: number; label: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const stroke = 16;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} role="img" aria-label={label}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.1} strokeWidth={stroke} />
      {total > 0 && parts.map((p) => {
        const len = (p.value / total) * c;
        const el = (
          <circle key={p.name} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth={stroke}
            strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        );
        offset += len;
        return el;
      })}
    </svg>
  );
}

export function MacroBar({ label, value, max, unit = 'g', color, hideMax }: { label: string; value: number | null; max?: number | null; unit?: string; color: string; hideMax?: boolean }) {
  const pct = max && value !== null ? Math.min(100, (value / max) * 100) : value !== null ? 100 : 0;
  return (
    <div className="macro-row">
      <span className="row" style={{ gap: 8 }}><span className="dot" style={{ background: color }} />{label}</span>
      <div className="progress" aria-hidden><span style={{ width: `${pct}%`, background: color }} /></div>
      <span className="small strong" style={{ minWidth: 64, textAlign: 'right' }}>
        {value === null ? '—' : `${Math.round(value)} ${unit}`}{max && !hideMax ? <span className="muted"> / {Math.round(max)}</span> : null}
      </span>
    </div>
  );
}

export function BarChart({
  data, height = 160, color = 'var(--primary)', label, unit = '', reference,
}: { data: { label: string; value: number | null }[]; height?: number; color?: string; label: string; unit?: string; reference?: number | null }) {
  const values = data.map((d) => d.value ?? 0);
  const max = Math.max(1, ...values, reference ?? 0);
  const w = 100 / Math.max(1, data.length);
  return (
    <div role="img" aria-label={`${label}: ${data.map((d) => `${d.label} ${d.value ?? 'sem dados'}${unit}`).join(', ')}`}>
      <svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none">
        {reference ? (
          <line x1="0" x2="100" y1={height - 18 - ((height - 30) * reference) / max} y2={height - 18 - ((height - 30) * reference) / max}
            stroke="var(--text-3)" strokeDasharray="2 2" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
        ) : null}
        {data.map((d, i) => {
          const h = ((height - 30) * (d.value ?? 0)) / max;
          return (
            <rect key={i} x={i * w + w * 0.2} width={w * 0.6} y={height - 18 - h} height={Math.max(h, d.value ? 2 : 0)} rx="1.2"
              fill={color} opacity={d.value ? 1 : 0.25}>
              <title>{`${d.label}: ${d.value ?? 'sem dados'}${unit}`}</title>
            </rect>
          );
        })}
      </svg>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${data.length}, 1fr)`, marginTop: -16 }}>
        {data.map((d, i) => <span key={i} className="tiny muted center">{d.label}</span>)}
      </div>
    </div>
  );
}

export function LineChart({
  points, height = 180, label, unit = '',
}: { points: { label: string; value: number }[]; height?: number; label: string; unit?: string }) {
  if (points.length === 0) return null;
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const pad = (max - min) * 0.15 || 1;
  const lo = min - pad;
  const hi = max + pad;
  const W = 320;
  const H = height;
  const x = (i: number) => (points.length === 1 ? W / 2 : 16 + (i * (W - 32)) / (points.length - 1));
  const y = (v: number) => 12 + ((hi - v) / (hi - lo)) * (H - 40);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${d} L${x(points.length - 1)},${H - 28} L${x(0)},${H - 28} Z`;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ${points.map((p) => `${p.label} ${p.value}${unit}`).join(', ')}`}>
      <defs>
        <linearGradient id="lc-grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--primary)" stopOpacity="0.25" />
          <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <text x="4" y="14" fontSize="10" fill="var(--text-3)">{hi.toFixed(1)}{unit}</text>
      <text x="4" y={H - 30} fontSize="10" fill="var(--text-3)">{lo.toFixed(1)}{unit}</text>
      <path d={area} fill="url(#lc-grad)" />
      <path d={d} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.value)} r="3.5" fill="var(--surface)" stroke="var(--primary)" strokeWidth="2"><title>{`${p.label}: ${p.value}${unit}`}</title></circle>
          {(points.length <= 8 || i % Math.ceil(points.length / 6) === 0) && (
            <text x={x(i)} y={H - 10} fontSize="9" textAnchor="middle" fill="var(--text-3)">{p.label}</text>
          )}
        </g>
      ))}
    </svg>
  );
}
