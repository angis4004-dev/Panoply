'use client';

import Link from 'next/link';
import { Shield, X, Mail, Gamepad2 } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="py-12 bg-background/50 border-t border-border/5">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 pt-12 pb-8">
          {/* Brand */}
          <div className="flex flex-col items-center">
            <div className="h-8 w-8 bg-primary/10 rounded-lg flex items-center justify-center">
              <Shield className="h-4 w-4 text-primary" />
            </div>
            <span className="text-xl font-bold text-primary">Aegis</span>
            <p className="text-sm text-foreground/60 text-center">
              AI-powered DeFi portfolio management platform
            </p>
            <div className="mt-4 flex space-x-4">
              <a href="#" className="text-foreground/60 hover:text-foreground transition-colors">
                <X className="h-4 w-4" />
              </a>
              <a href="#" className="text-foreground/60 hover:text-foreground transition-colors">
                <Mail className="h-4 w-4" />
              </a>
              <a href="#" className="text-foreground/60 hover:text-foreground transition-colors">
                <Gamepad2 className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* Product */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground mb-4">Product</h3>
            <nav className="space-y-2">
              <a href="#" className="text-foreground/60 hover:text-foreground transition-colors">
                Features
              </a>
              <Link
                href="/dashboard/ai"
                className="text-foreground/60 hover:text-foreground transition-colors"
              >
                AI Command Center
              </Link>
              <Link
                href="/dashboard/bots"
                className="text-foreground/60 hover:text-foreground transition-colors"
              >
                Trading Bots
              </Link>
              <Link
                href="/dashboard/vaults"
                className="text-foreground/60 hover:text-foreground transition-colors"
              >
                Vault Discovery
              </Link>
              <Link
                href="/dashboard/yield"
                className="text-foreground/60 hover:text-foreground transition-colors"
              >
                Yield Intelligence
              </Link>
              <Link
                href="/dashboard/builder"
                className="text-foreground/60 hover:text-foreground transition-colors"
              >
                Portfolio Builder
              </Link>
            </nav>
          </div>

          {/* Platform */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground mb-4">Platform</h3>
            <nav className="space-y-2">
              <a href="#" className="text-foreground/60 hover:text-foreground transition-colors">
                Security
              </a>
              <a href="#" className="text-foreground/60 hover:text-foreground transition-colors">
                Documentation
              </a>
              <a href="#" className="text-foreground/60 hover:text-foreground transition-colors">
                API
              </a>
              <a href="#" className="text-foreground/60 hover:text-foreground transition-colors">
                Status
              </a>
              <a href="#" className="text-foreground/60 hover:text-foreground transition-colors">
                Integrations
              </a>
            </nav>
          </div>

          {/* Legal */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground mb-4">Legal</h3>
            <nav className="space-y-2">
              <a href="#" className="text-foreground/60 hover:text-foreground transition-colors">
                Terms of Service
              </a>
              <a href="#" className="text-foreground/60 hover:text-foreground transition-colors">
                Privacy Policy
              </a>
              <a href="#" className="text-foreground/60 hover:text-foreground transition-colors">
                Cookie Policy
              </a>
              <a href="#" className="text-foreground/60 hover:text-foreground transition-colors">
                Disclaimer
              </a>
            </nav>
          </div>
        </div>

        <div className="border-t border-border/5 pt-8 mt-8 text-center text-xs text-foreground/40">
          © {new Date().getFullYear()} Aegis Labs. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
