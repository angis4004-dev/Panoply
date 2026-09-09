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
  /**
   * Market value of the position this flow currently holds, in quote currency.
   * Zero when it holds nothing — which is not the same as having no capital.
   */
  marketValue?: number;
  /**
   * Unrounded modelled P&L in dollars, straight from the deterministic model.
   * Use this for totals instead of parsing `pnl` — that string is rounded to
   * one decimal, so summing it across many flows compounds a rounding error
   * that grows with capital.
   */
  realizedPnlDollar?: number;
  /** True before the flow's first modelled outcome has settled. */
  neverTraded?: boolean;
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
  botsError: boolean;
  reports: Report[];
  vaultInvestments: VaultInvestment[];
  vaultInvestmentsLoading: boolean;
  walletBalance: number;
  walletBalanceLoading: boolean;
  walletBalanceError: boolean;
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
}

type AppStoreContextType = AppStoreState & AppStoreActions;

const AppStoreContext = createContext<AppStoreContextType | null>(null);

export function AppStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppStoreState>({
    user: null,
    botModalOpen: false,
    bots: [],
    botsLoading: false,
    botsError: false,
    reports: [],
    vaultInvestments: [],
    vaultInvestmentsLoading: false,
    walletBalance: 0,
    walletBalanceLoading: false,
    walletBalanceError: false,
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
      const response = await fetch('/api/reports');

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
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(report),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `Failed to create report: ${response.status}`);
      }

      const newReport: Report = await response.json();
      setState((prev) => ({ ...prev, reports: [newReport, ...prev.reports] }));
      return newReport;
    } catch (err) {
      console.error('Error adding report:', err);
      throw err;
    }
  };

  // Fetch the logged-in user's bots from the API.
  //
  // Only flips botsLoading on the *first* load (when there's nothing to show
  // yet). Consumers - MetricsBentoGrid and the dashboard's signal-flow list -
  // swap their entire subtree for skeletons whenever botsLoading is true, so
  // raising it on every refetch made the dashboard visibly blink to grey
  // blocks and back. Keeping the previous bots on screen while revalidating
  // means a refetch updates values in place instead of flashing.
  //
  // This also absorbs React Strict Mode's double-invoked effect in dev, which
  // otherwise fired this twice on mount and produced two skeleton flashes
  // back to back.
  const fetchBots = async () => {
    setState((prev) => ({
      ...prev,
      botsLoading: prev.bots.length === 0,
      botsError: false,
    }));
    try {
      const response = await fetch('/api/bots');

      if (!response.ok) {
        if (response.status === 401) {
          setState((prev) => ({ ...prev, bots: [], botsLoading: false, botsError: true }));
          return;
        }
        throw new Error(`Failed to fetch bots: ${response.status}`);
      }

      const botsData: Bot[] = await response.json();
      setState((prev) => ({ ...prev, bots: botsData, botsLoading: false, botsError: false }));
    } catch (err) {
      console.error('Error fetching bots:', err);
      // Keep whatever was already on screen rather than blanking the
      // dashboard on a transient network failure.
      setState((prev) => ({ ...prev, botsLoading: false, botsError: true }));
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
    setState((prev) => ({ ...prev, walletBalanceLoading: true, walletBalanceError: false }));
    try {
      const response = await fetch('/api/wallet');

      if (!response.ok) {
        if (response.status === 401) {
          setState((prev) => ({
            ...prev,
            walletBalance: 0,
            walletBalanceLoading: false,
            walletBalanceError: true,
          }));
          return;
        }
        throw new Error(`Failed to fetch wallet balance: ${response.status}`);
      }

      const data: { balance: number } = await response.json();
      setState((prev) => ({
        ...prev,
        walletBalance: data.balance,
        walletBalanceLoading: false,
        walletBalanceError: false,
      }));
    } catch (err) {
      console.error('Error fetching wallet balance:', err);
      setState((prev) => ({
        ...prev,
        walletBalance: 0,
        walletBalanceLoading: false,
        walletBalanceError: true,
      }));
    }
  };

  // There is no depositToWallet. A trader cannot move their own balance: they
  // declare a transfer against a published address (POST /api/deposits) and an
  // admin credits it after confirming the funds arrived. The balance shown here
  // only ever changes because the ledger did.

  useEffect(() => {
    // Fetch reports, bots, vault investments, and wallet balance when user changes
    if (!user) return;

    fetchReports();
    fetchBots();
    fetchVaultInvestments();
    fetchWalletBalance();

    /*
     * Keep the flows refreshing while the dashboard is open.
     *
     * Every P&L figure on the page is derived from this list - Realized P&L,
     * Profitable Flows, Largest Allocation, Drawdown, and each flow card. The
     * list was fetched once per sign-in, so those figures were a snapshot of
     * the moment the page loaded and never moved again, while the chart beside
     * them polled every 30 seconds and did. A running flow looked frozen, and
     * the two halves of the dashboard drifted further apart the longer it
     * stayed open.
     *
     * Thirty seconds, matching PnLAreaChart, so the tiles and the line move
     * together. fetchBots only raises botsLoading when there is nothing on
     * screen yet, so a refetch updates in place rather than flashing skeletons.
     */
    const interval = setInterval(fetchBots, 30 * 1000);

    /*
     * The balance has to follow too.
     *
     * It only ever moves because an admin credited a deposit or settled a
     * withdrawal, and it was fetched once per sign-in - so the trader saw the
     * notification saying their deposit had been approved while the balance
     * beside it still read the old figure, and only a reload reconciled them.
     *
     * Slower than the flow list because it changes far less often, and on the
     * same sixty-second beat as the notification that announces the change.
     */
    const balanceTimer = setInterval(() => {
      if (document.visibilityState === 'visible') fetchWalletBalance();
    }, 60 * 1000);
    const onBalanceRefresh = () => fetchWalletBalance();
    window.addEventListener('aegis:notifications-changed', onBalanceRefresh);
    window.addEventListener('aegis:account-changed', onBalanceRefresh);

    return () => {
      clearInterval(interval);
      clearInterval(balanceTimer);
      window.removeEventListener('aegis:notifications-changed', onBalanceRefresh);
      window.removeEventListener('aegis:account-changed', onBalanceRefresh);
    };
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
      /*
       * Reported, not swallowed. This used to log to the console and return,
       * so a refusal - an open position that could not be liquidated, or a
       * duplicate close the server declined to pay twice - left the flow on
       * screen with no explanation and looked like a dead button.
       */
      const payload = await response.json().catch(() => ({}));
      const message = payload.error || 'Could not close that signal flow.';
      console.error('Failed to delete bot:', message);

      // A 409 means the flow is already gone, settled by a request that got
      // there first. Drop it from the list rather than leaving a card the
      // server no longer knows about.
      if (response.status === 409) {
        setState((prev) => ({ ...prev, bots: prev.bots.filter((bot) => bot.id !== botId) }));
        await fetchWalletBalance();
        return;
      }

      addToast(message, 'error');
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
