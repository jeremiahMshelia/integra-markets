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
                        <p className="mb-3">
                            Integra Markets is a commodity intelligence platform built for traders who need to stay ahead of the market. We aggregate news from hundreds of sources, analyze sentiment, and deliver the insights that matter, directly to your device.
                        </p>
                        <p>
                            Whether you're tracking crude oil movements, monitoring agricultural exports, or watching precious metals, our platform keeps you informed without the information overload.
                        </p>
                    </section>
                    <section>
                        <h2 className="text-white font-semibold text-lg mb-3">Key Features</h2>
                        <div className="space-y-2">
                            <div className="flex items-center gap-3"><Zap size={18} className="text-[#4ECCA3]" /><span>Real time commodity news and price alerts</span></div>
                            <div className="flex items-center gap-3"><Brain size={18} className="text-[#30A5FF]" /><span>Sentiment analysis on market news</span></div>
                            <div className="flex items-center gap-3"><Bell size={18} className="text-[#FFD700]" /><span>Customizable alert preferences</span></div>
                            <div className="flex items-center gap-3"><Bookmark size={18} className="text-[#FF6B6B]" /><span>Save and track important news</span></div>
                            <div className="flex items-center gap-3"><Globe size={18} className="text-[#4ECCA3]" /><span>Global market coverage across regions</span></div>
                        </div>
                    </section>
                    <section>
                        <h2 className="text-white font-semibold text-lg mb-2">Built For Traders</h2>
                        <p className="mb-3">
                            Integra was born from the real world pain points of commodity traders, designed to cut through complex, fast moving market data and turn it into clear, actionable insight.
                        </p>
                        <p>
                            Volatility is everywhere. Data is fragmented. Integra brings structure to chaos so you can trade with confidence.
                        </p>
                    </section>
                    <section>
                        <h2 className="text-white font-semibold text-lg mb-2">Support & Contact</h2>
                        <p className="mb-3">Found a bug? Have a feature request? We actually read our emails.</p>
                        <a href="mailto:contact@integramarkets.app" className="inline-flex items-center gap-2 px-5 py-3 bg-[#4ECCA3] text-[#121212] font-semibold rounded-lg hover:bg-[#3db892] transition-colors">
                            <Mail size={18} />Contact Us
                        </a>
                    </section>
                </div>
                <div className="mt-8 p-5 bg-[#1E1E1E] border border-[#333] rounded-xl text-center">
                    <p className="text-zinc-500 text-sm mb-1">© 2026 Integra Markets. All rights reserved.</p>
                    <p className="text-zinc-600 text-xs italic">Built for commodity traders worldwide.</p>
                </div>
            </main>
        </div>
    );
}

