import { Navbar } from '@/components/homepage/navbar';
import { Footer } from '@/components/homepage/Footer';

interface LegalPageLayoutProps {
  title: string;
  updated: string;
  children: React.ReactNode;
}

export function LegalPageLayout({ title, updated, children }: LegalPageLayoutProps) {
  return (
    <main className="min-h-screen bg-[#0A0E13] text-[#E7ECF2] antialiased">
      <Navbar />
      <div className="pt-28 pb-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">{title}</h1>
          <p className="text-xs uppercase tracking-wider text-[#8B95A5] mb-10">
            Last updated {updated}
          </p>
          <div className="space-y-8 text-sm leading-relaxed text-[#C5CCD6] [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-white [&_h2]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_p+ul]:mt-3 [&_strong]:text-[#E7ECF2]">
            {children}
          </div>
        </div>
      </div>
      <Footer />
    </main>
  );
}
