'use client';

import Link from 'next/link';
import Image from 'next/image';
import { User } from 'lucide-react';

interface DashboardHeaderProps {
    userEmail?: string;
    onProfileClick: () => void;
}

export default function DashboardHeader({ userEmail, onProfileClick }: DashboardHeaderProps) {
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

                    {/* User Email (Desktop) */}
                    <span className="hidden md:block text-sm text-zinc-500 mr-2">
                        {userEmail}
                    </span>

                    {/* Profile Button */}
                    <button
                        onClick={onProfileClick}
                        className="w-10 h-10 rounded-full bg-[#2a2a2a] hover:bg-[#3a3a3a] flex items-center justify-center transition-colors"
                    >
                        <User size={20} className="text-zinc-400" />
                    </button>
                </div>
            </div>
        </header>
    );
}
