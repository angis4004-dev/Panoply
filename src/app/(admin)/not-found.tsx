import React from 'react';
import Link from 'next/link';
import { PanoplyMark } from '@/components/ui/PanoplyLogo';

/**
 * The admin surface's 404.
 *
 * Says nothing about what exists. Everything on the trader origin resolves
 * here when requested on the admin hostname, and vice versa, so this page is
 * reached both by an operator's typo and by someone probing for what the
 * console runs.
 */
export default function AdminNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="flex flex-col items-center text-center">
        <PanoplyMark size={32} className="text-brand-cream" />
        <p className="mt-4 font-mono text-ds-caption uppercase tracking-widest text-ds-text-muted">
          404
        </p>
        <h1 className="mt-1 text-ds-title text-ds-text">Not found</h1>
        <Link
          href="/admin"
          className="mt-5 inline-flex min-h-[36px] items-center rounded-lg border border-ds-border bg-ds-surface-inset px-3 text-ds-label font-medium tracking-normal text-ds-text transition-colors duration-fast ease-ds-out hover:border-ds-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          Back to the console
        </Link>
      </div>
    </div>
  );
}
