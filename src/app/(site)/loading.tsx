import { Loader } from '@/components/ui/loader';

export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0A0E13]">
      <Loader size={56} label="Loading" className="text-primary" />
    </div>
  );
}
