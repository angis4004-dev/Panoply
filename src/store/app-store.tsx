'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useAuth, type AuthUser } from '@/context/AuthContext';

export interface Bot {
  id: string;
  type: string;
  pair: string;
  confidence: number;
  status: string;
  pnl: string;
  allocatedAmount?: number | null;
  active?: boolean;
}

export interface Report {
  id: string;
  title: string;
  description: string;
  type: string;
  status: string;
  date: string;
  metrics?: Record<string, unknown>;
  holdings?: unknown[];
  recommendations?: string[];
}

export interface VaultInvestment {
  id: string;
  vaultId: string;
  vaultName: string;
  strategy: string;
  riskLevel: string;
  managerScore: number;
  tvl: string;
  apy: number;
  investedAmount: number;
  vaultTokens: number;
  investedAt: string;
}

interface AppStoreState {
  user: AuthUser | null;
  botModalOpen: boolean;
  bots: Bot[];
  botsLoading: boolean;
  reports: Report[];
  vaultInvestments: VaultInvestment[];
  vaultInvestmentsLoading: boolean;
  walletBalance: number;
  walletBalanceLoading: boolean;
  tab: string;
  reportsLoading: boolean;
}

export interface NewBotInput {
  type: string;
  pair: string;
  confidence: number;
  status: string;
  allocatedAmount: number;
}

interface AppStoreActions {
  setBotModalOpen: (open: boolean) => void;
  fetchBots: () => Promise<void>;
  addBot: (bot: NewBotInput) => Promise<Bot>;
  addToast: (message: string, type?: string) => void;
  setTab: (tab: string) => void;
  addReport: (report: Partial<Report>) => Promise<Report>;
  toggleBot: (botId: string) => Promise<void>;
  deleteBot: (botId: string) => Promise<void>;
  fetchReports: () => Promise<void>;
  fetchVaultInvestments: () => Promise<void>;
  addVaultInvestment: (vaultId: string, amount: number) => Promise<void>;
  fetchWalletBalance: () => Promise<void>;
  depositToWallet: (amount: number) => Promise<void>;
}

type AppStoreContextType = AppStoreState & AppStoreActions;

const AppStoreContext = createContext<AppStoreContextType | null>(null);

