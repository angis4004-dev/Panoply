import { Award, Lock } from 'lucide-react';
import type { AchievementCategory } from '@/lib/achievements/catalog';

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

export function AchievementCard({ achievement, onViewCertificate }: AchievementCardProps) {
  const { name, description, xp, hasCertificate, earned, earnedAt, progress } = achievement;

  return (
    <div
      className={`rounded-xl border p-4 transition-colors ${
        earned ? 'border-primary/30 bg-[#122131]/50' : 'border-[#212A35] bg-[#122131]/20 opacity-70'
      }`}
    >
      <div className="mb-3 flex items-start justify-between">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-lg ${
            earned ? 'bg-primary/10' : 'bg-[#212A35]'
          }`}
        >
          {earned ? (
            <Award className="h-4 w-4 text-primary" />
          ) : (
            <Lock className="h-4 w-4 text-[#4b5563]" />
          )}
        </div>
        <span className="font-mono text-xs font-semibold text-[#8B95A5]">+{xp} XP</span>
      </div>
      <h3 className="mb-1 text-sm font-semibold text-white">{name}</h3>
      <p className="mb-3 text-xs text-[#8B95A5]">{description}</p>

      {earned && earnedAt && (
        <p className="text-[10px] uppercase tracking-wide text-[#8B95A5]">
          Earned {new Date(earnedAt).toLocaleDateString()}
        </p>
      )}

      {!earned && progress && (
        <div>
          <div className="mb-1 h-1.5 w-full overflow-hidden rounded-full bg-[#212A35]">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.min(100, (progress.current / progress.target) * 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-[#8B95A5]">
            {progress.current}/{progress.target}
          </p>
        </div>
      )}

      {earned && hasCertificate && onViewCertificate && (
        <button
          onClick={onViewCertificate}
          className="mt-3 rounded-lg border border-primary/40 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#122131]"
        >
          View Certificate
        </button>
      )}
    </div>
  );
}
