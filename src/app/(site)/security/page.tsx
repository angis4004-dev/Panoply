import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, FileCheck, ShieldCheck } from 'lucide-react';
import { Navbar } from '@/components/homepage/navbar';
import { Footer } from '@/components/homepage/Footer';
import { PageBackground } from '@/components/backgrounds/PageBackground';
import { Reveal } from '@/components/ui/Reveal';
import {
  AUDIT,
  AUDITOR_INTRO,
  AUDIT_OBJECTIVE,
  AUDIT_SCOPE,
  METHODOLOGY,
  SECURITY_PRINCIPLES,
  SEVERITIES,
  STRENGTHENED,
  OBSERVED,
  ONGOING_RECOMMENDATIONS,
  DISCLAIMER,
} from '@/lib/audit-report';

export const metadata: Metadata = {
  title: 'Security Review | Panoply',
  description: `Independent smart contract security assessment of the Panoply protocol by ${AUDIT.auditor}, ${AUDIT.reviewDate}.`,
};

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-ds-caption font-semibold uppercase tracking-[0.35em] text-primary mb-3">
      {children}
    </p>
  );
}

/** Severity ramp. No "positive" tone exists - severity has no good end. */
const SEVERITY_TONE = {
  negative: 'text-ds-value-negative border-ds-value-negative/40 bg-ds-value-negative/10',
  warning: 'text-ds-value-warning border-ds-value-warning/40 bg-ds-value-warning/10',
  muted: 'text-ds-text-muted border-ds-border bg-ds-surface-inset',
} as const;

