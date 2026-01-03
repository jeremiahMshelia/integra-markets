'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

export default function About() {
    return (
        <section id="about" className="py-32 bg-gradient-to-b from-[#0a0a0a] to-black relative overflow-hidden">
            <div className="max-w-3xl mx-auto px-6 relative z-10">
                <motion.h2
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="text-[42px] md:text-[56px] font-[100] text-center mb-16 text-white tracking-tight"
                >
                    What is <span className="text-[#4ECCA3] font-light">Integra?</span>
                </motion.h2>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="space-y-8 text-[18px] text-zinc-400 leading-relaxed font-light"
                >
                    <p>
                        Integra was born from the real world pain points of physical and proprietary oil traders designed to cut through complex, fast moving market data and turn it into clear, actionable insight.
                    </p>

                    <p>
                        Built for speed, scale, and precision, Integra helps traders uncover inefficiencies and arbitrage opportunities in the energy markets physically, quantitatively, and algorithmically.
                    </p>

                    <p className="text-white font-normal text-[22px] mt-8">
                        It's time to get integrated.
                    </p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.2 }}
                    className="mt-16 border border-[#4ECCA3]/10 bg-black/40 p-10 text-center rounded-[4px] backdrop-blur-sm"
                >
                    <h4 className="text-[#4ECCA3] font-normal text-xl mb-3">Why now?</h4>
                    <p className="text-zinc-400 font-light text-lg">
                        Volatility is everywhere. Data is fragmented. Integra brings structure to chaos so you can trade with confidence.
                    </p>
                </motion.div>

                <div className="mt-20 text-center">
                    <Link
                        href="/signup"
                        className="inline-flex items-center justify-center h-14 px-10 bg-[#4ECCA3] hover:bg-[#45b393] text-black font-medium text-[16px] rounded-[8px] transition-all"
                    >
                        Start Trading Smarter
                    </Link>
                </div>
            </div>
        </section>
    );
}
