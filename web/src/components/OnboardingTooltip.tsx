'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface OnboardingTooltipProps {
    storageKey: string;
    title: string;
    message: string;
    onDismiss?: () => void;
}

export default function OnboardingTooltip({
    storageKey,
    title,
    message,
    onDismiss,
}: OnboardingTooltipProps) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const seen = localStorage.getItem(storageKey);
        if (!seen) {
            const timer = setTimeout(() => setVisible(true), 1000);
            return () => clearTimeout(timer);
        }
    }, [storageKey]);

    const handleDismiss = () => {
        setVisible(false);
        localStorage.setItem(storageKey, 'true');
        onDismiss?.();
    };

    return (
        <AnimatePresence>
            {visible && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={handleDismiss}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            backgroundColor: 'rgba(0, 0, 0, 0.45)',
                            zIndex: 9998,
                        }}
                    />
                    {/* Tooltip */}
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        transition={{ duration: 0.25, ease: 'easeOut' }}
                        style={{
                            position: 'fixed',
                            top: '22%',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            zIndex: 9999,
                            width: '100%',
                            maxWidth: 360,
                            padding: '0 16px',
                            boxSizing: 'border-box' as const,
                        }}
                    >
                        <div
                            style={{
                                backgroundColor: '#1A1A1A',
                                borderRadius: 12,
                                padding: '16px',
                                border: '1px solid rgba(78, 204, 163, 0.12)',
                                boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
                            }}
                        >
                            {/* Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <span style={{ fontSize: 15, fontWeight: 600, color: '#4ECCA3', letterSpacing: '0.2px' }}>
                                    {title}
                                </span>
                                <button
                                    onClick={handleDismiss}
                                    style={{
                                        width: 24,
                                        height: 24,
                                        borderRadius: 12,
                                        backgroundColor: 'rgba(255,255,255,0.08)',
                                        border: 'none',
                                        color: '#A0A0A0',
                                        fontSize: 12,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        marginLeft: 8,
                                        flexShrink: 0,
                                    }}
                                >
                                    ✕
                                </button>
                            </div>
                            {/* Message */}
                            <p style={{ fontSize: 13, lineHeight: '19px', color: '#A0A0A0', margin: '0 0 14px 0' }}>
                                {message}
                            </p>
                            {/* Got it button */}
                            <button
                                onClick={handleDismiss}
                                style={{
                                    backgroundColor: '#4ECCA3',
                                    borderRadius: 8,
                                    padding: '8px 20px',
                                    border: 'none',
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: '#121212',
                                    cursor: 'pointer',
                                    transition: 'opacity 0.15s',
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
                                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                            >
                                Got it
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