export default function SecurityReviewPage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="relative isolate min-h-screen text-[#E7ECF2] antialiased"
    >
      <PageBackground />
      <Navbar />

      <section className="relative pt-32 pb-16 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(30,99,255,0.10),transparent_60%)]"
        />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Reveal>
            <SectionEyebrow>Independent assessment</SectionEyebrow>
            <h1 className="font-display font-normal text-[2.75rem] sm:text-[4rem] leading-[1.05] tracking-[-0.015em] text-white mb-6">
              {AUDIT.title}
            </h1>
            <p className="text-ds-text-muted text-base sm:text-lg leading-relaxed max-w-2xl mx-auto mb-8">
              {AUDIT.subtitle}
            </p>
            {/* Auditor and date are the two facts a reader actually needs up
                front to judge whether the claim is worth anything. */}
            <dl className="inline-flex flex-col sm:flex-row items-center gap-4 sm:gap-8 rounded-xl border border-ds-border bg-ds-surface-raised/50 px-6 py-4">
              <div className="text-center sm:text-left">
                <dt className="text-ds-caption uppercase tracking-[0.2em] text-ds-text-muted">
                  Auditor
                </dt>
                <dd className="mt-1 font-semibold text-white">{AUDIT.auditor}</dd>
              </div>
              <div aria-hidden className="hidden sm:block h-8 w-px bg-[#212A35]" />
              <div className="text-center sm:text-left">
                <dt className="text-ds-caption uppercase tracking-[0.2em] text-ds-text-muted">
                  Review period
                </dt>
                <dd className="mt-1 font-mono text-sm text-white">{AUDIT.reviewDate}</dd>
              </div>
            </dl>
          </Reveal>
        </div>
      </section>

      {/* Conclusion, stated with the report's own conditionality intact. */}
      <section className="py-12 border-t border-ds-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="rounded-xl border border-primary/25 bg-ds-surface-raised/50 p-6 sm:p-8">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <FileCheck className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-display font-normal text-xl text-white mb-2">
                    Assessment outcome
                  </h2>
                  <p className="text-sm text-ds-text-muted leading-relaxed mb-3">
                    No evidence of intentionally malicious functionality was identified within the
                    reviewed codebase. Subject to the remediation of the findings presented in the
                    report, the reviewed Panoply codebase demonstrates a security posture suitable
                    for progression toward production deployment.
                  </p>
                  <p className="text-sm text-ds-text-muted leading-relaxed">
                    The protocol demonstrates a strong architectural foundation with a clear
                    emphasis on transparency, modularity, and risk-aware design.
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="py-16 border-t border-ds-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionEyebrow>The auditor</SectionEyebrow>
          <h2 className="font-display font-normal text-[2rem] sm:text-[2.75rem] leading-[1.1] tracking-[-0.01em] text-white mb-6">
            About {AUDIT.auditor}
          </h2>
          <div className="space-y-4">
            {AUDITOR_INTRO.map((p) => (
              <p key={p.slice(0, 24)} className="text-sm text-ds-text-muted leading-relaxed">
                {p}
              </p>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 border-t border-ds-border bg-[#0D1219]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionEyebrow>Objective</SectionEyebrow>
          <h2 className="font-display font-normal text-[2rem] sm:text-[2.75rem] leading-[1.1] tracking-[-0.01em] text-white mb-4">
            What was assessed for
          </h2>
          <p className="text-sm text-ds-text-muted leading-relaxed mb-8">
            The review focused on identifying vulnerabilities that could impact:
          </p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {AUDIT_OBJECTIVE.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-ds-text-muted">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="py-16 border-t border-ds-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mb-12">
            <SectionEyebrow>Coverage</SectionEyebrow>
            <h2 className="font-display font-normal text-[2rem] sm:text-[2.75rem] leading-[1.1] tracking-[-0.01em] text-white mb-4">
              Audit scope
            </h2>
            <p className="text-sm text-ds-text-muted leading-relaxed">
              The assessment covered the core smart contract ecosystem, protocol architecture, and
              supporting infrastructure that power the Panoply platform.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {AUDIT_SCOPE.map((group, i) => (
              <Reveal key={group.group} delay={i * 80}>
                <div className="h-full rounded-xl border border-ds-border bg-ds-surface-raised/50 p-6">
                  <h3 className="text-sm font-semibold text-white mb-4">{group.group}</h3>
                  <ul className="space-y-2">
                    {group.items.map((item) => (
                      <li key={item} className="text-xs text-ds-text-muted leading-relaxed">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 border-t border-ds-border bg-[#0D1219]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mb-12">
            <SectionEyebrow>How it was done</SectionEyebrow>
            <h2 className="text-2xl sm:font-display font-normal text-[2rem] sm:text-[2.5rem] leading-[1.1] tracking-[-0.01em] text-white">
              Review methodology
            </h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {METHODOLOGY.map((m, i) => (
              <Reveal key={m.name} delay={(i % 4) * 80}>
                <div className="h-full rounded-xl border border-ds-border bg-ds-surface-raised/50 p-6">
                  <h3 className="text-sm font-semibold text-white mb-2">{m.name}</h3>
                  <p className="text-xs text-ds-text-muted leading-relaxed">{m.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 border-t border-ds-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mb-10">
            <SectionEyebrow>Classification</SectionEyebrow>
            <h2 className="font-display font-normal text-[2rem] sm:text-[2.75rem] leading-[1.1] tracking-[-0.01em] text-white mb-4">
              Severity levels
            </h2>
            <p className="text-sm text-ds-text-muted leading-relaxed">
              Findings are categorized by potential impact and likelihood of exploitation. The
              report does not publish per-severity counts.
            </p>
          </div>
          {/* Scrolls inside its own container rather than pushing the page
              sideways on narrow screens. */}
          <div className="overflow-x-auto rounded-xl border border-ds-border">
            <table className="w-full min-w-[40rem] text-left">
              <thead>
                <tr className="border-b border-ds-border bg-ds-surface-raised/50">
                  <th className="px-5 py-3 text-ds-caption font-semibold uppercase tracking-[0.2em] text-ds-text-muted">
                    Severity
                  </th>
                  <th className="px-5 py-3 text-ds-caption font-semibold uppercase tracking-[0.2em] text-ds-text-muted">
                    Description
                  </th>
                  <th className="px-5 py-3 text-ds-caption font-semibold uppercase tracking-[0.2em] text-ds-text-muted">
                    Recommended action
                  </th>
                </tr>
              </thead>
              <tbody>
                {SEVERITIES.map((s) => (
                  <tr key={s.level} className="border-b border-ds-border last:border-b-0">
                    <td className="px-5 py-4 align-top">
                      <span
                        className={`inline-flex whitespace-nowrap rounded border px-2 py-0.5 text-xs font-semibold ${SEVERITY_TONE[s.tone]}`}
                      >
                        {s.level}
                      </span>
                    </td>
                    <td className="px-5 py-4 align-top text-xs text-ds-text-muted leading-relaxed">
                      {s.description}
                    </td>
                    <td className="px-5 py-4 align-top text-xs text-ds-text-muted whitespace-nowrap">
                      {s.action}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="py-16 border-t border-ds-border bg-[#0D1219]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid gap-10 lg:grid-cols-2">
          <div>
            <SectionEyebrow>Findings</SectionEyebrow>
            <h2 className="font-display font-normal text-[2rem] sm:text-[2.75rem] leading-[1.1] tracking-[-0.01em] text-white mb-4">
              Recommendations made
            </h2>
            <p className="text-sm text-ds-text-muted leading-relaxed mb-6">
              Several recommendations were made to strengthen:
            </p>
            <ul className="space-y-2.5">
              {STRENGTHENED.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-ds-text-muted">
                  <span
                    aria-hidden
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <SectionEyebrow>Observed</SectionEyebrow>
            <h2 className="font-display font-normal text-[2rem] sm:text-[2.75rem] leading-[1.1] tracking-[-0.01em] text-white mb-4">
              During the engagement
            </h2>
            <ul className="space-y-2.5 mb-8">
              {OBSERVED.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-ds-text-muted">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {item}
                </li>
              ))}
            </ul>
            <h3 className="text-sm font-semibold text-white mb-3">Principles applied</h3>
            <div className="flex flex-wrap gap-2">
              {SECURITY_PRINCIPLES.map((p) => (
                <span
                  key={p}
                  className="rounded-full border border-ds-border bg-ds-surface-raised/50 px-3 py-1 text-xs text-ds-text-muted"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 border-t border-ds-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionEyebrow>Ongoing</SectionEyebrow>
          <h2 className="font-display font-normal text-[2rem] sm:text-[2.75rem] leading-[1.1] tracking-[-0.01em] text-white mb-4">
            Security is not a one-time event
          </h2>
          <p className="text-sm text-ds-text-muted leading-relaxed mb-6">
            As with all decentralized financial systems, the auditor recommends:
          </p>
          <ul className="grid gap-3 sm:grid-cols-2 mb-10">
            {ONGOING_RECOMMENDATIONS.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-ds-text-muted">
                <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                {item}
              </li>
            ))}
          </ul>

          {/* Given prominence rather than buried in small print: a reader
              deciding whether to deposit needs the limits of the assessment as
              plainly as its conclusion. */}
          <div className="rounded-xl border border-ds-border bg-ds-surface-raised/50 p-6">
            <h3 className="text-sm font-semibold text-white mb-3">Disclaimer</h3>
            <p className="text-sm text-ds-text-muted leading-relaxed">{DISCLAIMER}</p>
            <p className="mt-4 text-xs text-ds-text-muted leading-relaxed">
              This page summarizes the assessment reported by {AUDIT.auditor} for the review period
              ending {AUDIT.reviewDate}. It is one component of a broader, continuous security
              program and is not a guarantee against loss.
            </p>
          </div>
        </div>
      </section>

      <section className="py-24 border-t border-ds-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="relative rounded-2xl border border-ds-border bg-ds-surface-raised/60 backdrop-blur-sm px-8 py-14 text-center overflow-hidden">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(30,99,255,0.08),transparent_70%)]"
              />
              <div className="relative">
                <h2 className="font-display font-normal text-[2rem] sm:text-[2.75rem] leading-[1.1] tracking-[-0.01em] text-white mb-4">
                  Your keys, your crypto.
                </h2>
                <p className="text-ds-text-muted mb-8 max-w-xl mx-auto leading-relaxed">
                  Panoply never takes custody of your assets. Every strategy runs non-custodially.
                </p>
                <Link
                  href="/sign-up-login-screen"
                  className="inline-flex items-center gap-2 px-8 py-3.5 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg transition-all active:scale-[0.97] hover:shadow-lg hover:shadow-primary/25"
                >
                  Get Started
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <Footer />
    </main>
  );
}
