import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function TermsSettingsPage() {
    return (
        <div className="min-h-screen bg-[#0a0a0a] font-[var(--font-geist-sans)]">
            <header className="sticky top-0 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-white/5 px-4 py-4">
                <div className="max-w-3xl mx-auto flex items-center gap-4">
                    <Link href="/dashboard" className="p-2 hover:bg-white/5 rounded-lg transition-colors">
                        <ArrowLeft size={20} className="text-zinc-400" />
                    </Link>
                    <h1 className="text-lg font-semibold text-white">Terms of Service</h1>
                </div>
            </header>
            <main className="max-w-3xl mx-auto p-6">
                <p className="text-zinc-500 text-sm mb-8 italic">
                    Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </p>

                <div className="space-y-8 text-zinc-400 text-[15px] leading-relaxed">
                    <section>
                        <h2 className="text-white font-semibold text-xl mb-3">1. Agreement to Terms</h2>
                        <p>
                            These Terms of Service constitute a legally binding agreement made between you, whether personally or on behalf of an entity (&quot;you&quot;) and Integra Markets (&quot;Company&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;), concerning your access to and use of the Integra Markets mobile application as well as any other form of media, media channel, mobile website, or mobile application related, linked, or otherwise connected thereto (collectively, the &quot;Site&quot;).
                        </p>
                    </section>

                    <section>
                        <h2 className="text-white font-semibold text-xl mb-3">2. Financial Information Disclaimer</h2>
                        <p className="mb-4">
                            Integra Markets provides AI-powered financial analysis and market insights for informational purposes only. This information does not constitute financial advice, investment recommendations, or trading signals. You acknowledge that:
                        </p>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li>All market analysis is based on AI interpretation and may contain errors</li>
                            <li>Past performance does not guarantee future results</li>
                            <li>Trading and investment decisions carry inherent risks</li>
                            <li>You should consult with qualified financial advisors before making investment decisions</li>
                            <li>Integra Markets is not liable for any financial losses resulting from use of our services</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-white font-semibold text-xl mb-3">3. API Key Management (BYOK)</h2>
                        <p className="mb-4">Our Bring Your Own Key (BYOK) model requires you to:</p>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li>Maintain valid API keys with supported AI providers (OpenAI, Anthropic, Groq)</li>
                            <li>Be responsible for all costs and usage associated with your API keys</li>
                            <li>Ensure your API keys comply with the respective provider&apos;s terms of service</li>
                            <li>Understand that we do not monitor or control your API usage</li>
                            <li>Accept that service interruptions may occur due to API key issues or provider downtime</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-white font-semibold text-xl mb-3">4. Prohibited Uses</h2>
                        <p className="mb-4">You may not use our service:</p>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li>For any unlawful purpose or to solicit others to unlawful acts</li>
                            <li>To violate any international, federal, provincial, or state regulations or laws</li>
                            <li>To impersonate or attempt to impersonate the Company, employees, or other users</li>
                            <li>To engage in any automated use of the system</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-white font-semibold text-xl mb-3">5. Privacy Policy</h2>
                        <p>
                            Your privacy is important to us. Please review our <Link href="/settings/privacy" className="text-[#4ECCA3] hover:underline">Privacy Policy</Link>, which also governs your use of the Site, to understand our practices.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-white font-semibold text-xl mb-3">6. Contact Information</h2>
                        <p>Questions about the Terms of Service should be sent to us at:</p>
                        <p className="text-white mt-2">Email: legal@integra-markets.com</p>
                    </section>
                </div>

                <div className="mt-12 p-6 bg-white/5 border border-white/10 rounded-xl">
                    <p className="text-zinc-400 text-sm text-center italic">
                        By using Integra Markets, you acknowledge that you have read and agree to these Terms of Service.
                    </p>
                </div>
            </main>
        </div>
    );
}
