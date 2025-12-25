import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Platform, Clipboard, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import { useBookmarks } from '../providers/BookmarkProvider';
import { sentimentApi } from '../services/api';

interface NewsData {
    title: string;
    summary: string;
    source: string;
    timeAgo: string;
    sentiment: string;
    sentimentScore: number;
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
    newsData: NewsData | null;
    isVisible: boolean;
    onClose: () => void;
}

const AIAnalysisOverlay: React.FC<AIAnalysisOverlayProps> = ({ newsData, isVisible, onClose }) => {
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
    const TOUR_STORAGE_KEY = '@integra_analysis_tour_completed';

    // Tour guide content
    const tourSteps = [
        {
            title: 'Welcome to Integra Analysis',
            icon: '🤖',
            content: 'This AI-powered analysis helps you understand market sentiment and make informed trading decisions. Let\'s walk through the key features.'
        },
        {
            title: 'Summary',
            icon: '📝',
            content: 'The Summary section provides an AI-generated synopsis highlighting the key points from the article, saving you time while ensuring you don\'t miss important details.'
        },
        {
            title: 'Sentiment Analysis',
            icon: '📊',
            content: 'Our FinBERT model analyzes the text to determine bullish, bearish, or neutral sentiment with confidence scores. Higher percentages indicate stronger conviction.'
        },
        {
            title: 'Key Sentiment Drivers',
            icon: '🔑',
            content: 'These are the most significant keywords and factors identified by our NLP engine that are driving the sentiment for this article.'
        },
        {
            title: 'Market Impact & Trade Ideas',
            icon: '📈',
            content: 'We assess the potential price impact based on historical patterns and provide actionable trade ideas for your consideration.'
        },
        {
            title: 'Community Sentiment Poll',
            icon: '👥',
            content: 'Vote on how you feel about the story and see how other verified traders in our community are viewing the same news. Great for gauging market consensus!'
        }
    ];

    // Check if tour was completed on mount
    useEffect(() => {
        const checkTourStatus = async () => {
            try {
                const completed = await AsyncStorage.getItem(TOUR_STORAGE_KEY);
                if (!completed && isVisible) {
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
        completeTour();
    };

    const isCurrentlyBookmarked = newsData ? isBookmarked(newsData.title) : false;

    const handleBookmarkToggle = async () => {
        if (!newsData) return;

        try {
            if (isCurrentlyBookmarked) {
                // Find the bookmark by title and remove it
                const bookmarkToRemove = bookmarks.find((b: any) => b.title === newsData.title);
                if (bookmarkToRemove) {
                    await removeBookmark(bookmarkToRemove.id);
                    Alert.alert('Removed', 'Analysis removed from bookmarks');
                }
            } else {
                // Add new bookmark with AI analysis data
                await addBookmark({
                    title: newsData.title,
                    summary: analysisData.summary,
                    source: newsData.source,
                    sentiment: analysisData.finBertSentiment.bullish > analysisData.finBertSentiment.bearish
                        ? (analysisData.finBertSentiment.bullish > analysisData.finBertSentiment.neutral ? 'BULLISH' : 'NEUTRAL')
                        : (analysisData.finBertSentiment.bearish > analysisData.finBertSentiment.neutral ? 'BEARISH' : 'NEUTRAL'),
                    sentimentScore: Math.max(
                        analysisData.finBertSentiment.bullish,
                        analysisData.finBertSentiment.bearish,
                        analysisData.finBertSentiment.neutral
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
                const fullText = `${newsData.title}. ${newsData.summary || ''}`.trim();
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

                if (newsData.analysis && typeof newsData.analysis.bulls === 'number') {
                    const a = newsData.analysis;
                    const bulls = Math.max(0, Math.min(100, Math.round(a.bulls)));
                    const bears = Math.max(0, Math.min(100, Math.round(a.bears)));
                    const neuts = Math.max(0, Math.min(100, Math.round(a.neuts)));
                    const drivers = Array.isArray(a.keywords)
                        ? pickDrivers(
                            a.keywords
                                .map((k) => ({ text: String((k as any).word ?? ''), score: Number((k as any).score ?? 0) })),
                            fullText
                        )
                        : [];
                    const level = a.impact || 'MEDIUM';
                    const conf = typeof a.confidence === 'number' ? a.confidence : 0.5;

                    const insights: string[] = [];
                    const dominant = Math.max(bulls, bears, neuts);
                    if (bulls === dominant && bulls > 40) insights.push('Sentiment strongly favors bullish positioning');
                    else if (bears === dominant && bears > 40) insights.push('Bearish sentiment dominates; exercise caution on long positions');
                    else if (neuts === dominant && neuts > 50) insights.push('Market sentiment is neutral/mixed');
                    else insights.push('Sentiment is balanced across different perspectives');
                    if (drivers.length > 0) insights.push(`Key factors: ${drivers.slice(0, 2).map(d => d.text).join(', ')}`);

                    setAnalysis({
                        summary: newsData.summary,
                        finBertSentiment: { bullish: bulls, bearish: bears, neutral: neuts },
                        keyDrivers: drivers,
                        marketImpact: { level, confidence: conf },
                        traderInsights: insights,
                        tradeIdeas: generateTradeIdeas(bulls, bears, commodity),
                        totalVotes: Math.floor(Math.random() * 500) + 500, // Simulated total votes
                    });
                    return; // Skip network call to keep numbers identical to the card
                }
                const res = commodity
                    ? await sentimentApi.analyzeEnhanced(text, commodity as any)
                    : await sentimentApi.analyzeEnhanced(text as any);
                // Convert from decimal to percentage and ensure they sum to 100
                let bulls = Math.round(((res?.bullish ?? 0) as number) * 100);
                let bears = Math.round(((res?.bearish ?? 0) as number) * 100);
                let neuts = Math.round(((res?.neutral ?? 0) as number) * 100);

                // Normalize to ensure sum is 100
                const total = bulls + bears + neuts;
                if (total > 0 && total !== 100) {
                    const scale = 100 / total;
                    bulls = Math.round(bulls * scale);
                    bears = Math.round(bears * scale);
                    neuts = 100 - bulls - bears; // Ensure exact 100
                }
                const drivers = Array.isArray(res?.keywords)
                    ? pickDrivers(
                        (res.keywords as any[])
                            .map((k) => ({
                                text: (k?.word ?? String(k)).toString(),
                                score: Number(k?.score ?? 0),
                            })),
                        text
                    )
                    : [];
                const level = (res?.impact as string) || 'MEDIUM';
                const conf = Number(res?.confidence ?? 0.5);
                const insights: string[] = [];

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
                setAnalysis({
                    summary: newsData.summary,
                    finBertSentiment: { bullish: bulls, bearish: bears, neutral: neuts },
                    keyDrivers: drivers,
                    marketImpact: { level, confidence: conf },
                    traderInsights: insights,
                    tradeIdeas: generateTradeIdeas(bulls, bears, commodity),
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
                    summary: newsData.summary,
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
        const insights = analysisData.traderInsights.map((insight, i) => `${i + 1}. ${insight}`).join('\n');

        return `INTEGRA AI ANALYSIS\n\nArticle: ${newsData.title}\nSource: ${newsData.source}\n\nSUMMARY:\n${analysisData.summary}\n\nSENTIMENT:\n${sentiment}\n\nKEY DRIVERS:\n${drivers}\n\nMARKET IMPACT:\n${analysisData.marketImpact.level} (Confidence: ${analysisData.marketImpact.confidence})\n\nTRADER INSIGHTS:\n${insights}`;
    };

    const analysisData = analysis || {
        summary: newsData.summary,
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
                            <TouchableOpacity>
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
                            {analysisData.keyDrivers.length > 0 && (
                                <View style={styles.section}>
                                    <View style={styles.sectionHeader}>
                                        <View style={styles.sectionIndicator} />
                                        <Text style={styles.sectionTitle}>Key Sentiment Drivers</Text>
                                    </View>
                                    <View style={styles.driversContainer}>
                                        {analysisData.keyDrivers.slice(0, 5).map(renderDriverPill)}
                                    </View>
                                </View>
                            )}

                            {/* Market Impact */}
                            <View style={styles.section}>
                                <View style={styles.sectionHeader}>
                                    <View style={styles.sectionIndicator} />
                                    <Text style={styles.sectionTitle}>Market Impact</Text>
                                </View>
                                <View style={styles.marketImpactContainer}>
                                    <View style={styles.impactBadge}>
                                        <Text style={styles.impactLevel}>{analysisData.marketImpact.level}</Text>
                                    </View>
                                    <Text style={styles.confidenceText}>
                                        Confidence: {analysisData.marketImpact.confidence}
                                    </Text>
                                </View>
                            </View>

                            {/* What this means for Traders */}
                            <View style={styles.section}>
                                <View style={styles.sectionHeader}>
                                    <View style={[styles.sectionIndicator, { backgroundColor: '#4ECCA3' }]} />
                                    <Text style={styles.sectionTitle}>What this means for Traders</Text>
                                </View>
                                {analysisData.traderInsights.map((insight, index) => (
                                    <View key={index} style={styles.insightRow}>
                                        <Text style={styles.bulletPoint}>•</Text>
                                        <Text style={styles.insightText}>{insight}</Text>
                                    </View>
                                ))}
                            </View>

                            {/* Trade Ideas - NEW SECTION */}
                            {analysisData.tradeIdeas.length > 0 && (
                                <View style={[styles.section, { marginBottom: 20 }]}>
                                    <View style={styles.sectionHeader}>
                                        <View style={[styles.sectionIndicator, { backgroundColor: '#4ECCA3' }]} />
                                        <Text style={styles.sectionTitle}>Trade Ideas</Text>
                                    </View>
                                    {analysisData.tradeIdeas.map((idea, index) => (
                                        <View key={index} style={styles.insightRow}>
                                            <Text style={styles.bulletPoint}>•</Text>
                                            <Text style={styles.insightText}>{idea}</Text>
                                        </View>
                                    ))}
                                </View>
                            )}

                            {/* Community Sentiment Poll */}
                            <View style={styles.pollSection}>
                                <View style={styles.pollHeader}>
                                    <Text style={styles.pollTitle}>Sentiment Poll</Text>
                                    <TouchableOpacity onPress={() => {
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
                                            style={[styles.pollOptionSmall, styles.pollBearishSmall]}
                                            onPress={() => setUserVote('BEARISH')}
                                        >
                                            <MaterialIcons name="trending-down" size={14} color="#F05454" />
                                            <Text style={[styles.pollOptionTextSmall, { color: '#F05454' }]}>Bearish</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.pollOptionSmall, styles.pollNeutralSmall]}
                                            onPress={() => setUserVote('NEUTRAL')}
                                        >
                                            <MaterialIcons name="trending-flat" size={14} color="#EAB308" />
                                            <Text style={[styles.pollOptionTextSmall, { color: '#EAB308' }]}>Neutral</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.pollOptionSmall, styles.pollBullishSmall]}
                                            onPress={() => setUserVote('BULLISH')}
                                        >
                                            <MaterialIcons name="trending-up" size={14} color="#4ECCA3" />
                                            <Text style={[styles.pollOptionTextSmall, { color: '#4ECCA3' }]}>Bullish</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <View style={styles.pollResults}>
                                        {/* Market Sentiment Dial */}
                                        <View style={styles.sentimentDialContainer}>
                                            <Text style={styles.dialLabel}>MARKET SENTIMENT</Text>
                                            <View style={styles.dialRow}>
                                                <View style={[styles.dialDot, { backgroundColor: '#4ECCA3' }]} />
                                                <View style={styles.dialLine} />
                                                <View style={[styles.dialDot, { backgroundColor: '#EAB308' }]} />
                                                <View style={styles.dialLine} />
                                                <View style={[styles.dialDot, { backgroundColor: '#F05454' }]} />
                                                <Text style={styles.dialPointer}>
                                                    {analysisData.finBertSentiment.bullish > analysisData.finBertSentiment.bearish
                                                        ? '← BULLISH'
                                                        : analysisData.finBertSentiment.bearish > analysisData.finBertSentiment.bullish
                                                            ? 'BEARISH →'
                                                            : 'NEUTRAL'}
                                                </Text>
                                            </View>
                                        </View>

                                        {/* Results with emojis */}
                                        {[
                                            { key: 'BULLISH' as const, label: 'Bullish', emoji: '🐂', value: analysisData.finBertSentiment.bullish, color: '#4ECCA3' },
                                            { key: 'NEUTRAL' as const, label: 'Neutral', emoji: '😐', value: analysisData.finBertSentiment.neutral, color: '#EAB308' },
                                            { key: 'BEARISH' as const, label: 'Bearish', emoji: '🐻', value: analysisData.finBertSentiment.bearish, color: '#F05454' },
                                        ].map((option) => (
                                            <View key={option.key} style={[styles.pollResultRow, userVote === option.key && styles.pollResultSelected]}>
                                                <View style={styles.pollResultLabelRow}>
                                                    <Text style={styles.emojiLabel}>{option.emoji}</Text>
                                                    <Text style={[styles.pollResultLabel, { color: option.color }]}>{option.label}</Text>
                                                    <Text style={[styles.pollResultLabel, { color: option.color, marginLeft: 4 }]}>— {option.value}%</Text>
                                                    {userVote === option.key && (
                                                        <Text style={styles.pollResultBadge}>Your vote</Text>
                                                    )}
                                                </View>
                                                <View style={styles.pollResultBar}>
                                                    <View style={[styles.pollResultFill, { width: `${option.value}%`, backgroundColor: option.color }]} />
                                                </View>
                                            </View>
                                        ))}

                                        {/* Who is voting? Section - Based on onboarding roles */}
                                        <View style={styles.whoIsVotingSection}>
                                            <View style={styles.whoIsVotingHeader}>
                                                <Text style={styles.whoIsVotingEmoji}>👥</Text>
                                                <Text style={styles.whoIsVotingTitle}>Who is voting?</Text>
                                            </View>
                                            {[
                                                { role: 'Physical crude traders', count: Math.floor(analysisData.totalVotes * 0.30) },
                                                { role: 'Financial traders', count: Math.floor(analysisData.totalVotes * 0.38) },
                                                { role: 'Analysts', count: Math.floor(analysisData.totalVotes * 0.15) },
                                                { role: 'Hedge funds', count: Math.floor(analysisData.totalVotes * 0.10) },
                                                { role: 'Risk managers', count: Math.floor(analysisData.totalVotes * 0.07) },
                                            ].map((voter, idx) => (
                                                <View key={idx} style={styles.voterRow}>
                                                    <Text style={styles.voterBullet}>•</Text>
                                                    <Text style={styles.voterRole}>{voter.role}:</Text>
                                                    <Text style={styles.voterCount}>{voter.count}</Text>
                                                </View>
                                            ))}
                                        </View>

                                        {/* Interpretation Section */}
                                        <View style={styles.interpretationSection}>
                                            <View style={styles.interpretationHeader}>
                                                <Text style={styles.interpretationEmoji}>🧠</Text>
                                                <Text style={styles.interpretationTitle}>Interpretation</Text>
                                            </View>
                                            <Text style={styles.interpretationText}>
                                                {analysisData.finBertSentiment.bullish > analysisData.finBertSentiment.bearish + 10
                                                    ? 'Sentiment strongly favors bullish positioning. Traders expect positive price action.'
                                                    : analysisData.finBertSentiment.bearish > analysisData.finBertSentiment.bullish + 10
                                                        ? 'Bearish sentiment dominates. Exercise caution on long positions.'
                                                        : 'Sentiment leans bullish but indecisive. Expect consolidation until major catalysts.'}
                                            </Text>
                                        </View>

                                        {/* Total Votes Display */}
                                        <View style={styles.totalVotesContainer}>
                                            <Text style={styles.totalVotesText}>
                                                {analysisData.totalVotes} votes
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

                        {/* Step counter */}
                        <Text style={styles.tourStepCounter}>{tourStep + 1} of {tourSteps.length}</Text>

                        {/* Icon */}
                        <Text style={styles.tourIcon}>{tourSteps[tourStep]?.icon}</Text>

                        {/* Title */}
                        <Text style={styles.tourTitle}>{tourSteps[tourStep]?.title}</Text>

                        {/* Content */}
                        <Text style={styles.tourContent}>{tourSteps[tourStep]?.content}</Text>

                        {/* Buttons */}
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
        color: '#A0A0A0',
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
        color: '#A0A0A0',
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
        borderRadius: 16,
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
        borderRadius: 6,
    },
    impactLevel: {
        color: '#000000',
        fontSize: 14,
        fontWeight: '600',
    },
    confidenceText: {
        fontSize: 16,
        color: '#A0A0A0',
    },
    insightRow: {
        flexDirection: 'row',
        marginBottom: 8,
        paddingRight: 10,
    },
    bulletPoint: {
        fontSize: 16,
        color: '#A0A0A0',
        marginRight: 8,
        marginTop: 2,
    },
    insightText: {
        flex: 1,
        fontSize: 15,
        color: '#A0A0A0',
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
        borderRadius: 14,
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
        borderRadius: 12,
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
        borderRadius: 20,
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
        color: '#A0A0A0',
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
        color: '#A0A0A0',
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
        color: '#A0A0A0',
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
        color: '#A0A0A0',
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
        color: '#A0A0A0',
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
        color: '#A0A0A0',
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
        color: '#A0A0A0',
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
        color: '#A0A0A0',
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
