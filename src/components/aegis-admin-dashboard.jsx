import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  Bot,
  Landmark,
  FileText,
  Cpu,
  DollarSign,
  ShieldCheck,
  Search,
  Menu,
  Bell,
} from 'lucide-react';
import { C, body, mono } from './admin/tokens';
import { Pill } from './admin/primitives';
import { UserDetailModal, AddBotModal, RejectKycModal, AddModelModal } from './admin/modals';
import {
  OverviewTab,
  UsersTab,
  KycTab,
  BotsTab,
  VaultsTab,
  ReportsTab,
  ModelsTab,
  RevenueTab,
} from './admin/tabs';
import {
  mauSeries,
  revenueSeries,
  retentionSeries,
  flaggedActivity,
  initialVaults,
  vaultsQueue,
  reportStats,
  recentReports,
  mrrTrend,
  tierBreakdown,
} from './admin/mock-data';

/**
 * Admin dashboard shell: navigation, data loading, and tab orchestration.
 *
 * Was 2,013 lines holding presentational primitives, five modals, eight tab
 * bodies, mock data and the container all in one file. Those now live under
 * ./admin/ and this keeps only the part that coordinates them. The split is
 * structural - no rendering or behaviour was changed.
 */

/* ---------------------------------- nav ---------------------------------- */
const NAV = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'users', label: 'Users', icon: Users },
  { key: 'kyc', label: 'Verification', icon: ShieldCheck },
  { key: 'bots', label: 'Signal Flows', icon: Bot },
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
          <ShieldCheck size={18} color={C.primary} />
          <span
            style={{
              fontFamily: 'var(--font-wordmark), Orbitron, sans-serif',
              fontSize: 16,
              fontWeight: 800,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
            }}
          >
            AEGIS
          </span>
        </div>
        <div
          style={{ ...mono, fontSize: 10, color: C.textFaint, letterSpacing: 1.5, marginTop: 2 }}
        >
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
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#10151C]"
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
                borderLeft: active ? `2px solid ${C.primary}` : '2px solid transparent',
                color: active ? C.text : C.textDim,
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: 13,
                ...body,
                fontWeight: active ? 600 : 500,
              }}
            >
              <Icon size={15} color={active ? C.primary : C.textFaint} />
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
              color: C.primary,
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
  const [kycSubmissions, setKycSubmissions] = useState([]);

  const [selectedUser, setSelectedUser] = useState(null);
  const [showAddBot, setShowAddBot] = useState(false);
  const [showAddModel, setShowAddModel] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null);

  // Fetch data on component mount and when tab changes (if needed)
  useEffect(() => {
    fetchUsers();
    fetchBots();
    fetchMLModels();
    fetchKycSubmissions();
  }, []);

  const sevTone = { high: 'red', med: 'primary', low: 'blue' };
  const statusTone = {
    active: 'teal',
    flagged: 'red',
    onboarding: 'blue',
    suspended: 'red',
    running: 'teal',
    fallback: 'primary',
    paused: 'neutral',
    pending: 'primary',
    review: 'blue',
    delivered: 'teal',
    bounced: 'red',
    verified: 'teal',
    rejected: 'red',
    unverified: 'neutral',
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

  const fetchKycSubmissions = async () => {
    try {
      const response = await fetch('/api/admin/kyc');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setKycSubmissions(data);
    } catch (error) {
      console.error('Failed to fetch KYC submissions:', error);
    }
  };

  const handleApproveKyc = async (id) => {
    try {
      const response = await fetch(`/api/admin/kyc/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      await fetchKycSubmissions();
    } catch (error) {
      console.error('Failed to approve KYC submission:', error);
    }
  };

  const handleRejectKyc = async (id, reason) => {
    try {
      const response = await fetch(`/api/admin/kyc/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', reason }),
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      await fetchKycSubmissions();
      setRejectTarget(null);
    } catch (error) {
      console.error('Failed to reject KYC submission:', error);
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
          walletBalance: updated.walletBalance,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const updatedUser = await response.json();
      // Update the user in state
      setUsers(users.map((u) => (u.id === updatedUser.id ? updatedUser : u)));
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
        }),
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
        }),
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
        tr.clickable:focus-visible { outline: 2px solid #1E63FF; outline-offset: -2px; }
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
            className="lg:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open menu"
            style={{
              background: 'transparent',
              border: 'none',
              color: C.text,
              flexShrink: 0,
              borderRadius: 4,
            }}
          >
            <Menu size={18} />
          </button>
          <div
            className="hidden sm:flex focus-within:ring-2 focus-within:ring-primary/50"
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
              placeholder="Search users, signal flows, vaults, reports…"
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
          {tab === 'kyc' && (
            <KycTab
              {...{
                submissions: kycSubmissions,
                statusTone,
                onApprove: handleApproveKyc,
                onReject: setRejectTarget,
              }}
            />
          )}
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
      {rejectTarget && (
        <RejectKycModal
          onClose={() => setRejectTarget(null)}
          onReject={(reason) => handleRejectKyc(rejectTarget, reason)}
        />
      )}
      {showAddBot && <AddBotModal onClose={() => setShowAddBot(false)} onAdd={handleAddBot} />}
      {showAddModel && (
        <AddModelModal onClose={() => setShowAddModel(false)} onAdd={handleAddModel} />
      )}
    </div>
  );
}
