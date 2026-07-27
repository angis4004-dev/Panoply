import React, { useState, useEffect } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import {
  LayoutDashboard,
  Users,
  Bot,
  Landmark,
  FileText,
  Cpu,
  DollarSign,
  Search,
  Bell,
  TrendingUp,
  AlertTriangle,
  ShieldCheck,
  MoreHorizontal,
  ArrowUpRight,
  ArrowDownRight,
  X,
  Plus,
  Pencil,
} from 'lucide-react';

/* ---------------------------------- tokens ---------------------------------- */
const C = {
  bg: '#0A0E13',
  panel: '#10151C',
  panel2: '#161D26',
  border: '#212A35',
  borderSoft: '#1A222C',
  text: '#E7ECF2',
  textDim: '#8B96A5',
  textFaint: '#5C6675',
  gold: '#1E63FF',
  goldDim: '#3D5A9E',
  teal: '#3FBF95',
  red: '#E5555A',
  blue: '#5B9BD9',
};

const display = { fontFamily: "'Space Grotesk', 'Inter', sans-serif" };
const body = { fontFamily: "'Inter', sans-serif" };
const mono = { fontFamily: "'JetBrains Mono', monospace" };

/* ---------------------------------- primitives ---------------------------------- */
function Panel({ children, style, ...rest }) {
  return (
    <div
      style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children, right }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h3 style={{ ...display, color: C.text, fontSize: 14, fontWeight: 600, letterSpacing: 0.2 }}>
        {children}
      </h3>
      {right}
    </div>
  );
}

