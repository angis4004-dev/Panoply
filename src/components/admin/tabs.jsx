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
import { Plus, Pencil } from 'lucide-react';
import { C, display, body, mono } from './tokens';
import {
  Panel,
  SectionLabel,
  Pill,
  KpiCard,
  ShieldGauge,
  DataTable,
  Td,
  Button,
} from './primitives';

/* ---------------------------------- tabs ---------------------------------- */
export function OverviewTab({
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Panel style={{ padding: 18, gridColumn: 'span 2' }}>
          <SectionLabel right={<Pill tone="primary">6-month trend</Pill>}>
            Monthly Active Users
          </SectionLabel>
          <ResponsiveContainer width="100%" height={190}>
            <AreaChart data={mauSeries} margin={{ left: -20, top: 5 }}>
              <defs>
                <linearGradient id="mauFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.primary} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={C.primary} stopOpacity={0} />
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
                stroke={C.primary}
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                <div style={{ ...display, fontSize: 14, fontWeight: 600, color: C.primary }}>
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

export function UsersTab({ users, statusTone, onSelect }) {
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
            'Active signal flows',
            'Portfolio value',
            'Wallet balance',
            'Status',
            'Joined',
            '',
          ]}
          rows={users.map((u) => (
            <tr
              key={u.id}
              className="clickable"
              onClick={() => onSelect(u)}
              tabIndex={0}
              role="button"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(u);
                }
              }}
            >
              <Td style={{ fontWeight: 500 }}>{u.name}</Td>
              <Td style={{ color: C.textDim }}>{u.email}</Td>
              <Td>{u.risk}</Td>
              <Td style={{ ...mono }}>{u.bots}</Td>
              <Td style={{ ...mono }}>{u.value}</Td>
              <Td style={{ ...mono }}>${Number(u.walletBalance || 0).toLocaleString()}</Td>
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

export const ID_TYPE_LABELS = {
  passport: 'Passport',
  drivers_license: "Driver's License",
  national_id: 'National ID',
};

export function KycTab({ submissions, statusTone, onApprove, onReject }) {
  const pending = submissions.filter((s) => s.status === 'pending').length;
  const verified = submissions.filter((s) => s.status === 'verified').length;
  const rejected = submissions.filter((s) => s.status === 'rejected').length;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 style={{ ...display, fontSize: 20, fontWeight: 600 }}>Verification</h1>
        <p style={{ color: C.textDim, fontSize: 12.5 }}>
          Review submitted identity verification applications.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label="Pending review" value={pending} delta="Needs action" sub="" />
        <KpiCard label="Verified" value={verified} delta="Approved" positive sub="" />
        <KpiCard label="Rejected" value={rejected} delta="Declined" sub="" />
      </div>
      <Panel style={{ padding: 18 }}>
        <DataTable
          columns={['Name', 'Email', 'Country', 'ID Type', 'Submitted', 'Status', '']}
          rows={submissions
            .filter((s) => s.status !== 'unverified')
            .map((s) => (
              <tr key={s.id}>
                <Td style={{ fontWeight: 500 }}>{s.fullName || s.name}</Td>
                <Td style={{ color: C.textDim }}>{s.email}</Td>
                <Td>{s.country || '—'}</Td>
                <Td>{ID_TYPE_LABELS[s.idType] || '—'}</Td>
                <Td style={{ color: C.textFaint }}>
                  {s.submittedAt
                    ? new Date(s.submittedAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })
                    : '—'}
                </Td>
                <Td>
                  <Pill tone={statusTone[s.status]}>{s.status}</Pill>
                </Td>
                <Td>
                  {s.status === 'pending' && (
                    <div className="flex items-center gap-2">
                      <Button variant="primary" onClick={() => onApprove(s.id)}>
                        Approve
                      </Button>
                      <Button variant="ghost" onClick={() => onReject(s.id)}>
                        Reject
                      </Button>
                    </div>
                  )}
                </Td>
              </tr>
            ))}
        />
        {submissions.filter((s) => s.status !== 'unverified').length === 0 && (
          <div style={{ ...body, color: C.textFaint, fontSize: 12.5, padding: '18px 0 4px' }}>
            No verification applications submitted yet.
          </div>
        )}
      </Panel>
    </div>
  );
}

export function BotsTab({ bots, statusTone, onAddClick }) {
  const active = bots.filter((b) => b.status === 'running').length;
  const fallback = bots.filter((b) => b.status === 'fallback').length;
  const avgConf = Math.round(bots.reduce((a, b) => a + Number(b.confidence), 0) / bots.length);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 style={{ ...display, fontSize: 20, fontWeight: 600 }}>Signal Flows</h1>
        <Button variant="primary" icon={Plus} onClick={onAddClick}>
          Add signal flow
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label="Active signal flows" value={active} delta="+3" positive sub="today" />
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
          columns={[
            'Signal Flow ID',
            'Type',
            'Pair',
            'User',
            'Allocated',
            'Confidence',
            'Status',
            'PnL',
          ]}
          rows={bots.map((b) => (
            <tr key={b.id}>
              <Td style={{ ...mono, fontSize: 11.5 }}>{b.id}</Td>
              <Td>{b.type}</Td>
              <Td style={{ ...mono }}>{b.pair}</Td>
              <Td style={{ color: C.textDim }}>{b.user}</Td>
              <Td style={{ ...mono }}>
                {b.allocatedAmount != null ? `$${Number(b.allocatedAmount).toLocaleString()}` : '—'}
              </Td>
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

export function VaultsTab({ topVaults, vaultsQueue, statusTone }) {
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
              <Td style={{ ...mono, color: C.primary }}>{v.score}</Td>
              <Td>{v.risk}</Td>
              <Td style={{ ...mono }}>{v.aum}</Td>
              <Td style={{ ...mono }}>{v.investors}</Td>
            </tr>
          ))}
        />
      </Panel>
      <Panel style={{ padding: 18 }}>
        <SectionLabel right={<Pill tone="primary">{vaultsQueue.length} pending</Pill>}>
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

export function ReportsTab({ reportStats, recentReports, statusTone }) {
  return (
    <div className="flex flex-col gap-5">
      <h1 style={{ ...display, fontSize: 20, fontWeight: 600 }}>Portfolio Reports</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

export function ModelsTab({ mlModels, onAddClick }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 style={{ ...display, fontSize: 20, fontWeight: 600 }}>ML Models</h1>
        <Button variant="primary" icon={Plus} onClick={onAddClick}>
          Register model
        </Button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {mlModels.map((m) => (
          <Panel key={m.name} style={{ padding: 18 }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{m.name}</div>
              <Pill
                tone={m.drift === 'stable' ? 'teal' : m.drift === 'critical' ? 'red' : 'primary'}
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
              <div style={{ height: '100%', width: `${m.confidence}%`, background: C.primary }} />
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

export function RevenueTab({ mrrTrend, tierBreakdown }) {
  return (
    <div className="flex flex-col gap-5">
      <h1 style={{ ...display, fontSize: 20, fontWeight: 600 }}>Revenue</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
