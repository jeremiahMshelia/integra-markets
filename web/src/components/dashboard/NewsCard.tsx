'use client';

import { useState } from 'react';
import { TrendingUp, TrendingDown, ArrowRight, ExternalLink, Share2, Bookmark, Sparkles, Clock } from 'lucide-react';
import Image from 'next/image';

export interface NewsItem {
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
    keywords?: Array<{ word: string; sentiment?: string; score?: number }>;
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

// Fallback logo path
const FALLBACK_LOGO = '/logoNew.png';

export default function NewsCard({ item, featured = false, onAIClick, isBookmarked = false, onBookmarkToggle }: NewsCardProps) {
    const [bookmarked, setBookmarked] = useState(isBookmarked);
    const [imageError, setImageError] = useState(false);
    const [logoError, setLogoError] = useState(false);

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

    // Only show "AI ANALYSIS" if there's literally no sentiment data
    const isDefault = !item.sentiment && score === '0.50';

    const timeStr = formatTimeAgo(item.time_published || item.published);
    const sentiment = isDefault ? 'AI ANALYSIS' : (item.sentiment?.toUpperCase() || 'NEUTRAL');
    const imageUrl = item.image_url || item.banner_image;

    // Custom color for default state
    const displayColor = isDefault ? '#4a9eff' : getSentimentColor(sentiment);



    // Card layout - same for featured and standard, just different sizes
    const cardHeight = featured ? 'min-h-[500px]' : 'min-h-[400px]';
    const titleSize = featured ? 'text-2xl sm:text-3xl' : 'text-lg sm:text-xl';
    const summaryLines = featured ? 'line-clamp-5' : 'line-clamp-4';
    const imageHeight = featured ? 'h-64 sm:h-72' : 'h-52 sm:h-56';

    return (
        <article
            onClick={handleAIClickLocal}
            className={`group flex flex-col bg-[#1C1C1E] rounded-2xl border border-[#2A2A2E] overflow-hidden cursor-pointer hover:border-[#4ECCA3]/40 hover:shadow-lg hover:shadow-[#4ECCA3]/5 transition-all duration-300 ${featured ? 'mb-6' : ''}`}
        >
            {/* Image Area with Sentiment Badge Overlay */}
            <div className={`relative ${imageHeight} w-full overflow-hidden bg-zinc-800`}>
                {imageUrl && !imageError ? (
                    <img
                        src={imageUrl}
                        alt={item.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        onError={() => setImageError(true)}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center relative bg-[#121212]">
                        <img
                            src="/NewLogoInt.png.png"
                            alt="Integra Markets"
                            className="w-28 h-28 object-contain opacity-70"
                        />
                    </div>
                )}

                {/* Sentiment Badge Overlay on Image */}
                <div className="absolute bottom-3 left-3">
                    <div className="inline-flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10">
                        {isDefault ? <Sparkles size={14} color={displayColor} /> : getSentimentIcon(sentiment)}
                        <span className="text-xs font-bold uppercase" style={{ color: displayColor }}>
                            {sentiment} {isDefault ? '' : score}
                        </span>
                    </div>
                </div>
            </div>

            {/* Content Area - Matches Mobile Layout */}
            <div className="flex flex-col flex-1 p-5">
                {/* Top Row: Bookmark & Integra Icon (right aligned) */}
                <div className="flex items-center justify-end gap-2 mb-3">
                    <button
                        onClick={handleBookmark}
                        className="p-1.5 text-zinc-400 hover:text-white transition-colors"
                    >
                        <Bookmark size={18} className={bookmarked ? 'fill-white text-white' : ''} />
                    </button>
                    <button
                        onClick={handleAIClickLocal}
                        className="p-1.5 text-[#4a9eff] hover:text-[#60a5fa] transition-colors"
                        title="Integra Analysis"
                    >
                        <Sparkles size={18} />
                    </button>
                </div>

                {/* Title */}
                <h3 className={`${titleSize} font-bold text-white mb-3 leading-snug group-hover:text-[#4ECCA3] transition-colors`}>
                    {item.title}
                </h3>

                {/* Summary */}
                <p className={`text-sm text-[#EEEEEE] leading-relaxed ${summaryLines} mb-4 flex-1`}>
                    {item.summary || 'No summary available.'}
                </p>

                {/* Bottom Row: Source Link + Time (left) + Share Button (right) */}
                <div className="flex items-center justify-between pt-4 border-t border-[#2A2A2E] mt-auto">
                    <div className="flex items-center gap-4 text-sm">
                        <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1 text-[#4a9eff] hover:underline font-medium"
                        >
                            {item.source}
                            <ExternalLink size={12} />
                        </a>
                        <span className="text-zinc-500">{timeStr}</span>
                    </div>

                    {/* Share Button */}
                    <button
                        onClick={handleShare}
                        className="p-2 text-zinc-500 hover:text-white transition-colors"
                    >
                        <Share2 size={18} />
                    </button>
                </div>
            </div>
        </article>
    );
}


