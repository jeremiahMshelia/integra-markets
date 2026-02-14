'use client';

import Image from 'next/image';
import { motion, useMotionTemplate, useMotionValue } from 'framer-motion';
import { MouseEvent } from 'react';

export default function Hero() {
    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);

    function handleMouseMove({ currentTarget, clientX, clientY }: MouseEvent) {
        const { left, top } = currentTarget.getBoundingClientRect();
        mouseX.set(clientX - left);
        mouseY.set(clientY - top);
    }

    return (
        <section
            className="relative min-h-screen flex items-center pt-28 pb-12 md:pt-40 md:pb-0 overflow-hidden bg-black group"
            onMouseMove={handleMouseMove}
        >
            {/* Background Grid */}
            <div
                className="absolute inset-0 bg-[linear-gradient(to_right,#222_1px,transparent_1px),linear-gradient(to_bottom,#222_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_70%,transparent_100%)] opacity-20"
            />

            {/* Hover Flashlight Effect */}
            <motion.div
                className="pointer-events-none absolute inset-0 opacity-0 transition duration-300 group-hover:opacity-100"
                style={{
                    background: useMotionTemplate`
            radial-gradient(
              650px circle at ${mouseX}px ${mouseY}px,
              rgba(78, 204, 163, 0.12),
              transparent 80%
            )
          `,
                }}
            />

            {/* Another Grid Layer revealed by hover */}
            <motion.div
                className="pointer-events-none absolute inset-0 opacity-0 transition duration-300 group-hover:opacity-100"
                style={{
                    maskImage: useMotionTemplate`
            radial-gradient(
              300px circle at ${mouseX}px ${mouseY}px,
              black,
              transparent
            )
          `,
                    backgroundImage: `linear-gradient(to right, #4ECCA3 1px, transparent 1px), linear-gradient(to bottom, #4ECCA3 1px, transparent 1px)`,
                    backgroundSize: '40px 40px',
                    opacity: 0.2
                }}
            />


            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent pointer-events-none"></div>

            <div className="max-w-[1400px] mx-auto px-4 sm:px-6 w-full relative z-10">
                <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">

                    {/* Left Content */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className="max-w-[640px]"
                    >
                        <h1 className="text-[36px] sm:text-[48px] md:text-[56px] lg:text-[64px] leading-[1.1] font-[100] tracking-[-0.02em] text-white mb-6 md:mb-8">
                            Smarter <span className="text-[#4ECCA3] font-light">Sentiment</span> <br className="hidden sm:block" />
                            for Commodity <br className="hidden sm:block" />
                            Traders
                        </h1>

                        <p className="text-[15px] sm:text-[17px] md:text-[18px] text-zinc-400 font-light leading-relaxed mb-8 md:mb-10 max-w-lg">
                            Advanced sentiment analysis and predictive insights across oil, gas, agriculture, and metals.
                            <br />
                            <span className="text-[#4ECCA3] block mt-3 md:mt-4 font-normal">Get the edge before the markets move.</span>
                        </p>

                        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-10 md:mb-14">
                            {/* App Store Button */}
                            <button className="flex items-center justify-center sm:justify-start bg-white text-black rounded-[8px] px-4 py-2.5 hover:bg-zinc-200 transition-colors">
                                <svg className="w-6 h-6 mr-2" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M17.864 12.871c-.015-2.79 2.29-4.133 2.396-4.195-1.306-1.9-3.34-2.16-4.067-2.193-1.711-.174-3.353 1.01-4.22 1.01-.884 0-2.232-1-3.666-1.028-1.896-.03-3.642 1.107-4.618 2.805-1.97 3.415-.504 8.468 1.402 11.233.937 1.36 2.05 2.89 3.513 2.835 1.405-.057 1.936-.91 3.633-.91 1.68 0 2.16.91 3.619.883 1.492-.03 2.45-1.36 3.37-2.71 1.066-1.542 1.505-3.034 1.528-3.11-.035-.015-2.92-1.12-2.888-4.62zm-3.12-6.52c.783-.946 1.306-2.259 1.163-3.568-1.12.045-2.476.75-3.28 1.69-.718.83-1.346 2.166-1.177 3.447 1.25.097 2.525-.623 3.294-1.57z" />
                                </svg>
                                <div className="text-left">
                                    <div className="text-[9px] leading-none uppercase font-medium mt-[1px]">Download on the</div>
                                    <div className="text-[15px] font-semibold leading-none mt-[2px]">App Store</div>
                                </div>
                            </button>

                            {/* Play Store Button */}
                            <button className="flex items-center justify-center sm:justify-start bg-transparent border border-white/20 text-white rounded-[8px] px-4 py-2.5 hover:bg-white/5 transition-colors">
                                <svg className="w-5 h-5 mr-2 ml-1" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M3 20.5v-17c0-.83.67-1.5 1.5-1.5.27 0 .54.07.77.21L18.21 11.4c.51.29.79.82.79 1.38v.44c0 .56-.28 1.09-.79 1.38L5.27 23.79c-.23.14-.5.21-.77.21-.83 0-1.5-.67-1.5-1.5zM14.95 12L5 6.47v11.06L14.95 12z" />
                                </svg>
                                <div className="text-left">
                                    <div className="text-[9px] leading-none uppercase font-medium mt-[1px] text-zinc-400">Get it on</div>
                                    <div className="text-[15px] font-semibold leading-none mt-[2px]">Google Play</div>
                                </div>
                            </button>
                        </div>

                        {/* Stats */}
                        <div className="flex items-start justify-center sm:justify-start gap-8 sm:gap-12">
                            <div className="text-center sm:text-left">
                                <div className="text-[20px] sm:text-[22px] font-[100] text-white mb-0">24/7</div>
                                <div className="text-[9px] sm:text-[10px] font-medium tracking-[0.2em] text-zinc-600 uppercase">Coverage</div>
                            </div>
                            <div className="text-center sm:text-left">
                                <div className="text-[20px] sm:text-[22px] font-[100] text-[#4ECCA3] mb-0">Real-time</div>
                                <div className="text-[9px] sm:text-[10px] font-medium tracking-[0.2em] text-zinc-600 uppercase">Analysis</div>
                            </div>
                        </div>
                    </motion.div>

                    {/* Right Content - Phone Mockup */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 1, delay: 0.2, ease: "circOut" }}
                        className="relative flex justify-center lg:justify-end mt-8 lg:mt-0"
                    >
                        <div className="relative w-[280px] sm:w-[360px] md:w-[420px] lg:w-[480px]">
                            <Image
                                src="/integra-mockup-app.webp"
                                alt="App Screenshot"
                                width={480}
                                height={960}
                                className="w-full h-auto drop-shadow-2xl"
                                priority
                            />
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}
