'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';

export default function SignupPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleEmailSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const supabase = createClient();
            const { error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: { full_name: fullName },
                    emailRedirectTo: `${window.location.origin}/auth/callback`,
                },
            });

            if (error) throw error;
            setSuccess(true);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to sign up');
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSignup = async () => {
        setGoogleLoading(true);
        setError('');

        try {
            const supabase = createClient();
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: `${window.location.origin}/auth/callback`,
                },
            });

            if (error) throw error;
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to sign up with Google');
            setGoogleLoading(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-6 py-12">
                <div className="w-full max-w-md text-center">
                    <div className="bg-[#121212] border border-white/10 rounded-2xl p-8">
                        <div className="w-16 h-16 bg-[#4ecca3]/20 rounded-full flex items-center justify-center mx-auto mb-6">
                            <svg width="32" height="32" fill="none" stroke="#4ecca3" strokeWidth="2" viewBox="0 0 24 24">
                                <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-4">Check your email</h1>
                        <p className="text-[#888] mb-6">
                            We've sent a confirmation link to <span className="text-white">{email}</span>.
                            Click the link to activate your account.
                        </p>
                        <Link href="/login" className="btn-primary inline-block">
                            Back to Login
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-6 py-12">
            <div className="w-full max-w-md">
                {/* Back Link */}
                <Link
                    href="/"
                    className="inline-flex items-center gap-2 text-[#888] hover:text-white transition-colors mb-8"
                >
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10 12L6 8l4-4" />
                    </svg>
                    Back to home
                </Link>

                {/* Card */}
                <div className="bg-[#121212] border border-white/10 rounded-2xl p-8">
                    {/* Logo */}
                    <div className="flex items-center justify-center gap-3 mb-8">
                        <Image
                            src="/logoNew.png"
                            alt="Integra Markets"
                            width={40}
                            height={40}
                            className="w-10 h-10"
                        />
                        <div className="flex items-center">
                            <span className="text-white font-semibold text-xl">integra</span>
                            <span className="text-[#888] text-xl ml-1">Markets</span>
                        </div>
                    </div>

                    <h1 className="text-2xl font-bold text-white text-center mb-2">Create an account</h1>
                    <p className="text-[#888] text-center mb-8">Start trading smarter today</p>

                    {/* Error */}
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg mb-6 text-sm">
                            {error}
                        </div>
                    )}

                    {/* Google Button */}
                    <button
                        onClick={handleGoogleSignup}
                        disabled={googleLoading}
                        className="w-full btn-secondary mb-6 disabled:opacity-50"
                    >
                        {googleLoading ? (
                            <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <>
                                <svg width="18" height="18" viewBox="0 0 24 24">
                                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                </svg>
                                Continue with Google
                            </>
                        )}
                    </button>

                    {/* Divider */}
                    <div className="relative mb-6">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-white/10"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-4 bg-[#121212] text-[#666]">or sign up with email</span>
                        </div>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleEmailSignup} className="space-y-4">
                        <div>
                            <label className="block text-[#888] text-sm mb-2">Full Name</label>
                            <input
                                type="text"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                placeholder="John Doe"
                                className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg py-3 px-4 text-white placeholder-[#666] focus:outline-none focus:border-[#4ecca3]/50 transition-colors"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-[#888] text-sm mb-2">Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg py-3 px-4 text-white placeholder-[#666] focus:outline-none focus:border-[#4ecca3]/50 transition-colors"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-[#888] text-sm mb-2">Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg py-3 px-4 text-white placeholder-[#666] focus:outline-none focus:border-[#4ecca3]/50 transition-colors"
                                required
                                minLength={6}
                            />
                            <p className="text-[#666] text-xs mt-1">Must be at least 6 characters</p>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full btn-primary disabled:opacity-50"
                        >
                            {loading ? (
                                <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                            ) : (
                                'Create Account'
                            )}
                        </button>
                    </form>

                    <p className="text-center text-[#888] mt-6">
                        Already have an account?{' '}
                        <Link href="/login" className="text-[#4ecca3] hover:text-[#5fd9b3] transition-colors">
                            Sign in
                        </Link>
                    </p>

                    <p className="text-center text-[#666] text-xs mt-6">
                        By creating an account, you agree to our{' '}
                        <Link href="/terms" className="text-[#888] hover:text-white">Terms of Service</Link>
                        {' '}and{' '}
                        <Link href="/privacy" className="text-[#888] hover:text-white">Privacy Policy</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
