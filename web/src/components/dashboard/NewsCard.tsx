'use client';

import { useState } from 'react';
import { TrendingUp, TrendingDown, ArrowRight, ExternalLink, Share2, Bookmark, Sparkles, Clock } from 'lucide-react';
import Image from 'next/image';

interface NewsItem {
    title: string;
    url: string;
    published: string;
    time_published?: string;
    summary: string;
    source: string;
    commodity?: string;
    sentiment?: string;
    sentiment_score?: number;
    image_url?: string;
    banner_image?: string;
}

interface NewsCardProps {
    item: NewsItem;
    featured?: boolean;
    onAIClick: (item: NewsItem) => void;
    isBookmarked?: boolean;
    onBookmarkToggle?: (item: NewsItem) => void;
}

const getSentimentColor = (sentiment: string): string => {
    switch (sentiment?.toUpperCase()) {
        case 'BULLISH': return '#4ECCA3';
        case 'BEARISH': return '#F05454';
        case 'NEUTRAL': return '#EAB308';
        default: return '#EAB308';
    }
};

const getSentimentIcon = (sentiment: string) => {
    const color = getSentimentColor(sentiment);
    const iconProps = { size: 16, color, strokeWidth: 2.5 };

    switch (sentiment?.toUpperCase()) {
        case 'BULLISH': return <TrendingUp {...iconProps} />;
        case 'BEARISH': return <TrendingDown {...iconProps} />;
        case 'NEUTRAL': return <ArrowRight {...iconProps} />;
        default: return <ArrowRight {...iconProps} />;
    }
};

const formatTimeAgo = (dateStr: string): string => {
    if (!dateStr) return '';
    try {
        let date: Date;
        if (dateStr.length >= 15 && dateStr[8] === 'T') {
            const year = parseInt(dateStr.slice(0, 4));
            const month = parseInt(dateStr.slice(4, 6)) - 1;
            const day = parseInt(dateStr.slice(6, 8));
            const hour = parseInt(dateStr.slice(9, 11));
            const minute = parseInt(dateStr.slice(11, 13));
            const second = parseInt(dateStr.slice(13, 15));
            date = new Date(Date.UTC(year, month, day, hour, minute, second));
        } else {
            date = new Date(dateStr);
        }
        if (isNaN(date.getTime())) return '';
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / (1000 * 60));
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        return `${Math.floor(diffHours / 24)}d ago`;
    } catch {
        return '';
    }
};

// Placeholder gradients for when images are missing (Perplexity style)
const PLACEHOLDERS = [
    'linear-gradient(135deg, #1a2a6c, #b21f1f, #fdbb2d)',
    'linear-gradient(135deg, #0f0c29, #302b63, #24243e)',
    'linear-gradient(135deg, #114357, #F29492)',
    'linear-gradient(135deg, #000046, #1CB5E0)',
];

