import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  Layers,
  LineChart,
  Lock,
  Radar,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react';
import { Navbar } from '@/components/homepage/navbar';
import { Footer } from '@/components/homepage/Footer';
import { Reveal } from '@/components/ui/Reveal';
import { FaqAccordion } from '@/components/about/FaqAccordion';
import {
  MOTTO,
  CORE_PRINCIPLES,
  HOW_IT_WORKS,
  STRATEGY_CATEGORIES,
  RISK_FRAMEWORK,
  ROADMAP,
  FAQ_ITEMS,
} from '@/lib/about-content';

export const metadata: Metadata = {
  title: 'About Aegis — Quantitative Intelligence for Decentralized Finance',
  description:
    'Aegis is a non-custodial DeFi automation platform combining quantitative research, signal generation, risk management, and transparent portfolio analytics.',
};

const CORE_ICONS = [Lock, ShieldCheck, BarChart3, Radar, LineChart];

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-primary mb-3">
      {children}
    </p>
  );
}

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[#0A0E13] text-[#E7ECF2] antialiased">
      <Navbar />

      {/* Intro / motto */}
      <section className="relative pt-32 pb-16 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(30,99,255,0.10),transparent_60%)]"
        />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Reveal>
            <SectionEyebrow>About Aegis</SectionEyebrow>
            <h1 className="text-4xl sm:text-5xl font-bold text-white mb-6 leading-tight">
              {MOTTO}
            </h1>
            <p className="text-[#8B95A5] text-lg leading-relaxed max-w-2xl mx-auto">
              Aegis is a non-custodial DeFi automation platform built around quantitative analysis,
              signal generation, and disciplined risk management - designed to bring institutional
              rigor to on-chain investing, without asking you to give up control of your assets.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Mission & Vision */}
      <section className="py-16 border-t border-[#212A35]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid gap-8 lg:grid-cols-2">
          <Reveal>
            <div className="h-full rounded-xl border border-[#212A35] bg-[#122131]/50 p-8">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 mb-5">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-3">Mission</h2>
              <p className="text-sm text-[#8B95A5] leading-relaxed">
                To bring institutional-grade quantitative discipline to decentralized finance -
                replacing guesswork with structured, risk-aware automation that operates
                transparently and non-custodially.
              </p>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <div className="h-full rounded-xl border border-[#212A35] bg-[#122131]/50 p-8">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 mb-5">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-3">Vision</h2>
              <p className="text-sm text-[#8B95A5] leading-relaxed">
                We believe on-chain investing should be held to the same standards of risk
                management, transparency, and accountability as traditional institutional finance -
                without requiring custody of user assets to get there.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Core Principles */}
      <section className="py-16 border-t border-[#212A35]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <SectionEyebrow>What we stand for</SectionEyebrow>
            <h2 className="text-3xl font-bold text-white">Core Principles</h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {CORE_PRINCIPLES.map((p, i) => {
              const Icon = CORE_ICONS[i] ?? ShieldCheck;
              return (
                <Reveal key={p.title} delay={i * 80}>
                  <div className="h-full rounded-xl border border-[#212A35] bg-[#122131]/50 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/25">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 mb-4">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <h3 className="font-semibold text-white mb-2 text-sm">{p.title}</h3>
                    <p className="text-xs text-[#8B95A5] leading-relaxed">{p.desc}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* How Aegis Works */}
      <section className="py-16 border-t border-[#212A35] bg-[#0D1219]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <SectionEyebrow>The pipeline</SectionEyebrow>
            <h2 className="text-3xl font-bold text-white">How Aegis Works</h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS.map((step, i) => (
              <Reveal key={step.step} delay={i * 80}>
                <div className="h-full rounded-xl border border-[#212A35] bg-[#122131]/50 p-6">
                  <span className="font-mono text-xs text-primary/70">{step.step}</span>
                  <h3 className="text-base font-semibold text-white mt-2 mb-2">{step.title}</h3>
                  <p className="text-xs text-[#8B95A5] leading-relaxed">{step.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Strategy Categories */}
      <section className="py-16 border-t border-[#212A35]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 max-w-2xl mx-auto">
            <SectionEyebrow>Educational overview</SectionEyebrow>
            <h2 className="text-3xl font-bold text-white mb-4">Strategy Categories</h2>
            <p className="text-sm text-[#8B95A5] leading-relaxed">
              Aegis strategies fall into distinct categories, each with a different purpose, risk
              profile, and expected behavior. No single category is presented as superior - the
              right mix depends on your own risk tolerance and objectives.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {STRATEGY_CATEGORIES.map((s, i) => (
              <Reveal key={s.name} delay={(i % 6) * 60}>
                <div className="h-full rounded-xl border border-[#212A35] bg-[#122131]/50 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/25">
                  <h3 className="text-sm font-semibold text-white mb-3">{s.name}</h3>
                  <dl className="space-y-2.5 text-xs leading-relaxed">
                    <div>
                      <dt className="text-[#4b5563] uppercase tracking-wide text-[10px] mb-0.5">
                        Purpose
                      </dt>
                      <dd className="text-[#8B95A5]">{s.purpose}</dd>
                    </div>
                    <div>
                      <dt className="text-[#4b5563] uppercase tracking-wide text-[10px] mb-0.5">
                        Typical use case
                      </dt>
                      <dd className="text-[#8B95A5]">{s.useCase}</dd>
                    </div>
                    <div>
                      <dt className="text-[#4b5563] uppercase tracking-wide text-[10px] mb-0.5">
                        Risk profile
                      </dt>
                      <dd className="text-[#8B95A5]">{s.riskProfile}</dd>
                    </div>
                    <div>
                      <dt className="text-[#4b5563] uppercase tracking-wide text-[10px] mb-0.5">
                        Expected behavior
                      </dt>
                      <dd className="text-[#8B95A5]">{s.behavior}</dd>
                    </div>
                  </dl>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Risk Framework */}
      <section className="py-16 border-t border-[#212A35] bg-[#0D1219]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 max-w-2xl mx-auto">
            <SectionEyebrow>Risk as a feature, not an afterthought</SectionEyebrow>
            <h2 className="text-3xl font-bold text-white mb-4">Risk Framework</h2>
            <p className="text-sm text-[#8B95A5] leading-relaxed">
              Risk management runs continuously alongside every strategy - not as a disclaimer, but
              as active infrastructure.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {RISK_FRAMEWORK.map((item, i) => (
              <Reveal key={item.title} delay={(i % 6) * 60}>
                <div className="h-full rounded-xl border border-[#212A35] bg-[#122131]/50 p-5">
                  <h3 className="text-sm font-semibold text-white mb-1.5">{item.title}</h3>
                  <p className="text-xs text-[#8B95A5] leading-relaxed">{item.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Technology & Security & Transparency */}
      <section className="py-16 border-t border-[#212A35]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid gap-8 lg:grid-cols-3">
          <Reveal>
            <div className="h-full rounded-xl border border-[#212A35] bg-[#122131]/50 p-7">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 mb-5">
                <Layers className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-white mb-3">Technology</h2>
              <p className="text-sm text-[#8B95A5] leading-relaxed">
                Quantitative models, real-time market data, and on-chain execution infrastructure
                work together to move a signal from generation to execution with minimal latency,
                across supported chains and protocols.
              </p>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <div className="h-full rounded-xl border border-[#212A35] bg-[#122131]/50 p-7">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 mb-5">
                <ShieldCheck className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-white mb-3">Security</h2>
              <p className="text-sm text-[#8B95A5] leading-relaxed">
                Non-custodial architecture means Aegis never holds user funds or private keys.
                Session security, encrypted infrastructure, and continuous account monitoring
                protect the platform layer around your assets.
              </p>
            </div>
          </Reveal>
          <Reveal delay={200}>
            <div className="h-full rounded-xl border border-[#212A35] bg-[#122131]/50 p-7">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 mb-5">
                <BarChart3 className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-white mb-3">Transparency</h2>
              <p className="text-sm text-[#8B95A5] leading-relaxed">
                Allocations, risk exposure, and performance are visible in your dashboard in real
                time. Strategy logic and risk parameters are documented, not left as a black box.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Roadmap */}
      <section className="py-16 border-t border-[#212A35] bg-[#0D1219]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <SectionEyebrow>Where we&apos;re headed</SectionEyebrow>
            <h2 className="text-3xl font-bold text-white">Roadmap</h2>
          </div>
          <div className="space-y-6">
            {ROADMAP.map((phase, i) => (
              <Reveal key={phase.phase} delay={i * 100}>
                <div className="rounded-xl border border-[#212A35] bg-[#122131]/50 p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <h3 className="text-base font-semibold text-white">{phase.phase}</h3>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-primary bg-primary/10 rounded-full px-2.5 py-1">
                      {phase.status}
                    </span>
                  </div>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {phase.items.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2 text-sm text-[#8B95A5] leading-relaxed"
                      >
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
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

      {/* FAQ */}
      <section className="py-16 border-t border-[#212A35]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <SectionEyebrow>Common questions</SectionEyebrow>
            <h2 className="text-3xl font-bold text-white">Frequently Asked Questions</h2>
          </div>
          <Reveal>
            <FaqAccordion items={[...FAQ_ITEMS]} />
          </Reveal>
        </div>
      </section>

      {/* Closing statement */}
      <section className="py-24 border-t border-[#212A35]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="relative rounded-2xl border border-[#212A35] bg-[#122131]/60 backdrop-blur-sm px-8 py-14 text-center overflow-hidden">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(30,99,255,0.08),transparent_70%)]"
              />
              <div className="relative">
                <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
                  Disciplined automation. Measurable process. No guarantees implied.
                </h2>
                <p className="text-[#8B95A5] mb-8 max-w-xl mx-auto leading-relaxed">
                  Aegis is built for long-term consistency and capital preservation, not promises of
                  guaranteed profit. Every strategy carries risk - our role is to make that risk
                  visible, managed, and continuously monitored.
                </p>
                <Link
                  href="/sign-up-login-screen"
                  className="inline-flex items-center gap-2 px-8 py-3.5 text-sm font-semibold text-[#F2F5FA] bg-primary hover:bg-[#3D77FF] rounded-lg transition-all active:scale-[0.97] hover:shadow-lg hover:shadow-primary/25"
                >
                  Explore the Platform
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
