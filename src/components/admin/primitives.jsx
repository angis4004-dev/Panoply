import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { C, display, body, mono } from './tokens';

/* ---------------------------------- primitives ---------------------------------- */
export function Panel({ children, style, ...rest }) {
  return (
    <div
      style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children, right }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h3 style={{ ...display, color: C.text, fontSize: 14, fontWeight: 600, letterSpacing: 0.2 }}>
        {children}
      </h3>
      {right}
    </div>
  );
}

export function Pill({ children, tone = 'neutral' }) {
  const tones = {
    neutral: { color: C.textDim, bg: C.panel2, border: C.border },
    primary: { color: C.primary, bg: 'rgba(30,99,255,0.12)', border: 'rgba(30,99,255,0.35)' },
    teal: { color: C.teal, bg: 'rgba(63,191,149,0.12)', border: 'rgba(63,191,149,0.35)' },
    red: { color: C.red, bg: 'rgba(229,85,90,0.12)', border: 'rgba(229,85,90,0.35)' },
    blue: { color: C.blue, bg: 'rgba(91,155,217,0.12)', border: 'rgba(91,155,217,0.35)' },
  };
  const t = tones[tone];
  return (
    <span
      style={{
        ...mono,
        fontSize: 11,
        padding: '3px 8px',
        borderRadius: 999,
        color: t.color,
        background: t.bg,
        border: `1px solid ${t.border}`,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

export function KpiCard({ label, value, delta, positive, sub }) {
  return (
    <Panel style={{ padding: '16px 18px' }}>
      <div style={{ ...body, color: C.textDim, fontSize: 12, marginBottom: 10 }}>{label}</div>
      <div style={{ ...display, color: C.text, fontSize: 24, fontWeight: 600, marginBottom: 6 }}>
        {value}
      </div>
      <div className="flex items-center gap-1">
        {positive ? (
          <ArrowUpRight size={13} color={C.teal} />
        ) : (
          <ArrowDownRight size={13} color={C.red} />
        )}
        <span style={{ ...mono, fontSize: 11.5, color: positive ? C.teal : C.red }}>{delta}</span>
        {sub && (
          <span style={{ ...body, fontSize: 11.5, color: C.textFaint, marginLeft: 4 }}>{sub}</span>
        )}
      </div>
    </Panel>
  );
}

export function ShieldGauge({ score = 87 }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  return (
    <div className="flex flex-col items-center justify-center" style={{ padding: '8px 0' }}>
      <svg width="150" height="150" viewBox="0 0 150 150">
        <circle cx="75" cy="75" r={r} fill="none" stroke={C.borderSoft} strokeWidth="10" />
        <circle
          cx={75}
          cy={75}
          r={r}
          fill="none"
          stroke={C.primary}
          strokeWidth={10}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 75 75)"
        />
        <text
          x="75"
          y="70"
          textAnchor="middle"
          style={{ ...display, fontSize: 30, fontWeight: 700, fill: C.text }}
        >
          {score}
        </text>
        <text
          x="75"
          y="90"
          textAnchor="middle"
          style={{ ...mono, fontSize: 10, fill: C.textDim, letterSpacing: 1 }}
        >
          SHIELD SCORE
        </text>
      </svg>
    </div>
  );
}

export function DataTable({ columns, rows }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                style={{
                  ...mono,
                  fontSize: 10.5,
                  color: C.textFaint,
                  textAlign: 'left',
                  padding: '0 14px 10px 0',
                  textTransform: 'uppercase',
                  letterSpacing: 0.6,
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, style, ...rest }) {
  return (
    <td
      style={{
        ...body,
        fontSize: 12.5,
        color: C.text,
        padding: '12px 14px 12px 0',
        borderBottom: `1px solid ${C.borderSoft}`,
        ...style,
      }}
      {...rest}
    >
      {children}
    </td>
  );
}

/* ---------------------------------- form elements ---------------------------------- */
export function Button({ children, onClick, variant = 'ghost', icon: Icon, style, disabled }) {
  const variants = {
    primary: { background: C.primary, color: '#F2F5FA', border: `1px solid ${C.primary}` },
    ghost: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}` },
    outline: { background: 'transparent', color: C.primary, border: `1px solid ${C.primaryDim}` },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13] disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        ...mono,
        fontSize: 11.5,
        borderRadius: 6,
        padding: '8px 13px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontWeight: 500,
        ...variants[variant],
        ...style,
      }}
    >
      {Icon && <Icon size={13} />}
      {children}
    </button>
  );
}

/* ---------------------------------- form fields ---------------------------------- */
export function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          ...mono,
          fontSize: 10.5,
          color: C.textFaint,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

export const inputStyle = {
  width: '100%',
  background: C.panel2,
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  padding: '9px 11px',
  color: C.text,
  fontSize: 13,
  ...body,
  outline: 'none',
};

export function TextInput(props) {
  return <input {...props} style={{ ...inputStyle, ...(props.style || {}) }} />;
}

export function Select({ value, onChange, options }) {
  return (
    <select value={value} onChange={onChange} style={{ ...inputStyle, cursor: 'pointer' }}>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
