import React, { useEffect, useState } from "react";
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  Alert,
  SafeAreaView,
  StatusBar, 
  ActivityIndicator
} from "react-native";
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'react-native';
import { useBookmarks } from '../providers/BookmarkProvider';
import { userService } from '../services/userService';
import DeleteAccountModal from './DeleteAccountModal';

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

export default function ProfileScreen({ userProfile, alertPreferences, apiKeys, onBack, onNavigateToSettings, onLogout, onNavigateToBookmarks, onAccountDeletionScheduled }) {
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [showAPIKeySetup, setShowAPIKeySetup] = useState(false);
  const [showAlertPreferences, setShowAlertPreferences] = useState(false);
  const [showAllBookmarks, setShowAllBookmarks] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState(null);
  const [resolvedProfile, setResolvedProfile] = useState(userProfile || null);
  const [uploading, setUploading] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Sorry, we need camera roll permissions to upload a profile photo.');
        return;
      }

      const result = await ImagePicker.launchImagePickerAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        setUploading(true);
        try {
          // Upload to your backend/storage service
          const formData = new FormData();
          formData.append('photo', {
            uri: result.assets[0].uri,
            type: 'image/jpeg',
            name: 'profile-photo.jpg',
          });

          // Update this with your actual API endpoint
          const response = await fetch('YOUR_UPLOAD_ENDPOINT', {
            method: 'POST',
            body: formData,
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          });

          const uploadResult = await response.json();
          
          if (uploadResult.url) {
            setResolvedProfile(prev => ({
              ...prev,
              photoUrl: uploadResult.url
            }));
            Alert.alert('Success', 'Profile photo updated successfully!');
          } else {
            throw new Error('Upload failed');
          }
        } catch (error) {
          console.error('Error uploading photo:', error);
          Alert.alert('Error', 'Failed to upload profile photo. Please try again.');
        } finally {
          setUploading(false);
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to select image. Please try again.');
    }
  };
  
  const { bookmarks, removeBookmark } = useBookmarks();

  useEffect(() => {
    let mounted = true;
    const loadProfile = async () => {
      try {
        setLoadingProfile(true);
        setProfileError(null);
        const profile = await userService.getCurrentUser();
        if (mounted) {
          if (profile) {
            setResolvedProfile(profile);
          } else {
            setProfileError('Unable to load user profile.');
          }
        }
      } catch (e) {
        if (mounted) setProfileError('An unexpected error occurred loading the profile.');
      } finally {
        if (mounted) setLoadingProfile(false);
      }
    };
    loadProfile();
    return () => { mounted = false; };
  }, []);

  const handleDeleteKey = (keyId, keyName) => {
    Alert.alert(
      'Delete API Key',
      `Are you sure you want to delete "${keyName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // Handle key deletion here
            console.log('Delete key:', keyId);
          }
        }
      ]
    );
  };

  const handleProviderSelect = (provider) => {
    setSelectedProvider(provider);
  };

// Remove demo defaults; derive from resolvedProfile
  const effectiveUserProfile = resolvedProfile || null;

  const defaultAlertPreferences = alertPreferences || {
    commodities: ['Crude Oil', 'Gold', 'Natural Gas'],
    frequency: 'daily',
    notifications: true
  };

  const defaultAPIKeys = apiKeys || [];
  
  const handleDeleteBookmark = (bookmarkId, bookmarkTitle) => {
    Alert.alert(
      'Delete Bookmark',
      `Are you sure you want to delete "${bookmarkTitle}"?`,
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

      {loadingProfile ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgPrimary }}>
          <ActivityIndicator size="large" color={colors.accentPositive} />
          <Text style={{ color: colors.textSecondary, marginTop: 12 }}>Loading profile…</Text>
        </View>
      ) : profileError ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: colors.textSecondary, textAlign: 'center', marginBottom: 12 }}>{profileError}</Text>
          <TouchableOpacity onPress={() => {
            setLoadingProfile(true);
            setProfileError(null);
            // Trigger reload
            (async () => {
              const profile = await userService.getCurrentUser();
              if (profile) setResolvedProfile(profile); else setProfileError('Unable to load user profile.');
              setLoadingProfile(false);
            })();
          }} style={[styles.viewAllButton, { paddingHorizontal: 24 }]}>
            <Text style={styles.viewAllText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
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
            <TouchableOpacity 
              style={styles.profileHeader}
              onPress={() => navigateToScreen('EditProfile')}
              activeOpacity={0.7}
            >
              <TouchableOpacity 
                style={styles.profileAvatar}
                onPress={pickImage}
                disabled={uploading}
              >
                {uploading ? (
                  <ActivityIndicator color={colors.bgPrimary} />
                ) : resolvedProfile?.photoUrl ? (
                  <Image 
                    source={{ uri: resolvedProfile.photoUrl }} 
                    style={styles.avatarImage}
                    defaultSource={require('../assets/default-avatar.png')}
                  />
                ) : (
                  <Text style={styles.profileAvatarText}>
                    {effectiveUserProfile?.username?.charAt(0)?.toUpperCase() || 'U'}
                  </Text>
                )}
                <View style={styles.cameraIconContainer}>
                  <MaterialIcons 
                    name="photo-camera" 
                    size={16} 
                    color={colors.bgPrimary} 
                  />
                </View>
              </TouchableOpacity>
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>
                  {effectiveUserProfile?.username || effectiveUserProfile?.email || 'User'}
                </Text>
                {effectiveUserProfile?.role ? (
                  <Text style={styles.profileRole}>
                    {getRoleLabel(effectiveUserProfile.role)}
                  </Text>
                ) : null}
                {effectiveUserProfile?.institution && (
                  <Text style={styles.profileInstitution}>
                    {effectiveUserProfile.institution}
                  </Text>
                )}
              </View>
              <MaterialIcons name="edit" size={20} color={colors.textSecondary} style={styles.editIcon} />
            </TouchableOpacity>
              
              {effectiveUserProfile?.bio ? (
                <Text style={styles.profileBio}>{effectiveUserProfile.bio}</Text>
              ) : null}
              
              <View style={styles.profileStats}>
                <TouchableOpacity 
                  style={styles.profileStat}
                  onPress={() => navigateToScreen('MarketFocus')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.profileStatValue}>
                    {effectiveUserProfile?.marketFocus?.length || 0}
                  </Text>
                  <Text style={styles.profileStatLabel}>Market Focus</Text>
                  <MaterialIcons name="arrow-forward" size={16} color={colors.textSecondary} style={styles.statIcon} />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.profileStat}
                  onPress={() => navigateToScreen('Experience')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.profileStatValue}>
                    {effectiveUserProfile?.experience || '-'}
                  </Text>
                  <Text style={styles.profileStatLabel}>Experience</Text>
                  <MaterialIcons name="arrow-forward" size={16} color={colors.textSecondary} style={styles.statIcon} />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.profileStat}
                  onPress={() => setShowAlertPreferences(true)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.profileStatValue}>
                    {defaultAlertPreferences.commodities.length}
                  </Text>
                  <Text style={styles.profileStatLabel}>Alerts</Text>
                  <MaterialIcons name="arrow-forward" size={16} color={colors.textSecondary} style={styles.statIcon} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

        {/* Alert Preferences Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleContainer}>
              <MaterialIcons name="notifications" color={colors.accentPositive} size={20} />
              <Text style={styles.sectionTitle}>Alert Preferences</Text>
            </View>
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => setShowAlertPreferences(true)}
            >
              <Text style={styles.editButtonText}>Edit</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.alertsCard}>
          <TouchableOpacity 
            style={styles.alertRow}
            onPress={() => navigateToScreen('CommodityPreferences')}
            activeOpacity={0.7}
          >
            <Text style={styles.alertLabel}>Commodities</Text>
            <View style={styles.alertValueContainer}>
              <Text style={styles.alertValue}>
                {defaultAlertPreferences.commodities.length} selected
              </Text>
              <MaterialIcons name="chevron-right" size={16} color={colors.textSecondary} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.alertRow}
            onPress={() => navigateToScreen('AlertFrequency')}
            activeOpacity={0.7}
          >
            <Text style={styles.alertLabel}>Frequency</Text>
            <View style={styles.alertValueContainer}>
              <Text style={styles.alertValue}>
                {defaultAlertPreferences.frequency.charAt(0).toUpperCase() + defaultAlertPreferences.frequency.slice(1)}
              </Text>
              <MaterialIcons name="chevron-right" size={16} color={colors.textSecondary} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.alertRow}
            onPress={() => navigateToScreen('NotificationSettings')}
            activeOpacity={0.7}
          >
            <Text style={styles.alertLabel}>Notifications</Text>
            <View style={styles.alertValueContainer}>
              <Text style={styles.alertValue}>
                {defaultAlertPreferences.notifications ? 'Enabled' : 'Disabled'}
              </Text>
              <MaterialIcons name="chevron-right" size={16} color={colors.textSecondary} />
            </View>
          </TouchableOpacity>
          </View>
        </View>

        {/* API Keys Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleContainer}>
              <MaterialIcons name="vpn-key" color={colors.accentPositive} size={20} />
              <Text style={styles.sectionTitle}>API Keys</Text>
            </View>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowAPIKeySetup(true)}
            >
              <MaterialIcons name="add" color={colors.accentPositive} size={20} />
            </TouchableOpacity>
          </View>

          {defaultAPIKeys.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No API keys configured</Text>
              <Text style={styles.emptyStateSubtext}>
                Add an API key to start chatting with AI
              </Text>
            </View>
          ) : (
            <View style={styles.keysList}>
              {defaultAPIKeys.map((key) => (
                <View key={key.id} style={styles.keyItem}>
                  <TouchableOpacity
                    style={[
                      styles.keyContent,
                      selectedProvider === key.provider && styles.selectedKey
                    ]}
                    onPress={() => handleProviderSelect(key.provider)}
                  >
                    <View style={styles.keyInfo}>
                      <Text style={styles.keyName}>{key.name}</Text>
                      <Text style={styles.keyProvider}>{getProviderLabel(key.provider)}</Text>
                      <Text style={styles.keyDate}>
                        Added {key.createdAt?.toLocaleDateString() || 'Recently'}
                      </Text>
                    </View>
                    {selectedProvider === key.provider && (
                      <View style={styles.selectedBadge}>
                        <Text style={styles.selectedBadgeText}>Active</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDeleteKey(key.id, key.name)}
                  >
                    <MaterialIcons name="delete" color={colors.accentNegative} size={18} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Bookmarks Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleContainer}>
              <MaterialIcons name="bookmark" color={colors.accentPositive} size={20} />
              <Text style={styles.sectionTitle}>Bookmarks</Text>
            </View>
            <TouchableOpacity 
              style={styles.manageButton}
              onPress={() => onNavigateToBookmarks ? onNavigateToBookmarks() : handleViewAllBookmarks()}
            >
              <Text style={styles.bookmarkCount}>{bookmarks.length}</Text>
              <MaterialIcons name="chevron-right" color={colors.accentPositive} size={20} />
            </TouchableOpacity>
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
                <TouchableOpacity 
                  key={bookmark.id} 
                  style={styles.bookmarkItem}
                  onPress={() => onNavigateToBookmarks ? onNavigateToBookmarks() : handleViewAllBookmarks()}
                >
                  <View style={styles.bookmarkContent}>
                    <Text style={styles.bookmarkTitle} numberOfLines={2}>
                      {bookmark.title}
                    </Text>
                    <Text style={styles.bookmarkSource}>
                      {bookmark.type === 'chat' ? 'AI Chat' : bookmark.source}
                    </Text>
                    {bookmark.type === 'news' && bookmark.sentiment && (
                      <Text style={[styles.bookmarkSentiment, {
                        color: bookmark.sentiment === 'BULLISH' ? colors.accentPositive :
                               bookmark.sentiment === 'BEARISH' ? colors.accentNegative :
                               colors.accentNeutral
                      }]}>
                        {bookmark.sentiment}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity 
                    style={styles.deleteBookmarkButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleDeleteBookmark(bookmark.id, bookmark.title);
                    }}
                  >
                    <MaterialIcons name="delete" color={colors.accentNegative} size={18} />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
              {!showAllBookmarks && bookmarks.length > 3 && (
                <TouchableOpacity 
                  style={styles.viewAllButton} 
                  onPress={() => onNavigateToBookmarks ? onNavigateToBookmarks() : handleViewAllBookmarks()}
                >
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

        <View style={[styles.section, { marginTop: 20 }]}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleContainer}>
              <MaterialIcons name="person-off" color={colors.accentNegative} size={20} />
              <Text style={styles.sectionTitle}>Account</Text>
            </View>
          </View>

          <View style={styles.settingsList}>
            <TouchableOpacity
              style={[styles.settingItem, { borderBottomWidth: 0 }]}
              onPress={() => setShowDeleteModal(true)}
            >
              <View style={styles.logoutContainer}>
                <MaterialIcons name="delete-forever" color={colors.accentNegative} size={20} />
                <Text style={[styles.settingText, { color: colors.accentNegative, marginLeft: 8 }]}>Delete account</Text>
              </View>
              <MaterialIcons name="chevron-right" color={colors.textSecondary} size={16} />
            </TouchableOpacity>
          </View>
        </View>
        </ScrollView>
      )}
      <DeleteAccountModal
        visible={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onDeleted={(expiresAt) => {
          setShowDeleteModal(false);
          if (onAccountDeletionScheduled) onAccountDeletionScheduled(expiresAt);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  editIcon: {
    position: 'absolute',
    right: 12,
    top: 12,
    opacity: 0.6,
  },
  statIcon: {
    marginTop: 4,
  },
  alertValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
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
  manageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
    position: 'relative',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.accentPositive,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  avatarImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  cameraIconContainer: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    backgroundColor: colors.accentPositive,
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.bgPrimary,
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