function Pill({ children, tone = 'neutral' }) {
  const tones = {
    neutral: { color: C.textDim, bg: C.panel2, border: C.border },
    gold: { color: C.gold, bg: 'rgba(30,99,255,0.12)', border: 'rgba(30,99,255,0.35)' },
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

function KpiCard({ label, value, delta, positive, sub }) {
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

function ShieldGauge({ score = 87 }) {
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
          stroke={C.gold}
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

function DataTable({ columns, rows }) {
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

function Td({ children, style, ...rest }) {
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
function Button({ children, onClick, variant = 'ghost', icon: Icon, style }) {
  const variants = {
    gold: { background: C.gold, color: '#F2F5FA', border: `1px solid ${C.gold}` },
    ghost: { background: 'transparent', color: C.textDim, border: `1px solid ${C.border}` },
    outline: { background: 'transparent', color: C.gold, border: `1px solid ${C.goldDim}` },
  };
  return (
    <button
      onClick={onClick}
      style={{
        ...mono,
        fontSize: 11.5,
        borderRadius: 6,
        padding: '8px 13px',
        cursor: 'pointer',
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
function Field({ label, children }) {
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

const inputStyle = {
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

function TextInput(props) {
  return <input {...props} style={{ ...inputStyle, ...(props.style || {}) }} />;
}

function Select({ value, onChange, options }) {
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

/* ---------------------------------- modal ---------------------------------- */
function Modal({ title, onClose, children, footer }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(4,6,9,0.65)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 440,
          maxWidth: '100%',
          maxHeight: '85vh',
          overflowY: 'auto',
          background: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        <div
          className="flex items-center justify-between"
          style={{ padding: '16px 20px', borderBottom: `1px solid ${C.borderSoft}` }}
        >
          <h3 style={{ ...display, fontSize: 15, fontWeight: 600, color: C.text }}>{title}</h3>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: C.textFaint,
            }}
          >
            <X size={17} />
          </button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
        {footer && (
          <div
            className="flex items-center justify-end gap-2"
            style={{ padding: '14px 20px', borderTop: `1px solid ${C.borderSoft}` }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------- user detail / edit modal ---------------------------------- */
function UserDetailModal({ user, onClose, onSave }) {
  const [form, setForm] = useState(user);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <Modal
      title={form.name}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="gold" onClick={() => onSave(form)}>
            Save changes
          </Button>
        </>
      }
    >
      <div style={{ ...mono, fontSize: 10.5, color: C.textFaint, marginBottom: 16 }}>
        {user.id} · {user.wallet}
      </div>

      <Field label="Full name">
        <TextInput value={form.name} onChange={set('name')} />
      </Field>
      <Field label="Email">
        <TextInput value={form.email} onChange={set('email')} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Risk profile">
          <Select
            value={form.risk}
            onChange={set('risk')}
            options={['Conservative', 'Balanced', 'Aggressive']}
          />
        </Field>
        <Field label="Account status">
          <Select
            value={form.status}
            onChange={set('status')}
            options={['active', 'flagged', 'onboarding', 'suspended']}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Active bots">
          <TextInput value={form.bots} onChange={set('bots')} type="number" />
        </Field>
        <Field label="Portfolio value">
          <TextInput value={form.value} onChange={set('value')} />
        </Field>
      </div>

      <Field label="Wallet address">
        <TextInput value={form.wallet} onChange={set('wallet')} style={mono} />
      </Field>

      <Field label="Admin notes">
        <textarea
          value={form.notes}
          onChange={set('notes')}
          rows={3}
          placeholder="Internal notes — not visible to the user."
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </Field>

      <div style={{ ...mono, fontSize: 10.5, color: C.textFaint, marginTop: 4 }}>
        Joined {form.joined}
      </div>
    </Modal>
  );
}

/* ---------------------------------- add bot modal ---------------------------------- */
function AddBotModal({ onClose, onAdd }) {
  const [form, setForm] = useState({
    type: 'Grid',
    pair: 'ETH/USDC',
    user: '',
    confidence: 80,
    status: 'running',
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <Modal
      title="Add trading bot"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="gold" onClick={() => onAdd(form)} disabled={!form.user}>
            Create bot
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Strategy type">
          <Select
            value={form.type}
            onChange={set('type')}
            options={['Grid', 'DCA', 'Arbitrage', 'Trailing Stop']}
          />
        </Field>
        <Field label="Pair">
          <Select
            value={form.pair}
            onChange={set('pair')}
            options={['ETH/USDC', 'BTC/USDC', 'SOL/USDT', 'ARB/USDC']}
          />
        </Field>
      </div>
      <Field label="Assigned user">
        <TextInput value={form.user} onChange={set('user')} placeholder="e.g. Marcus Owusu" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Model confidence (%)">
          <TextInput
            type="number"
            min="0"
            max="100"
            value={form.confidence}
            onChange={set('confidence')}
          />
        </Field>
        <Field label="Status">
          <Select
            value={form.status}
            onChange={set('status')}
            options={['running', 'paused', 'fallback']}
          />
        </Field>
      </div>
      <div style={{ fontSize: 11.5, color: C.textFaint }}>
        Bots below 70% confidence automatically revert to static parameters per the fallback policy.
      </div>
    </Modal>
  );
}

/* ---------------------------------- add model modal ---------------------------------- */
function AddModelModal({ onClose, onAdd }) {
  const [form, setForm] = useState({ name: '', scope: '', confidence: 80, drift: 'stable' });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <Modal
      title="Register ML model"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="gold" onClick={() => onAdd(form)} disabled={!form.name}>
            Register model
          </Button>
        </>
      }
    >
      <Field label="Model name">
        <TextInput
          value={form.name}
          onChange={set('name')}
          placeholder="e.g. Slippage Prediction (GBM)"
        />
      </Field>
      <Field label="Scale / used by">
        <TextInput value={form.scope} onChange={set('scope')} placeholder="e.g. Copy trading" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Confidence (%)">
          <TextInput
            type="number"
            min="0"
            max="100"
            value={form.confidence}
            onChange={set('confidence')}
          />
        </Field>
        <Field label="Drift status">
          <Select
            value={form.drift}
            onChange={set('drift')}
            options={['stable', 'watch', 'critical']}
          />
        </Field>
      </div>
      <div style={{ fontSize: 11.5, color: C.textFaint }}>
        New models start in shadow mode until confidence is validated against live traffic.
      </div>
    </Modal>
  );
}

/* ---------------------------------- mock data ---------------------------------- */
const mauSeries = [
  { m: 'Feb', v: 4200 },
  { m: 'Mar', v: 5800 },
  { m: 'Apr', v: 7100 },
  { m: 'May', v: 9400 },
  { m: 'Jun', v: 11800 },
  { m: 'Jul', v: 14650 },
];

const revenueSeries = [
  { k: 'Trading fees', v: 82400 },
  { k: 'Vault fees', v: 41200 },
  { k: 'Pro subs', v: 28900 },
  { k: 'API access', v: 9600 },
];

const retentionSeries = [
  { k: 'D7', v: 61 },
  { k: 'D30', v: 38 },
  { k: 'D90', v: 22 },
];

const flaggedActivity = [
  {
    id: 'FA-1042',
    type: 'Anomaly',
    detail: 'Isolation forest flagged unusual withdrawal pattern',
    user: '0x7c4…9adf',
    sev: 'high',
    time: '6m ago',
  },
  {
    id: 'FA-1041',
    type: 'Fallback',
    detail: 'Grid bot confidence 61% — reverted to static params',
    user: '0x1b2…6f21',
    sev: 'med',
    time: '22m ago',
  },
  {
    id: 'FA-1040',
    type: 'Delivery',
    detail: 'Portfolio report email bounced (SES)',
    user: '0x9a0…3cd4',
    sev: 'low',
    time: '41m ago',
  },
  {
    id: 'FA-1039',
    type: 'Anomaly',
    detail: 'Arbitrage bot latency spike on routing venue',
    user: 'system',
    sev: 'med',
    time: '1h ago',
  },
  {
    id: 'FA-1038',
    type: 'Fallback',
    detail: 'DCA regime detector confidence 58% — paused contributions',
    user: '0x44e…11ba',
    sev: 'med',
    time: '2h ago',
  },
];

const initialVaults = [
  {
    name: 'Meridian Yield',
    manager: '0x8f…3a1',
    score: 92,
    risk: 'Low',
    aum: '$4.2M',
    investors: 318,
  },
  {
    name: 'Nova Arbitrage',
    manager: '0x21…c9e',
    score: 87,
    risk: 'Med',
    aum: '$2.9M',
    investors: 204,
  },
  {
    name: 'Ledger Grid Co.',
    manager: '0x6b…7f0',
    score: 79,
    risk: 'Med',
    aum: '$1.8M',
    investors: 152,
  },
  {
    name: 'Quiet Compound',
    manager: '0x9d…4b2',
    score: 74,
    risk: 'Low',
    aum: '$1.1M',
    investors: 98,
  },
];

const initialUsers = [
  {
    id: 'USR-001',
    name: 'Marcus Owusu',
    email: 'marcus.o@proton.me',
    risk: 'Aggressive',
    bots: 4,
    value: '$18,420',
    status: 'active',
    joined: 'Jun 2, 2026',
    wallet: '0x7c4a…9adf',
    notes: '',
  },
  {
    id: 'USR-002',
    name: 'Aiko Tanaka',
    email: 'aiko.t@gmail.com',
    risk: 'Balanced',
    bots: 2,
    value: '$62,110',
    status: 'active',
    joined: 'May 14, 2026',
    wallet: '0x1b2f…6f21',
    notes: '',
  },
  {
    id: 'USR-003',
    name: 'Priya Nair',
    email: 'priya.nair@outlook.com',
    risk: 'Conservative',
    bots: 1,
    value: '$8,050',
    status: 'active',
    joined: 'Jul 1, 2026',
    wallet: '0x9a04…3cd4',
    notes: '',
  },
  {
    id: 'USR-004',
    name: 'Diego Fernandez',
    email: 'd.fernandez@icloud.com',
    risk: 'Aggressive',
    bots: 6,
    value: '$134,900',
    status: 'flagged',
    joined: 'Mar 29, 2026',
    wallet: '0x44e1…11ba',
    notes: 'Elevated withdrawal velocity — under review.',
  },
  {
    id: 'USR-005',
    name: 'Hannah Weiss',
    email: 'hweiss@yahoo.com',
    risk: 'Balanced',
    bots: 0,
    value: '$2,300',
    status: 'onboarding',
    joined: 'Jul 10, 2026',
    wallet: '0x2f91…70c5',
    notes: '',
  },
];

const initialBots = [
  {
    id: 'BOT-8821',
    type: 'Grid',
    pair: 'ETH/USDC',
    user: 'Marcus Owusu',
    confidence: 88,
    status: 'running',
    pnl: '+4.2%',
  },
  {
    id: 'BOT-8790',
    type: 'DCA',
    pair: 'BTC/USDC',
    user: 'Aiko Tanaka',
    confidence: 74,
    status: 'running',
    pnl: '+1.1%',
  },
  {
    id: 'BOT-8765',
    type: 'Arbitrage',
    pair: 'SOL/USDT',
    user: 'Diego Fernandez',
    confidence: 91,
    status: 'running',
    pnl: '+7.8%',
  },
  {
    id: 'BOT-8754',
    type: 'Trailing Stop',
    pair: 'ETH/USDC',
    user: 'Diego Fernandez',
    confidence: 61,
    status: 'fallback',
    pnl: '-0.6%',
  },
  {
    id: 'BOT-8701',
    type: 'DCA',
    pair: 'BTC/USDC',
    user: 'Priya Nair',
    confidence: 58,
    status: 'fallback',
    pnl: '+0.3%',
  },
];

const vaultsQueue = [
  {
    name: 'Solstice Momentum',
    manager: '0x3e…8c1',
    strategy: 'Momentum / L2',
    fee: '20% perf',
    status: 'pending',
  },
  {
    name: 'Harbor Stable Yield',
    manager: '0x77…f4d',
    strategy: 'Stablecoin LP',
    fee: '2% mgmt',
    status: 'pending',
  },
  {
    name: 'Ridge Delta-Neutral',
    manager: '0xa1…09b',
    strategy: 'Delta-neutral',
    fee: '15% perf',
    status: 'review',
  },
];

const initialMlModels = [
  {
    name: 'Volatility Forecast (LSTM)',
    scope: 'Grid bots',
    confidence: 84,
    drift: 'stable',
    retrained: '3 days ago',
  },
  {
    name: 'Risk Scoring (XGBoost)',
    scope: 'Vault manager scoring',
    confidence: 91,
    drift: 'stable',
    retrained: '6 days ago',
  },
  {
    name: 'Execution Routing (RL)',
    scope: 'Arbitrage bots',
    confidence: 88,
    drift: 'watch',
    retrained: '1 day ago',
  },
  {
    name: 'Anomaly Detection (Isolation Forest)',
    scope: 'Platform-wide',
    confidence: 76,
    drift: 'watch',
    retrained: '12 hours ago',
  },
];

const reportStats = [
  { k: 'Generated today', v: '312' },
  { k: 'Delivery success', v: '98.4%' },
  { k: 'Avg. open rate', v: '61.2%' },
  { k: 'Rate-limited', v: '7' },
];

const recentReports = [
  { id: 'RPT-55210', user: 'Aiko Tanaka', risk: 42, sent: '2m ago', status: 'delivered' },
  { id: 'RPT-55209', user: 'Hannah Weiss', risk: 68, sent: '9m ago', status: 'delivered' },
  { id: 'RPT-55208', user: 'Marcus Owusu', risk: 77, sent: '18m ago', status: 'bounced' },
  { id: 'RPT-55207', user: 'Priya Nair', risk: 29, sent: '34m ago', status: 'delivered' },
];

const mrrTrend = [
  { m: 'Feb', v: 18200 },
  { m: 'Mar', v: 24100 },
  { m: 'Apr', v: 31900 },
  { m: 'May', v: 38400 },
  { m: 'Jun', v: 47700 },
  { m: 'Jul', v: 58200 },
];

const tierBreakdown = [
  { tier: 'Free', users: '9,840', mrr: '$0' },
  { tier: 'Pro', users: '1,912', mrr: '$55,448' },
  { tier: 'Institutional', users: '14', mrr: '$21,300' },
];

/* ---------------------------------- nav ---------------------------------- */
const NAV = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'users', label: 'Users', icon: Users },
  { key: 'bots', label: 'Trading Bots', icon: Bot },
  { key: 'vaults', label: 'Vaults', icon: Landmark },
  { key: 'reports', label: 'Portfolio Reports', icon: FileText },
  { key: 'models', label: 'ML Models', icon: Cpu },
  { key: 'revenue', label: 'Revenue', icon: DollarSign },
];

function AdminSidebarContent({ tab, setTab, onNavigate }) {
  return (
    <>
      <div style={{ padding: '22px 20px', borderBottom: `1px solid ${C.borderSoft}` }}>
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} color={C.gold} />
          <span style={{ ...display, fontSize: 16, fontWeight: 700, letterSpacing: 0.4 }}>
            AEGIS
          </span>
        </div>
        <div style={{ ...mono, fontSize: 10, color: C.textFaint, letterSpacing: 1.5, marginTop: 2 }}>
          ADMIN CONSOLE
        </div>
      </div>
      <nav style={{ padding: '14px 10px', flex: 1 }}>
        {NAV.map(({ key, label, icon: Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => {
                setTab(key);
                onNavigate?.();
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 12px',
                marginBottom: 2,
                borderRadius: 7,
                background: active ? C.panel2 : 'transparent',
                border: 'none',
                borderLeft: active ? `2px solid ${C.gold}` : '2px solid transparent',
                color: active ? C.text : C.textDim,
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: 13,
                ...body,
                fontWeight: active ? 600 : 500,
              }}
            >
              <Icon size={15} color={active ? C.gold : C.textFaint} />
              {label}
            </button>
          );
        })}
      </nav>
      <div style={{ padding: 14, borderTop: `1px solid ${C.borderSoft}` }}>
        <div className="flex items-center gap-2">
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              background: C.panel2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              ...mono,
              fontSize: 11,
              color: C.gold,
            }}
          >
            RK
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Riya K.</div>
            <div style={{ fontSize: 10.5, color: C.textFaint }}>Risk Ops</div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------------------------------- main ---------------------------------- */
export default function AegisAdminDashboard() {
  const [tab, setTab] = useState('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [bots, setBots] = useState([]);
  const [mlModels, setMlModels] = useState([]);

  const [selectedUser, setSelectedUser] = useState(null);
  const [showAddBot, setShowAddBot] = useState(false);
  const [showAddModel, setShowAddModel] = useState(false);

  // Fetch data on component mount and when tab changes (if needed)
  useEffect(() => {
    fetchUsers();
    fetchBots();
    fetchMLModels();
  }, []);

  const sevTone = { high: 'red', med: 'gold', low: 'blue' };
  const statusTone = {
    active: 'teal',
    flagged: 'red',
    onboarding: 'blue',
    suspended: 'red',
    running: 'teal',
    fallback: 'gold',
    paused: 'neutral',
    pending: 'gold',
    review: 'blue',
    delivered: 'teal',
    bounced: 'red',
  };

  // Fetch functions
  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/admin/users');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setUsers(data);
    } catch (error) {
      console.error('Failed to fetch users:', error);
      // Keep existing state or set to empty array
    }
  };

  const fetchBots = async () => {
    try {
      const response = await fetch('/api/admin/bots');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setBots(data);
    } catch (error) {
      console.error('Failed to fetch bots:', error);
    }
  };

  const fetchMLModels = async () => {
    try {
      const response = await fetch('/api/admin/models');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setMlModels(data);
    } catch (error) {
      console.error('Failed to fetch ML models:', error);
    }
  };

  const handleSaveUser = async (updated) => {
    try {
      const response = await fetch(`/api/admin/users/${updated.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: updated.name,
          email: updated.email,
          risk: updated.risk,
          status: updated.status,
          bots: updated.bots,
          value: updated.value,
          wallet: updated.wallet,
          notes: updated.notes,
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const updatedUser = await response.json();
      // Update the user in state
      setUsers(users.map(u => u.id === updatedUser.id ? updatedUser : u));
      setSelectedUser(null);
    } catch (error) {
      console.error('Failed to save user:', error);
      // Optionally show error to user
    }
  };

  const handleAddBot = async (form) => {
    try {
      const response = await fetch('/api/admin/bots', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: form.type,
          pair: form.pair,
          user: form.user,
          confidence: form.confidence,
          status: form.status,
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const newBot = await response.json();
      // Add the new bot to state
      setBots([newBot, ...bots]);
      setShowAddBot(false);
    } catch (error) {
      console.error('Failed to add bot:', error);
      // Optionally show error to user
    }
  };

  const handleAddModel = async (form) => {
    try {
      const response = await fetch('/api/admin/models', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: form.name,
          scope: form.scope,
          confidence: form.confidence,
          drift: form.drift,
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const newModel = await response.json();
      // Add the new model to state
      setMlModels([newModel, ...mlModels]);
      setShowAddModel(false);
    } catch (error) {
      console.error('Failed to add ML model:', error);
      // Optionally show error to user
    }
  };

  return (
    <div style={{ ...body, background: C.bg, minHeight: '100vh', color: C.text, display: 'flex' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { height: 6px; width: 6px; }
        ::-webkit-scrollbar-thumb { background: #232B36; border-radius: 4px; }
        tr:hover td { background: rgba(255,255,255,0.015); }
        tr.clickable:hover { cursor: pointer; }
        select option { background: #161D26; }
      `}</style>

      {/* Sidebar (desktop) */}
      <div
        className="hidden lg:flex"
        style={{
          width: 220,
          borderRight: `1px solid ${C.border}`,
          background: C.panel,
          flexShrink: 0,
          flexDirection: 'column',
        }}
      >
        <AdminSidebarContent tab={tab} setTab={setTab} />
      </div>

      {/* Sidebar (mobile drawer) */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation"
          />
          <div
            className="relative flex h-full flex-col shadow-2xl"
            style={{ width: 220, background: C.panel }}
          >
            <AdminSidebarContent
              tab={tab}
              setTab={setTab}
              onNavigate={() => setMobileNavOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div
          style={{
            height: 60,
            borderBottom: `1px solid ${C.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '0 16px',
            flexShrink: 0,
          }}
        >
          <button
            className="lg:hidden"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open menu"
            style={{ background: 'transparent', border: 'none', color: C.text, flexShrink: 0 }}
          >
            <LayoutDashboard size={18} />
          </button>
          <div
            className="hidden sm:flex"
            style={{
              alignItems: 'center',
              gap: 8,
              background: C.panel2,
              border: `1px solid ${C.border}`,
              borderRadius: 7,
              padding: '7px 12px',
              flex: '1 1 auto',
              minWidth: 0,
              maxWidth: 320,
            }}
          >
            <Search size={14} color={C.textFaint} style={{ flexShrink: 0 }} />
            <input
              placeholder="Search users, bots, vaults, reports…"
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: C.text,
                fontSize: 12.5,
                width: '100%',
                minWidth: 0,
                ...body,
              }}
            />
          </div>
          <div className="flex items-center gap-4" style={{ flexShrink: 0, marginLeft: 'auto' }}>
            <Pill tone="teal">All systems nominal</Pill>
            <div style={{ position: 'relative' }}>
              <Bell size={17} color={C.textDim} />
              <div
                style={{
                  position: 'absolute',
                  top: -3,
                  right: -3,
                  width: 7,
                  height: 7,
                  borderRadius: 999,
                  background: C.red,
                }}
              />
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {tab === 'overview' && (
            <OverviewTab
              {...{
                mauSeries,
                revenueSeries,
                retentionSeries,
                flaggedActivity,
                topVaults: initialVaults,
                sevTone,
              }}
            />
          )}
          {tab === 'users' && <UsersTab {...{ users, statusTone, onSelect: setSelectedUser }} />}
          {tab === 'bots' && (
            <BotsTab {...{ bots, statusTone, onAddClick: () => setShowAddBot(true) }} />
          )}
          {tab === 'vaults' && (
            <VaultsTab {...{ topVaults: initialVaults, vaultsQueue, statusTone }} />
          )}
          {tab === 'reports' && <ReportsTab {...{ reportStats, recentReports, statusTone }} />}
          {tab === 'models' && (
            <ModelsTab {...{ mlModels, onAddClick: () => setShowAddModel(true) }} />
          )}
          {tab === 'revenue' && <RevenueTab {...{ mrrTrend, tierBreakdown }} />}
        </div>
      </div>

      {selectedUser && (
        <UserDetailModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onSave={handleSaveUser}
        />
      )}
      {showAddBot && <AddBotModal onClose={() => setShowAddBot(false)} onAdd={handleAddBot} />}
      {showAddModel && (
        <AddModelModal onClose={() => setShowAddModel(false)} onAdd={handleAddModel} />
      )}
    </div>
  );
}

/* ---------------------------------- tabs ---------------------------------- */
function OverviewTab({
  mauSeries,
  revenueSeries,
  retentionSeries,
  flaggedActivity,
  topVaults,
  sevTone,
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 style={{ ...display, fontSize: 20, fontWeight: 600, marginBottom: 2 }}>Overview</h1>
        <p style={{ color: C.textDim, fontSize: 12.5 }}>
          Sunday, July 12, 2026 — last synced 40s ago
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <KpiCard
          label="Monthly active users"
          value="14,650"
          delta="+24.2%"
          positive
          sub="vs last month"
        />
        <KpiCard
          label="Sign-up conversion"
          value="18.4%"
          delta="+1.1pt"
          positive
          sub="homepage → account"
        />
        <KpiCard label="TVL / AUM" value="$9.98M" delta="+6.7%" positive sub="24h" />
        <KpiCard label="Trading volume (24h)" value="$2.31M" delta="-3.2%" sub="vs prior day" />
        <KpiCard label="Vault investment volume" value="$412K" delta="+11.5%" positive sub="7d" />
        <KpiCard
          label="Report generation rate"
          value="312 / day"
          delta="+8.9%"
          positive
          sub="P050"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Panel style={{ padding: 18, gridColumn: 'span 2' }}>
          <SectionLabel right={<Pill tone="gold">6-month trend</Pill>}>
            Monthly Active Users
          </SectionLabel>
          <ResponsiveContainer width="100%" height={190}>
            <AreaChart data={mauSeries} margin={{ left: -20, top: 5 }}>
              <defs>
                <linearGradient id="mauFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.gold} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={C.gold} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={C.borderSoft} vertical={false} />
              <XAxis
                dataKey="m"
                tick={{ fill: C.textFaint, fontSize: 11 }}
                axisLine={{ stroke: C.border }}
                tickLine={false}
              />
              <YAxis tick={{ fill: C.textFaint, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  background: C.panel2,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: C.textDim }}
              />
              <Area
                type="monotone"
                dataKey="v"
                stroke={C.gold}
                strokeWidth={2}
                fill="url(#mauFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>

        <Panel style={{ padding: 18 }}>
          <SectionLabel>Shield Integrity</SectionLabel>
          <ShieldGauge score={87} />
          <div className="flex flex-col gap-2" style={{ marginTop: 4 }}>
            {[
              ['Avg model confidence', '84%'],
              ['Anomaly flags (24h)', '3'],
              ['Email delivery success', '98.4%'],
              ['Platform uptime (30d)', '99.97%'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between">
                <span style={{ fontSize: 11.5, color: C.textDim }}>{k}</span>
                <span style={{ ...mono, fontSize: 11.5, color: C.text }}>{v}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Panel style={{ padding: 18 }}>
          <SectionLabel>Revenue by Stream</SectionLabel>
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={revenueSeries} margin={{ left: -20, top: 5 }}>
              <CartesianGrid stroke={C.borderSoft} vertical={false} />
              <XAxis
                dataKey="k"
                tick={{ fill: C.textFaint, fontSize: 10 }}
                axisLine={{ stroke: C.border }}
                tickLine={false}
              />
              <YAxis tick={{ fill: C.textFaint, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  background: C.panel2,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: C.textDim }}
              />
              <Bar dataKey="v" fill={C.teal} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel style={{ padding: 18 }}>
          <SectionLabel>Retention</SectionLabel>
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={retentionSeries} margin={{ left: -20, top: 5 }}>
              <CartesianGrid stroke={C.borderSoft} vertical={false} />
              <XAxis
                dataKey="k"
                tick={{ fill: C.textFaint, fontSize: 11 }}
                axisLine={{ stroke: C.border }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: C.textFaint, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                unit="%"
              />
              <Tooltip
                contentStyle={{
                  background: C.panel2,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: C.textDim }}
              />
              <Bar dataKey="v" fill={C.blue} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel style={{ padding: 18 }}>
          <SectionLabel>Top Vaults by Manager Score</SectionLabel>
          <div className="flex flex-col gap-3">
            {topVaults.slice(0, 4).map((v) => (
              <div key={v.name} className="flex items-center justify-between">
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{v.name}</div>
                  <div style={{ ...mono, fontSize: 10.5, color: C.textFaint }}>{v.manager}</div>
                </div>
                <div style={{ ...display, fontSize: 14, fontWeight: 600, color: C.gold }}>
                  {v.score}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel style={{ padding: 18 }}>
        <SectionLabel right={<Pill tone="red">{flaggedActivity.length} open</Pill>}>
          Flagged Activity
        </SectionLabel>
        <DataTable
          columns={['ID', 'Type', 'Detail', 'Actor', 'Severity', 'Time']}
          rows={flaggedActivity.map((f) => (
            <tr key={f.id}>
              <Td style={{ ...mono, fontSize: 11.5, color: C.textDim }}>{f.id}</Td>
              <Td>{f.type}</Td>
              <Td style={{ color: C.textDim }}>{f.detail}</Td>
              <Td style={{ ...mono }}>{f.user}</Td>
              <Td>
                <Pill tone={sevTone[f.sev]}>{f.sev}</Pill>
              </Td>
              <Td style={{ color: C.textFaint }}>{f.time}</Td>
            </tr>
          ))}
        />
      </Panel>
    </div>
  );
}

function UsersTab({ users, statusTone, onSelect }) {
  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
        <h1 style={{ ...display, fontSize: 20, fontWeight: 600 }}>Users</h1>
        <div style={{ fontSize: 11.5, color: C.textFaint }}>Click a row to view and edit</div>
      </div>
      <Panel style={{ padding: 18 }}>
        <DataTable
          columns={[
            'Name',
            'Email',
            'Risk profile',
            'Active bots',
            'Portfolio value',
            'Status',
            'Joined',
            '',
          ]}
          rows={users.map((u) => (
            <tr key={u.id} className="clickable" onClick={() => onSelect(u)}>
              <Td style={{ fontWeight: 500 }}>{u.name}</Td>
              <Td style={{ color: C.textDim }}>{u.email}</Td>
              <Td>{u.risk}</Td>
              <Td style={{ ...mono }}>{u.bots}</Td>
              <Td style={{ ...mono }}>{u.value}</Td>
              <Td>
                <Pill tone={statusTone[u.status]}>{u.status}</Pill>
              </Td>
              <Td style={{ color: C.textFaint }}>{u.joined}</Td>
              <Td>
                <Pencil size={13} color={C.textFaint} />
              </Td>
            </tr>
          ))}
        />
      </Panel>
    </div>
  );
}

function BotsTab({ bots, statusTone, onAddClick }) {
  const active = bots.filter((b) => b.status === 'running').length;
  const fallback = bots.filter((b) => b.status === 'fallback').length;
  const avgConf = Math.round(bots.reduce((a, b) => a + Number(b.confidence), 0) / bots.length);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 style={{ ...display, fontSize: 20, fontWeight: 600 }}>Trading Bots</h1>
        <Button variant="gold" icon={Plus} onClick={onAddClick}>
          Add bot
        </Button>
        </div>
      <div className="grid grid-cols-3 gap-4">
        <KpiCard label="Active bots" value={active} delta="+3" positive sub="today" />
        <KpiCard
          label="In fallback mode"
          value={fallback}
          delta="threshold < 70%"
          sub="confidence"
        />
        <KpiCard
          label="Avg. model confidence"
          value={`${avgConf}%`}
          delta="+2.1pt"
          positive
          sub="24h"
        />
      </div>
      <Panel style={{ padding: 18 }}>
        <DataTable
          columns={['Bot ID', 'Type', 'Pair', 'User', 'Confidence', 'Status', 'PnL']}
          rows={bots.map((b) => (
            <tr key={b.id}>
              <Td style={{ ...mono, fontSize: 11.5 }}>{b.id}</Td>
              <Td>{b.type}</Td>
              <Td style={{ ...mono }}>{b.pair}</Td>
              <Td style={{ color: C.textDim }}>{b.user}</Td>
              <Td
                style={{
                  ...mono,
                  color: Number(b.confidence) < 70 ? C.red : C.text,
                }}
              >
                {b.confidence}%
              </Td>
              <Td>
                <Pill tone={statusTone[b.status]}>{b.status}</Pill>
              </Td>
              <Td
                style={{
                  ...mono,
                  color: b.pnl.startsWith('+') ? C.teal : C.red,
                }}
              >
                {b.pnl}
              </Td>
            </tr>
          ))}
        />
      </Panel>
    </div>
  );
}

function VaultsTab({ topVaults, vaultsQueue, statusTone }) {
  return (
    <div className="flex flex-col gap-5">
      <h1 style={{ ...display, fontSize: 20, fontWeight: 600 }}>Vaults</h1>
      <Panel style={{ padding: 18 }}>
        <SectionLabel>Active Vaults</SectionLabel>
        <DataTable
          columns={['Vault', 'Manager', 'Manager score', 'Risk', 'AUM', 'Investors']}
          rows={topVaults.map((v) => (
            <tr key={v.name}>
              <Td style={{ fontWeight: 500 }}>{v.name}</Td>
              <Td style={{ ...mono, color: C.textDim }}>{v.manager}</Td>
              <Td style={{ ...mono, color: C.gold }}>{v.score}</Td>
              <Td>{v.risk}</Td>
              <Td style={{ ...mono }}>{v.aum}</Td>
              <Td style={{ ...mono }}>{v.investors}</Td>
            </tr>
          ))}
        />
      </Panel>
      <Panel style={{ padding: 18 }}>
        <SectionLabel right={<Pill tone="gold">{vaultsQueue.length} pending</Pill>}>
          Vault Creation Queue
        </SectionLabel>
        <DataTable
          columns={['Vault', 'Manager', 'Strategy', 'Fee structure', 'Status', '']}
          rows={vaultsQueue.map((v) => (
            <tr key={v.name}>
              <Td style={{ fontWeight: 500 }}>{v.name}</Td>
              <Td style={{ ...mono, color: C.textDim }}>{v.manager}</Td>
              <Td>{v.strategy}</Td>
              <Td style={{ ...mono }}>{v.fee}</Td>
              <Td>
                <Pill tone={statusTone[v.status]}>{v.status}</Pill>
              </Td>
              <Td>
                <Button variant="outline">Review</Button>
              </Td>
            </tr>
          ))}
        />
      </Panel>
    </div>
  );
}

function ReportsTab({ reportStats, recentReports, statusTone }) {
  return (
    <div className="flex flex-col gap-5">
      <h1 style={{ ...display, fontSize: 20, fontWeight: 600 }}>Portfolio Reports</h1>
      <div className="grid grid-cols-4 gap-4">
        {reportStats.map((r) => (
          <Panel key={r.k} style={{ padding: '16px 18px' }}>
            <div style={{ color: C.textDim, fontSize: 12, marginBottom: 8 }}>{r.k}</div>
            <div style={{ ...display, fontSize: 22, fontWeight: 600 }}>{r.v}</div>
          </Panel>
        ))}
      </div>
      <Panel style={{ padding: 18 }}>
        <SectionLabel>Recent Reports</SectionLabel>
        <DataTable
          columns={['Report ID', 'User', 'Risk score', 'Sent', 'Status', '']}
          rows={recentReports.map((r) => (
            <tr key={r.id}>
              <Td style={{ ...mono, fontSize: 11.5 }}>{r.id}</Td>
              <Td>{r.user}</Td>
              <Td style={{ ...mono }}>{r.risk}</Td>
              <Td style={{ color: C.textFaint }}>{r.sent}</Td>
              <Td>
                <Pill tone={statusTone[r.status]}>{r.status}</Pill>
              </Td>
              <Td>
                <Button variant="ghost">Resend</Button>
              </Td>
            </tr>
          ))}
        />
      </Panel>
    </div>
  );
}

function ModelsTab({ mlModels, onAddClick }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 style={{ ...display, fontSize: 20, fontWeight: 600 }}>ML Models</h1>
        <Button variant="gold" icon={Plus} onClick={onAddClick}>
          Register model
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {mlModels.map((m) => (
          <Panel key={m.name} style={{ padding: 18 }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{m.name}</div>
              <Pill
                tone={m.drift === 'stable' ? 'teal' : m.drift === 'critical' ? 'red' : 'gold'}
              >
                {m.drift}
              </Pill>
            </div>
            <div style={{ fontSize: 11.5, color: C.textDim, marginBottom: 14 }}>{m.scope}</div>
            <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 11.5, color: C.textDim }}>Confidence</span>
              <span style={{ ...mono, fontSize: 11.5 }}>{m.confidence}%</span>
            </div>
            <div
              style={{
                height: 5,
                borderRadius: 999,
                background: C.borderSoft,
                overflow: 'hidden',
                marginBottom: 12,
              }}
            >
              <div style={{ height: '100%', width: `${m.confidence}%`, background: C.gold }} />
            </div>
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 11.5, color: C.textDim }}>Last retrained</span>
              <span style={{ ...mono, fontSize: 11.5, color: C.textFaint }}>{m.retrained}</span>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}

function RevenueTab({ mrrTrend, tierBreakdown }) {
  return (
    <div className="flex flex-col gap-5">
      <h1 style={{ ...display, fontSize: 20, fontWeight: 600 }}>Revenue</h1>
      <div className="grid grid-cols-3 gap-4">
        <KpiCard label="MRR" value="$76,748" delta="+21.9%" positive sub="vs last month" />
        <KpiCard label="ARPU (Pro)" value="$29.00" delta="flat" sub="tier price" />
        <KpiCard label="Institutional accounts" value="14" delta="+2" positive sub="this quarter" />
      </div>
      <Panel style={{ padding: 18 }}>
        <SectionLabel>MRR Trend</SectionLabel>
        <ResponsiveContainer width="100%" height={190}>
          <LineChart data={mrrTrend} margin={{ left: -20, top: 5 }}>
            <CartesianGrid stroke={C.borderSoft} vertical={false} />
            <XAxis
              dataKey="m"
              tick={{ fill: C.textFaint, fontSize: 11 }}
              axisLine={{ stroke: C.border }}
              tickLine={false}
            />
            <YAxis tick={{ fill: C.textFaint, fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{
                background: C.panel2,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: C.textDim }}
            />
            <Line
              type="monotone"
              dataKey="v"
              stroke={C.teal}
              strokeWidth={2.5}
              dot={{ r: 3, fill: C.teak }}
            />
          </LineChart>
        </ResponsiveContainer>
        </Panel>
      <Panel style={{ padding: 18 }}>
        <SectionLabel>Pricing Tiers</SectionLabel>
        <DataTable
          columns={['Tier', 'Users', 'MRR']}
          rows={tierBreakdown.map((t) => (
            <tr key={t.tier}>
              <Td style={{ fontWeight: 500 }}>{t.tier}</Td>
              <Td style={{ ...mono }}>{t.users}</Td>
              <Td style={{ ...mono, color: C.teal }}>{t.mrr}</Td>
            </tr>
          ))}
        />
      </Panel>
    </div>
  );
}