'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Award,
  Bot,
  Brain,
  LayoutDashboard,
  List,
  LogOut,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Vault,
  Zap,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { AegisMark } from '@/components/ui/AegisLogo';

const navItems = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/ai', label: 'AI Center', icon: Brain },
  { href: '/dashboard/bots', label: 'Signal Flows', icon: Bot },
  { href: '/dashboard/vaults', label: 'Vaults', icon: Vault },
  { href: '/dashboard/yield', label: 'Yield', icon: Zap },
  { href: '/dashboard/builder', label: 'Portfolio Builder', icon: SlidersHorizontal },
  { href: '/dashboard/history', label: 'Report History', icon: List },
  { href: '/dashboard/kyc', label: 'Verification', icon: ShieldCheck },
  { href: '/dashboard/achievements', label: 'Achievements', icon: Award },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

const KYC_DOT_STYLES: Record<string, string> = {
  unverified: 'bg-[#8B95A5]',
  pending: 'bg-primary',
  rejected: 'bg-red-400',
};

interface DashboardSidebarProps {
  onNavigate?: () => void;
}

export default function DashboardSidebar({ onNavigate }: DashboardSidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const kycDotClass = user?.kycStatus ? KYC_DOT_STYLES[user.kycStatus] : undefined;

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className="flex h-full min-h-screen w-64 flex-col border-r border-[#212A35] bg-[#10151C]">
      <div className="flex h-14 items-center gap-2.5 border-b border-[#212A35] px-5">
        <AegisMark size={28} />
        <div>
          <Link
            href="/"
            onClick={onNavigate}
            className="rounded font-wordmark text-base font-extrabold uppercase tracking-[0.12em] text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#10151C]"
          >
            AEGIS
          </Link>
          <p className="text-[10px] uppercase tracking-wider text-[#8B95A5]">Command Center</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {navItems.map(({ href, label, icon: Icon, exact }) => {
          const active = isActive(href, exact);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#10151C] ${
                active
                  ? 'bg-primary/12 text-primary border-l-2 border-primary pl-[10px]'
                  : 'text-[#8B95A5] hover:bg-[#17202e] hover:text-[#E7ECF2] border-l-2 border-transparent pl-[10px]'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{label}</span>
              {href === '/dashboard/kyc' && kycDotClass && (
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${kycDotClass}`} />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[#212A35] p-3">
        <button
          onClick={() => {
            logout();
            window.location.href = '/sign-up-login-screen';
          }}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-[#8B95A5] hover:bg-[#17202e] hover:text-[#E7ECF2] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#10151C]"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
