'use client';

import { useState } from 'react';
import { TrendingUp, TrendingDown, ArrowRight, ExternalLink, Share2, Bookmark, Sparkles } from 'lucide-react';

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
}

interface NewsCardProps {
    item: NewsItem;
    onAIClick: (item: NewsItem) => void;
    isBookmarked?: boolean;
    onBookmarkToggle?: (item: NewsItem) => void;
}

const getSentimentColor = (sentiment: string): string => {
    switch (sentiment?.toUpperCase()) {
        case 'BULLISH': return '#28c76f';
        case 'BEARISH': return '#ea5455';
        case 'NEUTRAL': return '#f4c542';
        default: return '#f4c542';
    }
};

const getSentimentIcon = (sentiment: string) => {
    const color = getSentimentColor(sentiment);
    const iconProps = { size: 14, color, strokeWidth: 2.5 };

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

        // Handle Alpha Vantage format: 20241119T150000 or 20241119T150000Z
        if (dateStr.length >= 15 && dateStr[8] === 'T') {
            const year = parseInt(dateStr.slice(0, 4));
            const month = parseInt(dateStr.slice(4, 6)) - 1;
            const day = parseInt(dateStr.slice(6, 8));
            const hour = parseInt(dateStr.slice(9, 11));
            const minute = parseInt(dateStr.slice(11, 13));
            const second = parseInt(dateStr.slice(13, 15));
            date = new Date(year, month, day, hour, minute, second);
        } else {
            // Try ISO format or other standard formats
            date = new Date(dateStr);
        }

        if (isNaN(date.getTime())) return '';

        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / (1000 * 60));

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} mins ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        return `${Math.floor(diffHours / 24)}d ago`;
    } catch {
        return '';
    }
};

export default function NewsCard({ item, onAIClick, isBookmarked = false, onBookmarkToggle }: NewsCardProps) {
    const [bookmarked, setBookmarked] = useState(isBookmarked);
    const [imgError, setImgError] = useState(false);

    const handleShare = async () => {
        const shareText = `${item.title}\n\n${item.summary || ''}\n\nSource: ${item.source}${item.url ? `\n\nRead more: ${item.url}` : ''}`;

        if (navigator.share) {
            try {
                await navigator.share({
                    title: item.title,
                    text: item.summary,
                    url: item.url,
                });
            } catch { }
        } else {
            await navigator.clipboard.writeText(shareText);
        }
    };

    const handleBookmark = () => {
        setBookmarked(!bookmarked);
        onBookmarkToggle?.(item);
    };

    const handleSourceClick = () => {
        if (item.url) {
            window.open(item.url, '_blank', 'noopener,noreferrer');
        }
    };

    const score = (item.sentiment_score || 0.5).toFixed(2);
    const timeStr = formatTimeAgo(item.time_published || item.published);

    return (
        <article className="bg-[#1C1C1E] rounded-2xl border border-[#2A2A2E] mb-5 overflow-hidden hover:border-[#3a3a3e] transition-colors">
            {/* Perplexity-style: Image at top */}
            {item.image_url && !imgError && (
                <div className="aspect-[2/1] bg-zinc-900 relative overflow-hidden">
                    <img
                        src={item.image_url}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={() => setImgError(true)}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#1C1C1E] via-transparent to-transparent" />
                </div>
            )}

            {/* Content */}
            <div className="p-5">
                {/* Sentiment + Actions Row (mobile app style) */}
                <div className="flex justify-between items-center mb-3">
                    {/* Sentiment: → NEUTRAL 0.50 */}
                    <div className="flex items-center gap-1.5">
                        {getSentimentIcon(item.sentiment || 'neutral')}
                        <span
                            className="text-xs font-semibold uppercase tracking-wide"
                            style={{ color: getSentimentColor(item.sentiment || 'neutral') }}
                        >
                            {(item.sentiment || 'NEUTRAL').toUpperCase()}
                        </span>
                        <span
                            className="text-xs font-semibold"
                            style={{ color: getSentimentColor(item.sentiment || 'neutral') }}
                        >
                            {score}
                        </span>
                    </div>

                    {/* Bookmark + AI Buttons */}
                    <div className="flex items-center">
                        <button onClick={handleBookmark} className="p-2" title="Bookmark">
                            <Bookmark size={18} className={bookmarked ? 'fill-yellow-400 text-yellow-400' : 'text-[#666]'} />
                        </button>
                        <button onClick={() => onAIClick(item)} className="p-1" title="Integra AI Analysis">
                            <Sparkles size={24} className="text-[#4a9eff]" />
                        </button>
                    </div>
                </div>

                {/* Title */}
                <h3 className="text-[16px] font-semibold text-white leading-[1.4] mb-3">
                    {item.title}
                </h3>

                {/* Summary */}
                <p className="text-[14px] text-[#9CA3AF] leading-[1.6] mb-5 line-clamp-3">
                    {item.summary || 'More details would go here...'}
                </p>

                {/* Footer: Source + Time + Share */}
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        {item.source && (
                            <button
                                onClick={handleSourceClick}
                                className="flex items-center gap-1 text-[13px] font-medium text-[#3B82F6] hover:underline"
                            >
                                {item.source}
                                <ExternalLink size={12} />
                            </button>
                        )}
                        {timeStr && (
                            <span className="text-[12px] text-[#6B7280]">{timeStr}</span>
                        )}
                    </div>

                    <button onClick={handleShare} className="p-1">
                        <Share2 size={16} className="text-[#666]" />
                    </button>
                </div>
            </div>
        </article>
    );
}

export type { NewsItem };
