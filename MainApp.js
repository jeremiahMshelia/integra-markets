import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import TodayDashboard from './app/components/TodayDashboard';
import AlertsScreen from './app/components/AlertsScreen';
import ProfileScreen from './app/components/ProfileScreen';
import IntegraLoadingPage from './app/components/IntegraLoadingPage';
import ErrorBoundary from './app/components/ErrorBoundary';
import { BookmarkProvider } from './app/providers/BookmarkProvider';
import PendingDeletionBanner from './app/components/PendingDeletionBanner';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerForPushNotificationsAsync } from './app/services/notificationService';
import { getPendingDeletion } from './app/services/accountService';

// Ensure __DEV__ is defined
if (typeof global.__DEV__ === 'undefined') {
  global.__DEV__ = process.env.NODE_ENV === 'development';
}

const MainApp = () => {
  const [activeTab, setActiveTab] = useState('Today');
  const [isLoading, setIsLoading] = useState(true);
  const [agentActive, setAgentActive] = useState(true);
  const [pendingDeletionExpiresAt, setPendingDeletionExpiresAt] = useState(null);

  const checkFirstLaunch = async () => {
    try {
      const hasLaunched = await AsyncStorage.getItem('has_launched');
      if (!hasLaunched) {
        // First launch - request notification permissions
        await registerForPushNotificationsAsync();
        await AsyncStorage.setItem('has_launched', 'true');
      }
    } catch (error) {
      console.error('Error checking first launch:', error);
    }
  };

  const refreshPendingDeletion = async () => {
    const result = await getPendingDeletion();
    if (result.ok) {
      setPendingDeletionExpiresAt(result.data ? result.data.expires_at : null);
    }
  };

  useEffect(() => {
    checkFirstLaunch();
    refreshPendingDeletion();
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return <IntegraLoadingPage />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'Today':
        return <TodayDashboard agentActive={agentActive} />;
      case 'Alerts':
        return <AlertsScreen />;
      case 'Profile':
        return (
          <ProfileScreen
            onAccountDeletionScheduled={(expiresAt) => {
              setPendingDeletionExpiresAt(expiresAt);
              setActiveTab('Today');
            }}
          />
        );
      default:
        return <TodayDashboard agentActive={agentActive} />;
    }
  };

  return (
    <ErrorBoundary>
      <BookmarkProvider>
        <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#121212" />

        {pendingDeletionExpiresAt ? (
          <PendingDeletionBanner
            expiresAt={pendingDeletionExpiresAt}
            onRestored={() => setPendingDeletionExpiresAt(null)}
          />
        ) : null}

        {/* Main Content */}
        <View style={styles.content}>
          {renderContent()}
        </View>

        {/* Bottom Navigation */}
        <View style={styles.bottomNav}>
          <TouchableOpacity
            style={[styles.navItem, activeTab === 'Today' && styles.navItemActive]}
            onPress={() => setActiveTab('Today')}
          >
            <Ionicons
              name={activeTab === 'Today' ? 'today' : 'today-outline'}
              size={24}
              color={activeTab === 'Today' ? '#4ECCA3' : '#666666'}
            />
            <Text style={[styles.navText, activeTab === 'Today' && styles.navTextActive]}>
              Today
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navItem, activeTab === 'Alerts' && styles.navItemActive]}
            onPress={() => setActiveTab('Alerts')}
          >
            <Ionicons
              name={activeTab === 'Alerts' ? 'notifications' : 'notifications-outline'}
              size={24}
              color={activeTab === 'Alerts' ? '#4ECCA3' : '#666666'}
            />
            <Text style={[styles.navText, activeTab === 'Alerts' && styles.navTextActive]}>
              Alerts
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navItem, activeTab === 'Profile' && styles.navItemActive]}
            onPress={() => setActiveTab('Profile')}
          >
            <Ionicons
              name={activeTab === 'Profile' ? 'person' : 'person-outline'}
              size={24}
              color={activeTab === 'Profile' ? '#4ECCA3' : '#666666'}
            />
            <Text style={[styles.navText, activeTab === 'Profile' && styles.navTextActive]}>
              Profile
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
      </BookmarkProvider>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  content: {
    flex: 1,
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: '#1E1E1E',
    borderTopWidth: 1,
    borderTopColor: '#333333',
    paddingBottom: 20,
    paddingTop: 12,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  navItemActive: {
    // Active state styling handled by icon and text colors
  },
  navText: {
    fontSize: 12,
    color: '#666666',
    marginTop: 4,
    fontWeight: '500',
  },
  navTextActive: {
    color: '#4ECCA3',
    fontWeight: '600',
  },
});

export default MainApp;