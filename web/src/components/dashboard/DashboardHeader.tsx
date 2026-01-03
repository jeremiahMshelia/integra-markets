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
        <header className="sticky top-0 z-40 bg-[#121212]/95 backdrop-blur-md border-b border-[#2a2a2a]">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
                {/* Logo - Same styling as main Header */}
                <Link href="/" className="flex items-center gap-2 group">
                    <div className="relative w-6 h-6">
                        <Image src="/logoNew.png" alt="Integra" fill className="object-contain" />
                    </div>
                    <div className="flex items-center">
                        <span className="text-white font-medium text-[16px]">integra</span>
                        <span className="text-zinc-500 font-medium text-[16px] ml-1 group-hover:text-zinc-400 transition-colors">Markets</span>
                    </div>
                </Link>

                {/* Profile Button */}
                <button
                    onClick={onProfileClick}
                    className="w-9 h-9 rounded-full bg-[#2a2a2a] hover:bg-[#3a3a3a] flex items-center justify-center transition-colors"
                >
                    <User size={18} className="text-zinc-400" />
                </button>
            </div>
        </header>
    );
}
