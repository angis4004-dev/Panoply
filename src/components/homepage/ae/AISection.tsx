'use client';

import Link from 'next/link';
import { ArrowRight, Brain, User } from 'lucide-react';

export default function AISection() {
  return (
    <section className="py-16 bg-red-500">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold text-foreground mb-8 text-center">AI-Powered Insights</h2>
        <div className="bg-background/30 border-[#212A35]/20 rounded-xl p-6">
          <div className="flex items-start space-x-4 mb-4">
            <div className="flex-shrink-0 h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="mb-2 font-medium text-foreground">You:</p>
              <p className="text-sm text-foreground/90">
                How can I improve my portfolio yield without significantly increasing my risk?
              </p>
            </div>
          </div>
          <div className="flex items-start space-x-4 mb-6">
            <div className="flex-shrink-0 h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center">
              <Brain className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="mb-2 font-medium text-foreground">Aegis AI:</p>
              <p className="text-sm text-foreground/90">
                I found 3 opportunities that may improve your estimated yield while maintaining your
                current risk profile. Would you like me to review the recommendations?
              </p>
              <button className="mt-2 px-3 py-1 bg-primary text-[#1A1305] hover:bg-primary/90 rounded text-sm">
                View Recommendations
              </button>
            </div>
          </div>
          <div className="mt-6 text-center">
            <Link
              href="/dashboard/ai"
              className="inline-flex items-center px-4 py-2 bg-primary text-[#1A1305] font-medium rounded-lg hover:bg-primary/90 transition-colors"
            >
              <ArrowRight className="mr-2 h-4 w-4" /> Try the AI Command Center
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
