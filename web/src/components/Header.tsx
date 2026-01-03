'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

export default function Header() {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    return (
        <header className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-md transition-all duration-300">
            <div className="max-w-[1400px] mx-auto px-6 h-20 flex items-center justify-between">
                {/* Logo */}
                <Link href="/" className="flex items-center gap-3 group">
                    <div className="relative w-7 h-7">
                        <Image
                            src="/logoNew.png"
                            alt="Integra"
                            fill
                            className="object-contain"
                        />
                    </div>
                    <div className="flex items-center">
                        {/* Larger text size requested */}
                        <span className="text-white font-medium text-[18px] tracking-tight">integra</span>
                        <span className="text-zinc-500 font-medium text-[18px] ml-1.5 group-hover:text-zinc-400 transition-colors">Markets</span>
                    </div>
                </Link>

                {/* Desktop Nav */}
                <nav className="hidden md:flex items-center gap-10">
                    <Link href="/#features" className="text-[14px] font-light text-zinc-400 hover:text-white transition-colors">
                        Features
                    </Link>
                    <Link href="/#how-it-works" className="text-[14px] font-light text-zinc-400 hover:text-white transition-colors">
                        How It Works
                    </Link>
                    <Link href="/#about" className="text-[14px] font-light text-zinc-400 hover:text-white transition-colors">
                        About
                    </Link>
                </nav>

                {/* Auth Buttons */}
                <div className="hidden md:flex items-center gap-6">
                    <Link href="/login" className="text-[14px] font-light text-zinc-400 hover:text-white transition-colors">
                        Sign In
                    </Link>
                    <Link
                        href="/signup"
                        className="text-[14px] font-medium bg-[#4ECCA3] hover:bg-[#45b393] text-black px-5 py-2.5 rounded-[6px] transition-all"
                    >
                        Sign Up
                    </Link>
                </div>

                {/* Mobile Menu Toggle */}
                <button
                    className="md:hidden text-zinc-400 hover:text-white"
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                >
                    <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        {mobileMenuOpen ? (
                            <path d="M6 6l12 12M6 18L18 6" />
                        ) : (
                            <path d="M4 6h16M4 12h16M4 18h16" />
                        )}
                    </svg>
                </button>
            </div>

            {/* Mobile Menu */}
            {mobileMenuOpen && (
                <div className="md:hidden absolute top-20 left-0 right-0 bg-black border-b border-white/5 px-6 py-6">
                    <div className="flex flex-col gap-6">
                        <Link href="/#features" className="text-[15px] font-light text-zinc-400 hover:text-white">Features</Link>
                        <Link href="/#how-it-works" className="text-[15px] font-light text-zinc-400 hover:text-white">How It Works</Link>
                        <Link href="/#about" className="text-[15px] font-light text-zinc-400 hover:text-white">About</Link>
                        <div className="h-px bg-white/10 w-full my-2" />
                        <Link href="/login" className="text-[15px] font-light text-zinc-400 hover:text-white">Sign In</Link>
                        <Link href="/signup" className="text-[15px] font-medium bg-[#4ECCA3] text-black px-4 py-3 rounded-[6px] text-center">
                            Sign Up
                        </Link>
                    </div>
                </div>
            )}
        </header>
    );
}
