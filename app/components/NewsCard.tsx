import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Alert, Share, Platform, ActionSheetIOS, Clipboard } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SingleStar } from './CustomStarIcon';
import PolymarketIcon from './PolymarketIcon';
import { useBookmarks } from '../providers/BookmarkProvider';
import { getPreferredSourceUrl } from '../utils/polymarketLinks';

interface NewsItem {
  id?: number;
  title: string;
  content?: string;
  summary?: string;
  date?: string;
  source?: string;
  sourceUrl?: string;
  eventUrl?: string;
  polymarketUrl?: string;
  sentiment?: string;
  sentimentScore?: string;
  timeAgo?: string;
  commodities?: string[];
  marketImpact?: string;
  polymarketContext?: {
    slug?: string;
  };
  // Divergence enrichment (added by TodayDashboard from /v1/markets/divergence).
  // Optional — undefined for articles whose topic has no prediction-market match.
  divergenceProvider?: 'polymarket' | 'kalshi';
  divergenceStatus?: 'ALIGNED' | 'DIVERGENCE' | 'NO_DATA';
  divergenceDelta?: number; // signed, -1..+1; +ve = news more bullish than market
}

interface NewsCardProps {
  item: NewsItem;
  onAIClick: (newsItem: NewsItem) => void;
}

