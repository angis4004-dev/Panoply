'use client';
import React, { Suspense, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import {
  Eye,
  EyeOff,
  Shield,
  TrendingUp,
  Activity,
  ChevronRight,
  Lock,
  Mail,
  KeyRound,
  AlertCircle,
  Cpu,
} from 'lucide-react';
import AppLogo from '@/components/ui/AppLogo';
import FlowFieldBackground from '@/components/ui/flow-field-background';
import { Toaster, toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';

type AuthMode = 'login' | 'signup';

interface LoginFormValues {
  email: string;
  password: string;
  otp?: string;
  rememberMe?: boolean;
}

interface SignupFormValues {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  agreeTerms: boolean;
}

function LoginForm({
  onCredentialFill: _onCredentialFill,
  onSwitchToSignup,
}: {
  onCredentialFill: (email: string, password: string) => void;
  onSwitchToSignup: () => void;
}) {
  const router = useRouter();
  const { setUser } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [showOTP, setShowOTP] = useState(false);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginFormValues>();

  const onSubmit = async (data: LoginFormValues) => {
    setLoading(true);

    try {
      const response = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        const fallbackMessage =
          payload.error === 'Invalid credentials.'
            ? 'No account was found for that email. Create one with your Google account or email address, or switch to sign up.'
            : payload.error || 'Unable to sign in right now.';
        setError('email', {
          message: fallbackMessage,
        });
        setLoading(false);
        return;
      }

      setUser({
        email: payload.user.email,
        role: payload.user.role as 'Admin' | 'Trader',
        name: payload.user.name,
      });

      toast.success(`Welcome back, ${payload.user.name}!`, {
        description: 'Redirecting to dashboard...',
      });

      setTimeout(() => {
        if (payload.user.role === 'Admin') {
          router.push('/admin');
        } else {
          router.push('/dashboard');
        }
      }, 800);
    } catch {
      setError('email', {
        message: 'Unable to reach the authentication service.',
      });
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="rounded-lg border border-[#2A3542]/60 bg-[#212A35]/40 px-3 py-3 text-sm text-[#C5CCD6]">
        <p className="font-semibold text-[#E7ECF2]">Need an account?</p>
        <p className="mt-1 text-xs text-[#8B95A5]">
          Create one with your Google account or your email address, then return here to sign in.
        </p>
        <button
          type="button"
          onClick={onSwitchToSignup}
          className="mt-2 text-xs font-semibold text-[#3D77FF] underline decoration-[#1E63FF]/40 underline-offset-2"
        >
          Create an account
        </button>
      </div>
      {/* Email */}
      <div>
        <label className="block text-xs font-semibold text-[#8B95A5] mb-1.5 tracking-wide uppercase">
          Email Address
        </label>
        <div className="relative">
          <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B95A5]" />
          <input
            type="email"
            autoComplete="email"
            placeholder="you@cryptotradeai.io"
            className={`w-full bg-[#212A35] border rounded-lg pl-9 pr-4 py-2.5 text-sm text-[#E7ECF2] placeholder-[#5C6675] focus:outline-none focus:ring-2 focus:ring-[#1E63FF]/50 transition-all ${
              errors.email ? 'border-red-500/60' : 'border-[#2A3542]'
            }`}
            {...register('email', {
              required: 'Email is required',
              pattern: {
                value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                message: 'Enter a valid email',
              },
            })}
          />
        </div>
        {errors.email && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-red-400">
            <AlertCircle size={11} />
            {errors.email.message}
          </p>
        )}
      </div>

      {/* Password */}
      <div>
        <label className="block text-xs font-semibold text-[#8B95A5] mb-1.5 tracking-wide uppercase">
          Password
        </label>
        <div className="relative">
          <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B95A5]" />
          <input
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••••••••"
            className={`w-full bg-[#212A35] border rounded-lg pl-9 pr-10 py-2.5 text-sm text-[#E7ECF2] placeholder-[#5C6675] focus:outline-none focus:ring-2 focus:ring-[#1E63FF]/50 transition-all ${
              errors.password ? 'border-red-500/60' : 'border-[#2A3542]'
            }`}
            {...register('password', { required: 'Password is required' })}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8B95A5] hover:text-[#C5CCD6] transition-colors"
          >
            {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        {errors.password && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-red-400">
            <AlertCircle size={11} />
            {errors.password.message}
          </p>
        )}
      </div>

      {/* MFA toggle */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showOTP}
            onChange={(e) => setShowOTP(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-[#5C6675] bg-[#212A35] accent-[#1E63FF]"
          />
          <span className="text-xs text-[#8B95A5]">Use MFA / OTP</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            {...register('rememberMe')}
            className="w-3.5 h-3.5 rounded border-[#5C6675] bg-[#212A35] accent-[#1E63FF]"
          />
          <span className="text-xs text-[#8B95A5]">Remember me</span>
        </label>
      </div>

      <div className="flex justify-end -mt-2">
        <Link href="/forgot-password" className="text-xs text-[#3D77FF] hover:text-[#00D4FF]">
          Forgot your password?
        </Link>
      </div>

      {/* OTP field (conditional) */}
      {showOTP && (
        <div className="animate-fade-in">
          <label className="block text-xs font-semibold text-[#8B95A5] mb-1.5 tracking-wide uppercase">
            One-Time Password (OTP)
          </label>
          <p className="text-xs text-[#5C6675] mb-1.5">
            Enter the 6-digit code from your authenticator app or email
          </p>
          <div className="relative">
            <KeyRound
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B95A5]"
            />
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              className="w-full bg-[#212A35] border border-[#2A3542] rounded-lg pl-9 pr-4 py-2.5 text-sm text-[#E7ECF2] placeholder-[#5C6675] focus:outline-none focus:ring-2 focus:ring-[#1E63FF]/50 font-mono tracking-[0.3em] transition-all"
              {...register('otp')}
            />
          </div>
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 bg-[#1E63FF] hover:bg-[#3D77FF] disabled:bg-[#1E63FF]/40 disabled:cursor-not-allowed text-[#0A0E13] font-semibold text-sm rounded-lg py-2.5 transition-all duration-150 active:scale-[0.98]"
        style={{ minHeight: '42px' }}
      >
        {loading ? (
          <>
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Authenticating...
          </>
        ) : (
          <>
            Sign In
            <ChevronRight size={15} />
          </>
        )}
      </button>
    </form>
  );
}

function SignupForm() {
  const router = useRouter();
  const { setUser } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SignupFormValues>();

  const password = watch('password');

  const onSubmit = async (data: SignupFormValues) => {
    setLoading(true);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: data.fullName,
          email: data.email,
          password: data.password,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        toast.error('Account creation failed', {
          description: payload.error || 'Please try again.',
        });
        setLoading(false);
        return;
      }

      setUser({
        email: payload.user.email,
        role: 'Trader',
        name: payload.user.name,
      });

      toast.success('Account created!', {
        description: 'Redirecting to your dashboard...',
      });

      setTimeout(() => {
        router.push('/dashboard');
      }, 800);
    } catch {
      toast.error('Account creation failed', {
        description: 'Unable to reach the authentication service.',
      });
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Full Name */}
      <div>
        <label className="block text-xs font-semibold text-[#8B95A5] mb-1.5 tracking-wide uppercase">
          Full Name
        </label>
        <input
          type="text"
          placeholder="Alex Thornton"
          className={`w-full bg-[#212A35] border rounded-lg px-4 py-2.5 text-sm text-[#E7ECF2] placeholder-[#5C6675] focus:outline-none focus:ring-2 focus:ring-[#1E63FF]/50 transition-all ${
            errors.fullName ? 'border-red-500/60' : 'border-[#2A3542]'
          }`}
          {...register('fullName', { required: 'Full name is required' })}
        />
        {errors.fullName && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-red-400">
            <AlertCircle size={11} />
            {errors.fullName.message}
          </p>
        )}
      </div>

      {/* Email */}
      <div>
        <label className="block text-xs font-semibold text-[#8B95A5] mb-1.5 tracking-wide uppercase">
          Email Address
        </label>
        <input
          type="email"
          placeholder="you@cryptotradeai.io"
          className={`w-full bg-[#212A35] border rounded-lg px-4 py-2.5 text-sm text-[#E7ECF2] placeholder-[#5C6675] focus:outline-none focus:ring-2 focus:ring-[#1E63FF]/50 transition-all ${
            errors.email ? 'border-red-500/60' : 'border-[#2A3542]'
          }`}
          {...register('email', {
            required: 'Email is required',
            pattern: {
              value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
              message: 'Enter a valid email',
            },
          })}
        />
        {errors.email && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-red-400">
            <AlertCircle size={11} />
            {errors.email.message}
          </p>
        )}
      </div>

      {/* Password */}
      <div>
        <label className="block text-xs font-semibold text-[#8B95A5] mb-1.5 tracking-wide uppercase">
          Password
        </label>
        <p className="text-[11px] text-[#5C6675] mb-1.5">
          Minimum 8 characters, one uppercase, one number
        </p>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••••••"
            className={`w-full bg-[#212A35] border rounded-lg px-4 pr-10 py-2.5 text-sm text-[#E7ECF2] placeholder-[#5C6675] focus:outline-none focus:ring-2 focus:ring-[#1E63FF]/50 transition-all ${
              errors.password ? 'border-red-500/60' : 'border-[#2A3542]'
            }`}
            {...register('password', {
              required: 'Password is required',
              minLength: { value: 8, message: 'Minimum 8 characters' },
              pattern: {
                value: /^(?=.*[A-Z])(?=.*\d).+$/,
                message: 'Must include uppercase and number',
              },
            })}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8B95A5] hover:text-[#C5CCD6]"
          >
            {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        {errors.password && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-red-400">
            <AlertCircle size={11} />
            {errors.password.message}
          </p>
        )}
      </div>

      {/* Confirm Password */}
      <div>
        <label className="block text-xs font-semibold text-[#8B95A5] mb-1.5 tracking-wide uppercase">
          Confirm Password
        </label>
        <div className="relative">
          <input
            type={showConfirm ? 'text' : 'password'}
            placeholder="••••••••••••"
            className={`w-full bg-[#212A35] border rounded-lg px-4 pr-10 py-2.5 text-sm text-[#E7ECF2] placeholder-[#5C6675] focus:outline-none focus:ring-2 focus:ring-[#1E63FF]/50 transition-all ${
              errors.confirmPassword ? 'border-red-500/60' : 'border-[#2A3542]'
            }`}
            {...register('confirmPassword', {
              required: 'Please confirm your password',
              validate: (v) => v === password || 'Passwords do not match',
            })}
          />
          <button
            type="button"
            onClick={() => setShowConfirm(!showConfirm)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8B95A5] hover:text-[#C5CCD6]"
          >
            {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        {errors.confirmPassword && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-red-400">
            <AlertCircle size={11} />
            {errors.confirmPassword.message}
          </p>
        )}
      </div>

      {/* Terms */}
      <div>
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5 w-3.5 h-3.5 rounded border-[#5C6675] bg-[#212A35] accent-[#1E63FF] flex-shrink-0"
            {...register('agreeTerms', {
              required: 'You must accept the terms',
            })}
          />
          <span className="text-xs text-[#8B95A5] leading-relaxed">
            I agree to the{' '}
            <Link href="#" className="text-[#3D77FF] hover:underline">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link href="#" className="text-[#3D77FF] hover:underline">
              Privacy Policy
            </Link>
            . I understand this platform involves financial risk.
          </span>
        </label>
        {errors.agreeTerms && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-red-400">
            <AlertCircle size={11} />
            {errors.agreeTerms.message}
          </p>
        )}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 bg-[#1E63FF] hover:bg-[#3D77FF] disabled:bg-[#1E63FF]/40 disabled:cursor-not-allowed text-[#0A0E13] font-semibold text-sm rounded-lg py-2.5 transition-all duration-150 active:scale-[0.98]"
        style={{ minHeight: '42px' }}
      >
        {loading ? (
          <>
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Creating Account...
          </>
        ) : (
          <>
            Create Account
            <ChevronRight size={15} />
          </>
        )}
      </button>
    </form>
  );
}

function SignUpLoginPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialMode = searchParams.get('mode') === 'signup' ? 'signup' : 'login';
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [, setFilledEmail] = useState('');

  useEffect(() => {
    const nextMode = searchParams.get('mode') === 'signup' ? 'signup' : 'login';
    setMode(nextMode);
  }, [searchParams]);

  const handleCredentialFill = (email: string, _password: string) => {
    setFilledEmail(email);
  };

  const handleGoogleEntry = async () => {
    try {
      await signIn('google', { callbackUrl: '/dashboard' });
    } catch (error) {
      console.error('Google sign-in error:', error);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0E13] flex">
      <Toaster position="bottom-right" theme="dark" richColors />

      {/* Left brand panel */}
      <div className="hidden lg:flex lg:w-[52%] xl:w-[55%] flex-col relative overflow-hidden bg-gradient-to-br from-[#122131] via-[#0A0E13] to-[#122131]">
        {/* Ambient particle flow field */}
        <FlowFieldBackground
          className="absolute inset-0 opacity-60"
          color="#00D4FF"
          particleCount={130}
          trailOpacity={0.1}
          speed={0.6}
        />

        {/* Glow orbs */}
        <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-[#1E63FF]/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-[#1E63FF]/5 rounded-full blur-3xl" />

        <div className="relative z-10 flex flex-col h-full p-12">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <AppLogo size={40} />
            <span className="text-xl font-bold text-[#E7ECF2] tracking-tight">Aegis</span>
          </div>

          {/* Hero text */}
          <div className="flex-1 flex flex-col justify-center">
            <div className="inline-flex items-center gap-2 bg-[#1E63FF]/10 border border-[#1E63FF]/20 rounded-full px-3 py-1.5 mb-6 w-fit">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3D77FF] pulse-glow" />
              <span className="text-xs font-semibold text-[#3D77FF] tracking-wide">
                AEGIS — AI-FIRST CRYPTO INTELLIGENCE
              </span>
            </div>
            <h1 className="text-4xl xl:text-5xl font-bold text-[#E7ECF2] leading-tight mb-4">
              Securely access
              <br />
              your{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#3D77FF] to-[#00D4FF]">
                Aegis workspace
              </span>
            </h1>
            <p className="text-[#8B95A5] text-base leading-relaxed max-w-sm">
              Sign in with Google or your email address to view portfolio intelligence, yield
              opportunities, and workflow tools in one calm environment.
            </p>

            {/* Feature pills */}
            <div className="flex flex-wrap gap-2 mt-8">
              {[
                { icon: Cpu, label: 'AI Strategy Routing' },
                { icon: Shield, label: 'Secure Sign-In' },
                { icon: TrendingUp, label: 'Portfolio Insights' },
                { icon: Activity, label: 'Yield Context' },
              ].map((f) => {
                const Icon = f.icon;
                return (
                  <div
                    key={`feature-${f.label}`}
                    className="flex items-center gap-1.5 bg-[#212A35]/60 border border-[#2A3542]/50 rounded-lg px-3 py-1.5"
                  >
                    <Icon size={13} className="text-[#3D77FF]" />
                    <span className="text-xs text-[#C5CCD6] font-medium">{f.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Primary action */}
          <div className="mt-auto rounded-2xl border border-[#212A35]/80 bg-[#122131]/60 px-5 py-4 backdrop-blur-sm">
            <p className="text-[10px] uppercase tracking-[0.35em] text-[#8B95A5] mb-2">
              Continue to Aegis
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleGoogleEntry}
                className="rounded-full bg-[#1E63FF] px-4 py-2 text-sm font-semibold text-[#0A0E13] transition hover:bg-[#3D77FF]"
              >
                Sign in with Google
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  router.replace('/sign-up-login-screen?mode=signup');
                }}
                className="rounded-full border border-[#2A3542] px-4 py-2 text-sm font-semibold text-[#C5CCD6] transition hover:border-[#8B95A5] hover:text-white"
              >
                Sign up with email
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 lg:p-12 overflow-y-auto">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-2.5 mb-8 lg:hidden">
            <AppLogo size={32} />
            <span className="font-bold text-[#E7ECF2]">Aegis</span>
          </div>

          {/* Security badge */}
          <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2 mb-6">
            <Shield size={13} className="text-emerald-400" />
            <span className="text-xs text-emerald-400 font-medium">
              Secure access for your Aegis workspace and portfolio intelligence
            </span>
          </div>

          {/* Tab switcher */}
          <div className="flex bg-[#122131] border border-[#212A35] rounded-xl p-1 mb-6">
            {(['login', 'signup'] as AuthMode[]).map((m) => (
              <button
                key={`tab-${m}`}
                onClick={() => setMode(m)}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
                  mode === m ? 'bg-[#1E63FF] text-[#0A0E13]' : 'text-[#8B95A5] hover:text-[#E7ECF2]'
                }`}
              >
                {m === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          {/* Form */}
          <div className="bg-[#122131] border border-[#212A35] rounded-xl p-6">
            <h2 className="text-lg font-bold text-[#E7ECF2] mb-1">
              {mode === 'login' ? 'Welcome back' : 'Create your Aegis workspace'}
            </h2>
            <p className="text-sm text-[#8B95A5] mb-5">
              {mode === 'login'
                ? 'Sign in to your secure Aegis workspace.'
                : 'Use Google or your email address to create your account.'}
            </p>

            <button
              type="button"
              onClick={handleGoogleEntry}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-[#2A3542] bg-[#212A35]/60 px-4 py-2.5 text-sm font-semibold text-[#E7ECF2] transition hover:border-[#8B95A5] hover:bg-[#212A35] lg:hidden"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.54 5.54 0 0 1-2.4 3.63v3.02h3.89c2.28-2.1 3.56-5.19 3.56-8.84Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.89-3.02c-1.08.72-2.46 1.15-4.06 1.15-3.13 0-5.78-2.11-6.73-4.96H1.26v3.12A11.99 11.99 0 0 0 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.27 14.27a7.2 7.2 0 0 1 0-4.54V6.61H1.26a12 12 0 0 0 0 10.78l4.01-3.12Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.77c1.76 0 3.34.6 4.59 1.79l3.44-3.44C17.95 1.19 15.23 0 12 0 7.31 0 3.26 2.69 1.26 6.61l4.01 3.12C6.22 6.88 8.87 4.77 12 4.77Z"
                />
              </svg>
              Continue with Google
            </button>

            <div className="flex items-center gap-3 my-5 lg:hidden">
              <div className="h-px flex-1 bg-[#212A35]" />
              <span className="text-[11px] uppercase tracking-wider text-[#8B95A5]">
                or continue with email
              </span>
              <div className="h-px flex-1 bg-[#212A35]" />
            </div>

            {mode === 'login' ? (
              <LoginForm
                onCredentialFill={handleCredentialFill}
                onSwitchToSignup={() => setMode('signup')}
              />
            ) : (
              <SignupForm />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SignUpLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#0A0E13] text-sm text-[#8B95A5]">
          Loading your secure sign-in experience…
        </div>
      }
    >
      <SignUpLoginPageContent />
    </Suspense>
  );
}
