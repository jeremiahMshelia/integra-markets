import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Platform, Clipboard, Alert } from 'react-native';
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
    } | null>(null);
    const [loading, setLoading] = useState(false);
    
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
                    'rate','rates','cut','hike','yield','yields','treasury','treasuries','bond','bonds','interest',
                    'cpi','ppi','inflation','disinflation','deflation','deflator','gdp','jobs','unemployment','payrolls','pmi','ism',
                    'guidance','earnings','revenue','margin','margins','buyback','dividend','valuation','liquidity','volatility',
                    'recession','growth','outlook','forecast','upgrade','downgrade','opec','inventory','supply','demand','production',
                    'exports','import','sanctions','geopolitical','risk','etf','inflows','outflows','ipo','listing','merger','acquisition',
                    'deal','approval','sec','regulator','policy','dovish','hawkish','fed','federal','reserve','powell','dot','dots',
                    'curve','flattening','steepening','oil','gas','gold','wheat','copper','silver','commodities','fx','usd','dxy',
                    'equities','stocks','index','bitcoin','ethereum','xrp','altcoins','crypto','bullish','bearish','signal','signals',
                    'indicator','indicators','alert','alerts','inflow','outflow','share','shares','price','prices','volume','volumes',
                    'breakout','support','resistance','options','futures','spot','intraday','trend','momentum','credit','spread','spreads',
                    'cash','debt','yoy','qoq'
                ]);
                const acceptStrict = (phrase: { text: string; score: number }) => {
                    const t = phrase.text.toLowerCase().trim();
                    if (!/\s/.test(t)) return false; // multiword only
                    if (NOISY.test(t)) return false; // drop boilerplate
                    const toks = t.split(/\s+/);
                    if (toks.length < 2) return false;
                    // require at least one finance lexicon token
                    if (!toks.some(w => LEXICON.has(w))) return false;
                    // min length after removing spaces
                    if (t.replace(/\s+/g,'').length < 6) return false;
                    return true;
                };
                const acceptRelaxed = (phrase: { text: string; score: number }) => {
                    const t = phrase.text.toLowerCase().trim();
                    if (!/\s/.test(t)) return false;
                    if (NOISY.test(t)) return false;
                    if (t.replace(/\s+/g,'').length < 6) return false;
                    return true;
                };
                const extractFromText = (t: string) => {
                    const txt = (t || '').toLowerCase().replace(/[’']/g,' ').replace(/[^a-z\s\-]/g,' ').replace(/\s+/g,' ').trim();
                    const toks = txt.split(' ');
                    const sw = new Set(['the','and','for','with','from','that','this','into','over','after','before','under','between','by','on','in','to','of','as','at','be','is','are','was','were','has','have','had','will','would','could','should','may','might','a','an','both','what','we','here','today']);
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
                    cands.sort((a,b) => b.score - a.score);
                    const out: { text: string; score: number }[] = [];
                    for (const c of cands) {
                        if (out.some(o => jaccard(o.text, c.text) >= 0.7)) continue;
                        out.push(c);
                        if (out.length >= 5) break;
                    }
                    return out;
                };
                const pickDrivers = (arr: { text: string; score: number }[], textForFallback?: string) => {
                    const sorted = [...arr].sort((x,y) => (y.score - x.score));
                    const seen = new Set<string>();
                    const strictOut: { text: string; score: number }[] = [];
                    for (const d of sorted) {
                        const key = d.text.toLowerCase();
                        if (seen.has(key)) continue;
                        if (!acceptStrict(d)) continue;
                        seen.add(key);
                        strictOut.push(d);
                        if (strictOut.length >= 8) break;
                    }
                    if (strictOut.length >= 3) return strictOut;
                    // Fallback: relaxed
                    const relaxedOut: { text: string; score: number }[] = [...strictOut];
                    for (const d of sorted) {
                        if (relaxedOut.length >= 8) break;
                        const key = d.text.toLowerCase();
                        if (seen.has(key)) continue;
                        if (!acceptRelaxed(d)) continue;
                        seen.add(key);
                        relaxedOut.push(d);
                    }
                    if (relaxedOut.length >= 3) return relaxedOut;
                    // Final fallback: derive from article text
                    if (textForFallback) {
                        const fb = extractFromText(textForFallback);
                        return [...relaxedOut, ...fb].slice(0, 5);
                    }
                    return relaxedOut;
                };
                // If precomputed analysis is available, use it to ensure exact match with the card
                const fullText = `${newsData.title}. ${newsData.summary || ''}`.trim();
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
                    if (drivers.length > 0) insights.push(`Key factors: ${drivers.slice(0,2).map(d=>d.text).join(', ')}`);

                    setAnalysis({
                        summary: newsData.summary,
                        finBertSentiment: { bullish: bulls, bearish: bears, neutral: neuts },
                        keyDrivers: drivers,
                        marketImpact: { level, confidence: conf },
                        traderInsights: insights,
                    });
                    return; // Skip network call to keep numbers identical to the card
                }
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
                            <Text style={styles.title}>Integra Analysis</Text>
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
                                <TouchableOpacity 
                                    style={styles.sectionCopyButton}
                                    onPress={() => copyToClipboard(analysisData.summary, 'Summary')}
                                >
                                    <MaterialIcons name="content-copy" size={16} color="#A0A0A0" />
                                </TouchableOpacity>
                            </View>
                            <Text style={styles.summaryText}>{analysisData.summary}</Text>
                        </View>

                        {/* Sentiment Section */}
                        <View style={styles.section}>
                            <View style={styles.sectionHeader}>
                                <View style={styles.sectionIndicator} />
                                <Text style={styles.sectionTitle}>Sentiment</Text>
                                <TouchableOpacity 
                                    style={styles.sectionCopyButton}
                                    onPress={() => copyToClipboard(
                                        `Bullish: ${analysisData.finBertSentiment.bullish}%, Bearish: ${analysisData.finBertSentiment.bearish}%, Neutral: ${analysisData.finBertSentiment.neutral}%`,
                                        'Sentiment Analysis'
                                    )}
                                >
                                    <MaterialIcons name="content-copy" size={16} color="#A0A0A0" />
                                </TouchableOpacity>
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

                        {/* Key Sentiment Drivers */}
                        {analysisData.keyDrivers.length > 0 && (
                          <View style={styles.section}>
                              <View style={styles.sectionHeader}>
                                  <View style={styles.sectionIndicator} />
                                  <Text style={styles.sectionTitle}>Key Sentiment Drivers</Text>
                                  <TouchableOpacity 
                                      style={styles.sectionCopyButton}
                                      onPress={() => copyToClipboard(
                                          analysisData.keyDrivers.slice(0,2).map(d => `${d.text}`).join(', '),
                                          'Key Drivers'
                                      )}
                                  >
                                      <MaterialIcons name="content-copy" size={16} color="#A0A0A0" />
                                  </TouchableOpacity>
                              </View>
                              <View style={styles.driversContainer}>
                                  {analysisData.keyDrivers.slice(0, 2).map(renderDriverPill)}
                              </View>
                          </View>
                        )}

                        {/* Market Impact */}
                        <View style={styles.section}>
                            <View style={styles.sectionHeader}>
                                <View style={styles.sectionIndicator} />
                                <Text style={styles.sectionTitle}>Market Impact</Text>
                                <TouchableOpacity 
                                    style={styles.sectionCopyButton}
                                    onPress={() => copyToClipboard(
                                        `${analysisData.marketImpact.level} (Confidence: ${analysisData.marketImpact.confidence})`,
                                        'Market Impact'
                                    )}
                                >
                                    <MaterialIcons name="content-copy" size={16} color="#A0A0A0" />
                                </TouchableOpacity>
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
                        <View style={[styles.section, { marginBottom: 20 }]}>
                            <View style={styles.sectionHeader}>
                                <View style={styles.sectionIndicator} />
                                <Text style={styles.sectionTitle}>What this means for Traders</Text>
                                <TouchableOpacity 
                                    style={styles.sectionCopyButton}
                                    onPress={() => copyToClipboard(
                                        analysisData.traderInsights.map((insight, i) => `${i + 1}. ${insight}`).join('\n'),
                                        'Trader Insights'
                                    )}
                                >
                                    <MaterialIcons name="content-copy" size={16} color="#A0A0A0" />
                                </TouchableOpacity>
                            </View>
                            {analysisData.traderInsights.map((insight, index) => (
                                <View key={index} style={styles.insightRow}>
                                    <Text style={styles.bulletPoint}>•</Text>
                                    <Text style={styles.insightText}>{insight}</Text>
                                </View>
                            ))}
                        </View>
                        
                        {/* Community Sentiment Poll */}
                        <View style={styles.pollSection}>
                            <View style={styles.pollHeader}>
                                <Text style={styles.pollTitle}>Sentiment Poll</Text>
                                <MaterialIcons name="info-outline" size={18} color="#A0A0A0" />
                            </View>
                            <Text style={styles.pollQuestion}>How do you feel about this story?</Text>

                            {!userVote ? (
                                <View style={styles.pollOptions}>
                                    <TouchableOpacity
                                        style={[styles.pollOption, styles.pollBearish]}
                                        onPress={() => setUserVote('BEARISH')}
                                    >
                                        <MaterialIcons name="trending-down" size={18} color="#F05454" />
                                        <Text style={styles.pollOptionText}>Bearish</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.pollOption, styles.pollNeutral]}
                                        onPress={() => setUserVote('NEUTRAL')}
                                    >
                                        <MaterialIcons name="trending-flat" size={18} color="#EAB308" />
                                        <Text style={styles.pollOptionText}>Neutral</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.pollOption, styles.pollBullish]}
                                        onPress={() => setUserVote('BULLISH')}
                                    >
                                        <MaterialIcons name="trending-up" size={18} color="#4ECCA3" />
                                        <Text style={styles.pollOptionText}>Bullish</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <View style={styles.pollResults}>
                                    {[
                                        { key: 'BULLISH' as const, label: 'Bullish', value: analysisData.finBertSentiment.bullish, color: '#4ECCA3' },
                                        { key: 'NEUTRAL' as const, label: 'Neutral', value: analysisData.finBertSentiment.neutral, color: '#EAB308' },
                                        { key: 'BEARISH' as const, label: 'Bearish', value: analysisData.finBertSentiment.bearish, color: '#F05454' },
                                    ].map((option) => (
                                        <View key={option.key} style={[styles.pollResultRow, userVote === option.key && styles.pollResultSelected]}>
                                            <View style={styles.pollResultLabelRow}>
                                                <Text style={[styles.pollResultLabel, { color: option.color }]}>{option.label}</Text>
                                                {userVote === option.key && (
                                                    <Text style={styles.pollResultBadge}>Your vote</Text>
                                                )}
                                            </View>
                                            <View style={styles.pollResultBar}>
                                                <View style={[styles.pollResultFill, { width: `${option.value}%`, backgroundColor: option.color }]} />
                                            </View>
                                            <Text style={styles.pollResultValue}>{option.value}%</Text>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </View>
                        </ScrollView>
                    </View>
                </View>
            </View>
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
        justifyContent: 'space-between',
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
});

export default AIAnalysisOverlay;
