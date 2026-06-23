import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Platform, Clipboard, Alert, ActivityIndicator, Linking } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import ChatInterface from './ChatInterface';
import PolymarketIcon from './PolymarketIcon';
import { useBookmarks } from '../providers/BookmarkProvider';
import newsAnalysisService from '../services/newsAnalysisService';
import { getPreferredSourceUrl } from '../utils/polymarketLinks';

interface NewsData {
    title: string;
    summary: string;
    source: string;
    sourceUrl?: string;
    eventUrl?: string;
    polymarketUrl?: string;
    polymarketContext?: {
        slug?: string;
    };
    timeAgo: string;
    sentiment: string;
    sentimentScore: number;
}

interface AIAnalysisOverlayProps {
    newsData: NewsData | null;
    isVisible: boolean;
    onClose: () => void;
}

const AIAnalysisOverlay: React.FC<AIAnalysisOverlayProps> = ({ newsData, isVisible, onClose }) => {
    const [showChat, setShowChat] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [analysisData, setAnalysisData] = useState<any>(null);
    const { addNewsBookmark, removeBookmark, isBookmarked, bookmarks } = useBookmarks();
    
    const isCurrentlyBookmarked = newsData ? isBookmarked(newsData.title) : false;
    const isPolymarketAnalysis = newsData?.source?.toLowerCase?.() === 'polymarket';
    const preferredSourceUrl = newsData ? getPreferredSourceUrl(newsData) : null;
    
    // Fetch analysis when component mounts or newsData changes
    useEffect(() => {
        if (newsData && isVisible) {
            fetchAnalysis();
        }
    }, [newsData, isVisible]);
    
    const fetchAnalysis = async () => {
        if (!newsData) return;
        
        setIsLoading(true);
        try {
            const analysis = await newsAnalysisService.analyzeArticle(newsData);
            setAnalysisData(analysis);
        } catch (error) {
            console.error('Error fetching analysis:', error);
            // Use fallback data
            setAnalysisData({
                summary: newsData.summary || newsData.title,
                finBertSentiment: { bullish: 33, bearish: 33, neutral: 34 },
                keyDrivers: [],
                marketImpact: { level: 'MEDIUM', confidence: 0.5 },
                traderInsights: ['Analysis unavailable - please try again later']
            });
        } finally {
            setIsLoading(false);
        }
    };
    
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
                await addNewsBookmark({
                    title: newsData.title,
                    summary: analysisData.summary,
                    source: newsData.source,
                    sourceUrl: preferredSourceUrl || undefined,
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
    
    if (!newsData) return null;

    const copyToClipboard = (text: string, sectionName: string) => {
        Clipboard.setString(text);
        Alert.alert('Copied!', `${sectionName} copied to clipboard`);
    };

    const handleSourcePress = async () => {
        if (!preferredSourceUrl) {
            Alert.alert(
                'Source Unavailable',
                isPolymarketAnalysis
                    ? 'No canonical Polymarket event URL is attached to this analysis yet.'
                    : 'No source URL is available for this article.'
            );
            return;
        }

        try {
            await Linking.openURL(preferredSourceUrl);
        } catch (error) {
            console.error('Error opening source URL:', error);
            Alert.alert('Unable to Open Link', 'The source link could not be opened.');
        }
    };

    const formatAnalysisForCopy = () => {
        if (!analysisData) return '';
        
        const sentiment = `Bullish: ${analysisData.finBertSentiment.bullish}%, Bearish: ${analysisData.finBertSentiment.bearish}%, Neutral: ${analysisData.finBertSentiment.neutral}%`;
        const drivers = analysisData.keyDrivers?.map((d: { text: string; score: number }) => `${d.text} (${d.score})`).join(', ') || 'N/A';
        const insights = analysisData.traderInsights?.map((insight: string, i: number) => `${i + 1}. ${insight}`).join('\n') || 'N/A';
        
        const header = isPolymarketAnalysis ? 'POLYMARKET ANALYSIS' : 'INTEGRA AI ANALYSIS';
        const sourceLine = preferredSourceUrl ? `Source: ${newsData.source} (${preferredSourceUrl})` : `Source: ${newsData.source}`;
        return `${header}\n\nArticle: ${newsData.title}\n${sourceLine}\n\nSUMMARY:\n${analysisData.summary}\n\nSENTIMENT:\n${sentiment}\n\nKEY DRIVERS:\n${drivers}\n\nMARKET IMPACT:\n${analysisData.marketImpact.level} (Confidence: ${analysisData.marketImpact.confidence})\n\nTRADER INSIGHTS:\n${insights}`;
    };

    // Show loading indicator while fetching
    if (isLoading || !analysisData) {
        return (
            <Modal
                animationType="slide"
                transparent={true}
                visible={isVisible}
                onRequestClose={onClose}
            >
                <View style={styles.overlayContainer}>
                    <View style={styles.webWrapper}>
                        <View style={[styles.contentContainer, styles.loadingContainer]}>
                            <ActivityIndicator size="large" color="#4ECCA3" />
                            <Text style={styles.loadingText}>Analyzing article...</Text>
                        </View>
                    </View>
                </View>
            </Modal>
        );
    }

    const renderProgressBar = (percentage: number, color: string) => (
        <View style={styles.progressBarContainer}>
            <View style={[styles.progressBar, { backgroundColor: '#404040' }]}>
                <View style={[styles.progressFill, { width: `${percentage}%`, backgroundColor: color }]} />
            </View>
        </View>
    );

    const renderDriverPill = (driver: { text: string; score: number }) => (
        <View key={driver.text} style={styles.driverPill}>
            <Text style={styles.driverText}>{driver.text} ({driver.score})</Text>
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
                            <View style={styles.headerBrand}>
                                {isPolymarketAnalysis ? (
                                    <>
                                        <PolymarketIcon size={28} rounded={false} style={undefined} />
                                        <View>
                                            <Text style={styles.title}>Polymarket Analysis</Text>
                                            <Text style={styles.brandSubtitle}>Event-driven market intelligence</Text>
                                        </View>
                                    </>
                                ) : (
                                    <Text style={styles.title}>Integra Analysis</Text>
                                )}
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
                        <TouchableOpacity onPress={handleSourcePress} disabled={!preferredSourceUrl}>
                            <Text style={[styles.source, preferredSourceUrl ? styles.sourceLink : null]}>{newsData.source}</Text>
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
                        <View style={styles.section}>
                            <View style={styles.sectionHeader}>
                                <View style={styles.sectionIndicator} />
                                <Text style={styles.sectionTitle}>Key Sentiment Drivers</Text>
                                <TouchableOpacity 
                                    style={styles.sectionCopyButton}
                                    onPress={() => copyToClipboard(
                                        analysisData.keyDrivers.map((d: { text: string; score: number }) => `${d.text} (${d.score})`).join(', '),
                                        'Key Drivers'
                                    )}
                                >
                                    <MaterialIcons name="content-copy" size={16} color="#A0A0A0" />
                                </TouchableOpacity>
                            </View>
                            <View style={styles.driversContainer}>
                                {analysisData.keyDrivers.map(renderDriverPill)}
                            </View>
                        </View>

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
                                        analysisData.traderInsights.map((insight: string, i: number) => `${i + 1}. ${insight}`).join('\n'),
                                        'Trader Insights'
                                    )}
                                >
                                    <MaterialIcons name="content-copy" size={16} color="#A0A0A0" />
                                </TouchableOpacity>
                            </View>
                            {analysisData.traderInsights.map((insight: string, index: number) => (
                                <View key={index} style={styles.insightRow}>
                                    <Text style={styles.bulletPoint}>•</Text>
                                    <Text style={styles.insightText}>{insight}</Text>
                                </View>
                            ))}
                        </View>
                        
                        {/* Chat Button */}
                        <TouchableOpacity 
                            style={styles.chatButton}
                            onPress={() => setShowChat(true)}
                        >
                            <MaterialIcons name="chat-bubble-outline" size={20} color="#000000" />
                            <Text style={styles.chatButtonText}>Ask Integra AI</Text>
                        </TouchableOpacity>
                        </ScrollView>
                    </View>
                    
                    {/* Chat Interface Modal */}
                    {showChat && (
                        <Modal
                            animationType="slide"
                            transparent={true}
                            visible={showChat}
                            onRequestClose={() => setShowChat(false)}
                        >
                            <View style={styles.chatModalContainer}>
                                <View style={styles.chatContainer}>
                                    <View style={styles.chatHeader}>
                                        <Text style={styles.chatTitle}>Integra AI Assistant</Text>
                                        <TouchableOpacity 
                                            style={styles.chatCloseButton}
                                            onPress={() => setShowChat(false)}
                                        >
                                            <MaterialIcons name="close" size={24} color="#ECECEC" />
                                        </TouchableOpacity>
                                    </View>
                                    <ChatInterface 
                                        newsContext={{
                                            title: newsData.title,
                                            summary: analysisData.summary || newsData.summary,
                                            source: newsData.source,
                                            sentiment: analysisData.finBertSentiment,
                                            keyDrivers: analysisData.keyDrivers,
                                            marketImpact: analysisData.marketImpact,
                                            traderInsights: analysisData.traderInsights,
                                            fullAnalysis: formatAnalysisForCopy()
                                        }}
                                    />
                                </View>
                            </View>
                        </Modal>
                    )}
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
    headerBrand: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flexShrink: 1,
        paddingRight: 12,
    },
    title: {
        fontSize: 22,
        fontWeight: '600',
        color: '#ECECEC',
    },
    brandSubtitle: {
        fontSize: 12,
        color: '#8FA7FF',
        marginTop: 2,
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
    sourceLink: {
        color: '#4ECCA3',
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
    chatButton: {
        backgroundColor: '#4ECCA3',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        borderRadius: 12,
        marginBottom: 30,
        marginTop: 10,
        gap: 8,
    },
    chatButtonText: {
        color: '#000000',
        fontSize: 16,
        fontWeight: '600',
    },
    chatModalContainer: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        paddingTop: Platform.OS === 'ios' ? 50 : 30,
    },
    chatContainer: {
        flex: 1,
        backgroundColor: '#121212',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        overflow: 'hidden',
        ...(Platform.OS === 'web' && {
            maxWidth: 414,
            alignSelf: 'center',
            width: '100%',
        }),
    },
    chatHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#333333',
    },
    chatTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: '#ECECEC',
    },
    chatCloseButton: {
        padding: 2,
    },
    loadingContainer: {
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: 200,
    },
    loadingText: {
        marginTop: 20,
        fontSize: 16,
        color: '#A0A0A0',
    },
});

export default AIAnalysisOverlay;
