import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  StatusBar,
  Image,
  ActivityIndicator,
} from "react-native";
import { MaterialIcons } from '@expo/vector-icons';
import { useBookmarks } from '../providers/BookmarkProvider';
import { supabaseService } from '../services/supabaseService';
import * as ImagePicker from 'expo-image-picker';

// Use the same color palette as the main app
const colors = {
  bgPrimary: '#121212',
  bgSecondary: '#1E1E1E',
  textPrimary: '#ECECEC',
  textSecondary: '#A0A0A0',
  accentPositive: '#4ECCA3',
  accentPositiveBg: 'rgba(78, 204, 163, 0.1)',
  accentNeutral: '#A0A0A0',
  accentNeutralBg: 'rgba(160, 160, 160, 0.1)',
  accentNegative: '#F05454',
  accentNegativeBg: 'rgba(240, 84, 84, 0.1)',
  accentData: '#30A5FF',
  divider: '#333333',
  cardBorder: '#333333',
};

const getProviderLabel = (provider) => {
  switch (provider) {
    case 'openai': return 'OpenAI ChatGPT';
    case 'claude': return 'Anthropic Claude';
    case 'groq': return 'Groq';
    default: return provider;
  }
};

const getRoleLabel = (role) => {
  const roleMap = {
    'trader': 'Trader',
    'analyst': 'Analyst',
    'hedge-fund': 'Hedge Fund',
    'bank': 'Bank',
    'refiner': 'Refiner',
    'blender': 'Blender',
    'producer': 'Producer',
    'shipping': 'Shipping & Freight'
  };
  return roleMap[role] || role;
};

