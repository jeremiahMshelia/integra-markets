'use client';

import {
    TrendingUp,
    BarChart3,
    Zap,
    Globe
} from 'lucide-react';
import { motion } from 'framer-motion';

const features = [
    {
        icon: TrendingUp,
        title: 'Sentiment Analysis',
        description: 'Specialized sentiment engines analyze headlines with confidence scores.',
        color: 'text-[#4ECCA3]'
    },
    {
        icon: BarChart3,
        title: 'Predictive Analytics',
        description: 'Advanced algorithms predict price movements and trading opportunities.',
        color: 'text-[#30a5ff]'
    },
    {
        icon: Zap,
        title: 'Real-time Insights',
        description: 'Instant notifications as market moving news breaks.',
        color: 'text-[#ffd93d]'
    },
    {
        icon: Globe,
        title: 'Global Coverage',
        description: 'Worldwide monitoring of oil, gas, agriculture, and metals markets.',
        color: 'text-[#4ECCA3]'
    }
];

export default function Features() {
    return (
        <section id="features" className="py-32 bg-black relative">
            <div className="max-w-7xl mx-auto px-6 relative z-10">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                    className="text-center mb-24"
                >
                    <h2 className="text-[40px] md:text-[56px] font-[100] mb-6 text-white tracking-tight leading-tight">
                        Built for <span className="bg-gradient-to-r from-[#4ECCA3] to-[#45b393] bg-clip-text text-transparent font-light">Market Intelligence</span>
                    </h2>
                    <p className="text-[20px] text-zinc-400 font-light">
                        Designed for traders, by traders.
                    </p>
                    <p className="mt-4 text-[16px] text-zinc-500 max-w-2xl mx-auto font-light leading-relaxed">
                        Real market expertise combined with cutting edge technology for commodity trading insights that actually work.
                    </p>
                </motion.div>

                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {features.map((feature, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: index * 0.1 }}
                            className="bg-[#0a0a0a] border border-white/5 rounded-[12px] p-8 hover:border-[#4ECCA3]/20 transition-colors duration-300"
                        >
                            <div className={`${feature.color} mb-6`}>
                                <feature.icon size={28} strokeWidth={1} />
                            </div>
                            <h3 className="text-[20px] font-light text-white mb-3">{feature.title}</h3>
                            <p className="text-[15px] text-zinc-500 leading-relaxed font-light">
                                {feature.description}
                            </p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
