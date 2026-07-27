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
              <span className="text-lg font-bold text-white tracking-wide">AEGIS</span>
            </div>
            <p className="text-sm text-[#8B95A5] leading-relaxed">
              AI-first crypto intelligence for automated trading, vault investing, and portfolio
              analysis.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Product</h3>
            <nav className="flex flex-col gap-2 text-sm">
              <a href="#features" className="text-[#8B95A5] hover:text-[#E7ECF2] transition-colors">
                Features
              </a>
              <Link
                href="/dashboard/bots"
                className="text-[#8B95A5] hover:text-[#E7ECF2] transition-colors"
              >
                Trading Bots
              </Link>
              <Link
                href="/dashboard/vaults"
                className="text-[#8B95A5] hover:text-[#E7ECF2] transition-colors"
              >
                Vaults
              </Link>
              <Link
                href="/dashboard/builder"
                className="text-[#8B95A5] hover:text-[#E7ECF2] transition-colors"
              >
                Portfolio Builder
              </Link>
            </nav>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Platform</h3>
            <nav className="flex flex-col gap-2 text-sm">
              <a href="#security" className="text-[#8B95A5] hover:text-[#E7ECF2] transition-colors">
                Security
              </a>
              <a href="#pricing" className="text-[#8B95A5] hover:text-[#E7ECF2] transition-colors">
                Pricing
              </a>
              <Link href="/prd" className="text-[#8B95A5] hover:text-[#E7ECF2] transition-colors">
                Product Docs
              </Link>
            </nav>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Legal</h3>
            <nav className="flex flex-col gap-2 text-sm">
              <a href="#" className="text-[#8B95A5] hover:text-[#E7ECF2] transition-colors">
                Privacy Policy
              </a>
              <a href="#" className="text-[#8B95A5] hover:text-[#E7ECF2] transition-colors">
                Terms of Service
              </a>
              <a href="#" className="text-[#8B95A5] hover:text-[#E7ECF2] transition-colors">
                Disclaimer
              </a>
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
