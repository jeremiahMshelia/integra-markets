import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Alert, Share, Platform, ActionSheetIOS, Clipboard, Image } from 'react-native';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import { SingleStar } from './CustomStarIcon';
import { useBookmarks } from '../providers/BookmarkProvider';
import * as Haptics from 'expo-haptics';

interface NewsItem {
  id?: number;
  title: string;
  content?: string;
  summary?: string;
  fullSummary?: string; // Full untruncated summary for AI overlay
  date?: string;
  source?: string;
  sourceUrl?: string;
  sentiment?: string;
  sentiment_score?: number | string;
  sentimentScore?: string | number;
  timeAgo?: string;
  image_url?: string; // Image URL for the card
  // Backend preprocessing fields
  bullish?: number;
  bearish?: number;
  neutral?: number;
  market_impact?: string;
  trade_ideas?: string[];
  event_type?: string;
  severity?: string;
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

interface NewsCardProps {
  item: NewsItem;
  onAIClick: (newsItem: NewsItem) => void;
}

export default function NewsCard({ item, onAIClick }: NewsCardProps) {
  const { addBookmark, removeBookmark, isBookmarked, bookmarks } = useBookmarks();
  const isCurrentlyBookmarked = isBookmarked(item.title);

  // Debug log for image_url
  console.log('[NewsCard] Title:', item.title?.slice(0, 30), 'image_url:', item.image_url?.slice(0, 50));

  // Handle regular press with light haptic feedback
  const handlePress = () => {
    // Fire haptic without awaiting (so it doesn't block on simulator)
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {
      // Haptics not available (simulator)
    }
    onAIClick(item);
  };

  // Handle long press with heavy haptic feedback
  const handleLongPress = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch (e) {
      // Haptics not available (simulator)
    }
    onAIClick(item);
  };

  const handleBookmarkToggle = async () => {
    try {
      if (isCurrentlyBookmarked) {
        // Find the bookmark by title and remove it
        const bookmark = bookmarks.find(b => b.title === item.title);
        if (bookmark) {
          await removeBookmark(bookmark.id);
        }
      } else {
        // Add new bookmark
        await addBookmark({
          title: item.title,
          summary: item.summary || item.content || '',
          source: item.source || 'Unknown',
          sentiment: (item.sentiment?.toUpperCase() as "BULLISH" | "BEARISH" | "NEUTRAL") || 'NEUTRAL',
          sentimentScore: typeof item.sentiment_score === 'number' ? item.sentiment_score : parseFloat(item.sentimentScore as string || '0.5')
        });
      }
    } catch (error) {
      console.error('Bookmark error:', error);
      Alert.alert('Error', 'Failed to update bookmark');
    }
  };
  const handleSourcePress = async () => {
    // First check if we have a valid URL
    if (item.sourceUrl && item.sourceUrl !== '#') {
      try {
        // Ensure the URL has a protocol
        let url = item.sourceUrl;
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
          `Could not open the source website. You can search for "${item.title}" on ${item.source || 'the web'} to find the article.`,
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
    const shareUrl = item.sourceUrl && item.sourceUrl !== '#' ? item.sourceUrl : '';
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
      if (item.sourceUrl && item.sourceUrl !== '#') {
        // Copy just the URL if available
        await Clipboard.setString(item.sourceUrl);
        Alert.alert('Link Copied', 'Article link copied to clipboard.');
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
        return <MaterialIcons name="east" size={14} color={color} />;
      default:
        return <Feather name="minus" size={14} color={color} />;
    }
  };

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={handlePress}
      onLongPress={handleLongPress}
      delayLongPress={400}
      activeOpacity={0.85}
    >
      {/* Image Section - Always render (using fallback logo if needed) */}
      <View style={[styles.imageContainer, !item.image_url && { justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' }]}>
        <Image
          source={item.image_url ? { uri: item.image_url } : require('../../assets/NewLogoInt.png.png')}
          style={[
            styles.cardImage,
            !item.image_url && {
              opacity: 0.8,
              width: '55%',
              height: '55%',
            }
          ]}
          resizeMode={item.image_url ? "cover" : "contain"}
        />

        {/* Sentiment badge at bottom-left with dark transparent background */}
        {item.sentiment && (
          <View style={styles.imageSentimentBadge}>
            {renderSentimentIcon(item.sentiment)}
            <Text style={[styles.imageSentimentText, { color: getSentimentColor(item.sentiment) }]}>
              {item.sentiment.toUpperCase()} {formatScore(item.sentiment_score || item.sentimentScore)}
            </Text>
          </View>
        )}
      </View>

      {/* Content Section */}
      <View style={styles.contentSection}>


        {/* Title row with AI button on the right */}
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
          <View style={styles.titleActionButtons}>
            <TouchableOpacity onPress={() => onAIClick(item)} style={styles.starButton}>
              <SingleStar size={28} color="#4a9eff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Description */}
        <Text style={styles.description} numberOfLines={item.image_url ? 3 : 4}>
          {item.summary || item.content || 'More details would go here...'}
        </Text>

        {/* Footer with source, time, bookmark and share */}
        <View style={styles.footer}>
          <View style={styles.sourceContainer}>
            {item.source && (
              <TouchableOpacity onPress={handleSourcePress} style={styles.sourceButton}>
                <Text style={[styles.sourceText, item.sourceUrl && item.sourceUrl !== '#' ? styles.sourceTextLink : null]}>
                  {item.source}
                </Text>
                {item.sourceUrl && item.sourceUrl !== '#' && (
                  <Feather name="external-link" size={14} color="#4a9eff" style={styles.linkIcon} />
                )}
              </TouchableOpacity>
            )}
            <Text style={styles.timeAgo}>{item.timeAgo || item.date || '4 hours ago'}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity onPress={handleBookmarkToggle} style={styles.bookmarkButton}>
              <Feather
                name="bookmark"
                size={16}
                color={isCurrentlyBookmarked ? "#FFD700" : "#666666"}
              />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleShare} style={styles.shareButton}>
              <Feather name="share-2" size={16} color="#666666" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const formatScore = (score: string | number | undefined): string => {
  if (score === undefined || score === null) return '0.50';
  const numProps = typeof score === 'string' ? parseFloat(score) : score;
  return isNaN(numProps) ? '0.50' : numProps.toFixed(2);
};

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
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2A2A2E',
    shadowColor: 'rgba(0, 0, 0, 0.2)',
    shadowRadius: 4,
    overflow: 'hidden',
  },
  imageContainer: {
    position: 'relative',
    width: '100%',
    height: 180,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  imageSentimentBadge: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  imageSentimentText: {
    fontSize: 12,
    fontWeight: '700',
  },
  contentSection: {
    padding: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  titleActionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    flexShrink: 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sentimentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
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
    lineHeight: 22,
    flex: 1,
  },
  description: {
    fontSize: 14,
    fontWeight: '400',
    color: '#EEEEEE',
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
