import Link from 'next/link';
import { AegisMark } from '@/components/ui/AegisLogo';

export function Footer() {
  return (
    <footer id="about" className="pt-16 pb-10 border-t border-[#212A35]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <AegisMark size={22} />
              <span className="font-wordmark text-lg font-extrabold uppercase tracking-[0.12em] text-white">
                AEGIS
              </span>
            </div>
            <p className="text-sm text-[#8B95A5] leading-relaxed">
              Quantitative Intelligence for Decentralized Finance — signal-driven automation, vault
              investing, and transparent portfolio analytics.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Product</h3>
            <nav className="flex flex-col gap-2 text-sm">
              <a
                href="#features"
                className="inline-flex min-h-[44px] items-center rounded text-ds-text-muted hover:text-[#E7ECF2] transition-colors duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
              >
                Features
              </a>
              <Link
                href="/dashboard/bots"
                className="inline-flex min-h-[44px] items-center rounded text-ds-text-muted hover:text-[#E7ECF2] transition-colors duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
              >
                Signal Flows
              </Link>
              <Link
                href="/dashboard/vaults"
                className="inline-flex min-h-[44px] items-center rounded text-ds-text-muted hover:text-[#E7ECF2] transition-colors duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
              >
                Vaults
              </Link>
              <Link
                href="/dashboard/builder"
                className="inline-flex min-h-[44px] items-center rounded text-ds-text-muted hover:text-[#E7ECF2] transition-colors duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
              >
                Portfolio Builder
              </Link>
            </nav>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Platform</h3>
            <nav className="flex flex-col gap-2 text-sm">
              <Link
                href="/about"
                className="inline-flex min-h-[44px] items-center rounded text-ds-text-muted hover:text-[#E7ECF2] transition-colors duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
              >
                About
              </Link>
              <a
                href="#security"
                className="inline-flex min-h-[44px] items-center rounded text-ds-text-muted hover:text-[#E7ECF2] transition-colors duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
              >
                Security
              </a>
              <a
                href="#pricing"
                className="inline-flex min-h-[44px] items-center rounded text-ds-text-muted hover:text-[#E7ECF2] transition-colors duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
              >
                Pricing
              </a>
              <Link
                href="/prd"
                className="inline-flex min-h-[44px] items-center rounded text-ds-text-muted hover:text-[#E7ECF2] transition-colors duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
              >
                Product Docs
              </Link>
            </nav>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Legal</h3>
            <nav className="flex flex-col gap-2 text-sm">
              <Link
                href="/privacy"
                className="inline-flex min-h-[44px] items-center rounded text-ds-text-muted hover:text-[#E7ECF2] transition-colors duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
              >
                Privacy Policy
              </Link>
              <Link
                href="/terms"
                className="inline-flex min-h-[44px] items-center rounded text-ds-text-muted hover:text-[#E7ECF2] transition-colors duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
              >
                Terms of Service
              </Link>
              <Link
                href="/disclaimer"
                className="inline-flex min-h-[44px] items-center rounded text-ds-text-muted hover:text-[#E7ECF2] transition-colors duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
              >
                Disclaimer
              </Link>
            </nav>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-[#212A35] text-center text-xs text-[#8B95A5]">
          © {new Date().getFullYear()} Aegis. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
