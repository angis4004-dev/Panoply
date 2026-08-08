'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck, Clock, ShieldAlert, ShieldX, Paperclip } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { useAuth } from '@/hooks/use-auth';
import { useAppStore } from '@/store/app-store';
import type { KycInfo } from '@/lib/types';

const ID_TYPES: { value: 'passport' | 'drivers_license' | 'national_id'; label: string }[] = [
  { value: 'passport', label: 'Passport' },
  { value: 'drivers_license', label: "Driver's License" },
  { value: 'national_id', label: 'National ID' },
];

const inputClass =
  'w-full rounded-lg border border-ds-border bg-ds-surface-raised px-3 py-2.5 text-sm text-white placeholder-[#8B95A5] focus:outline-none focus:ring-2 focus:ring-primary/50';
const labelClass = 'block text-xs font-semibold text-ds-text-muted mb-1.5 uppercase tracking-wide';

interface FormState {
  fullName: string;
  dateOfBirth: string;
  country: string;
  idType: 'passport' | 'drivers_license' | 'national_id';
  idNumber: string;
  documentProvided: boolean;
}

const emptyForm: FormState = {
  fullName: '',
  dateOfBirth: '',
  country: '',
  idType: 'passport',
  idNumber: '',
  documentProvided: false,
};

export default function KycPage() {
  const { user, setUser } = useAuth();
  const { addToast } = useAppStore();
  const [info, setInfo] = useState<KycInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [fileName, setFileName] = useState('');
  const [form, setForm] = useState<FormState>(emptyForm);

  useEffect(() => {
    fetch('/api/kyc')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: KycInfo | null) => {
        if (!data) return;
        setInfo(data);
        setForm({
          fullName: data.fullName || '',
          dateOfBirth: data.dateOfBirth || '',
          country: data.country || '',
          idType: (data.idType || 'passport') as FormState['idType'],
          idNumber: data.idNumber || '',
          documentProvided: data.documentProvided,
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileName(file?.name || '');
    updateField('documentProvided', !!file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/kyc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to submit verification');
      }

      const data = await res.json();
      setInfo((prev) =>
        prev
          ? { ...prev, status: data.status, submittedAt: data.submittedAt, rejectionReason: null }
          : prev
      );
      if (user) setUser({ ...user, kycStatus: data.status });
      addToast('Verification submitted — under review', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to submit verification', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageHeader
          title="Identity Verification"
          description="Confirm your identity to unlock vault deposits and withdrawals."
        />
        <p className="text-sm text-ds-text-muted">Loading verification status...</p>
      </div>
    );
  }

  const status = info?.status || 'unverified';

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Identity Verification"
        description="Confirm your identity to unlock vault deposits and withdrawals."
      />

      <div className="mx-auto max-w-2xl space-y-6">
        {status === 'verified' && (
          <div className="flex items-start gap-3 rounded-xl border border-green-400/25 bg-green-400/5 p-5">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-400" />
            <div>
              <h2 className="font-semibold text-white">You&apos;re verified</h2>
              <p className="mt-1 text-sm text-ds-text-muted">
                Identity verification is complete. Vault deposits and withdrawals are unlocked.
                {info?.submittedAt && (
                  <>
                    {' '}
                    Submitted{' '}
                    {new Date(info.submittedAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                    .
                  </>
                )}
              </p>
            </div>
          </div>
        )}

        {status === 'pending' && (
          <div className="flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/5 p-5">
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <h2 className="font-semibold text-white">Under review</h2>
              <p className="mt-1 text-sm text-ds-text-muted">
                Your application is being reviewed. This typically completes within 24-48 hours.
                Vault deposits and withdrawals stay locked until verification is approved.
              </p>
            </div>
          </div>
        )}

        {status === 'rejected' && (
          <div className="flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/5 p-5">
            <ShieldX className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
            <div>
              <h2 className="font-semibold text-white">Verification rejected</h2>
              <p className="mt-1 text-sm text-ds-text-muted">
                {info?.rejectionReason ||
                  'Your application could not be verified. Please review your details and resubmit.'}
              </p>
            </div>
          </div>
        )}

        {(status === 'unverified' || status === 'rejected') && (
          <form
            onSubmit={handleSubmit}
            className="rounded-xl border border-ds-border bg-ds-surface-raised/50 p-5 sm:p-6 space-y-4"
          >
            {status === 'unverified' && (
              <div className="mb-2 flex items-start gap-3 rounded-lg border border-ds-border bg-ds-surface-inset/60 p-4">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-ds-text-muted" />
                <p className="text-xs text-ds-text-muted">
                  This information is used only to confirm your identity and is never shared. No
                  documents are verified by a third party in this demo environment.
                </p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Full legal name</label>
                <input
                  type="text"
                  required
                  value={form.fullName}
                  onChange={(e) => updateField('fullName', e.target.value)}
                  placeholder="Jane A. Doe"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Date of birth</label>
                <input
                  type="date"
                  required
                  value={form.dateOfBirth}
                  onChange={(e) => updateField('dateOfBirth', e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Country of residence</label>
                <input
                  type="text"
                  required
                  value={form.country}
                  onChange={(e) => updateField('country', e.target.value)}
                  placeholder="United States"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>ID type</label>
                <select
                  value={form.idType}
                  onChange={(e) => updateField('idType', e.target.value as FormState['idType'])}
                  className={inputClass}
                >
                  {ID_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className={labelClass}>ID number</label>
              <input
                type="text"
                required
                value={form.idNumber}
                onChange={(e) => updateField('idNumber', e.target.value)}
                placeholder="X1234567"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Upload ID document</label>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-ds-border bg-ds-surface-raised px-3 py-2.5 text-sm text-ds-text-muted transition-colors hover:border-primary/40 focus-within:ring-2 focus-within:ring-primary/50">
                <Paperclip className="h-4 w-4 shrink-0" />
                <span className="truncate">{fileName || 'Choose a file (front of ID)'}</span>
                <input
                  type="file"
                  onChange={handleFileChange}
                  className="sr-only"
                  accept="image/*,.pdf"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface"
            >
              {submitting
                ? 'Submitting...'
                : status === 'rejected'
                  ? 'Resubmit for review'
                  : 'Submit for review'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
