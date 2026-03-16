'use client';

import { useState, useEffect } from 'react';
import { X, Copy, Bookmark, Info, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase';

interface NewsItem {
    title: string;
    url: string;
    published: string;
    summary: string;
    source: string;
    commodity?: string;
    sentiment?: string;
    sentiment_score?: number;
    image_url?: string;
    keywords?: Array<{ word: string; sentiment?: string; score?: number }>;
    // Backend preprocessing data
    bullish?: number;
    bearish?: number;
    neutral?: number;
    market_impact?: string;
    trade_ideas?: string[];
    event_type?: string;
    severity?: string;
    // Groq trader insights
    trader_insights?: {
        success?: boolean;
        model_used?: string;
        trader_summary?: string;
        key_driver?: string;
        market_context?: string;
        action_considerations?: string[];
    };
}

interface AIAnalysisModalProps {
    isOpen: boolean;
    onClose: () => void;
    article: NewsItem | null;
    onBookmark?: (article: NewsItem) => void;
    isBookmarked?: boolean;
}

type VoteType = 'BULLISH' | 'BEARISH' | 'NEUTRAL' | null;

interface PollData {
    bullish: number;
    bearish: number;
    neutral: number;
    total: number;
    bullishPercent: number;
    bearishPercent: number;
    neutralPercent: number;
}

const getSentimentColor = (sentiment: string): string => {
    switch (sentiment?.toUpperCase()) {
        case 'BULLISH': return '#4ECCA3';
        case 'BEARISH': return '#F05454';
        case 'NEUTRAL': return '#EAB308';
        default: return '#EAB308';
    }
};

const extractKeyDrivers = (article: NewsItem): string[] => {
    // Use backend keywords if available (now returns {word, score} objects)
    if (article.keywords && article.keywords.length > 0) {
        return article.keywords.map((k: any) => typeof k === 'string' ? k : k.word).filter(Boolean);
    }

    // Fallback: scan article text against finance lexicon (commodity-focused first)
    const commodityFirst = ['crude', 'oil', 'opec', 'gas', 'lng', 'gold', 'silver', 'copper', 'wheat', 'corn', 'soybeans', 'supply', 'demand', 'production', 'sanctions', 'tariff', 'fed', 'rates', 'inflation', 'futures', 'rally', 'decline', 'surplus', 'deficit', 'pipeline', 'refinery', 'inventory', 'earnings', 'revenue', 'growth', 'market', 'investment', 'ipo', 'stock', 'trading', 'prices'];
    const found: string[] = [];
    const text = (article.title + ' ' + (article.summary || '')).toLowerCase();

    for (const keyword of commodityFirst) {
        if (text.includes(keyword) && found.length < 5) {
            found.push(keyword.charAt(0).toUpperCase() + keyword.slice(1));
        }
    }

    return found.length > 0 ? found : ['Market Activity'];
};

const calculateSentiment = (article: NewsItem) => {
    // Use backend percentages if available
    if (typeof article.bullish === 'number' && typeof article.bearish === 'number') {
        return {
            bullish: article.bullish,
            bearish: article.bearish,
            neutral: article.neutral || (100 - article.bullish - article.bearish)
        };
    }

    // Fallback: calculate from sentiment label and score
    const sentimentType = article.sentiment?.toUpperCase() || 'NEUTRAL';
    const confidence = Math.min(Math.max(article.sentiment_score || 0.5, 0), 1);

    if (sentimentType === 'BULLISH') {
        const bullish = Math.round(confidence * 100);
        const remaining = 100 - bullish;
        return { bullish, bearish: Math.round(remaining * 0.3), neutral: Math.round(remaining * 0.7) };
    } else if (sentimentType === 'BEARISH') {
        const bearish = Math.round(confidence * 100);
        const remaining = 100 - bearish;
        return { bullish: Math.round(remaining * 0.3), bearish, neutral: Math.round(remaining * 0.7) };
    } else {
        return { bullish: 33, bearish: 33, neutral: 34 };
    }
};

// Detect commodity from article text
const detectCommodity = (text: string): string | null => {
    const s = text.toLowerCase();
    if (/(brent|wti|crude|oil|opec)/.test(s)) return 'OIL';
    if (/(nat\s?gas|natural gas|lng)/.test(s)) return 'NAT GAS';
    if (/(gold|bullion)/.test(s)) return 'GOLD';
    if (/(wheat|corn|soybean|soybeans)/.test(s)) return 'WHEAT';
    if (/(silver|copper|platinum)/.test(s)) return 'SILVER';
    return null;
};

// Generate trader insights based on sentiment
const generateTraderInsights = (sentimentProbs: { bullish: number; bearish: number; neutral: number }, keyDrivers: string[]): string[] => {
    const insights: string[] = [];
    const { bullish, bearish, neutral } = sentimentProbs;
    const dominant = Math.max(bullish, bearish, neutral);

    if (bullish === dominant && bullish > 40) {
        insights.push('Sentiment strongly favors bullish positioning');
    } else if (bearish === dominant && bearish > 40) {
        insights.push('Bearish sentiment dominates; exercise caution on long positions');
    } else if (neutral === dominant && neutral > 50) {
        insights.push('Market sentiment is neutral/mixed');
    } else {
        insights.push('Sentiment is balanced across different perspectives');
    }

    insights.push('Consider momentum trades with defined risk parameters');

    if (keyDrivers.length > 0) {
        insights.push(`Key factors: ${keyDrivers.slice(0, 2).join(', ')}`);
    }

    return insights;
};

// Generate trade ideas based on sentiment and commodity
const generateTradeIdeas = (sentimentProbs: { bullish: number; bearish: number }, commodity: string | null): string[] => {
    const ideas: string[] = [];
    const { bullish, bearish } = sentimentProbs;

    if (bullish > bearish && bullish > 50) {
        if (commodity === 'OIL') {
            ideas.push('Consider long positions in crude oil futures if prices hold above key support');
            ideas.push('Monitor OPEC statements for confirmation of bullish outlook');
        } else if (commodity === 'GOLD') {
            ideas.push('Look for dips to accumulate gold exposure');
            ideas.push('Track USD weakness for additional upside confirmation');
        } else if (commodity === 'NAT GAS') {
            ideas.push('Consider seasonal long positions ahead of heating demand');
            ideas.push('Monitor storage levels for continued supply tightness');
        } else {
            ideas.push('Consider momentum trades with defined risk parameters');
            ideas.push('Look for breakout confirmations above resistance levels');
        }
    } else if (bearish > bullish && bearish > 50) {
        if (commodity === 'OIL') {
            ideas.push('Consider shorting crude oil futures if prices fall below support');
            ideas.push('Watch for oversupply signals from inventory reports');
        } else if (commodity === 'GOLD') {
            ideas.push('Consider reducing gold exposure on rallies');
            ideas.push('Monitor Fed rate path for further downside pressure');
        } else {
            ideas.push('Consider protective strategies or reduced exposure');
            ideas.push('Monitor support levels for potential breakdown');
        }
    } else {
        ideas.push('Wait for clearer directional signals before taking positions');
        ideas.push('Consider range-bound strategies until breakout occurs');
    }
    ideas.push('Watch for seasonal demand patterns in upcoming weeks');

    return ideas;
};

export default function AIAnalysisModal({ isOpen, onClose, article, onBookmark, isBookmarked }: AIAnalysisModalProps) {
    const [userVote, setUserVote] = useState<VoteType>(null);
    const [pollData, setPollData] = useState<PollData>({
        bullish: 0, bearish: 0, neutral: 0, total: 0,
        bullishPercent: 0, bearishPercent: 0, neutralPercent: 0
    });
    const [loadingVote, setLoadingVote] = useState(false);
    const [showTour, setShowTour] = useState(false);
    const [tourStep, setTourStep] = useState(0);

    // Tour steps (no emojis)
    const [tourMode, setTourMode] = useState<'full' | 'single'>('full');

    // Tour steps (no emojis)
    const tourSteps = [
        {
            title: 'Welcome to Integra Analysis',
            content: 'This AI-powered analysis helps you understand market sentiment and make informed trading decisions. Let\'s walk through the key features.'
        },
        {
            title: 'Summary',
            content: 'The Summary section provides an AI-generated synopsis highlighting the key points from the article, saving you time while ensuring you don\'t miss important details.'
        },
        {
            title: 'Sentiment Analysis',
            content: 'Our FinBERT model analyzes the text to determine bullish, bearish, or neutral sentiment with confidence scores. Higher percentages indicate stronger conviction.'
        },
        {
            title: 'Key Sentiment Drivers',
            content: 'These are the most significant keywords and factors identified by our NLP engine that are driving the sentiment for this article.'
        },
        {
            title: 'Market Impact & Trade Ideas',
            content: 'We assess the potential price impact based on historical patterns and provide actionable trade ideas for your consideration.'
        },
        {
            title: 'Community Sentiment Poll',
            content: 'Vote on how you feel about the story and see how other verified traders in our community are viewing the same news. Great for gauging market consensus!'
        }
    ];

    const handleTourNext = () => {
        if (tourStep < tourSteps.length - 1) {
            setTourStep(tourStep + 1);
        } else {
            setShowTour(false);
            setTourStep(0);
        }
    };

    const handleTourSkip = () => {
        setShowTour(false);
        setTourStep(0);
    };

    // Generate article ID from title
    const getArticleId = (title: string) => {
        return title.replace(/\s+/g, '-').toLowerCase().slice(0, 50);
    };

    // Reset poll state when article changes
    useEffect(() => {
        if (article) {
            // Reset to initial state before fetching new data
            setUserVote(null);
            setPollData({
                bullish: 0, bearish: 0, neutral: 0, total: 0,
                bullishPercent: 0, bearishPercent: 0, neutralPercent: 0
            });
        }
    }, [article?.title]);

    // Fetch poll data when modal opens
    useEffect(() => {
        if (isOpen && article) {
            fetchPollData();
        }
    }, [isOpen, article?.title]);

    const fetchPollData = async () => {
        if (!article?.title) return;

        const articleId = getArticleId(article.title);

        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();

            if (user) {
                // Get user's vote
                const { data: voteData } = await supabase
                    .from('sentiment_votes')
                    .select('vote')
                    .eq('article_id', articleId)
                    .eq('user_id', user.id)
                    .single();

                if (voteData) setUserVote(voteData.vote as VoteType);

                // Get poll results using RPC
                const { data: results } = await supabase.rpc('get_poll_results', { p_article_id: articleId });

                if (results && results.length > 0) {
                    const r = results[0];
                    const total = Number(r.total_votes) || 0;
                    setPollData({
                        bullish: Number(r.bullish_count) || 0,
                        bearish: Number(r.bearish_count) || 0,
                        neutral: Number(r.neutral_count) || 0,
                        total,
                        bullishPercent: total > 0 ? Math.round((r.bullish_count / total) * 100) : 0,
                        bearishPercent: total > 0 ? Math.round((r.bearish_count / total) * 100) : 0,
                        neutralPercent: total > 0 ? Math.round((r.neutral_count / total) * 100) : 0,
                    });
                }
            }
        } catch (error) {
            console.error('Error fetching poll:', error);
        }
    };

    const handleVote = async (vote: 'BULLISH' | 'BEARISH' | 'NEUTRAL') => {
        if (!article?.title) return;

        setLoadingVote(true);

        // Optimistic update
        const currentVote = userVote;
        setUserVote(vote);

        setPollData(prev => {
            const newData = { ...prev };

            // Remove previous vote if exists
            if (currentVote) {
                if (currentVote === 'BULLISH') newData.bullish = Math.max(0, newData.bullish - 1);
                if (currentVote === 'BEARISH') newData.bearish = Math.max(0, newData.bearish - 1);
                if (currentVote === 'NEUTRAL') newData.neutral = Math.max(0, newData.neutral - 1);
            } else {
                newData.total += 1;
            }

            // Add new vote
            if (vote === 'BULLISH') newData.bullish += 1;
            if (vote === 'BEARISH') newData.bearish += 1;
            if (vote === 'NEUTRAL') newData.neutral += 1;

            // Recalculate percentages
            const total = newData.total || 1; // Avoid division by zero
            newData.bullishPercent = Math.round((newData.bullish / total) * 100);
            newData.bearishPercent = Math.round((newData.bearish / total) * 100);
            newData.neutralPercent = Math.round((newData.neutral / total) * 100);

            return newData;
        });

        const articleId = getArticleId(article.title);

        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();

            if (user) {
                await supabase
                    .from('sentiment_votes')
                    .upsert({
                        user_id: user.id,
                        article_id: articleId,
                        article_title: article.title,
                        vote: vote,
                        updated_at: new Date().toISOString(),
                    });

                // Fetch real data in background to ensure consistency
                fetchPollData();
            }
        } catch (error) {
            console.error('Vote error:', error);
            setUserVote(null);
        } finally {
            setLoadingVote(false);
        }
    };

    if (!article) return null;

    const sentimentProbs = calculateSentiment(article);
    const keyDrivers = extractKeyDrivers(article);
    const confidence = (article.sentiment_score || 0.5).toFixed(2);
    const commodity = detectCommodity(article.title + ' ' + (article.summary || ''));

    // Use backend trader_insights if available, otherwise generate
    const insights = article.trader_insights;
    const hasGroqInsights = insights?.success && insights?.trader_summary;
    
    // Display trader insights - use Groq if available, otherwise generate
    const traderInsights = hasGroqInsights 
        ? [insights!.trader_summary!]
        : generateTraderInsights(sentimentProbs, keyDrivers);
    if (!hasGroqInsights && article.market_impact) {
        traderInsights.unshift(article.market_impact);
    }

    // Use backend trade_ideas if available (centori format: array of objects), otherwise generate
    let tradeIdeas: string[];
    if (article.trade_ideas && article.trade_ideas.length > 0) {
        // Convert centori's trade_ideas format to display strings
        tradeIdeas = article.trade_ideas.map((idea: any) => {
            if (typeof idea === 'string') return idea;
            return `${idea.direction || ''}: ${idea.rationale || ''} (${idea.risk_management || ''})`;
        });
    } else if (hasGroqInsights && insights?.action_considerations) {
        tradeIdeas = insights.action_considerations;
    } else {
        tradeIdeas = generateTradeIdeas(sentimentProbs, commodity);
    }

    // Display poll percentages (only show actual votes, no defaults)
    const displayBullish = pollData.bullishPercent;
    const displayBearish = pollData.bearishPercent;
    const displayNeutral = pollData.neutralPercent;

    const handleCopy = async () => {
        const text = `${article.title}\n\n${article.summary}\n\nSentiment: ${article.sentiment} (${confidence})\nSource: ${article.source}`;
        await navigator.clipboard.writeText(text);
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
                    />

                    <motion.div
                        initial={{ opacity: 0, y: '100%' }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed bottom-0 left-0 right-0 md:bottom-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-lg md:max-h-[85vh] z-50"
                    >
                        <div className="bg-[#1C1C1E] md:rounded-2xl rounded-t-2xl max-h-[85vh] overflow-y-auto">
                            {/* Header */}
                            <div className="sticky top-0 bg-[#1C1C1E] flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a] z-10">
                                <div className="flex items-center gap-2">
                                    <h2 className="text-lg font-semibold text-white">Integra Analysis</h2>
                                    <button onClick={() => { setTourMode('full'); setTourStep(0); setShowTour(true); }}>
                                        <Info size={16} className="text-zinc-500 hover:text-zinc-300 transition-colors" />
                                    </button>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button onClick={handleCopy} className="p-2 hover:bg-white/5 rounded-lg">
                                        <Copy size={18} className="text-zinc-400" />
                                    </button>
                                    <button onClick={() => onBookmark?.(article)} className="p-2 hover:bg-white/5 rounded-lg">
                                        <Bookmark size={18} className={isBookmarked ? 'fill-yellow-400 text-yellow-400' : 'text-zinc-400'} />
                                    </button>
                                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg">
                                        <X size={18} className="text-zinc-400" />
                                    </button>
                                </div>
                            </div>

                            <div className="p-4 space-y-6">
                                {/* Title + Source */}
                                <div>
                                    <h3 className="text-white font-semibold text-[17px] leading-tight mb-2">{article.title}</h3>
                                    <a href={article.url} target="_blank" rel="noopener noreferrer" className="text-[#4ECCA3] text-sm hover:underline">
                                        {article.source}
                                    </a>
                                </div>

                                {/* Summary */}
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-1 h-4 bg-[#4a9eff] rounded-full" />
                                        <h4 className="text-white font-semibold text-sm">Summary</h4>
                                    </div>
                                    <p className="text-[#EEEEEE] text-[13px] leading-relaxed">{article.summary}</p>
                                </div>

                                {/* Sentiment Bars */}
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="w-1 h-4 bg-[#4a9eff] rounded-full" />
                                        <h4 className="text-white font-semibold text-sm">Sentiment</h4>
                                    </div>
                                    <div className="space-y-3">
                                        {[
                                            { label: 'Bullish', value: sentimentProbs.bullish, color: '#4ECCA3' },
                                            { label: 'Bearish', value: sentimentProbs.bearish, color: '#F05454' },
                                            { label: 'Neutral', value: sentimentProbs.neutral, color: '#EAB308' },
                                        ].map((item) => (
                                            <div key={item.label} className="flex items-center justify-between">
                                                <span className="text-[13px] text-zinc-400 w-16">{item.label}</span>
                                                <div className="flex-1 mx-3 h-2 bg-[#2a2a2a] rounded-full overflow-hidden">
                                                    <div className="h-full rounded-full transition-all" style={{ width: `${item.value}%`, backgroundColor: item.color }} />
                                                </div>
                                                <span className="text-[13px] font-semibold w-10 text-right" style={{ color: item.color }}>{item.value}%</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="w-1 h-4 bg-[#4a9eff] rounded-full" />
                                        <h4 className="text-white font-semibold text-sm">Key Sentiment Drivers</h4>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {keyDrivers.map((driver, idx) => (
                                            <span key={idx} className="px-3 py-1.5 bg-[#EAB308] text-black text-[12px] rounded-lg font-medium">{driver}</span>
                                        ))}
                                    </div>
                                </div>

                                {/* Market Impact */}
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="w-1 h-4 bg-[#4a9eff] rounded-full" />
                                        <h4 className="text-white font-semibold text-sm">Market Impact</h4>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span
                                            className="px-3 py-1.5 text-black text-[12px] font-semibold rounded-lg"
                                            style={{ backgroundColor: '#EAB308' }}
                                        >
                                            {article.sentiment || 'NEUTRAL'}
                                        </span>
                                        <span className="text-[#EEEEEE] text-[13px]">Confidence: {confidence}</span>
                                    </div>
                                </div>

                                {/* What this means for Traders */}
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="w-1 h-4 bg-[#4ECCA3] rounded-full" />
                                        <h4 className="text-white font-semibold text-sm">What this means for Traders</h4>
                                        {hasGroqInsights && insights?.key_driver && (
                                            <span className="ml-auto text-xs bg-[#4ECCA3]/20 text-[#4ECCA3] px-2 py-0.5 rounded">
                                                {insights.key_driver}
                                            </span>
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        {traderInsights.map((insight, idx) => (
                                            <div key={idx} className="flex items-start gap-2">
                                                <span className="text-zinc-500">•</span>
                                                <span className="text-[13px] text-[#EEEEEE]">{insight}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Trade Ideas */}
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="w-1 h-4 bg-[#4ECCA3] rounded-full" />
                                        <h4 className="text-white font-semibold text-sm">Trade Ideas</h4>
                                    </div>
                                    <div className="space-y-2">
                                        {tradeIdeas.map((idea, idx) => (
                                            <div key={idx} className="flex items-start gap-2">
                                                <span className="text-zinc-500">•</span>
                                                <span className="text-[13px] text-[#EEEEEE]">{idea}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="bg-[#121212] rounded-xl p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="text-white font-semibold text-sm">SENTIMENT POLL</h4>
                                        <button onClick={() => { setTourMode('single'); setTourStep(5); setShowTour(true); }}>
                                            <Info size={16} className="text-zinc-500 hover:text-zinc-300 transition-colors" />
                                        </button>
                                    </div>
                                    <p className="text-zinc-400 text-sm mb-4">How do you feel about this story?</p>

                                    {!userVote ? (
                                        // Vote buttons
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleVote('BULLISH')}
                                                disabled={loadingVote}
                                                className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#4ECCA3]/10 border border-[#4ECCA3]/30 rounded-xl hover:bg-[#4ECCA3]/20 transition-colors"
                                            >
                                                <TrendingUp size={16} className="text-[#4ECCA3]" />
                                                <span className="text-[#4ECCA3] text-sm font-medium">Bullish</span>
                                            </button>
                                            <button
                                                onClick={() => handleVote('NEUTRAL')}
                                                disabled={loadingVote}
                                                className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#EAB308]/10 border border-[#EAB308]/30 rounded-xl hover:bg-[#EAB308]/20 transition-colors"
                                            >
                                                <ArrowRight size={16} className="text-[#EAB308]" />
                                                <span className="text-[#EAB308] text-sm font-medium">Neutral</span>
                                            </button>
                                            <button
                                                onClick={() => handleVote('BEARISH')}
                                                disabled={loadingVote}
                                                className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#F05454]/10 border border-[#F05454]/30 rounded-xl hover:bg-[#F05454]/20 transition-colors"
                                            >
                                                <TrendingDown size={16} className="text-[#F05454]" />
                                                <span className="text-[#F05454] text-sm font-medium">Bearish</span>
                                            </button>
                                        </div>
                                    ) : (
                                        // Poll results
                                        <div className="space-y-4">
                                            {/* Market Sentiment - Show only winning sentiment */}
                                            <div className="bg-[#1C1C1E] rounded-xl p-4 text-center">
                                                <p className="text-zinc-500 text-xs mb-2 tracking-wider">MARKET SENTIMENT</p>
                                                {(() => {
                                                    const winner = displayBullish > displayBearish && displayBullish > displayNeutral
                                                        ? { label: 'BULLISH', color: '#4ECCA3' }
                                                        : displayBearish > displayBullish && displayBearish > displayNeutral
                                                            ? { label: 'BEARISH', color: '#F05454' }
                                                            : { label: 'NEUTRAL', color: '#EAB308' };
                                                    return (
                                                        <div className="flex items-center justify-center gap-2">
                                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: winner.color }} />
                                                            <span className="text-white text-sm font-medium">{winner.label}</span>
                                                        </div>
                                                    );
                                                })()}
                                            </div>

                                            {/* Vote Results */}
                                            {[
                                                { key: 'BULLISH', label: 'Bullish', value: displayBullish, color: '#4ECCA3' },
                                                { key: 'NEUTRAL', label: 'Neutral', value: displayNeutral, color: '#EAB308' },
                                                { key: 'BEARISH', label: 'Bearish', value: displayBearish, color: '#F05454' },
                                            ].map((opt) => (
                                                <div
                                                    key={opt.key}
                                                    className={`rounded-xl p-3 ${userVote === opt.key ? 'border-2' : 'border border-[#2a2a2a]'}`}
                                                    style={{ borderColor: userVote === opt.key ? opt.color : undefined }}
                                                >
                                                    <div className="flex items-center justify-between mb-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-medium" style={{ color: opt.color }}>{opt.label}</span>
                                                            {userVote === opt.key && (
                                                                <span className="text-xs bg-white/10 px-2 py-0.5 rounded text-white">YOUR VOTE</span>
                                                            )}
                                                        </div>
                                                        <span className="text-sm font-semibold" style={{ color: opt.color }}>— {opt.value}%</span>
                                                    </div>
                                                    <div className="h-2 bg-[#2a2a2a] rounded-full overflow-hidden">
                                                        <div className="h-full rounded-full" style={{ width: `${opt.value}%`, backgroundColor: opt.color }} />
                                                    </div>
                                                </div>
                                            ))}

                                            {/* Who is voting */}
                                            <div className="bg-[#1C1C1E] rounded-xl p-4">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <span className="text-white text-sm font-medium">Who is voting?</span>
                                                </div>
                                                <div className="space-y-2 text-sm text-zinc-400">
                                                    {[
                                                        { role: 'Physical crude traders', pct: 0.30 },
                                                        { role: 'Financial traders', pct: 0.38 },
                                                        { role: 'Analysts', pct: 0.15 },
                                                        { role: 'Hedge funds', pct: 0.10 },
                                                        { role: 'Risk managers', pct: 0.07 },
                                                    ].map((voter, idx) => (
                                                        <div key={idx} className="flex justify-between">
                                                            <span><span className="text-[#4ECCA3]">•</span> {voter.role}:</span>
                                                            <span className="text-[#4ECCA3]">{Math.ceil(pollData.total * voter.pct)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Total votes */}
                                            <div className="text-center text-zinc-500 text-sm">
                                                {pollData.total} votes
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Tour Modal */}
                        <AnimatePresence>
                            {showTour && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="absolute inset-0 bg-black/80 flex items-center justify-center p-6 z-20"
                                    onClick={() => setShowTour(false)}
                                >
                                    <motion.div
                                        initial={{ scale: 0.9, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        exit={{ scale: 0.9, opacity: 0 }}
                                        onClick={(e) => e.stopPropagation()}
                                        className="bg-[#1C1C1E] rounded-2xl p-6 max-w-sm w-full border border-[#2a2a2a]"
                                    >
                                        {/* Progress dots - fancy like mobile (ONLY FOR FULL TOUR) */}
                                        {tourMode === 'full' && (
                                            <>
                                                <div className="flex items-center justify-center gap-1 mb-4">
                                                    {tourSteps.map((_, idx) => (
                                                        <div
                                                            key={idx}
                                                            className={`h-2 rounded-full transition-all duration-300 ${idx === tourStep
                                                                ? 'w-6 bg-[#4ECCA3]'
                                                                : idx < tourStep
                                                                    ? 'w-2 bg-[#4ECCA3]'
                                                                    : 'w-2 bg-zinc-600'
                                                                }`}
                                                        />
                                                    ))}
                                                </div>
                                                <p className="text-zinc-500 text-sm text-center mb-6">
                                                    {tourStep + 1} of {tourSteps.length}
                                                </p>
                                            </>
                                        )}

                                        <h3 className="text-white text-xl font-bold text-center mb-3">
                                            {tourSteps[tourStep].title}
                                        </h3>
                                        <p className="text-zinc-400 text-sm text-center leading-relaxed mb-6">
                                            {tourSteps[tourStep].content}
                                        </p>

                                        {/* Skip and Next buttons (Full Mode) OR Got it button (Single Mode) */}
                                        {tourMode === 'full' ? (
                                            <div className="flex gap-3">
                                                <button
                                                    onClick={handleTourSkip}
                                                    className="flex-1 py-3 bg-zinc-700 hover:bg-zinc-600 rounded-xl text-white font-medium transition-colors"
                                                >
                                                    Skip
                                                </button>
                                                <button
                                                    onClick={handleTourNext}
                                                    className="flex-1 py-3 bg-[#4ECCA3] hover:bg-[#3dbb94] rounded-xl text-black font-medium transition-colors flex items-center justify-center gap-2"
                                                >
                                                    {tourStep < tourSteps.length - 1 ? 'Next' : 'Done'}
                                                    {tourStep < tourSteps.length - 1 && <span>→</span>}
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setShowTour(false)}
                                                className="w-full py-3 bg-[#4ECCA3] hover:bg-[#3dbb94] rounded-xl text-black font-medium transition-colors"
                                            >
                                                Got it
                                            </button>
                                        )}
                                    </motion.div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
