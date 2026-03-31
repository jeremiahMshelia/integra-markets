'use client';

import { motion } from 'framer-motion';

export default function HowItWorks() {
    return (
        <section id="how-it-works" className="py-32 bg-[#0a0a0a] relative">
            <div className="max-w-3xl mx-auto px-6">
                <motion.h2
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="text-[40px] md:text-[56px] font-[100] text-center mb-20 text-white tracking-tight"
                >
                    How It <span className="text-[#4ECCA3] font-light">Works</span>
                </motion.h2>

                <div className="space-y-16">
                    {/* Step 1 */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                        className="flex gap-8"
                    >
                        <div className="flex-shrink-0 w-12 h-12 rounded-full border border-[#4ECCA3]/20 flex items-center justify-center text-[#4ECCA3] font-[200] text-xl bg-[#111]">
                            1
                        </div>
                        <div>
                            <p className="text-[18px] text-zinc-400 leading-relaxed font-light">
                                Integra runs low-latency sentiment engines designed for fast-moving news and social feeds, helping traders quickly spot shifts that can move prices in real time.
                            </p>
                        </div>
                    </motion.div>

                    {/* Step 2 */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                        className="flex gap-8"
                    >
                        <div className="flex-shrink-0 w-12 h-12 rounded-full border border-[#30a5ff]/20 flex items-center justify-center text-[#30a5ff] font-[200] text-xl bg-[#111]">
                            2
                        </div>
                        <div>
                            <p className="text-[18px] text-zinc-400 leading-relaxed font-light">
                                A specialized financial language layer analyzes longer articles and reports, turning complex market narratives into clear, tradeable insights.
                            </p>
                        </div>
                    </motion.div>

                    {/* Step 3 */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.3 }}
                        className="flex gap-8"
                    >
                        <div className="flex-shrink-0 w-12 h-12 rounded-full border border-[#ffd93d]/20 flex items-center justify-center text-[#ffd93d] font-[200] text-xl bg-[#111]">
                            3
                        </div>
                        <div>
                            <p className="text-[18px] text-zinc-400 leading-relaxed font-light">
                                These signals are enhanced by adaptive learning systems that combine market data and user behavior, continuously improving the accuracy and timing of trade opportunities.
                            </p>
                        </div>
                    </motion.div>

                    {/* Quote Box */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.4 }}
                        className="border-l border-[#4ECCA3] pl-8 py-2 mt-16"
                    >
                        <p className="text-[20px] text-zinc-300 leading-relaxed font-light italic">
                            "As it evolves, Integra delivers better trade ideas, sharper insights, and an edge you can rely on."
                        </p>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}
