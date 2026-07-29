import AppLogo from '@/components/ui/AppLogo';
import LoadingBars from '@/components/ui/loading-bars';

export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#0A0E13]">
      <AppLogo size={40} />
      <LoadingBars />
      <p className="text-sm text-[#8B95A5]">Loading Aegis…</p>
    </div>
  );
}
