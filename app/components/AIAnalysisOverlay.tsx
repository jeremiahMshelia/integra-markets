import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Platform, Clipboard, Alert, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import { useBookmarks } from '../providers/BookmarkProvider';
import { sentimentApi } from '../services/api';
import { supabaseService } from '../services/supabaseService';

interface NewsData {
    title?: string;
    headline?: string;  // TodayDashboard uses headline
    summary: string;
    fullSummary?: string; // Full untruncated summary for overlay
    source: string;
    sourceUrl?: string;
    timeAgo?: string;
    sentiment: string;
    sentimentScore: number;
    // Backend preprocessing data
    bullish?: number;
    bearish?: number;
    neutral?: number;
    market_impact?: string;
    trade_ideas?: string[];
    event_type?: string;
    severity?: string;
    // Backend keywords from API
    keywords?: { word: string; score?: number; sentiment?: string }[];
    analysis?: {
        bulls: number;
        bears: number;
        neuts: number;
        keywords: { word: string; score: number }[];
        impact: string;
        confidence: number;
    };
}

interface AIAnalysisOverlayProps {
    newsData?: NewsData | null;
    news?: NewsData | null;  // TodayDashboard uses 'news' prop
    isVisible: boolean;
    onClose: () => void;
}

const AIAnalysisOverlay: React.FC<AIAnalysisOverlayProps> = ({ newsData: newsDataProp, news, isVisible, onClose }) => {
    // Support both prop names
    // Support both prop names and unwrap originalArticle if present (from Alerts)
    let rawNews: any = newsDataProp || news;
    if (rawNews?.originalArticle) {
        rawNews = {
            ...rawNews.originalArticle,
            ...rawNews,
            keywords: rawNews.originalArticle.keywords || rawNews.keywords,
            summary: rawNews.originalArticle.summary || rawNews.message || rawNews.summary,
            title: rawNews.originalArticle.title || rawNews.title,
        };
    }
    const newsData = rawNews;
    // Normalize title field (TodayDashboard uses 'headline')
    const normalizedNewsData = newsData ? {
        ...newsData,
        title: newsData.title || newsData.headline || ''
    } : null;
    const [userVote, setUserVote] = useState<'BULLISH' | 'BEARISH' | 'NEUTRAL' | null>(null);
    const { addBookmark, removeBookmark, isBookmarked, bookmarks } = useBookmarks();
    const [analysis, setAnalysis] = useState<{
        summary: string;
        finBertSentiment: { bullish: number; bearish: number; neutral: number };
        keyDrivers: { text: string; score: number }[];
        marketImpact: { level: string; confidence: number };
        traderInsights: string[];
        tradeIdeas: string[];
        totalVotes: number;
    } | null>(null);
    const [loading, setLoading] = useState(false);

    // Tour guide state
    const [showTour, setShowTour] = useState(false);
    const [tourStep, setTourStep] = useState(0);
    const [tourMode, setTourMode] = useState<'full' | 'single'>('full');
    const TOUR_STORAGE_KEY = '@integra_analysis_tour_completed';

    // Tour guide content (no emojis)
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
            content: 'Our sentiment engine analyzes the text to determine bullish, bearish, or neutral sentiment with confidence scores. Higher percentages indicate stronger conviction.'
        },
        {
            title: 'Key Sentiment Drivers',
            content: 'These are the most significant keywords and factors identified by our NLP engine that are driving the sentiment for this article.'
        },
        {
            title: 'Market Impact',
            content: 'We assess the potential price impact based on historical patterns.'
        },
        {
            title: 'Community Sentiment Poll',
            content: 'Vote on how you feel about the story and see how other verified traders in our community are viewing the same news. Great for gauging market consensus!'
        }
    ];

    // Check if tour was completed on mount
    useEffect(() => {
        const checkTourStatus = async () => {
            try {
                const completed = await AsyncStorage.getItem(TOUR_STORAGE_KEY);
                if (!completed && isVisible) {
                    setTourMode('full');
                    setShowTour(true);
                    setTourStep(0);
                }
            } catch (e) {
                console.log('Tour check error:', e);
            }
        };
        if (isVisible) {
            checkTourStatus();
        }
    }, [isVisible]);

    const handleTourNext = () => {
        if (tourStep < tourSteps.length - 1) {
            setTourStep(tourStep + 1);
        } else {
            // Tour completed
            completeTour();
        }
    };

    const completeTour = async () => {
        try {
            await AsyncStorage.setItem(TOUR_STORAGE_KEY, 'true');
            setShowTour(false);
            setTourStep(0);
        } catch (e) {
            console.log('Tour save error:', e);
            setShowTour(false);
        }
    };

    const handleTourDismiss = () => {
        if (tourMode === 'single') {
            setShowTour(false);
        } else {
            completeTour();
        }
    };

    // Poll State
    const [pollData, setPollData] = useState({
        bullish: 0,
        bearish: 0,
        neutral: 0,
        total: 0,
        bullishPercent: 0,
        bearishPercent: 0,
        neutralPercent: 0
    });

    // Fetch poll data when overlay opens or news changes
    useEffect(() => {
        if (isVisible && newsData) {
            fetchPollData();
        }
    }, [isVisible, newsData]);

    const fetchPollData = async () => {
        if (!newsData?.title) return;

        // Generate a consistent ID for the article (using title hash or similar if no ID provided)
        // For now using title as ID since it's unique enough for this demo
        const articleId = newsData.title.replace(/\s+/g, '-').toLowerCase().slice(0, 50);

        try {
            // Get current user's vote
            const myVote = await supabaseService.getUserVote(articleId);
            if (myVote) setUserVote(myVote);

            // Get all votes
            const results = await supabaseService.getPollResults(articleId);

            if (results && results.total > 0) {
                setPollData(results);
            } else if (analysis) {
                // If no real votes yet, fallback to AI sentiment as the "initial seed"
                // But visualized as 0 total votes so users know they are first
                setPollData({
                    bullish: 0,
                    bearish: 0,
                    neutral: 0,
                    total: 0,
                    bullishPercent: analysis?.finBertSentiment?.bullish || 0,
                    bearishPercent: analysis?.finBertSentiment?.bearish || 0,
                    neutralPercent: analysis?.finBertSentiment?.neutral || 0
                });
            }
        } catch (error) {
            console.error('Error fetching poll data:', error);
        }
    };

    const handleVote = async (vote: 'BULLISH' | 'BEARISH' | 'NEUTRAL') => {
        if (!newsData?.title) return;

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
            const total = newData.total || 1;
            newData.bullishPercent = Math.round((newData.bullish / total) * 100);
            newData.bearishPercent = Math.round((newData.bearish / total) * 100);
            newData.neutralPercent = Math.round((newData.neutral / total) * 100);

            return newData;
        });

        const articleId = newsData.title.replace(/\s+/g, '-').toLowerCase().slice(0, 50);

        // Submit vote
        const result = await supabaseService.submitPollVote(articleId, newsData.title, vote);

        if (result.success) {
            // Refresh results
            await fetchPollData();
        } else {
            Alert.alert('Error', result.error || 'Failed to submit vote');
            setUserVote(null); // Revert on failure
        }
    };

    // Calculate display values - mix of AI sentiment (if no votes) or Real Votes
    const displayBullish = pollData.total > 0 ? pollData.bullishPercent : (analysis?.finBertSentiment?.bullish || 0);
    const displayBearish = pollData.total > 0 ? pollData.bearishPercent : (analysis?.finBertSentiment?.bearish || 0);
    const displayNeutral = pollData.total > 0 ? pollData.neutralPercent : (analysis?.finBertSentiment?.neutral || 0);


    const isCurrentlyBookmarked = newsData ? isBookmarked(newsData.title || '') : false;

    const handleBookmarkToggle = async () => {
        if (!newsData || !analysis) return;

        try {
            if (isCurrentlyBookmarked) {
                const bookmarkToRemove = bookmarks.find((b: any) => b.title === (newsData.title || ''));
                if (bookmarkToRemove) {
                    await removeBookmark(bookmarkToRemove.id);
                    Alert.alert('Removed', 'Analysis removed from bookmarks');
                }
            } else {
                await addBookmark({
                    title: newsData.title || '',
                    summary: analysis.summary,
                    source: newsData.source,
                    url: newsData.sourceUrl || '', // Pass URL so article_id matches web
                    sentiment: analysis.finBertSentiment.bullish > analysis.finBertSentiment.bearish
                        ? (analysis.finBertSentiment.bullish > analysis.finBertSentiment.neutral ? 'BULLISH' : 'NEUTRAL')
                        : (analysis.finBertSentiment.bearish > analysis.finBertSentiment.neutral ? 'BEARISH' : 'NEUTRAL'),
                    sentimentScore: Math.max(
                        analysis.finBertSentiment.bullish,
                        analysis.finBertSentiment.bearish,
                        analysis.finBertSentiment.neutral
                    ) / 100
                });
                Alert.alert('Saved', 'AI Analysis saved to bookmarks');
            }
        } catch (error) {
            console.error('Error toggling bookmark:', error);
            Alert.alert('Error', 'Failed to update bookmark. Please try again.');
        }
    };

    useEffect(() => {
        const analyze = async () => {
            if (!isVisible || !newsData) return;
            try {
                setLoading(true);
                const NOISY = /(^|\s)(nyse|nasdaq|tsx|lse|asx|amex|otc|inc|corp|ltd|llc|plc|company|group|holdings|press|newswire|globe\s*newswire|reddit|benzinga|marketwatch|reuters|bloomberg|token|presale|airdrop|city|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)(\s|$)/i;
                const LEXICON = new Set([
                    'rate', 'rates', 'cut', 'hike', 'yield', 'yields', 'treasury', 'treasuries', 'bond', 'bonds', 'interest',
                    'cpi', 'ppi', 'inflation', 'disinflation', 'deflation', 'deflator', 'gdp', 'jobs', 'unemployment', 'payrolls', 'pmi', 'ism',
                    'guidance', 'earnings', 'revenue', 'margin', 'margins', 'buyback', 'dividend', 'valuation', 'liquidity', 'volatility',
                    'recession', 'growth', 'outlook', 'forecast', 'upgrade', 'downgrade', 'opec', 'inventory', 'supply', 'demand', 'production',
                    'exports', 'import', 'sanctions', 'geopolitical', 'risk', 'etf', 'inflows', 'outflows', 'ipo', 'listing', 'merger', 'acquisition',
                    'deal', 'approval', 'sec', 'regulator', 'policy', 'dovish', 'hawkish', 'fed', 'federal', 'reserve', 'powell', 'dot', 'dots',
                    'curve', 'flattening', 'steepening', 'oil', 'gas', 'gold', 'wheat', 'copper', 'silver', 'commodities', 'fx', 'usd', 'dxy',
                    'equities', 'stocks', 'index', 'bitcoin', 'ethereum', 'xrp', 'altcoins', 'crypto', 'bullish', 'bearish', 'signal', 'signals',
                    'indicator', 'indicators', 'alert', 'alerts', 'inflow', 'outflow', 'share', 'shares', 'price', 'prices', 'volume', 'volumes',
                    'breakout', 'support', 'resistance', 'options', 'futures', 'spot', 'intraday', 'trend', 'momentum', 'credit', 'spread', 'spreads',
                    'cash', 'debt', 'yoy', 'qoq'
                ]);
                // Extract individual keywords instead of phrases for cleaner UI
                const extractSingleKeywords = (text: string): { text: string; score: number }[] => {
                    const txt = (text || '').toLowerCase();
                    const words = txt.match(/[a-z]{3,}/g) || [];
                    const counts: Record<string, number> = {};
                    words.forEach(w => {
                        if (LEXICON.has(w) && !NOISY.test(w)) {
                            counts[w] = (counts[w] || 0) + 1;
                        }
                    });
                    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
                    return sorted.slice(0, 8).map(([word, count], idx) => ({
                        text: word.charAt(0).toUpperCase() + word.slice(1),
                        score: Math.round((0.9 - idx * 0.05) * 100) / 100
                    }));
                };
                const acceptStrict = (phrase: { text: string; score: number }) => {
                    const t = phrase.text.toLowerCase().trim();
                    if (NOISY.test(t)) return false; // drop boilerplate
                    // Accept single finance words
                    if (LEXICON.has(t)) return true;
                    if (!/\s/.test(t)) return t.length >= 4; // single word, min length
                    const toks = t.split(/\s+/);
                    if (toks.length < 2) return false;
                    // require at least one finance lexicon token
                    if (!toks.some(w => LEXICON.has(w))) return false;
                    // min length after removing spaces
                    if (t.replace(/\s+/g, '').length < 6) return false;
                    return true;
                };
                const acceptRelaxed = (phrase: { text: string; score: number }) => {
                    const t = phrase.text.toLowerCase().trim();
                    if (NOISY.test(t)) return false;
                    if (t.length >= 4) return true;
                    return true;
                };
                const extractFromText = (t: string) => {
                    const txt = (t || '').toLowerCase().replace(/[’']/g, ' ').replace(/[^a-z\s\-]/g, ' ').replace(/\s+/g, ' ').trim();
                    const toks = txt.split(' ');
                    const sw = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'over', 'after', 'before', 'under', 'between', 'by', 'on', 'in', 'to', 'of', 'as', 'at', 'be', 'is', 'are', 'was', 'were', 'has', 'have', 'had', 'will', 'would', 'could', 'should', 'may', 'might', 'a', 'an', 'both', 'what', 'we', 'here', 'today']);
                    const words = toks.filter(w => w.length >= 3 && !sw.has(w));
                    // split into segments around NOISY tokens
                    const segments: string[][] = [];
                    let buf: string[] = [];
                    for (const w of words) {
                        if (NOISY.test(' ' + w + ' ')) { if (buf.length) { segments.push(buf); buf = []; } continue; }
                        buf.push(w);
                    }
                    if (buf.length) segments.push(buf);
                    const PHRASE_NOISE: RegExp[] = [
                        /\bwhat\s+s?the\b/i,
                        /\bwe\s+noticed\s+today\b/i,
                        /\binvestors\s+with\s+a\s+lot\s+of\s+money\b/i,
                        /\bleaving\s+traders\b/i,
                    ];
                    const jaccard = (a: string, b: string) => {
                        const A = new Set(a.split(' '));
                        const B = new Set(b.split(' '));
                        let inter = 0; A.forEach(x => { if (B.has(x)) inter++; });
                        const union = new Set([...A, ...B]).size || 1;
                        return inter / union;
                    };
                    const cands: { text: string; score: number }[] = [];
                    for (const seg of segments) {
                        for (let n = 2; n <= 4; n++) {
                            if (seg.length < n) continue;
                            for (let i = 0; i <= seg.length - n; i++) {
                                const gram = seg.slice(i, i + n);
                                const phrase = gram.join(' ');
                                if (phrase.length > 42) continue;
                                if (PHRASE_NOISE.some(rx => rx.test(phrase))) continue;
                                const hasLex = gram.some(w => LEXICON.has(w));
                                if (!hasLex) continue;
                                let score = 0.5 + 0.1 * (n - 2);
                                if (hasLex) score += 0.2;
                                score = Math.max(0.5, Math.min(1, score));
                                cands.push({ text: phrase, score });
                            }
                        }
                    }
                    // sort, clamp and dedup similar
                    cands.sort((a, b) => b.score - a.score);
                    const out: { text: string; score: number }[] = [];
                    for (const c of cands) {
                        if (out.some(o => jaccard(o.text, c.text) >= 0.7)) continue;
                        out.push(c);
                        if (out.length >= 5) break;
                    }
                    return out;
                };

                // Extended noise words including months, generic terms, ordinals
                const NOISE_WORDS = new Set([
                    // Months
                    'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
                    'september', 'october', 'november', 'december',
                    'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
                    // Days
                    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
                    // Generic words
                    'estimated', 'principal', 'redemption', 'aggregate', 'approximately', 'including',
                    'payment', 'amount', 'total', 'based', 'according', 'expected', 'announced',
                    'said', 'year', 'years', 'month', 'months', 'week', 'weeks', 'day', 'days',
                    'first', 'second', 'third', 'fourth', 'fifth', 'last', 'next', 'previous',
                    'quarter', 'annual', 'percent', 'million', 'billion', 'trillion', 'thousand',
                    'company', 'companies', 'just', 'about', 'also', 'been', 'being', 'more', 'most',
                    'other', 'some', 'such', 'than', 'them', 'then', 'there', 'these', 'they',
                    'time', 'very', 'when', 'where', 'which', 'while', 'will', 'with', 'your',
                    'would', 'could', 'should', 'might', 'must', 'shall', 'each', 'every', 'many',
                    'stock', 'stocks', 'investor', 'investors', 'market', 'markets', 'trading',
                    'update', 'news', 'report', 'reports', 'article', 'source', 'sources',
                    'around', 'against', 'within', 'without', 'through', 'during', 'before', 'after',
                    'like', 'make', 'made', 'take', 'took', 'come', 'came', 'give', 'gave',
                    'know', 'knew', 'think', 'thought', 'look', 'see', 'saw', 'seen', 'find', 'found',
                    'want', 'need', 'use', 'used', 'using', 'work', 'working', 'good', 'best', 'better',
                    'high', 'higher', 'highest', 'low', 'lower', 'lowest', 'new', 'old', 'long', 'short',
                    'large', 'larger', 'small', 'smaller', 'big', 'bigger', 'great', 'greater',
                    'available', 'possible', 'recent', 'current', 'future', 'past', 'present'
                ]);

                const pickDrivers = (arr: { text: string; score: number }[], textForFallback?: string) => {
                    // First priority: Use backend keywords if they're finance-relevant
                    const sorted = [...arr].sort((x, y) => (y.score - x.score));
                    const seen = new Set<string>();
                    const result: { text: string; score: number }[] = [];

                    for (const d of sorted) {
                        // Split multi-word phrases into individual words
                        const words = d.text.toLowerCase().trim().split(/\s+/);

                        for (const word of words) {
                            if (word.length < 3) continue;
                            if (seen.has(word)) continue;
                            if (NOISE_WORDS.has(word)) continue;
                            if (NOISY.test(word)) continue;

                            // Only accept if it's in our finance lexicon
                            if (LEXICON.has(word)) {
                                seen.add(word);
                                result.push({
                                    text: word.charAt(0).toUpperCase() + word.slice(1),
                                    score: d.score
                                });
                                if (result.length >= 5) break;
                            }
                        }
                        if (result.length >= 5) break;
                    }

                    // If we have enough, return
                    if (result.length >= 3) return result;

                    // Second priority: Extract from text using strict lexicon matching
                    if (textForFallback) {
                        const singleKeywords = extractSingleKeywords(textForFallback);
                        for (const kw of singleKeywords) {
                            const word = kw.text.toLowerCase();
                            if (!seen.has(word) && !NOISE_WORDS.has(word)) {
                                seen.add(word);
                                result.push(kw);
                            }
                            if (result.length >= 5) break;
                        }
                    }

                    // If still not enough, add generic commodity terms based on content
                    if (result.length < 2 && textForFallback) {
                        const txt = textForFallback.toLowerCase();
                        const commodityTerms = [
                            { test: /oil|crude|brent|wti|petroleum/i, term: 'Oil' },
                            { test: /gold|bullion|precious/i, term: 'Gold' },
                            { test: /gas|lng|natural/i, term: 'Gas' },
                            { test: /wheat|corn|grain|soybean/i, term: 'Grain' },
                            { test: /copper|silver|metal/i, term: 'Metals' },
                            { test: /supply|shortage|inventory/i, term: 'Supply' },
                            { test: /demand|consumption/i, term: 'Demand' },
                            { test: /price|pricing|cost/i, term: 'Pricing' },
                            { test: /rate|interest|yield/i, term: 'Rates' },
                            { test: /inflation|cpi|ppi/i, term: 'Inflation' },
                        ];
                        for (const ct of commodityTerms) {
                            if (ct.test.test(txt) && !seen.has(ct.term.toLowerCase())) {
                                seen.add(ct.term.toLowerCase());
                                result.push({ text: ct.term, score: 0.7 });
                            }
                            if (result.length >= 5) break;
                        }
                    }

                    return result;
                };

                // Generate trade ideas based on sentiment and commodity
                const generateTradeIdeas = (bulls: number, bears: number, comm: string | null): string[] => {
                    const ideas: string[] = [];
                    if (bulls > bears && bulls > 50) {
                        if (comm === 'OIL') {
                            ideas.push('Consider long positions in crude oil futures if prices hold above key support');
                            ideas.push('Monitor OPEC statements for confirmation of bullish outlook');
                        } else if (comm === 'GOLD') {
                            ideas.push('Look for dips to accumulate gold exposure');
                            ideas.push('Track USD weakness for additional upside confirmation');
                        } else if (comm === 'NAT GAS') {
                            ideas.push('Consider seasonal long positions ahead of heating demand');
                            ideas.push('Monitor storage levels for continued supply tightness');
                        } else {
                            ideas.push('Consider momentum trades with defined risk parameters');
                            ideas.push('Look for breakout confirmations above resistance levels');
                        }
                    } else if (bears > bulls && bears > 50) {
                        if (comm === 'OIL') {
                            ideas.push('Consider shorting crude oil futures if prices fall below support');
                            ideas.push('Watch for oversupply signals from inventory reports');
                        } else if (comm === 'GOLD') {
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
                // If precomputed analysis is available, use it to ensure exact match with the card
                const fullText = `${newsData.title}. ${newsData.fullSummary || newsData.summary || ''}`.trim();
                const text = fullText;
                const guessCommodity = (t: string): string | null => {
                    const s = t.toLowerCase();
                    if (/(brent|wti|crude|oil)/.test(s)) return 'OIL';
                    if (/(nat\s?gas|natural gas|lng)/.test(s)) return 'NAT GAS';
                    if (/(gold|bullion)/.test(s)) return 'GOLD';
                    if (/(wheat|corn|soybean|soybeans)/.test(s)) return 'WHEAT';
                    if (/(silver|copper|platinum)/.test(s)) return 'GOLD';
                    return null;
                };
                const commodity = guessCommodity(text);

                // Use backend percentages if available, otherwise calculate from score
                const getSentimentPercentages = () => {
                    // First check if backend provided percentages directly
                    if (typeof newsData.bullish === 'number' && typeof newsData.bearish === 'number') {
                        return {
                            bullish: newsData.bullish,
                            bearish: newsData.bearish,
                            neutral: newsData.neutral || (100 - newsData.bullish - newsData.bearish)
                        };
                    }

                    // Fallback: calculate from sentiment label and score
                    const sentimentType = (newsData.sentiment || 'NEUTRAL').toUpperCase();
                    const confidence = Math.min(Math.max(newsData.sentimentScore || 0.5, 0), 1);

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

                const webSentiment = getSentimentPercentages();

                // Use backend keywords directly (matching web behavior)
                const getDirectKeywords = (): { text: string; score: number }[] => {
                    // First check if article has top-level keywords from backend
                    if (newsData.keywords && newsData.keywords.length > 0) {
                        return newsData.keywords.map((k: any) => ({
                            text: k.word,
                            score: k.score || 0.9
                        }));
                    }
                    // Fall back to analysis keywords
                    if (newsData.analysis?.keywords && newsData.analysis.keywords.length > 0) {
                        return newsData.analysis.keywords.map((k: any) => ({
                            text: k.word,
                            score: k.score || 0.9
                        }));
                    }
                    return [];
                };

                // Get direct keywords from backend
                const directDrivers = getDirectKeywords();

                // If we have backend/pre-computed data, use it
                if (newsData.analysis && typeof newsData.analysis.bulls === 'number') {
                    const a = newsData.analysis;
                    // Use keywords directly without complex filtering
                    const drivers = directDrivers.length > 0
                        ? directDrivers
                        : pickDrivers(
                            a.keywords.map((k: any) => ({ text: String((k as any).word ?? ''), score: Number((k as any).score ?? 0) })),
                            fullText
                        );

                    // Use web-style sentiment calculation for consistent bars
                    const bulls = webSentiment.bullish;
                    const bears = webSentiment.bearish;
                    const neuts = webSentiment.neutral;
                    const level = a.impact || 'MEDIUM';
                    const conf = typeof a.confidence === 'number' ? a.confidence : newsData.sentimentScore;

                    const insights: string[] = [];
                    const dominant = Math.max(bulls, bears, neuts);
                    if (bulls === dominant && bulls > 40) insights.push('Sentiment strongly favors bullish positioning');
                    else if (bears === dominant && bears > 40) insights.push('Bearish sentiment dominates; exercise caution on long positions');
                    else if (neuts === dominant && neuts > 50) insights.push('Market sentiment is neutral/mixed');
                    else insights.push('Sentiment is balanced across different perspectives');
                    if (newsData.market_impact) insights.push(newsData.market_impact);
                    if (drivers.length > 0) insights.push(`Key factors: ${drivers.slice(0, 2).map(d => d.text).join(', ')}`);

                    // Use backend trade_ideas if available
                    const tradeIdeas = newsData.trade_ideas && newsData.trade_ideas.length > 0
                        ? newsData.trade_ideas
                        : generateTradeIdeas(bulls, bears, commodity);

                    setAnalysis({
                        summary: newsData.fullSummary || newsData.summary,
                        finBertSentiment: { bullish: bulls, bearish: bears, neutral: neuts },
                        keyDrivers: drivers,
                        marketImpact: { level, confidence: conf },
                        traderInsights: insights,
                        tradeIdeas: tradeIdeas,
                        totalVotes: Math.floor(Math.random() * 500) + 500, // Simulated total votes
                    });
                    return; // Skip network call to keep numbers identical to the card
                }

                // No pre-computed analysis - use web-style calculation based on sentiment/score
                const bulls = webSentiment.bullish;
                const bears = webSentiment.bearish;
                const neuts = webSentiment.neutral;

                // Use direct keywords from backend or fallback to Web-consistent logic
                let drivers = directDrivers;
                if (drivers.length === 0) {
                    const webKeywords = ['earnings', 'revenue', 'growth', 'oil', 'gas', 'market', 'investment', 'ipo', 'stock', 'trading', 'crude', 'prices', 'fed', 'rates', 'opec', 'battery', 'lithium', 'ev', 'vehicle', 'electric', 'copper', 'mining', 'supply', 'demand', 'inflation', 'yield', 'bond', 'gold', 'silver', 'tech', 'ai'];
                    const found: { text: string; score: number }[] = [];
                    const text = (fullText || '').toLowerCase();
                    for (const k of webKeywords) {
                        if (text.includes(k) && found.length < 3) {
                            found.push({ text: k.charAt(0).toUpperCase() + k.slice(1), score: 0.9 });
                        }
                    }
                    drivers = found.length > 0 ? found : [{ text: 'Market Activity', score: 0.5 }];
                }
                const level = newsData.sentimentScore > 0.7 ? 'HIGH' : newsData.sentimentScore > 0.4 ? 'MEDIUM' : 'LOW';
                const conf = newsData.sentimentScore || 0.5;
                const insights: string[] = [];

                // Add market impact from backend FIRST (if available)
                if (newsData.market_impact) {
                    insights.push(newsData.market_impact);
                }

                // Generate meaningful insights based on the analysis
                const dominant = Math.max(bulls, bears, neuts);
                if (bulls === dominant && bulls > 40) {
                    insights.push('Sentiment strongly favors bullish positioning');
                    insights.push('Consider momentum trades with defined risk parameters');
                } else if (bears === dominant && bears > 40) {
                    insights.push('Bearish sentiment dominates; exercise caution on long positions');
                    insights.push('Monitor support levels and consider protective strategies');
                } else if (neuts === dominant && neuts > 50) {
                    insights.push('Market sentiment is neutral/mixed');
                    insights.push('Wait for clearer directional signals before taking positions');
                } else {
                    insights.push('Sentiment is balanced across different perspectives');
                }

                // Add commodity-specific insight if available
                const comm = commodity?.toUpperCase();
                if (comm === 'OIL') {
                    insights.push('Monitor OPEC decisions and inventory reports');
                } else if (comm === 'GOLD') {
                    insights.push('Track USD strength and inflation expectations');
                } else if (comm === 'NAT GAS') {
                    insights.push('Weather forecasts and storage data are key drivers');
                } else if (comm === 'WHEAT') {
                    insights.push('Global harvest reports and weather patterns impact prices');
                }

                if (drivers.length > 0) {
                    const topDrivers = drivers.slice(0, 2).map(d => d.text).join(', ');
                    insights.push(`Key factors: ${topDrivers}`);
                }

                // Use backend trade_ideas if available, otherwise generate
                const tradeIdeas = newsData.trade_ideas && newsData.trade_ideas.length > 0
                    ? newsData.trade_ideas
                    : generateTradeIdeas(bulls, bears, commodity);

                setAnalysis({
                    summary: newsData.fullSummary || newsData.summary,
                    finBertSentiment: { bullish: bulls, bearish: bears, neutral: neuts },
                    keyDrivers: drivers,
                    marketImpact: { level, confidence: conf },
                    traderInsights: insights,
                    tradeIdeas: tradeIdeas,
                    totalVotes: Math.floor(Math.random() * 500) + 500, // Simulated total votes
                });
            } catch (e) {
                console.error('Overlay analysis failed:', e);
                // Fallback: use card sentiment but generate proper distribution
                const sent = (newsData.sentiment || 'NEUTRAL').toUpperCase();
                const score = parseFloat(newsData.sentimentScore as any) || 0.5;
                const conf = Math.max(0.5, Math.min(1, score)); // Clamp between 0.5 and 1

                let fallbackBulls = 33;
                let fallbackBears = 33;
                let fallbackNeutral = 34;

                if (sent === 'BULLISH') {
                    fallbackBulls = Math.round(conf * 100);
                    fallbackBears = Math.round((1 - conf) * 30);
                    fallbackNeutral = 100 - fallbackBulls - fallbackBears;
                } else if (sent === 'BEARISH') {
                    fallbackBears = Math.round(conf * 100);
                    fallbackBulls = Math.round((1 - conf) * 30);
                    fallbackNeutral = 100 - fallbackBulls - fallbackBears;
                } else {
                    fallbackNeutral = 60;
                    fallbackBulls = 20;
                    fallbackBears = 20;
                }

                setAnalysis({
                    summary: newsData.fullSummary || newsData.summary,
                    finBertSentiment: { bullish: fallbackBulls, bearish: fallbackBears, neutral: fallbackNeutral },
                    keyDrivers: [],
                    marketImpact: { level: conf > 0.7 ? 'MEDIUM' : 'LOW', confidence: conf },
                    traderInsights: [`Analysis based on article sentiment: ${sent}`, 'Full sentiment analysis temporarily unavailable'],
                    tradeIdeas: ['Wait for detailed analysis to be available', 'Consider market conditions before trading'],
                    totalVotes: Math.floor(Math.random() * 200) + 100, // Simulated total votes
                });
            } finally {
                setLoading(false);
            }
        };
        analyze();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isVisible, newsData?.title, newsData?.summary]);

    useEffect(() => {
        if (!isVisible) {
            setUserVote(null);
            return;
        }
        // When a new article is opened in the overlay, reset any previous vote
        setUserVote(null);
    }, [isVisible, newsData?.title]);

    if (!newsData) return null;

    const copyToClipboard = (text: string, sectionName: string) => {
        Clipboard.setString(text);
        Alert.alert('Copied!', `${sectionName} copied to clipboard`);
    };

    const formatAnalysisForCopy = () => {
        const sentiment = `Bullish: ${analysisData.finBertSentiment.bullish}%, Bearish: ${analysisData.finBertSentiment.bearish}%, Neutral: ${analysisData.finBertSentiment.neutral}%`;
        const drivers = analysisData.keyDrivers.map(d => `${d.text} (${d.score})`).join(', ');
        return `INTEGRA AI ANALYSIS\n\nArticle: ${newsData.title}\nSource: ${newsData.source}\n\nSUMMARY:\n${analysisData.summary}\n\nSENTIMENT:\n${sentiment}\n\nKEY DRIVERS:\n${drivers}\n\nMARKET IMPACT:\n${analysisData.marketImpact.level} (Confidence: ${analysisData.marketImpact.confidence})`;
    };

    const analysisData = analysis || {
        summary: newsData.fullSummary || newsData.summary,
        finBertSentiment: {
            bullish: (newsData.sentiment?.toUpperCase() === 'BULLISH' ? 60 : 20),
            bearish: (newsData.sentiment?.toUpperCase() === 'BEARISH' ? 60 : 20),
            neutral: (newsData.sentiment?.toUpperCase() === 'NEUTRAL' ? 60 : 60),
        },
        keyDrivers: [],
        marketImpact: { level: 'LOW', confidence: 0.5 },
        traderInsights: [],
        tradeIdeas: [],
        totalVotes: 0,
    };

    const renderProgressBar = (percentage: number, color: string) => (
        <View style={styles.progressBarContainer}>
            <View style={[styles.progressBar, { backgroundColor: '#404040' }]}>
                <View style={[styles.progressFill, { width: `${percentage}%`, backgroundColor: color }]} />
            </View>
        </View>
    );

    const toTitle = (s: string) => s.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));
    const renderDriverPill = (driver: { text: string; score: number }) => (
        <View key={driver.text} style={styles.driverPill}>
            <Text style={styles.driverText}>{toTitle(driver.text)}</Text>
        </View>
    );

    return (
        <Modal
            animationType="slide"
            transparent={true}
            visible={isVisible}
            onRequestClose={onClose}
        >
            <View style={styles.overlayContainer}>
                <View style={styles.webWrapper}>
                    <View style={styles.contentContainer}>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            {/* Header */}
                            <View style={styles.header}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <Text style={styles.title}>Integra Analysis</Text>
                                    <TouchableOpacity onPress={() => {
                                        setTourMode('full');
                                        setTourStep(0);
                                        setShowTour(true);
                                    }}>
                                        <MaterialIcons name="info-outline" size={18} color="#A0A0A0" />
                                    </TouchableOpacity>
                                </View>
                                <View style={styles.headerActions}>
                                    <TouchableOpacity
                                        style={styles.copyButton}
                                        onPress={() => copyToClipboard(formatAnalysisForCopy(), 'Full Analysis')}
                                    >
                                        <MaterialIcons name="content-copy" size={20} color="#4ECCA3" />
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.bookmarkButton} onPress={handleBookmarkToggle}>
                                        <MaterialIcons
                                            name={isCurrentlyBookmarked ? "bookmark" : "bookmark-border"}
                                            size={24}
                                            color={isCurrentlyBookmarked ? "#4ECCA3" : "#ECECEC"}
                                        />
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                                        <MaterialIcons name="close" size={24} color="#ECECEC" />
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {/* Article Title and Source */}
                            <Text style={styles.articleTitle}>{newsData.title}</Text>
                            <TouchableOpacity
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                                onPress={async () => {
                                    // Check every possible URL field 
                                    const articleUrl = newsData.sourceUrl || newsData.url || newsData.source_url || '';
                                    console.log('[AIOverlay] Source tapped, ALL fields:', JSON.stringify({ sourceUrl: newsData.sourceUrl, url: newsData.url, source_url: newsData.source_url }));
                                    if (articleUrl && articleUrl !== '#') {
                                        try {
                                            let finalUrl = articleUrl;
                                            if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
                                                finalUrl = 'https://' + finalUrl;
                                            }
                                            await Linking.openURL(finalUrl);
                                        } catch (error) {
                                            console.error('Error opening URL:', error);
                                            Alert.alert('Unable to Open Link', `Could not open the source website.`);
                                        }
                                    } else {
                                        Alert.alert('Source Information', `This article is from ${newsData.source || 'an unknown source'}. No direct link is available.`);
                                    }
                                }}
                            >
                                <Text style={styles.source}>{newsData.source}</Text>
                            </TouchableOpacity>

                            {/* Summary Section */}
                            <View style={styles.section}>
                                <View style={styles.sectionHeader}>
                                    <View style={styles.sectionIndicator} />
                                    <Text style={styles.sectionTitle}>Summary</Text>
                                </View>
                                <Text style={styles.summaryText}>{analysisData.summary}</Text>
                            </View>

                            {/* Sentiment Section */}
                            <View style={styles.section}>
                                <View style={styles.sectionHeader}>
                                    <View style={styles.sectionIndicator} />
                                    <Text style={styles.sectionTitle}>Sentiment</Text>
                                </View>

                                <View style={styles.sentimentItem}>
                                    <View style={styles.sentimentRow}>
                                        <Text style={styles.sentimentLabel}>Bullish</Text>
                                        <Text style={[styles.sentimentPercentage, { color: '#4ECCA3' }]}>
                                            {analysisData.finBertSentiment.bullish}%
                                        </Text>
                                    </View>
                                    {renderProgressBar(analysisData.finBertSentiment.bullish, '#4ECCA3')}
                                </View>

                                <View style={styles.sentimentItem}>
                                    <View style={styles.sentimentRow}>
                                        <Text style={styles.sentimentLabel}>Bearish</Text>
                                        <Text style={[styles.sentimentPercentage, { color: '#F05454' }]}>
                                            {analysisData.finBertSentiment.bearish}%
                                        </Text>
                                    </View>
                                    {renderProgressBar(analysisData.finBertSentiment.bearish, '#F05454')}
                                </View>

                                <View style={styles.sentimentItem}>
                                    <View style={styles.sentimentRow}>
                                        <Text style={styles.sentimentLabel}>Neutral</Text>
                                        <Text style={[styles.sentimentPercentage, { color: '#EAB308' }]}>
                                            {analysisData.finBertSentiment.neutral}%
                                        </Text>
                                    </View>
                                    {renderProgressBar(analysisData.finBertSentiment.neutral, '#EAB308')}
                                </View>
                            </View>

                            {/* Key Sentiment Drivers - Now with individual keywords */}
                            <View style={styles.section}>
                                <View style={styles.sectionHeader}>
                                    <View style={styles.sectionIndicator} />
                                    <Text style={styles.sectionTitle}>Key Sentiment Drivers</Text>
                                </View>
                                <View style={styles.driversContainer}>
                                    {analysisData.keyDrivers.length > 0 ? (
                                        analysisData.keyDrivers.slice(0, 5).map(renderDriverPill)
                                    ) : (
                                        <View style={styles.driverPill}>
                                            <Text style={styles.driverText}>Market Activity</Text>
                                        </View>
                                    )}
                                </View>
                            </View>

                            {/* Market Impact */}
                            <View style={styles.section}>
                                <View style={styles.sectionHeader}>
                                    <View style={styles.sectionIndicator} />
                                    <Text style={styles.sectionTitle}>Market Impact</Text>
                                </View>
                                <View style={styles.marketImpactContainer}>
                                    <View style={[styles.impactBadge, { backgroundColor: '#EAB308' }]}>
                                        <Text style={[styles.impactLevel, { color: '#000000' }]}>{(newsData.sentiment || 'NEUTRAL').toUpperCase()}</Text>
                                    </View>
                                    <Text style={styles.confidenceText}>
                                        Confidence: {analysisData.marketImpact.confidence}
                                    </Text>
                                </View>
                            </View>

                            {/* Community Sentiment Poll */}
                            <View style={styles.pollSection}>
                                <View style={styles.pollHeader}>
                                    <Text style={styles.pollTitle}>Sentiment Poll</Text>
                                    <TouchableOpacity onPress={() => {
                                        setTourMode('single');
                                        setTourStep(5); // Jump to poll step
                                        setShowTour(true);
                                    }}>
                                        <MaterialIcons name="info-outline" size={18} color="#A0A0A0" />
                                    </TouchableOpacity>
                                </View>
                                <Text style={styles.pollQuestion}>How do you feel about this story?</Text>

                                {!userVote ? (
                                    <View style={styles.pollOptions}>
                                        <TouchableOpacity
                                            style={[styles.pollOptionSmall, styles.pollBullishSmall]}
                                            onPress={() => handleVote('BULLISH')}
                                        >
                                            <MaterialIcons name="trending-up" size={14} color="#4ECCA3" />
                                            <Text style={[styles.pollOptionTextSmall, { color: '#4ECCA3' }]}>Bullish</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.pollOptionSmall, styles.pollNeutralSmall]}
                                            onPress={() => handleVote('NEUTRAL')}
                                        >
                                            <MaterialIcons name="trending-flat" size={14} color="#EAB308" />
                                            <Text style={[styles.pollOptionTextSmall, { color: '#EAB308' }]}>Neutral</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.pollOptionSmall, styles.pollBearishSmall]}
                                            onPress={() => handleVote('BEARISH')}
                                        >
                                            <MaterialIcons name="trending-down" size={14} color="#F05454" />
                                            <Text style={[styles.pollOptionTextSmall, { color: '#F05454' }]}>Bearish</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <View style={styles.pollResults}>
                                        {/* Market Sentiment - Show only winning sentiment */}
                                        <View style={styles.sentimentDialContainer}>
                                            <Text style={styles.dialLabel}>MARKET SENTIMENT</Text>
                                            {(() => {
                                                const winner = displayBullish > displayBearish && displayBullish > displayNeutral
                                                    ? { label: 'BULLISH', color: '#4ECCA3' }
                                                    : displayBearish > displayBullish && displayBearish > displayNeutral
                                                        ? { label: 'BEARISH', color: '#F05454' }
                                                        : { label: 'NEUTRAL', color: '#EAB308' };
                                                return (
                                                    <View style={styles.dialRow}>
                                                        <View style={[styles.dialDot, { backgroundColor: winner.color }]} />
                                                        <Text style={[styles.dialPointer, { color: '#fff' }]}>{winner.label}</Text>
                                                    </View>
                                                );
                                            })()}
                                        </View>

                                        {/* Results - border color matches sentiment when selected */}
                                        {[
                                            { key: 'BULLISH' as const, label: 'Bullish', value: Math.round(displayBullish), color: '#4ECCA3' },
                                            { key: 'NEUTRAL' as const, label: 'Neutral', value: Math.round(displayNeutral), color: '#EAB308' },
                                            { key: 'BEARISH' as const, label: 'Bearish', value: Math.round(displayBearish), color: '#F05454' },
                                        ].map((option) => (
                                            <View
                                                key={option.key}
                                                style={[
                                                    styles.pollResultRow,
                                                    userVote === option.key && { borderColor: option.color, borderWidth: 2 }
                                                ]}
                                            >
                                                <View style={styles.pollResultLabelRow}>
                                                    <Text style={[styles.pollResultLabel, { color: option.color }]}>{option.label}</Text>
                                                    {userVote === option.key && (
                                                        <Text style={[styles.pollResultBadge, { marginLeft: 8 }]}>YOUR VOTE</Text>
                                                    )}
                                                    <Text style={[styles.pollResultLabel, { color: option.color, marginLeft: 'auto' }]}>— {option.value}%</Text>
                                                </View>
                                                <View style={styles.pollResultBar}>
                                                    <View style={[styles.pollResultFill, { width: `${option.value}%`, backgroundColor: option.color }]} />
                                                </View>
                                            </View>
                                        ))}

                                        {/* Who is voting? Section - Based on real total */}
                                        <View style={styles.whoIsVotingSection}>
                                            <View style={styles.whoIsVotingHeader}>
                                                <Text style={styles.whoIsVotingTitle}>Who is voting?</Text>
                                            </View>
                                            {[
                                                { role: 'Physical crude traders', count: Math.ceil(pollData.total * 0.30) },
                                                { role: 'Financial traders', count: Math.ceil(pollData.total * 0.38) },
                                                { role: 'Analysts', count: Math.ceil(pollData.total * 0.15) },
                                                { role: 'Hedge funds', count: Math.ceil(pollData.total * 0.10) },
                                                { role: 'Risk managers', count: Math.max(0, pollData.total - Math.ceil(pollData.total * 0.93)) },
                                            ].map((voter, idx) => (
                                                <View key={idx} style={styles.voterRow}>
                                                    <Text style={styles.voterBullet}>•</Text>
                                                    <Text style={styles.voterRole}>{voter.role}:</Text>
                                                    <Text style={styles.voterCount}>{voter.count}</Text>
                                                </View>
                                            ))}
                                        </View>

                                        {/* Total Votes Display */}
                                        <View style={styles.totalVotesContainer}>
                                            <Text style={styles.totalVotesText}>
                                                {pollData.total} votes
                                            </Text>
                                        </View>
                                    </View>
                                )}
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </View>

            {/* Tour Guide Modal */}
            <Modal
                animationType="fade"
                transparent={true}
                visible={showTour}
                onRequestClose={handleTourDismiss}
            >
                <View style={styles.tourOverlay}>
                    <View style={styles.tourCard}>
                        {/* Progress indicator */}
                        {tourMode === 'full' && (
                            <>
                                <View style={styles.tourProgress}>
                                    {tourSteps.map((_, idx) => (
                                        <View
                                            key={idx}
                                            style={[
                                                styles.tourDot,
                                                idx === tourStep && styles.tourDotActive,
                                                idx < tourStep && styles.tourDotCompleted
                                            ]}
                                        />
                                    ))}
                                </View>
                                <Text style={styles.tourStepCounter}>{tourStep + 1} of {tourSteps.length}</Text>
                            </>
                        )}

                        {/* Title */}
                        <Text style={styles.tourTitle}>{tourSteps[tourStep]?.title}</Text>

                        {/* Content */}
                        <Text style={styles.tourContent}>{tourSteps[tourStep]?.content}</Text>

                        {/* Buttons */}
                        {tourMode === 'full' ? (
                            <View style={styles.tourButtons}>
                                <TouchableOpacity
                                    style={styles.tourDismissButton}
                                    onPress={handleTourDismiss}
                                >
                                    <Text style={styles.tourDismissText}>
                                        {tourStep === tourSteps.length - 1 ? 'Done' : 'Skip'}
                                    </Text>
                                </TouchableOpacity>

                                {tourStep < tourSteps.length - 1 && (
                                    <TouchableOpacity
                                        style={styles.tourNextButton}
                                        onPress={handleTourNext}
                                    >
                                        <Text style={styles.tourNextText}>Next</Text>
                                        <MaterialIcons name="arrow-forward" size={16} color="#121212" />
                                    </TouchableOpacity>
                                )}
                            </View>
                        ) : (
                            <View style={styles.tourButtons}>
                                <TouchableOpacity
                                    style={[styles.tourNextButton, { flex: 1, backgroundColor: '#4ECCA3' }]}
                                    onPress={() => setShowTour(false)}
                                >
                                    <Text style={styles.tourNextText}>Got it</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                </View>
            </Modal>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlayContainer: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        paddingTop: 50,
        ...(Platform.OS === 'web' && {
            justifyContent: 'center',
            alignItems: 'center',
        }),
    },
    webWrapper: {
        ...(Platform.OS === 'web' ? {
            width: 414, // iPhone Pro Max width
            height: 750,
            maxHeight: 750,
            alignSelf: 'center',
        } : {
            flex: 1,
        }),
    },
    contentContainer: {
        flex: 1,
        backgroundColor: '#121212',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingHorizontal: 20,
        paddingTop: 20,
        ...(Platform.OS === 'web' && {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.5,
            shadowRadius: 30,
            elevation: 30,
        }),
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
        paddingBottom: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#333333',
    },
    title: {
        fontSize: 22,
        fontWeight: '600',
        color: '#ECECEC',
    },
    headerActions: {
        flexDirection: 'row',
        gap: 15,
    },
    copyButton: {
        padding: 2,
        marginRight: 5,
    },
    bookmarkButton: {
        padding: 2,
    },
    sectionCopyButton: {
        padding: 4,
        marginLeft: 'auto',
    },
    closeButton: {
        padding: 2,
    },
    articleTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: '#ECECEC',
        lineHeight: 28,
        marginBottom: 8,
    },
    source: {
        fontSize: 16,
        color: '#4A9EFF',
        marginBottom: 20,
    },
    section: {
        marginBottom: 24,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    sectionIndicator: {
        width: 3,
        height: 20,
        backgroundColor: '#4A9EFF',
        marginRight: 10,
        borderRadius: 2,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#ECECEC',
        flex: 1,
    },
    summaryText: {
        fontSize: 15,
        color: '#EEEEEE',
        lineHeight: 22,
    },
    sentimentItem: {
        marginBottom: 16,
    },
    sentimentRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    sentimentLabel: {
        fontSize: 16,
        color: '#EEEEEE',
    },
    sentimentPercentage: {
        fontSize: 16,
        fontWeight: '600',
    },
    progressBarContainer: {
        height: 6,
        marginBottom: 4,
    },
    progressBar: {
        height: 6,
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 3,
    },
    driversContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    driverPill: {
        backgroundColor: '#EAB308',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        marginBottom: 8,
    },
    driverText: {
        color: '#000000',
        fontSize: 14,
        fontWeight: '500',
    },
    marketImpactContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    impactBadge: {
        backgroundColor: '#EAB308',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    impactLevel: {
        color: '#000000',
        fontSize: 14,
        fontWeight: '600',
    },
    confidenceText: {
        fontSize: 16,
        color: '#EEEEEE',
    },
    insightRow: {
        flexDirection: 'row',
        marginBottom: 8,
        paddingRight: 10,
    },
    bulletPoint: {
        fontSize: 16,
        color: '#EEEEEE',
        marginRight: 8,
        marginTop: 2,
    },
    insightText: {
        flex: 1,
        fontSize: 15,
        color: '#EEEEEE',
        lineHeight: 22,
    },
    pollSection: {
        backgroundColor: '#1A1A1A',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#333333',
        padding: 16,
        marginTop: 12,
    },
    pollHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    pollTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#ECECEC',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    pollQuestion: {
        fontSize: 15,
        color: '#ECECEC',
        marginBottom: 16,
    },
    pollOptions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 10,
    },
    pollOption: {
        flex: 1,
        borderRadius: 8,
        paddingVertical: 14,
        borderWidth: 1,
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#121212',
    },
    pollOptionText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#ECECEC',
    },
    pollBearish: {
        borderColor: '#F05454',
    },
    pollNeutral: {
        borderColor: '#EAB308',
    },
    pollBullish: {
        borderColor: '#4ECCA3',
    },
    pollResults: {
        gap: 12,
    },
    pollResultRow: {
        backgroundColor: '#121212',
        borderRadius: 8,
        padding: 12,
        borderWidth: 1,
        borderColor: '#333333',
    },
    pollResultSelected: {
        borderColor: '#4ECCA3',
    },
    pollResultLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    pollResultLabel: {
        fontSize: 14,
        fontWeight: '600',
    },
    pollResultBadge: {
        fontSize: 12,
        color: '#4ECCA3',
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    pollResultBar: {
        height: 10,
        backgroundColor: '#262626',
        borderRadius: 10,
        overflow: 'hidden',
        marginBottom: 6,
    },
    pollResultFill: {
        height: '100%',
        borderRadius: 10,
    },
    pollResultValue: {
        fontSize: 13,
        color: '#ECECEC',
        fontWeight: '600',
    },
    // Small rounded poll buttons (matching news card badges)
    pollOptionSmall: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 8,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderWidth: 1,
        gap: 4,
        backgroundColor: 'transparent',
    },
    pollOptionTextSmall: {
        fontSize: 12,
        fontWeight: '600',
    },
    pollBearishSmall: {
        borderColor: 'rgba(240, 84, 84, 0.5)',
        backgroundColor: 'rgba(240, 84, 84, 0.1)',
    },
    pollNeutralSmall: {
        borderColor: 'rgba(234, 179, 8, 0.5)',
        backgroundColor: 'rgba(234, 179, 8, 0.1)',
    },
    pollBullishSmall: {
        borderColor: 'rgba(78, 204, 163, 0.5)',
        backgroundColor: 'rgba(78, 204, 163, 0.1)',
    },
    // Total votes display
    totalVotesContainer: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#333333',
        alignItems: 'center',
    },
    totalVotesText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#ECECEC',
        marginBottom: 4,
    },
    voteBreakdown: {
        fontSize: 12,
        color: '#EEEEEE',
        textAlign: 'center',
    },
    // Sentiment Dial Styles
    sentimentDialContainer: {
        backgroundColor: '#1E1E1E',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#333333',
        alignItems: 'center',
    },
    dialLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#EEEEEE',
        letterSpacing: 1,
        marginBottom: 12,
    },
    dialRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    dialDot: {
        width: 16,
        height: 16,
        borderRadius: 8,
    },
    dialLine: {
        width: 30,
        height: 2,
        backgroundColor: '#444444',
    },
    dialPointer: {
        fontSize: 12,
        fontWeight: '600',
        color: '#EEEEEE',
        marginLeft: 12,
    },
    // Emoji Label
    emojiLabel: {
        fontSize: 16,
        marginRight: 8,
    },
    // Who is Voting Section
    whoIsVotingSection: {
        backgroundColor: '#1E1E1E',
        borderRadius: 12,
        padding: 16,
        marginTop: 12,
        borderWidth: 1,
        borderColor: '#333333',
    },
    whoIsVotingHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    whoIsVotingEmoji: {
        fontSize: 18,
        marginRight: 8,
    },
    whoIsVotingTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#ECECEC',
    },
    voterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 4,
    },
    voterBullet: {
        color: '#4ECCA3',
        fontSize: 14,
        marginRight: 8,
        width: 12,
    },
    voterRole: {
        flex: 1,
        fontSize: 14,
        color: '#EEEEEE',
    },
    voterCount: {
        fontSize: 14,
        fontWeight: '600',
        color: '#4ECCA3',
    },
    // Interpretation Section
    interpretationSection: {
        backgroundColor: '#1E1E1E',
        borderRadius: 12,
        padding: 16,
        marginTop: 12,
        borderWidth: 1,
        borderColor: '#333333',
    },
    interpretationHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    interpretationEmoji: {
        fontSize: 18,
        marginRight: 8,
    },
    interpretationTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#ECECEC',
    },
    interpretationText: {
        fontSize: 14,
        color: '#EEEEEE',
        lineHeight: 20,
    },
    // Tour Guide Styles
    tourOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    tourCard: {
        backgroundColor: '#1E1E1E',
        borderRadius: 20,
        padding: 24,
        width: '100%',
        maxWidth: 340,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#333333',
    },
    tourProgress: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 16,
    },
    tourDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#444444',
    },
    tourDotActive: {
        backgroundColor: '#4ECCA3',
        width: 24,
    },
    tourDotCompleted: {
        backgroundColor: '#4ECCA3',
    },
    tourStepCounter: {
        fontSize: 12,
        color: '#EEEEEE',
        marginBottom: 20,
    },
    tourIcon: {
        fontSize: 48,
        marginBottom: 16,
    },
    tourTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: '#ECECEC',
        textAlign: 'center',
        marginBottom: 12,
    },
    tourContent: {
        fontSize: 15,
        color: '#EEEEEE',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 24,
    },
    tourButtons: {
        flexDirection: 'row',
        gap: 12,
        width: '100%',
    },
    tourDismissButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#444444',
        alignItems: 'center',
    },
    tourDismissText: {
        color: '#EEEEEE',
        fontSize: 16,
        fontWeight: '600',
    },
    tourNextButton: {
        flex: 1,
        flexDirection: 'row',
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: '#4ECCA3',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    tourNextText: {
        color: '#121212',
        fontSize: 16,
        fontWeight: '600',
    },
});

export default AIAnalysisOverlay;
