'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';

interface DashboardHeaderProps {
    userEmail?: string;
    onProfileClick: () => void;
}

export default function DashboardHeader({ userEmail, onProfileClick }: DashboardHeaderProps) {
    const [username, setUsername] = useState<string>('');
    const [avatarUrl, setAvatarUrl] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadUserProfile();
    }, []);

    const loadUserProfile = async () => {
        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                setIsLoading(false);
                return;
            }

            // Set username from email first
            setUsername(user.user_metadata?.full_name?.split(' ')[0] || user.email?.split('@')[0] || 'there');

            // Try to get profile for avatar and username
            const { data: profile } = await supabase
                .from('profiles')
                .select('username, avatar_url')
                .eq('id', user.id)
                .single();

            if (profile) {
                if (profile.username) setUsername(profile.username);
                if (profile.avatar_url) setAvatarUrl(profile.avatar_url);
            }
        } catch (error) {
            console.error('Error loading profile:', error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <header className="sticky top-0 z-50 bg-[#121212]/95 backdrop-blur-md border-b border-[#2a2a2a]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
                {/* Logo */}
                <Link href="/" className="flex items-center gap-2.5">
                    <Image src="/logoNew.png" alt="Integra" width={28} height={28} />
                    <div className="flex items-baseline">
                        <span className="text-white font-medium text-lg">integra</span>
                        <span className="text-[#a0a0a0] text-lg ml-1">Markets</span>
                    </div>
                </Link>

                {/* Right Actions */}
                <div className="flex items-center gap-4">
                    {/* Greeting (Desktop) */}
                    <span className="hidden md:block text-sm text-zinc-400">
                        Hi,{' '}
                        {isLoading ? (
                            <span className="inline-block w-16 h-4 bg-[#333] rounded animate-pulse ml-1" />
                        ) : (
                            <span className="text-white font-medium ml-0.5">{username}</span>
                        )}
                    </span>

                    {/* Profile Button with Avatar */}
                    <button
                        onClick={onProfileClick}
                        className="w-8 h-8 rounded-full bg-[#4ECCA3] ring-2 ring-[#4ECCA3]/40 hover:ring-[#4ECCA3]/70 flex items-center justify-center transition-all overflow-hidden cursor-pointer"
                    >
                        {isLoading ? (
                            <div className="w-full h-full bg-[#333] animate-pulse" />
                        ) : avatarUrl ? (
                            <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                            <span className="text-[#121212] font-semibold text-xs">
                                {username.charAt(0).toUpperCase()}
                            </span>
                        )}
                    </button>
                </div>
            </div>
        </header>
    );
}
