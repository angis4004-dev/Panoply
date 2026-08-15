import { Loader } from '@/components/ui/loader';

/**
 * Shown while a dashboard route streams in.
 *
 * Scoped to the segment, so the sidebar, the header and the unlocked state all
 * stay put and only the content area waits - moving between Overview and
 * Vaults should not look like the application reloading. The site-wide
 * loading.tsx would have blanked the whole screen for the same navigation.
 */
export default function DashboardLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-8">
      <Loader size={48} label="Loading" className="text-primary" />
    </div>
  );
}
