import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function TermsPage() {
    return (
        <div className="min-h-screen bg-[#0a0a0a] font-[var(--font-geist-sans)]">
            <header className="sticky top-0 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-white/5 px-4 py-4">
                <div className="max-w-3xl mx-auto flex items-center gap-4">
                    <Link href="/" className="p-2 hover:bg-white/5 rounded-lg transition-colors">
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
                            These Terms of Service constitute a legally binding agreement made between you, whether personally or on behalf of an entity (&quot;you&quot;) and Integra Markets (&quot;Company&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;), concerning your access to and use of the Integra Markets mobile application as well as any other form of media, media channel, mobile website, or mobile application related, linked, or otherwise connected thereto (collectively, the &quot;Site&quot;). You agree that by accessing the Site, you have read, understood, and agreed to be bound by all of these Terms of Service.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-white font-semibold text-xl mb-3">2. Intellectual Property Rights</h2>
                        <p>
                            Unless otherwise indicated, the Site is our proprietary property and all source code, databases, functionality, software, website designs, audio, video, text, photographs, and graphics on the Site (collectively, the &quot;Content&quot;) and the trademarks, service marks, and logos contained therein (the &quot;Marks&quot;) are owned or controlled by us or licensed to us, and are protected by copyright and trademark laws and various other intellectual property rights and unfair competition laws of the United States, international copyright laws, and international conventions.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-white font-semibold text-xl mb-3">3. User Representations</h2>
                        <p className="mb-4">By using the Site, you represent and warrant that:</p>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li>You have the legal capacity and you agree to comply with these Terms of Service</li>
                            <li>You are not a minor in the jurisdiction in which you reside, or if a minor, you have received parental permission to use the Site</li>
                            <li>You will not access the Site through automated or non-human means, whether through a bot, script, or otherwise</li>
                            <li>You will not use the Site for any illegal or unauthorized purpose</li>
                            <li>Your use of the Site will not violate any applicable law or regulation</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-white font-semibold text-xl mb-3">4. Financial Information Disclaimer</h2>
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
                        <h2 className="text-white font-semibold text-xl mb-3">5. API Key Management (BYOK)</h2>
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
                        <h2 className="text-white font-semibold text-xl mb-3">6. Prohibited Uses</h2>
                        <p className="mb-4">You may not use our service:</p>
                        <ul className="list-disc list-inside space-y-2 ml-4">
                            <li>For any unlawful purpose or to solicit others to unlawful acts</li>
                            <li>To violate any international, federal, provincial, or state regulations or laws</li>
                            <li>To transmit or procure the sending of any advertising or promotional material</li>
                            <li>To impersonate or attempt to impersonate the Company, employees, or other users</li>
                            <li>To harass, abuse, insult, harm, defame, slander, disparage, intimidate, or discriminate</li>
                            <li>To submit false or misleading information</li>
                            <li>To engage in any automated use of the system</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-white font-semibold text-xl mb-3">7. User Generated Content</h2>
                        <p>
                            You may post, upload, or contribute content to the service. By doing so, you grant us a license to use, reproduce, adapt, modify, publish, or distribute such content. You represent that you own or have the necessary rights to such content and that use of your content does not infringe any third-party rights.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-white font-semibold text-xl mb-3">8. Privacy Policy</h2>
                        <p>
                            Your privacy is important to us. Please review our <Link href="/privacy" className="text-[#4ECCA3] hover:underline">Privacy Policy</Link>, which also governs your use of the Site, to understand our practices.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-white font-semibold text-xl mb-3">9. Termination</h2>
                        <p>
                            We may terminate or suspend your account and bar access to the service immediately, without prior notice or liability, under our sole discretion, for any reason whatsoever and without limitation, including but not limited to a breach of the Terms.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-white font-semibold text-xl mb-3">10. Disclaimer</h2>
                        <p>
                            The information on this site is provided on an &quot;as is&quot; basis. To the fullest extent permitted by law, this Company excludes all representations, warranties, conditions and terms related to our service.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-white font-semibold text-xl mb-3">11. Governing Law</h2>
                        <p>
                            These Terms shall be interpreted and governed by the laws of the United States, without regard to its conflict of law provisions.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-white font-semibold text-xl mb-3">12. Changes to Terms</h2>
                        <p>
                            We reserve the right to modify these terms at any time. We will notify users of any material changes via email or through the application.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-white font-semibold text-xl mb-3">13. Contact Information</h2>
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
