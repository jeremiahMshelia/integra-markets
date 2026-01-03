import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  StatusBar
} from "react-native";
import { MaterialIcons } from '@expo/vector-icons';

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

export default function ProfileScreen({ userProfile, alertPreferences, apiKeys, bookmarks, onBack, onNavigateToSettings }) {
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [showAPIKeySetup, setShowAPIKeySetup] = useState(false);
  const [showAlertPreferences, setShowAlertPreferences] = useState(false);

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

  // Default values for demo
  const defaultUserProfile = userProfile || {
    username: 'GodModeTrader301',
    role: 'trader',
    institution: 'Goldman Sachs',
    bio: 'Oil Trader at Hedge Fund with 10+ years experience',
    marketFocus: ['Oil & Oil Products', 'Metals & Minerals'],
    experience: '10+'
  };

  const defaultAlertPreferences = alertPreferences || {
    commodities: ['Crude Oil', 'Gold', 'Natural Gas'],
    frequency: 'daily',
    notifications: true
  };

  const defaultAPIKeys = apiKeys || [];
  const defaultBookmarks = bookmarks || [];

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
              <View style={styles.profileAvatar}>
                <Text style={styles.profileAvatarText}>
                  {defaultUserProfile.username?.charAt(0)?.toUpperCase() || 'U'}
                </Text>
              </View>
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>
                  {defaultUserProfile.username || 'User'}
                </Text>
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
                  {defaultAlertPreferences.commodities.length}
                </Text>
                <Text style={styles.profileStatLabel}>Alerts</Text>
              </View>
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
            <View style={styles.alertRow}>
              <Text style={styles.alertLabel}>Commodities</Text>
              <Text style={styles.alertValue}>
                {defaultAlertPreferences.commodities.length} selected
              </Text>
            </View>
            <View style={styles.alertRow}>
              <Text style={styles.alertLabel}>Frequency</Text>
              <Text style={styles.alertValue}>
                {defaultAlertPreferences.frequency.charAt(0).toUpperCase() + defaultAlertPreferences.frequency.slice(1)}
              </Text>
            </View>
            <View style={styles.alertRow}>
              <Text style={styles.alertLabel}>Notifications</Text>
              <Text style={styles.alertValue}>
                {defaultAlertPreferences.notifications ? 'Enabled' : 'Disabled'}
              </Text>
            </View>
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
            <Text style={styles.bookmarkCount}>{defaultBookmarks.length}</Text>
          </View>

          {defaultBookmarks.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No bookmarks yet</Text>
              <Text style={styles.emptyStateSubtext}>
                Bookmark news articles to save them for later
              </Text>
            </View>
          ) : (
            <View style={styles.bookmarksList}>
              {defaultBookmarks.slice(0, 3).map((bookmark) => (
                <View key={bookmark.id} style={styles.bookmarkItem}>
                  <View style={styles.bookmarkContent}>
                    <Text style={styles.bookmarkTitle} numberOfLines={2}>
                      {bookmark.title}
                    </Text>
                    <Text style={styles.bookmarkSource}>{bookmark.source}</Text>
                  </View>
                  <MaterialIcons name="bookmark" color={colors.accentPositive} size={16} />
                </View>
              ))}
              {defaultBookmarks.length > 3 && (
                <TouchableOpacity style={styles.viewAllButton}>
                  <Text style={styles.viewAllText}>View all {defaultBookmarks.length} bookmarks</Text>
                  <MaterialIcons name="chevron-right" color={colors.accentPositive} size={16} />
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
});
