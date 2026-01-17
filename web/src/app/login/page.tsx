'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [error, setError] = useState('');

    const handleEmailLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const supabase = createClient();
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;
            window.location.href = '/dashboard';
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to sign in');
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
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
            setError(err instanceof Error ? err.message : 'Failed to sign in with Google');
            setGoogleLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-black flex">
            {/* Left Side - Form (40%) */}
            <div className="w-full lg:w-[40%] flex items-center justify-center px-8 py-12">
                <div className="w-full max-w-sm">
                    {/* Logo - links to home */}
                    <Link href="/" className="flex items-center justify-center gap-2.5 mb-10 hover:opacity-80 transition-opacity">
                        <Image
                            src="/logoNew.png"
                            alt="Integra Markets"
                            width={28}
                            height={28}
                            className="w-7 h-7"
                        />
                        <div className="flex items-center">
                            <span className="text-white font-semibold text-base">integra</span>
                            <span className="text-[#888] text-base ml-1">Markets</span>
                        </div>
                    </Link>

                    <h1 className="text-2xl font-bold text-white mb-1.5 text-center">Welcome back</h1>
                    <p className="text-[#888] text-sm mb-8 text-center">Sign in to your account</p>

                    {/* Error */}
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg mb-5 text-sm">
                            {error}
                        </div>
                    )}

                    {/* Form */}
                    <form onSubmit={handleEmailLogin} className="space-y-4">
                        <div>
                            <label className="block text-[#888] text-xs mb-1.5">Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                className="w-full bg-[#111] border border-white/10 rounded-lg py-2.5 px-3.5 text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#4ecca3]/50 transition-all"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-[#888] text-xs mb-1.5">Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="w-full bg-[#111] border border-white/10 rounded-lg py-2.5 px-3.5 text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#4ecca3]/50 transition-all"
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-[#4ECCA3] hover:bg-[#45b393] text-black font-semibold py-2.5 px-4 rounded-lg text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                            ) : (
                                'Sign In'
                            )}
                        </button>
                    </form>

                    {/* Divider */}
                    <div className="relative my-5">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-white/10"></div>
                        </div>
                        <div className="relative flex justify-center text-xs">
                            <span className="px-3 bg-black text-[#555]">or</span>
                        </div>
                    </div>

                    {/* Google Button */}
                    <button
                        onClick={handleGoogleLogin}
                        disabled={googleLoading}
                        className="w-full bg-[#111] hover:bg-[#1a1a1a] border border-white/10 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2.5"
                    >
                        {googleLoading ? (
                            <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <>
                                <svg width="16" height="16" viewBox="0 0 24 24">
                                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                </svg>
                                Continue with Google
                            </>
                        )}
                    </button>

                    <p className="text-center text-[#888] text-sm mt-6">
                        Don&apos;t have an account?{' '}
                        <Link href="/signup" className="text-[#4ecca3] hover:text-[#5fd9b3] transition-colors font-medium">
                            Sign up
                        </Link>
                    </p>
                </div>
            </div>

            {/* Right Side - Video (60%) */}
            <div className="hidden lg:flex w-[60%] relative bg-black items-center justify-center">
                <video
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                >
                    <source src="/video_ascii_integra.webm" type="video/webm" />
                </video>
            </div>
        </div>
    );
}
