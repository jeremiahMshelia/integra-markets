import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function TermsPage() {
    return (
        <div className="min-h-screen bg-[#121212]">
            <header className="sticky top-0 bg-[#121212] border-b border-[#333] px-4 py-4">
                <div className="max-w-2xl mx-auto flex items-center gap-4">
                    <Link href="/dashboard" className="p-2 hover:bg-white/5 rounded-lg">
                        <ArrowLeft size={20} className="text-zinc-400" />
                    </Link>
                    <h1 className="text-lg font-semibold text-white">Terms of Service</h1>
                </div>
            </header>
            <main className="max-w-2xl mx-auto p-6">
                <p className="text-zinc-500 text-sm mb-6 italic">Last updated: January 2026</p>
                <div className="space-y-6 text-zinc-400 text-[15px] leading-relaxed">
                    <section>
                        <h2 className="text-white font-semibold text-lg mb-2">1. Agreement to Terms</h2>
                        <p>By accessing Integra Markets, you agree to be bound by these Terms of Service.</p>
                    </section>
                    <section>
                        <h2 className="text-white font-semibold text-lg mb-2">2. Financial Disclaimer</h2>
                        <p>Integra Markets provides AI-powered analysis for informational purposes only. This is not financial advice.</p>
                    </section>
                    <section>
                        <h2 className="text-white font-semibold text-lg mb-2">3. API Key Management</h2>
                        <p>You are responsible for maintaining valid API keys and all associated costs.</p>
                    </section>
                    <section>
                        <h2 className="text-white font-semibold text-lg mb-2">4. Contact</h2>
                        <p>Email: legal@integra-markets.com</p>
                    </section>
                </div>
            </main>
        </div>
    );
}