export function AppStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppStoreState>({
    user: null,
    botModalOpen: false,
    bots: [],
    botsLoading: false,
    reports: [],
    vaultInvestments: [],
    vaultInvestmentsLoading: false,
    walletBalance: 0,
    walletBalanceLoading: false,
    tab: 'dashboard',
    reportsLoading: false,
  });

  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      setState((prev) => ({
        ...prev,
        user,
      }));
    }
  }, [user]);

  // Fetch user's reports from API
  const fetchReports = async () => {
    setState((prev) => ({ ...prev, reportsLoading: true }));
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4028'}/api/reports`
      );

      if (!response.ok) {
        // If unauthorized (not logged in), just continue with empty reports
        if (response.status === 401) {
          setState((prev) => ({ ...prev, reports: [], reportsLoading: false }));
          return;
        }
        throw new Error(`Failed to fetch reports: ${response.status}`);
      }

      const reportsData: Report[] = await response.json();
      setState((prev) => ({ ...prev, reports: reportsData, reportsLoading: false }));
    } catch (err) {
      console.error('Error fetching reports:', err);
      setState((prev) => ({ ...prev, reports: [], reportsLoading: false }));
    }
  };

  // Add a report via API
  const addReport = async (report: Partial<Report>): Promise<Report> => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4028'}/api/reports`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(report),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to create report: ${response.status}`);
      }

      const newReport: Report = await response.json();
      setState((prev) => ({ ...prev, reports: [newReport, ...prev.reports] }));
      return newReport;
    } catch (err) {
      console.error('Error adding report:', err);
      throw err;
    }
  };

  // Fetch the logged-in user's bots from the API
  const fetchBots = async () => {
    setState((prev) => ({ ...prev, botsLoading: true }));
    try {
      const response = await fetch('/api/bots');

      if (!response.ok) {
        if (response.status === 401) {
          setState((prev) => ({ ...prev, bots: [], botsLoading: false }));
          return;
        }
        throw new Error(`Failed to fetch bots: ${response.status}`);
      }

      const botsData: Bot[] = await response.json();
      setState((prev) => ({ ...prev, bots: botsData, botsLoading: false }));
    } catch (err) {
      console.error('Error fetching bots:', err);
      setState((prev) => ({ ...prev, bots: [], botsLoading: false }));
    }
  };

  // Fetch the logged-in user's vault investments from the API
  const fetchVaultInvestments = async () => {
    setState((prev) => ({ ...prev, vaultInvestmentsLoading: true }));
    try {
      const response = await fetch('/api/user/vault-investments');

      if (!response.ok) {
        if (response.status === 401) {
          setState((prev) => ({ ...prev, vaultInvestments: [], vaultInvestmentsLoading: false }));
          return;
        }
        throw new Error(`Failed to fetch vault investments: ${response.status}`);
      }

      const data: VaultInvestment[] = await response.json();
      setState((prev) => ({ ...prev, vaultInvestments: data, vaultInvestmentsLoading: false }));
    } catch (err) {
      console.error('Error fetching vault investments:', err);
      setState((prev) => ({ ...prev, vaultInvestments: [], vaultInvestmentsLoading: false }));
    }
  };

  const addVaultInvestment = async (vaultId: string, amount: number): Promise<void> => {
    const response = await fetch('/api/user/vault-investments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vaultId, amount }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `Failed to invest in vault: ${response.status}`);
    }

    // The POST response doesn't include vault details, so refresh from the
    // list endpoint (which populates them) rather than shaping a partial one.
    await fetchVaultInvestments();
  };

  const fetchWalletBalance = async () => {
    setState((prev) => ({ ...prev, walletBalanceLoading: true }));
    try {
      const response = await fetch('/api/wallet');

      if (!response.ok) {
        if (response.status === 401) {
          setState((prev) => ({ ...prev, walletBalance: 0, walletBalanceLoading: false }));
          return;
        }
        throw new Error(`Failed to fetch wallet balance: ${response.status}`);
      }

      const data: { balance: number } = await response.json();
      setState((prev) => ({ ...prev, walletBalance: data.balance, walletBalanceLoading: false }));
    } catch (err) {
      console.error('Error fetching wallet balance:', err);
      setState((prev) => ({ ...prev, walletBalance: 0, walletBalanceLoading: false }));
    }
  };

  const depositToWallet = async (amount: number): Promise<void> => {
    const response = await fetch('/api/wallet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `Failed to deposit: ${response.status}`);
    }

    const data: { balance: number } = await response.json();
    setState((prev) => ({ ...prev, walletBalance: data.balance }));
  };

  useEffect(() => {
    // Fetch reports, bots, vault investments, and wallet balance when user changes
    if (user) {
      fetchReports();
      fetchBots();
      fetchVaultInvestments();
      fetchWalletBalance();
    }
  }, [user]);

  const setBotModalOpen = (open: boolean) => {
    setState((prev) => ({ ...prev, botModalOpen: open }));
  };

  const addBot = async (bot: NewBotInput): Promise<Bot> => {
    const response = await fetch('/api/bots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bot),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `Failed to create bot: ${response.status}`);
    }

    const newBot: Bot = await response.json();
    setState((prev) => ({ ...prev, bots: [...prev.bots, newBot] }));
    // Creating a bot debits the wallet balance server-side - refresh it here
    // rather than computing the new value client-side.
    await fetchWalletBalance();
    return newBot;
  };

  const addToast = (message: string, type: string = 'info') => {
    const toastFn = type === 'success' || type === 'error' ? toast[type] : toast;
    toastFn(message);
  };

  const setTab = (tab: string) => {
    setState((prev) => ({ ...prev, tab: tab }));
  };

  const toggleBot = async (botId: string) => {
    const current = state.bots.find((bot) => bot.id === botId);
    if (!current) return;

    const nextStatus = current.status === 'running' ? 'paused' : 'running';

    const response = await fetch(`/api/bots/${botId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });

    if (!response.ok) {
      console.error('Failed to toggle bot status');
      return;
    }

    const updated: Bot = await response.json();
    setState((prev) => ({
      ...prev,
      bots: prev.bots.map((bot) => (bot.id === botId ? updated : bot)),
    }));
  };

  const deleteBot = async (botId: string) => {
    const response = await fetch(`/api/bots/${botId}`, { method: 'DELETE' });

    if (!response.ok) {
      console.error('Failed to delete bot');
      return;
    }

    setState((prev) => ({
      ...prev,
      bots: prev.bots.filter((bot) => bot.id !== botId),
    }));
    // Deleting a bot refunds its allocated capital server-side - refresh the
    // wallet balance to reflect that.
    await fetchWalletBalance();
  };

  const storeValue: AppStoreContextType = {
    ...state,
    setBotModalOpen,
    fetchBots,
    addBot,
    addToast,
    setTab,
    addReport: addReport, // Reference to the async function defined above
    toggleBot,
    deleteBot,
    fetchReports,
    fetchVaultInvestments,
    addVaultInvestment,
    fetchWalletBalance,
    depositToWallet,
  };

  return <AppStoreContext.Provider value={storeValue}>{children}</AppStoreContext.Provider>;
}

export function useAppStore() {
  const context = useContext(AppStoreContext);
  if (!context) {
    throw new Error('useAppStore must be used within an AppStoreProvider');
  }
  return context;
}
