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

                <div className="space-y-8 text-zinc-400 text-[15px] leading-relaxed">
                    <section>
                        <h2 className="text-white font-semibold text-lg mb-3">1. Introduction</h2>
                        <p>Integra Markets ("we", "our", or "us") is committed to protecting your privacy while providing advanced AI-powered financial market analysis. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application and related services, including our Bring Your Own Key (BYOK) AI integration features.</p>
                    </section>

                    <section>
                        <h2 className="text-white font-semibold text-lg mb-3">2. Information We Collect</h2>
                        <p className="mb-3">We collect different types of information to provide and improve our services:</p>
                        <ul className="list-disc list-inside space-y-1 ml-2">
                            <li>Account Information: Email address, preferences, and settings</li>
                            <li>Usage Data: App interactions, feature usage patterns, and session data</li>
                            <li>Device Information: Device type, operating system, app version, and unique identifiers</li>
                            <li>Financial Data Queries: Market analysis requests and trading-related questions (anonymized)</li>
                            <li>Third-Party API Keys: Encrypted storage of your AI service API keys (OpenAI, Anthropic, Groq)</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-white font-semibold text-lg mb-3">3. Bring Your Own Key (BYOK) Model</h2>
                        <p className="mb-3">Our BYOK approach ensures:</p>
                        <ul className="list-disc list-inside space-y-1 ml-2">
                            <li>Your API keys are encrypted and stored locally on your device</li>
                            <li>Direct communication between your device and your chosen AI provider</li>
                            <li>We never access, store, or transmit your API keys to our servers</li>
                            <li>You maintain full control over your AI service costs and usage</li>
                            <li>Your API provider's privacy policy governs the handling of your queries</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-white font-semibold text-lg mb-3">4. Data Usage for Service Improvement</h2>
                        <p className="mb-3">To enhance our financial analysis accuracy and relevance:</p>
                        <ul className="list-disc list-inside space-y-1 ml-2">
                            <li>We may analyze anonymized and aggregated usage patterns</li>
                            <li>Market queries and interactions are obfuscated to remove personal identifiers</li>
                            <li>Proprietary trading strategies and personal financial data are never stored or shared</li>
                            <li>Data analysis helps improve news relevance, market sentiment accuracy, and feature development</li>
                            <li>All personal information and specific trading queries remain confidential</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-white font-semibold text-lg mb-3">5. Third-Party AI Services</h2>
                        <p className="mb-3">When using BYOK with third-party AI providers:</p>
                        <ul className="list-disc list-inside space-y-1 ml-2">
                            <li>OpenAI, Anthropic, Groq: Your queries are subject to their respective privacy policies</li>
                            <li>We recommend reviewing your chosen AI provider's data usage policies</li>
                            <li>Your interactions with AI services are direct and not monitored by Integra Markets</li>
                            <li>We do not store or access the content of your AI conversations</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-white font-semibold text-lg mb-3">6. Data Security & Protection</h2>
                        <p className="mb-3">We implement robust security measures:</p>
                        <ul className="list-disc list-inside space-y-1 ml-2">
                            <li>End-to-end encryption for sensitive data transmission</li>
                            <li>Secure local storage for API keys using device keychain services</li>
                            <li>Regular security audits and updates</li>
                            <li>No storage of personal financial decisions or trading strategies</li>
                            <li>Compliance with financial data protection standards</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-white font-semibold text-lg mb-3">7. Information Sharing & Disclosure</h2>
                        <p className="mb-3">We do not sell, trade, or share your personal information. Limited disclosure may occur:</p>
                        <ul className="list-disc list-inside space-y-1 ml-2">
                            <li>When required by law or legal process</li>
                            <li>To protect our rights or prevent fraud</li>
                            <li>With your explicit consent</li>
                            <li>In anonymized, aggregated form for market research (no personal identifiers)</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-white font-semibold text-lg mb-3">8. Your Privacy Rights</h2>
                        <p className="mb-3">You have comprehensive control over your data:</p>
                        <ul className="list-disc list-inside space-y-1 ml-2">
                            <li>Access and review your stored information</li>
                            <li>Correct or update your account details</li>
                            <li>Delete your account and associated data</li>
                            <li>Revoke API key permissions at any time</li>
                            <li>Opt-out of anonymized usage analytics</li>
                            <li>Request data portability in standard formats</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-white font-semibold text-lg mb-3">9. Data Retention</h2>
                        <ul className="list-disc list-inside space-y-1 ml-2">
                            <li>Account data: Retained while your account is active</li>
                            <li>Usage analytics: Anonymized data retained for service improvement</li>
                            <li>API keys: Deleted immediately upon account deletion or key removal</li>
                            <li>Cached market data: Automatically expired and refreshed regularly</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-white font-semibold text-lg mb-3">10. International Data Transfers</h2>
                        <p>Your data may be processed in different countries where our service providers operate. We ensure appropriate safeguards are in place to protect your information in accordance with this policy.</p>
                    </section>

                    <section>
                        <h2 className="text-white font-semibold text-lg mb-3">11. Changes to This Policy</h2>
                        <p>We may update this Privacy Policy periodically. Significant changes will be communicated through the app or via email. Your continued use of Integra Markets constitutes acceptance of any updates.</p>
                    </section>

                    <section>
                        <h2 className="text-white font-semibold text-lg mb-3">12. Contact Information</h2>
                        <p className="mb-3">For privacy-related questions or concerns:</p>
                        <p>Email: privacy@integra-markets.com</p>
                        <p>Data Protection Officer: dpo@integra-markets.com</p>
                        <p className="mt-2">Response time: We aim to respond within 72 hours</p>
                    </section>
                </div>

                <div className="mt-8 p-5 bg-[#1E1E1E] border border-[#333] rounded-xl text-center">
                    <p className="text-zinc-500 text-sm italic">
                        By using Integra Markets, you acknowledge that you have read and understand this Privacy Policy.
                    </p>
                </div>
            </main>
        </div>
    );
}
