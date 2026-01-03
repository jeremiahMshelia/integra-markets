import Link from 'next/link';
import { ArrowLeft, Zap, Brain, Bell, Bookmark, Globe, Mail } from 'lucide-react';
import Image from 'next/image';

export default function AboutPage() {
    return (
        <div className="min-h-screen bg-[#121212]">
            <header className="sticky top-0 bg-[#121212] border-b border-[#333] px-4 py-4">
                <div className="max-w-2xl mx-auto flex items-center gap-4">
                    <Link href="/dashboard" className="p-2 hover:bg-white/5 rounded-lg">
                        <ArrowLeft size={20} className="text-zinc-400" />
                    </Link>
                    <h1 className="text-lg font-semibold text-white">About</h1>
                </div>
            </header>
            <main className="max-w-2xl mx-auto p-6">
                <div className="text-center mb-8">
                    <div className="flex justify-center mb-4">
                        <Image src="/logoNew.png" alt="Integra" width={80} height={80} />
                    </div>
                    <h2 className="text-white text-2xl font-semibold mb-1">Integra Markets</h2>
                    <p className="text-zinc-500 text-sm">Version 1.0.0</p>
                </div>
                <div className="space-y-6 text-zinc-400 text-[15px] leading-relaxed">
                    <section>
                        <h2 className="text-white font-semibold text-lg mb-2">What We Do</h2>
                        <p>Integra Markets is a commodity intelligence platform built for traders who need to stay ahead of the market.</p>
                    </section>
                    <section>
                        <h2 className="text-white font-semibold text-lg mb-3">Key Features</h2>
                        <div className="space-y-2">
                            <div className="flex items-center gap-3"><Zap size={18} className="text-[#4ECCA3]" /><span>Real-time commodity news and price alerts</span></div>
                            <div className="flex items-center gap-3"><Brain size={18} className="text-[#30A5FF]" /><span>Sentiment analysis on market news</span></div>
                            <div className="flex items-center gap-3"><Bell size={18} className="text-[#FFD700]" /><span>Customizable alert preferences</span></div>
                            <div className="flex items-center gap-3"><Bookmark size={18} className="text-[#FF6B6B]" /><span>Save and track important news</span></div>
                            <div className="flex items-center gap-3"><Globe size={18} className="text-[#4ECCA3]" /><span>Global market coverage</span></div>
                        </div>
                    </section>
                    <section>
                        <h2 className="text-white font-semibold text-lg mb-2">Contact</h2>
                        <a href="mailto:support@integra-markets.com" className="inline-flex items-center gap-2 px-5 py-3 bg-[#4ECCA3] text-[#121212] font-semibold rounded-lg hover:bg-[#3db892] transition-colors">
                            <Mail size={18} />Contact Us
                        </a>
                    </section>
                </div>
                <div className="mt-8 p-5 bg-[#1E1E1E] border border-[#333] rounded-xl text-center">
                    <p className="text-zinc-500 text-sm">© 2026 Integra Markets. All rights reserved.</p>
                </div>
            </main>
        </div>
    );
}
