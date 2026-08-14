import {
  Check,
  Flame,
  Lock,
  PieChart,
  Rocket,
  ShieldCheck,
  Trophy,
  Waypoints,
  type LucideIcon,
} from 'lucide-react';
import type { AchievementCategory } from '@/lib/achievements/catalog';

/**
 * One icon per category, rather than one icon for everything.
 *
 * Every earned card used to show the same Award glyph, so a wall of 25
 * achievements was 25 identical tiles distinguished only by their text -
 * nothing to scan by, and the six categories the page is already grouped
 * into had no visual counterpart. The card was being handed `category` and
 * ignoring it.
 *
 * Per-category rather than per-achievement: it is the grouping the page
 * actually uses, and 25 bespoke icons would be 25 more chances for one to
 * drift out of step with its achievement.
 */
const CATEGORY_ICONS: Record<AchievementCategory, LucideIcon> = {
  'getting-started': Rocket,
  'security-trust': ShieldCheck,
  portfolio: PieChart,
  'strategy-analytics': Waypoints,
  engagement: Flame,
  milestones: Trophy,
};

export interface AchievementViewModel {
  key: string;
  name: string;
  description: string;
  category: AchievementCategory;
  xp: number;
  hasCertificate: boolean;
  earned: boolean;
  earnedAt: string | null;
  progress: { current: number; target: number } | null;
}

interface AchievementCardProps {
  achievement: AchievementViewModel;
  onViewCertificate?: () => void;
}

/*
 * Earned has to be obvious at a glance.
 *
 * The two states used to differ by a border at 30% cream and `opacity-70`,
 * which on this surface is close to no difference at all: a wall of 25 tiles
 * where the seven you have actually earned do not announce themselves. The
 * page exists to show progress, so the earned state now carries the accent on
 * four separate channels - border, background wash, icon chip, and a check
 * badge - and none of them is colour alone.
 *
 * Unearned is dimmed by choosing muted tokens rather than by dropping opacity
 * on the whole card. A blanket `opacity-70` also dims already-muted body text,
 * which is how a locked card's description ends up under the contrast floor;
 * styling the parts explicitly keeps every string legible.
 */
export function AchievementCard({ achievement, onViewCertificate }: AchievementCardProps) {
  const { name, description, category, xp, hasCertificate, earned, earnedAt, progress } =
    achievement;
  const CategoryIcon = CATEGORY_ICONS[category] ?? Trophy;

  return (
    <div
      // data-earned so the state is inspectable and testable without reading
      // Tailwind classes back out of the DOM.
      data-earned={earned}
      className={`relative rounded-xl border p-4 transition-colors ${
        earned
          ? 'border-primary/60 bg-primary/[0.07] shadow-[inset_0_1px_0_0_rgb(255_240_201_/_0.08)]'
          : 'border-ds-border bg-ds-surface-raised/20'
      }`}
    >
      <div className="mb-3 flex items-start justify-between">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-lg ${
            earned ? 'bg-primary/20 ring-1 ring-primary/40' : 'bg-ds-border/60'
          }`}
        >
          {earned ? (
            <CategoryIcon className="h-4 w-4 text-primary" aria-hidden />
          ) : (
            <Lock className="h-4 w-4 text-ds-text-muted" aria-hidden />
          )}
        </div>
        <div className="flex items-center gap-2">
          {earned && (
            // The badge carries a text label for screen readers, so "done" is
            // never communicated by the cream wash alone.
            <span className="flex items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              <Check className="h-3 w-3" aria-hidden />
              Earned
            </span>
          )}
          <span
            className={`font-mono text-xs font-semibold ${
              earned ? 'text-primary' : 'text-ds-text-muted'
            }`}
          >
            +{xp} XP
          </span>
        </div>
      </div>
      <h3
        className={`mb-1 text-sm font-semibold ${earned ? 'text-ds-text' : 'text-ds-text-secondary'}`}
      >
        {name}
      </h3>
      <p className="mb-3 text-xs text-ds-text-muted">{description}</p>

      {earned && earnedAt && (
        <p className="text-[10px] uppercase tracking-wide text-primary/70">
          Earned {new Date(earnedAt).toLocaleDateString()}
        </p>
      )}

      {!earned && progress && (
        <div>
          <div className="mb-1 h-1.5 w-full overflow-hidden rounded-full bg-ds-border">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.min(100, (progress.current / progress.target) * 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-ds-text-muted">
            {progress.current}/{progress.target}
          </p>
        </div>
      )}

      {earned && hasCertificate && onViewCertificate && (
        <button
          onClick={onViewCertificate}
          className="mt-3 rounded-lg border border-primary/40 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface-raised"
        >
          View Certificate
        </button>
      )}
    </div>
  );
}
