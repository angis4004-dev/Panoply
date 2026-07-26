'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth, type AuthUser } from '@/context/AuthContext';

export interface Bot {
  id: string;
  type: string;
  pair: string;
  confidence: number;
  status: string;
  pnl: string;
  active?: boolean;
}

export interface Toast {
  id: number;
  message: string;
  type: string;
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

interface AppStoreState {
  user: AuthUser | null;
  botModalOpen: boolean;
  bots: Bot[];
  toasts: Toast[];
  reports: Report[];
  vaults: unknown[];
  yields: unknown[];
  tab: string;
  reportsLoading: boolean;
}

interface AppStoreActions {
  setBotModalOpen: (open: boolean) => void;
  addBot: (bot: Bot) => void;
  addToast: (message: string, type?: string) => void;
  setTab: (tab: string) => void;
  addReport: (report: Partial<Report>) => Promise<Report>;
  toggleBot: (botId: string) => void;
  deleteBot: (botId: string) => void;
  removeToast: (toastId: number) => void;
  fetchReports: () => Promise<void>;
}

type AppStoreContextType = AppStoreState & AppStoreActions;

const AppStoreContext = createContext<AppStoreContextType | null>(null);

export function AppStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppStoreState>({
    user: null,
    botModalOpen: false,
    bots: [],
    toasts: [],
    reports: [],
    vaults: [],
    yields: [],
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

  useEffect(() => {
    // Fetch reports when user changes
    if (user) {
      fetchReports();
    }
  }, [user]);

  const setBotModalOpen = (open: boolean) => {
    setState((prev) => ({ ...prev, botModalOpen: open }));
  };

  const addBot = (bot: Bot) => {
    setState((prev) => ({ ...prev, bots: [...prev.bots, bot] }));
  };

  const addToast = (message: string, type: string = 'info') => {
    const id = Date.now() + Math.random();
    setState((prev) => ({ ...prev, toasts: [...prev.toasts, { id, message, type }] }));
  };

  const setTab = (tab: string) => {
    setState((prev) => ({ ...prev, tab: tab }));
  };

  const toggleBot = (botId: string) => {
    setState((prev) => ({
      ...prev,
      bots: prev.bots.map((bot) => (bot.id === botId ? { ...bot, active: !bot.active } : bot)),
    }));
  };

  const deleteBot = (botId: string) => {
    setState((prev) => ({
      ...prev,
      bots: prev.bots.filter((bot) => bot.id !== botId),
    }));
  };

  const removeToast = (toastId: number) => {
    setState((prev) => ({
      ...prev,
      toasts: prev.toasts.filter((t) => t.id !== toastId),
    }));
  };

  const storeValue: AppStoreContextType = {
    ...state,
    setBotModalOpen,
    addBot,
    addToast,
    setTab,
    addReport: addReport, // Reference to the async function defined above
    toggleBot,
    deleteBot,
    removeToast,
    fetchReports,
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