export default function NewsCard({ item, featured = false, onAIClick, isBookmarked = false, onBookmarkToggle }: NewsCardProps) {
    const [bookmarked, setBookmarked] = useState(isBookmarked);
    const [imageError, setImageError] = useState(false);

    const handleShare = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const shareText = `${item.title}\n\n${item.summary || ''}\n\nSource: ${item.source}${item.url ? `\n\nRead more: ${item.url}` : ''}`;
        if (navigator.share) {
            try { await navigator.share({ title: item.title, text: item.summary, url: item.url }); } catch { }
        } else {
            await navigator.clipboard.writeText(shareText);
        }
    };

    const handleBookmark = (e: React.MouseEvent) => {
        e.stopPropagation();
        setBookmarked(!bookmarked);
        onBookmarkToggle?.(item);
    };

    const handleAIClickLocal = (e: React.MouseEvent) => {
        e.stopPropagation();
        onAIClick(item);
    };

    const openUrl = () => {
        if (item.url) window.open(item.url, '_blank', 'noopener,noreferrer');
    };

    // Robust field checking
    let rawScore = item.sentiment_score;
    if (rawScore === undefined || rawScore === null) {
        // @ts-ignore
        rawScore = item.overall_sentiment_score;
    }
    if (rawScore === undefined || rawScore === null) {
        // @ts-ignore
        rawScore = item.score;
    }

    const scoreVal = rawScore ?? 0.5;
    const score = Number(scoreVal).toFixed(2);
    const isDefault = score === '0.50' && (!item.sentiment || item.sentiment === 'NEUTRAL');

    const timeStr = formatTimeAgo(item.time_published || item.published);
    const sentiment = isDefault ? 'AI ANALYSIS' : (item.sentiment || 'NEUTRAL');
    const imageUrl = item.image_url || item.banner_image;

    // Custom color for default state
    const displayColor = isDefault ? '#4a9eff' : getSentimentColor(sentiment);

    // Deterministic placeholder based on title length
    const placeholderBg = PLACEHOLDERS[(item.title?.length || 0) % PLACEHOLDERS.length];

    if (featured) {
        return (
            <article
                onClick={openUrl}
                className="group relative w-full h-[400px] rounded-3xl overflow-hidden cursor-pointer border border-[#333] hover:border-[#4ECCA3]/50 transition-all duration-300 mb-8"
            >
                {/* Background Image */}
                <div className="absolute inset-0 z-0">
                    {imageUrl && !imageError ? (
                        <img
                            src={imageUrl}
                            alt={item.title}
                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                            onError={() => setImageError(true)}
                        />
                    ) : (
                        <div className="w-full h-full" style={{ background: placeholderBg }} />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#121212] via-[#121212]/80 to-transparent" />
                </div>

                {/* Content Content - Bottom Align */}
                <div className="absolute bottom-0 left-0 right-0 p-8 z-10">
                    {/* Sentiment Badge */}
                    <div className="inline-flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 mb-4">
                        {isDefault ? <Sparkles size={16} color={displayColor} /> : getSentimentIcon(sentiment)}
                        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: displayColor }}>
                            {sentiment} {isDefault ? '' : score}
                        </span>
                    </div>

                    <h2 className="text-3xl md:text-4xl font-bold text-white mb-3 leading-tight text-shadow-sm">
                        {item.title}
                    </h2>

                    <p className="text-zinc-300 text-lg mb-6 line-clamp-2 max-w-3xl">
                        {item.summary}
                    </p>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 text-sm text-zinc-400">
                            <span className="flex items-center gap-1.5">
                                <span className="w-4 h-4 rounded-full bg-zinc-700 flex items-center justify-center text-[8px] text-white">
                                    {item.source?.charAt(0)}
                                </span>
                                {item.source}
                            </span>
                            <span className="w-1 h-1 rounded-full bg-zinc-600" />
                            <span className="flex items-center gap-1">
                                <Clock size={14} />
                                {timeStr}
                            </span>
                        </div>

                        <div className="flex items-center gap-2">
                            <button onClick={handleBookmark} className="p-2.5 bg-white/10 hover:bg-white/20 rounded-full backdrop-blur-md transition-colors text-white">
                                <Bookmark size={18} className={bookmarked ? 'fill-white' : ''} />
                            </button>
                            <button onClick={handleAIClickLocal} className="flex items-center gap-2 px-4 py-2.5 bg-[#4a9eff] hover:bg-[#3b82f6] text-white rounded-full font-medium transition-colors">
                                <Sparkles size={16} />
                                <span>AI Analysis</span>
                            </button>
                        </div>
                    </div>
                </div>
            </article>
        );
    }

    // STANDARD GRID CARD (Perplexity Style)
    return (
        <article
            onClick={openUrl}
            className="group flex flex-col h-full bg-[#1C1C1E] rounded-2xl border border-[#2A2A2E] overflow-hidden cursor-pointer hover:border-[#4ECCA3]/40 hover:shadow-lg hover:shadow-[#4ECCA3]/5 transition-all duration-300"
        >
            {/* Image Area */}
            <div className="relative h-48 w-full overflow-hidden bg-zinc-800">
                {imageUrl && !imageError ? (
                    <img
                        src={imageUrl}
                        alt={item.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        onError={() => setImageError(true)}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center" style={{ background: placeholderBg }}>
                        <span className="text-5xl opacity-20">📰</span>
                    </div>
                )}

                {/* Floating Actions on Image */}
                <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <button onClick={handleShare} className="p-2 bg-black/50 hover:bg-black/70 rounded-full backdrop-blur-sm text-white transition-colors">
                        <Share2 size={16} />
                    </button>
                    <button onClick={handleBookmark} className="p-2 bg-black/50 hover:bg-black/70 rounded-full backdrop-blur-sm text-white transition-colors">
                        <Bookmark size={16} className={bookmarked ? 'fill-white' : ''} />
                    </button>
                </div>

                {/* Sentiment Badge Overlay */}
                <div className="absolute bottom-3 left-3">
                    <div className="inline-flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/5">
                        {isDefault ? <Sparkles size={14} color={displayColor} /> : getSentimentIcon(sentiment)}
                        <span className="text-[10px] font-bold uppercase" style={{ color: displayColor }}>
                            {sentiment} {isDefault ? '' : score}
                        </span>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex flex-col flex-1 p-5">
                <div className="flex items-center gap-2 mb-3 text-xs text-zinc-500">
                    <span className="font-medium text-zinc-300">{item.source}</span>
                    <span>•</span>
                    <span>{timeStr}</span>
                </div>

                <h3 className="text-lg font-bold text-white mb-2 leading-snug line-clamp-2 group-hover:text-[#4ECCA3] transition-colors">
                    {item.title}
                </h3>

                <p className="text-sm text-zinc-400 leading-relaxed line-clamp-2 mb-4 flex-1">
                    {item.summary || 'No summary available.'}
                </p>

                {/* Bottom Action */}
                <div className="pt-4 border-t border-[#2A2A2E] flex items-center justify-between mt-auto">
                    <button
                        onClick={handleAIClickLocal}
                        className="flex items-center gap-1.5 text-xs font-semibold text-[#4a9eff] hover:text-[#60a5fa] transition-colors"
                    >
                        <Sparkles size={14} />
                        INTEGRA ANALYSIS
                    </button>

                    <ExternalLink size={14} className="text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                </div>
            </div>
        </article>
    );
}

export type { NewsItem };