export default function ProfileScreen({ userProfile, onBack, onNavigateToSettings, onLogout, onOpenArticle }) {
  const [showAllBookmarks, setShowAllBookmarks] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState(userProfile?.profilePhoto || null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoKey, setPhotoKey] = useState(Date.now()); // For cache busting

  const { bookmarks, removeBookmark } = useBookmarks();

  // Load profile from Supabase on mount
  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const profile = await supabaseService.getProfile();
      if (profile?.avatar_url) {
        setProfilePhoto(profile.avatar_url);
      }
    } catch (error) {
      console.log('Error loading profile:', error);
    }
  };

  const handleEditProfilePhoto = async () => {
    try {
      // Request permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow access to your photo library to change your profile picture.');
        return;
      }

      // Pick image - using new MediaType API
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setIsUploadingPhoto(true);

        const uploadResult = await supabaseService.uploadAvatar(result.assets[0].uri);

        if (uploadResult.success) {
          setProfilePhoto(uploadResult.url);
          setPhotoKey(Date.now()); // Force image refresh
          Alert.alert('Success', 'Profile photo updated!');
        } else {
          Alert.alert('Upload Failed', uploadResult.error || 'Could not upload photo. Please try again.');
        }

        setIsUploadingPhoto(false);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      setIsUploadingPhoto(false);
      Alert.alert('Error', 'Could not update profile photo. Please try again.');
    }
  };



  // Default values for demo
  const defaultUserProfile = userProfile || {
    username: 'GodModeTrader301',
    role: 'trader',
    institution: 'Goldman Sachs',
    bio: 'Oil Trader at Hedge Fund with 10+ years experience',
    marketFocus: ['Oil & Oil Products', 'Metals & Minerals'],
    experience: '10+'
  };

  const handleDeleteBookmark = (bookmarkId, bookmarkTitle) => {
    Alert.alert(
      'Delete Bookmark',
      `Are you sure you want to delete "${bookmarkTitle}" ? `,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeBookmark(bookmarkId);
              Alert.alert('Deleted', 'Bookmark removed successfully');
            } catch (error) {
              console.error('Error deleting bookmark:', error);
              Alert.alert('Error', 'Failed to delete bookmark. Please try again.');
            }
          }
        }
      ]
    );
  };

  const handleViewAllBookmarks = () => {
    setShowAllBookmarks(true);
  };

  const navigateToScreen = (screenName) => {
    if (onNavigateToSettings) {
      onNavigateToSettings(screenName);
    } else {
      Alert.alert('Coming Soon', `${screenName} will be available in the next update.`);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bgPrimary} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <MaterialIcons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* User Profile Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleContainer}>
              <MaterialIcons name="person" color={colors.accentPositive} size={20} />
              <Text style={styles.sectionTitle}>Profile</Text>
            </View>
          </View>

          <View style={styles.profileCard}>
            <View style={styles.profileHeader}>
              <TouchableOpacity onPress={handleEditProfilePhoto} disabled={isUploadingPhoto}>
                {isUploadingPhoto ? (
                  <View style={[styles.profileAvatar, styles.profileAvatarLoading]}>
                    <ActivityIndicator color={colors.accentPositive} />
                  </View>
                ) : profilePhoto || defaultUserProfile.profilePhoto ? (
                  <View>
                    <Image
                      source={{
                        uri: `${profilePhoto || defaultUserProfile.profilePhoto}?t=${photoKey}`,
                        cache: 'reload'
                      }}
                      style={styles.profileAvatar}
                    />
                    <View style={styles.editAvatarBadge}>
                      <MaterialIcons name="edit" size={12} color="#FFF" />
                    </View>
                  </View>
                ) : (
                  <View>
                    <View style={styles.profileAvatar}>
                      <Text style={styles.profileAvatarText}>
                        {defaultUserProfile.username?.charAt(0)?.toUpperCase() || 'U'}
                      </Text>
                    </View>
                    <View style={styles.editAvatarBadge}>
                      <MaterialIcons name="add-a-photo" size={12} color="#FFF" />
                    </View>
                  </View>
                )}
              </TouchableOpacity>
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>
                  {defaultUserProfile.username || 'User'}
                </Text>
                {defaultUserProfile.email && (
                  <Text style={styles.profileEmail}>
                    {defaultUserProfile.email}
                  </Text>
                )}
                <Text style={styles.profileRole}>
                  {getRoleLabel(defaultUserProfile.role)}
                </Text>
                {defaultUserProfile.institution && (
                  <Text style={styles.profileInstitution}>
                    {defaultUserProfile.institution}
                  </Text>
                )}
              </View>
            </View>

            {defaultUserProfile.bio && (
              <Text style={styles.profileBio}>{defaultUserProfile.bio}</Text>
            )}

            <View style={styles.profileStats}>
              <View style={styles.profileStat}>
                <Text style={styles.profileStatValue}>
                  {defaultUserProfile.marketFocus?.length || 0}
                </Text>
                <Text style={styles.profileStatLabel}>Market Focus</Text>
              </View>
              <View style={styles.profileStat}>
                <Text style={styles.profileStatValue}>
                  {defaultUserProfile.experience}
                </Text>
                <Text style={styles.profileStatLabel}>Experience</Text>
              </View>
              <View style={styles.profileStat}>
                <Text style={styles.profileStatValue}>
                  {bookmarks.length}
                </Text>
                <Text style={styles.profileStatLabel}>Bookmarks</Text>
              </View>
            </View>
          </View>
        </View>



        {/* Bookmarks Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleContainer}>
              <MaterialIcons name="bookmark" color={colors.accentPositive} size={20} />
              <Text style={styles.sectionTitle}>Bookmarks</Text>
            </View>
            <Text style={styles.bookmarkCount}>{bookmarks.length}</Text>
          </View>

          {bookmarks.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No bookmarks yet</Text>
              <Text style={styles.emptyStateSubtext}>
                Bookmark news articles to save them for later
              </Text>
            </View>
          ) : (
            <View style={styles.bookmarksList}>
              {(showAllBookmarks ? bookmarks : bookmarks.slice(0, 3)).map((bookmark) => (
                <View key={bookmark.id} style={styles.bookmarkItem}>
                  <TouchableOpacity
                    style={styles.bookmarkContent}
                    onPress={() => {
                      if (onOpenArticle) {
                        onOpenArticle(bookmark);
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.bookmarkTitle} numberOfLines={2}>
                      {bookmark.title}
                    </Text>
                    <Text style={styles.bookmarkSource}>{bookmark.source}</Text>
                    {bookmark.sentiment && (
                      <Text style={[styles.bookmarkSentiment, {
                        color: bookmark.sentiment === 'BULLISH' ? colors.accentPositive :
                          bookmark.sentiment === 'BEARISH' ? colors.accentNegative :
                            colors.accentNeutral
                      }]}>
                        {bookmark.sentiment}
                      </Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteBookmarkButton}
                    onPress={() => handleDeleteBookmark(bookmark.id, bookmark.title)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <MaterialIcons name="delete" color={colors.accentNegative} size={18} />
                  </TouchableOpacity>
                </View>
              ))}
              {!showAllBookmarks && bookmarks.length > 3 && (
                <TouchableOpacity style={styles.viewAllButton} onPress={handleViewAllBookmarks}>
                  <Text style={styles.viewAllText}>View all {bookmarks.length} bookmarks</Text>
                  <MaterialIcons name="chevron-right" color={colors.accentPositive} size={16} />
                </TouchableOpacity>
              )}
              {showAllBookmarks && bookmarks.length > 3 && (
                <TouchableOpacity style={styles.viewAllButton} onPress={() => setShowAllBookmarks(false)}>
                  <Text style={styles.viewAllText}>Show less</Text>
                  <MaterialIcons name="chevron-up" color={colors.accentPositive} size={16} />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Settings Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleContainer}>
              <MaterialIcons name="settings" color={colors.accentPositive} size={20} />
              <Text style={styles.sectionTitle}>Settings</Text>
            </View>
          </View>

          <View style={styles.settingsList}>
            <TouchableOpacity style={styles.settingItem} onPress={() => navigateToScreen('NotificationsSettings')}>
              <Text style={styles.settingText}>Notifications</Text>
              <MaterialIcons name="chevron-right" color={colors.textSecondary} size={16} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.settingItem} onPress={() => navigateToScreen('PrivacyPolicy')}>
              <Text style={styles.settingText}>Privacy Policy</Text>
              <MaterialIcons name="chevron-right" color={colors.textSecondary} size={16} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.settingItem} onPress={() => navigateToScreen('TermsOfService')}>
              <Text style={styles.settingText}>Terms of Service</Text>
              <MaterialIcons name="chevron-right" color={colors.textSecondary} size={16} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.settingItem} onPress={() => navigateToScreen('About')}>
              <Text style={styles.settingText}>About</Text>
              <MaterialIcons name="chevron-right" color={colors.textSecondary} size={16} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.settingItem, { borderBottomWidth: 0 }]}
              onPress={onLogout}
            >
              <View style={styles.logoutContainer}>
                <MaterialIcons name="exit-to-app" color={colors.accentNegative} size={20} />
                <Text style={[styles.settingText, { color: colors.accentNegative, marginLeft: 8 }]}>Log out</Text>
              </View>
              <MaterialIcons name="chevron-right" color={colors.textSecondary} size={16} />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backButton: {
    padding: 5,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  headerSpacer: {
    width: 34,
  },
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: "600",
  },
  editButton: {
    backgroundColor: colors.accentPositiveBg,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.accentPositive,
  },
  editButtonText: {
    color: colors.accentPositive,
    fontSize: 14,
    fontWeight: "500",
  },
  addButton: {
    backgroundColor: colors.accentPositiveBg,
    borderRadius: 20,
    padding: 8,
    borderWidth: 1,
    borderColor: colors.accentPositive,
  },
  bookmarkCount: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  profileCard: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  profileAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.accentPositive,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  profileAvatarLoading: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 2,
    borderColor: colors.accentPositive,
  },
  editAvatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 12,
    backgroundColor: colors.accentPositive,
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bgSecondary,
  },
  profileAvatarText: {
    color: colors.bgPrimary,
    fontSize: 24,
    fontWeight: "600",
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 4,
  },
  profileEmail: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: 4,
  },
  profileRole: {
    color: colors.accentPositive,
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 2,
  },
  profileInstitution: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  profileBio: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  profileStats: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  profileStat: {
    alignItems: "center",
  },
  profileStatValue: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 4,
  },
  profileStatLabel: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  alertsCard: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: "hidden",
  },
  alertRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  alertLabel: {
    color: colors.textPrimary,
    fontSize: 16,
  },
  alertValue: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  emptyState: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  emptyStateText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 8,
  },
  emptyStateSubtext: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: "center",
  },
  keysList: {
    gap: 12,
  },
  keyItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: "hidden",
  },
  keyContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  selectedKey: {
    backgroundColor: colors.accentPositiveBg,
  },
  keyInfo: {
    flex: 1,
  },
  keyName: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 4,
  },
  keyProvider: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: 2,
  },
  keyDate: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  selectedBadge: {
    backgroundColor: colors.accentPositive,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  selectedBadgeText: {
    color: colors.bgPrimary,
    fontSize: 12,
    fontWeight: "500",
  },
  deleteButton: {
    padding: 16,
    borderLeftWidth: 1,
    borderLeftColor: colors.divider,
  },
  bookmarksList: {
    gap: 12,
  },
  bookmarkItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  bookmarkContent: {
    flex: 1,
  },
  bookmarkTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 4,
  },
  bookmarkSource: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: 4,
  },
  bookmarkSentiment: {
    fontSize: 12,
    fontWeight: '500',
  },
  deleteBookmarkButton: {
    padding: 8,
    marginLeft: 8,
  },
  viewAllButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentPositiveBg,
    borderRadius: 12,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.accentPositive,
  },
  viewAllText: {
    color: colors.accentPositive,
    fontSize: 16,
    fontWeight: "500",
  },
  settingsList: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: "hidden",
  },
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  settingText: {
    color: colors.textPrimary,
    fontSize: 16,
  },
  logoutContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
