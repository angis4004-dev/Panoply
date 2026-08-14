import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import { PanoplyMark } from '@/components/ui/PanoplyLogo';
import { Loader } from '@/components/ui/loader';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Sign in | Panoply Operations',
  robots: { index: false, follow: false },
};

/**
 * Never prerendered, even though nothing on it is dynamic.
 *
 * A statically generated page gets Next's own Cache-Control, which overrides
 * the no-store the proxy sets on every admin response - so this one page was
 * the single cacheable thing on the console. It is also the page most likely
 * to sit behind a CDN. Forcing it dynamic keeps the whole surface uncacheable
 * rather than almost.
 */
export const dynamic = 'force-dynamic';

/**
 * The console's only unauthenticated page.
 *
 * It says nothing about the platform, links nowhere, and offers no account
 * recovery: an admin who has lost their credentials is recovered by another
 * admin through the console, or by the environment-controlled bootstrap. A
 * self-service reset here would be a way in that bypasses both factors.
 */
export default function AdminLoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      {/* A single cream wash behind the card, the same accent the marketing
          pages use. Enough to say "this is Panoply" without decorating a screen
          whose entire job is one form. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/[0.07] blur-3xl"
      />

      <div className="relative w-full max-w-sm">
        {/*
         * The whole card sits inside the boundary, lockup included.
         *
         * The form reads ?next= to return an operator to the page they were
         * trying to reach, and useSearchParams opts a component out of static
         * rendering unless it sits behind a boundary - so a boundary there has
         * to be. What it wraps is the choice. With only the form inside it, the
         * waiting state was the mark, the wordmark, OPERATIONS and a blank grey
         * rectangle where the form belonged: a screen that looks finished and
         * is not. Wrapping the lockup too means the wait shows one thing, the
         * loader, and everything arrives together.
         */}
        <Suspense
          fallback={
            <div
              className="flex min-h-[27rem] items-center justify-center"
              role="status"
              aria-label="Loading"
            >
              <Loader size={48} className="text-primary" />
            </div>
          }
        >
          <div className="mb-7 flex flex-col items-center text-center">
            <PanoplyMark size={40} className="text-brand-cream" />
            <span className="mt-3 font-wordmark text-ds-title font-normal tracking-normal text-brand-cream">
              Panoply
            </span>
            <span className="mt-1 text-ds-caption uppercase tracking-[0.2em] text-primary/70">
              Operations
            </span>
          </div>

          <LoginForm />

          <p className="mt-6 text-center text-ds-caption font-normal tracking-normal text-ds-text-muted">
            Authorized personnel only. Every action is recorded.
          </p>
        </Suspense>
      </div>
    </div>
  );
}
