import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-[#121212]">
            <header className="sticky top-0 bg-[#121212] border-b border-[#333] px-4 py-4">
                <div className="max-w-2xl mx-auto flex items-center gap-4">
                    <Link href="/dashboard" className="p-2 hover:bg-white/5 rounded-lg">
                        <ArrowLeft size={20} className="text-zinc-400" />
                    </Link>
                    <h1 className="text-lg font-semibold text-white">Privacy Policy</h1>
                </div>
            </header>
            <main className="max-w-2xl mx-auto p-6">
                <p className="text-zinc-500 text-sm mb-6 italic">Last updated: December 2024</p>
                <div className="space-y-6 text-zinc-400 text-[15px] leading-relaxed">
                    <section>
                        <h2 className="text-white font-semibold text-lg mb-2">1. Introduction</h2>
                        <p>Integra Markets is committed to protecting your privacy while providing advanced AI-powered financial market analysis.</p>
                    </section>
                    <section>
                        <h2 className="text-white font-semibold text-lg mb-2">2. Information We Collect</h2>
                        <p>Account Information, Usage Data, Device Information, Financial Data Queries, and Third-Party API Keys.</p>
                    </section>
                    <section>
                        <h2 className="text-white font-semibold text-lg mb-2">3. BYOK Model</h2>
                        <p>Your API keys are encrypted and stored locally. We never access or transmit your API keys to our servers.</p>
                    </section>
                    <section>
                        <h2 className="text-white font-semibold text-lg mb-2">4. Contact</h2>
                        <p>Email: privacy@integra-markets.com</p>
                    </section>
                </div>
            </main>
        </div>
    );
}