export default function NewsCard({ item, onAIClick }: NewsCardProps) {
  const { addNewsBookmark, removeBookmark, isBookmarked, newsBookmarks } = useBookmarks();
  const isCurrentlyBookmarked = isBookmarked(item.title, 'news');
  const isPolymarket = item.source?.toLowerCase() === 'polymarket';
  const preferredSourceUrl = getPreferredSourceUrl(item);

  const handleBookmarkToggle = async () => {
    try {
      if (isCurrentlyBookmarked) {
        // Find the bookmark by title and remove it
        const bookmark = newsBookmarks.find(b => b.title === item.title);
        if (bookmark) {
          await removeBookmark(bookmark.id);
        }
      } else {
        // Add new news bookmark with enhanced fields
        await addNewsBookmark({
          title: item.title,
          summary: item.summary || item.content || '',
          source: item.source || 'Unknown',
          sourceUrl: preferredSourceUrl || undefined,
          sentiment: (item.sentiment?.toUpperCase() as "BULLISH" | "BEARISH" | "NEUTRAL") || 'NEUTRAL',
          sentimentScore: parseFloat(item.sentimentScore || '0.5'),
          commodities: Array.isArray(item.commodities) ? item.commodities : undefined,
          marketImpact: item.marketImpact,
          tags: [item.source || 'news', ...(item.commodities || [])]
        });
      }
    } catch (error) {
      console.error('Bookmark error:', error);
      // Error alert is handled by the provider
    }
  };
  const handleSourcePress = async () => {
    // First check if we have a valid URL
    if (preferredSourceUrl) {
      try {
        // Ensure the URL has a protocol
        let url = preferredSourceUrl;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }
        
        const supported = await Linking.canOpenURL(url);
        if (supported) {
          await Linking.openURL(url);
        } else {
          // Try to open anyway as canOpenURL might return false for valid URLs on some platforms
          await Linking.openURL(url);
        }
      } catch (error) {
        console.error('Error opening URL:', error);
        // Provide a more informative message
        Alert.alert(
          'Unable to Open Link',
          `Could not open the source website. You can search for "${item.title}" on ${item.source || 'the web'} to find the article or event.`,
          [{ text: 'OK' }]
        );
      }
    } else {
      // No URL available, just show source info
      Alert.alert(
        'Source Information',
        `This article is from ${item.source || 'an unknown source'}. No direct link is available.`,
        [{ text: 'OK' }]
      );
    }
  };

  const handleShare = async () => {
    const shareMessage = `${item.title}\n\n${item.summary || item.content || ''}\n\nSource: ${item.source || 'Unknown'}`;
    const shareUrl = preferredSourceUrl || '';
    const fullShareText = shareUrl ? `${shareMessage}\n\nRead more: ${shareUrl}` : shareMessage;
    
    if (Platform.OS === 'ios') {
      // iOS: Show ActionSheet with specific options
      const options = [
        'Cancel',
        'Share via Email',
        'Share on Twitter',
        'Copy Link',
        'More Options'
      ];
      
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: 0,
          title: 'Share Article',
          message: item.title
        },
        async (buttonIndex) => {
          try {
            switch (buttonIndex) {
              case 1: // Email
                await handleEmailShare(shareMessage, shareUrl);
                break;
              case 2: // Twitter
                await handleTwitterShare(item.title, shareUrl);
                break;
              case 3: // Copy Link
                await handleCopyLink(shareUrl || fullShareText);
                break;
              case 4: // More Options (Native Share Sheet)
                await handleNativeShare(fullShareText, shareUrl);
                break;
            }
          } catch (error) {
            console.error('Share action error:', error);
            Alert.alert('Share Error', 'Unable to complete sharing action.');
          }
        }
      );
    } else {
      // Android: Use native share directly
      await handleNativeShare(fullShareText, shareUrl);
    }
  };
  
  const handleEmailShare = async (message: string, url: string) => {
    const subject = encodeURIComponent(`Market News: ${item.title}`);
    const body = encodeURIComponent(`${message}${url ? `\n\nRead more: ${url}` : ''}`);
    const mailtoUrl = `mailto:?subject=${subject}&body=${body}`;
    
    try {
      const canOpen = await Linking.canOpenURL(mailtoUrl);
      if (canOpen) {
        await Linking.openURL(mailtoUrl);
      } else {
        Alert.alert('Email Not Available', 'No email app is configured on this device.');
      }
    } catch (error) {
      console.error('Email share error:', error);
      Alert.alert('Error', 'Unable to open email app.');
    }
  };
  
  const handleTwitterShare = async (title: string, url: string) => {
    const tweetText = encodeURIComponent(`${title}${url ? ` ${url}` : ''}`);
    const twitterUrl = `https://twitter.com/intent/tweet?text=${tweetText}`;
    
    try {
      // Try Twitter app first, then fall back to web
      const twitterAppUrl = `twitter://post?message=${tweetText}`;
      const canOpenApp = await Linking.canOpenURL(twitterAppUrl);
      
      if (canOpenApp) {
        await Linking.openURL(twitterAppUrl);
      } else {
        await Linking.openURL(twitterUrl);
      }
    } catch (error) {
      console.error('Twitter share error:', error);
      Alert.alert('Error', 'Unable to share on Twitter.');
    }
  };
  
  const handleCopyLink = async (content: string) => {
    try {
      if (preferredSourceUrl) {
        // Copy just the URL if available
        await Clipboard.setString(preferredSourceUrl);
        Alert.alert('Link Copied', `${isPolymarket ? 'Event' : 'Article'} link copied to clipboard.`);
      } else {
        // Copy the full text if no URL
        await Clipboard.setString(content);
        Alert.alert('Text Copied', 'Article content copied to clipboard.');
      }
    } catch (error) {
      console.error('Copy error:', error);
      Alert.alert('Error', 'Unable to copy to clipboard.');
    }
  };
  
  const handleNativeShare = async (message: string, url: string) => {
    try {
      const shareOptions: any = {
        message,
        title: item.title,
      };
      
      // On iOS, provide URL separately for better app integration
      if (Platform.OS === 'ios' && url) {
        shareOptions.url = url;
      }
      
      const result = await Share.share(shareOptions);
      
      if (result.action === Share.sharedAction) {
        console.log('Content shared successfully');
      }
    } catch (error) {
      console.error('Native share error:', error);
      Alert.alert('Share Error', 'Unable to share this article.');
    }
  };

  const renderSentimentIcon = (sentiment: string) => {
    const color = getSentimentColor(sentiment);
    switch (sentiment?.toUpperCase()) {
      case 'BULLISH':
        return <Feather name="trending-up" size={14} color={color} />;
      case 'BEARISH':
        return <Feather name="trending-down" size={14} color={color} />;
      case 'NEUTRAL':
        return <Feather name="arrow-right" size={14} color={color} />;
      default:
        return <Feather name="minus" size={14} color={color} />;
    }
  };

  return (
    <View style={styles.card}>
      {/* Header with sentiment and action buttons */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {item.sentiment && (
            <View style={styles.sentimentBadge}>
              <View style={styles.sentimentIconContainer}>
                {renderSentimentIcon(item.sentiment)}
              </View>
              <Text style={[styles.sentimentLabel, { color: getSentimentColor(item.sentiment) }]}>
                {item.sentiment.toUpperCase()}
              </Text>
              <Text style={[styles.sentimentScore, { color: getSentimentColor(item.sentiment) }]}>
                {item.sentimentScore || '0.50'}
              </Text>
            </View>
          )}
          {isPolymarket && (
            <View style={styles.polymarketBadge}>
              <PolymarketIcon size={18} rounded={false} style={undefined} />
              <Text style={styles.polymarketText}>Polymarket</Text>
            </View>
          )}
        </View>
        <View style={styles.actionButtons}>
          <TouchableOpacity onPress={handleBookmarkToggle} style={styles.bookmarkButton}>
            <Feather 
              name={isCurrentlyBookmarked ? "bookmark" : "bookmark"} 
              size={18} 
              color={isCurrentlyBookmarked ? "#FFD700" : "#666666"} 
              fill={isCurrentlyBookmarked ? "#FFD700" : "none"}
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onAIClick(item)} style={styles.starButton}>
            <SingleStar size={35} color="#4a9eff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Main title */}
      <Text style={styles.title}>{item.title}</Text>

      {/* Description */}
      {(item.summary || item.content) && (
        <Text style={styles.description} numberOfLines={3}>
          {item.summary || item.content}
        </Text>
      )}

      {/* Divergence footer — only renders if upstream enriched this article
          with a divergence reading (sentiment vs. prediction-market gap). */}
      {item.divergenceStatus === 'DIVERGENCE' && item.divergenceProvider && typeof item.divergenceDelta === 'number' && (
        <View style={styles.divergenceFooter}>
          <Feather name="alert-triangle" size={12} color="#fbbf24" />
          <Text style={styles.divergenceText}>
            {item.divergenceProvider === 'polymarket' ? 'Polymarket' : 'Kalshi'}
            {' '}
            {item.divergenceDelta > 0 ? 'underpricing' : 'overpricing'}
            {' '}
            by {Math.round(Math.abs(item.divergenceDelta) * 100)}pt
          </Text>
        </View>
      )}

      {/* Footer with source and share */}
      <View style={styles.footer}>
        <View style={styles.sourceContainer}>
          {item.source && (
            <TouchableOpacity onPress={handleSourcePress} style={styles.sourceButton}>
              <Text style={[styles.sourceText, preferredSourceUrl ? styles.sourceTextLink : null]}>
                {item.source}
              </Text>
              {preferredSourceUrl && (
                <Feather name="external-link" size={14} color="#4a9eff" style={styles.linkIcon} />
              )}
            </TouchableOpacity>
          )}
          <Text style={styles.timeAgo}>{item.timeAgo || item.date || '4 hours ago'}</Text>
        </View>
        <TouchableOpacity onPress={handleShare} style={styles.shareButton}>
          <Feather name="share-2" size={16} color="#666666" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const getSentimentColor = (sentiment: string): string => {
  switch (sentiment?.toUpperCase()) {
    case 'BULLISH': return '#4ade80';
    case 'BEARISH': return '#ff6b6b';
    case 'NEUTRAL': return '#fbbf24';
    default: return '#888888';
  }
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    // Border removed - background contrast is sufficient
    shadowColor: 'rgba(0, 0, 0, 0.2)',
    shadowRadius: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    flex: 1,
    marginRight: 8,
  },
  sentimentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  polymarketBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 10,
  },
  polymarketText: {
    color: '#8FA7FF',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  divergenceFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: 'rgba(251, 191, 36, 0.08)',
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  divergenceText: {
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 6,
  },
  sentimentIconContainer: {
    marginRight: 6,
  },
  sentimentLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginRight: 6,
  },
  sentimentScore: {
    fontSize: 12,
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bookmarkButton: {
    padding: 8,
    marginRight: 8,
  },
  starButton: {
    padding: 2,
  },
  starIcon: {
    fontSize: 20,
    color: '#4a9eff',
  },
  iconWithStarsButton: {
    padding: 2,
    marginLeft: 8,
  },
  moreIcon: {
    fontSize: 20,
    color: '#888888',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginTop: 6,
    marginBottom: 8,
    lineHeight: 26,
  },
  description: {
    fontSize: 14,
    fontWeight: '400',
    color: '#9CA3AF',
    marginBottom: 20,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sourceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sourceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  sourceText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '500',
    marginRight: 4,
  },
  sourceTextLink: {
    color: '#3B82F6',
    textDecorationLine: 'underline',
  },
  linkIcon: {
    marginLeft: 4,
  },
  linkIconFeather: {
    marginLeft: 4,
  },
  timeAgo: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '400',
  },
  shareButton: {
    padding: 2,
  },
  shareIcon: {
    fontSize: 16,
    color: '#666666',
  },
});
