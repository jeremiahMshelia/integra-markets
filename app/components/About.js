import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Linking,
  Image,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

// Logo image
const LOGO_IMAGE = require('../../assets/logoNew.png');

const colors = {
  bgPrimary: '#121212',
  bgSecondary: '#1E1E1E',
  textPrimary: '#ECECEC',
  textSecondary: '#A0A0A0',
  accentPositive: '#4ECCA3',
  accentData: '#30A5FF',
  divider: '#333333',
  cardBorder: '#333333',
};

const About = ({ onBack }) => {
  const handleContact = () => {
    Linking.openURL('mailto:support@integra-markets.com');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bgPrimary} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <MaterialIcons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>About</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.content}>
        <View style={styles.logoSection}>
          <Image
            source={LOGO_IMAGE}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <Text style={styles.appName}>Integra Markets</Text>
          <Text style={styles.appVersion}>Version 1.0.0</Text>
        </View>

        <Text style={styles.sectionTitle}>What We Do</Text>
        <Text style={styles.sectionContent}>
          Integra Markets is a commodity intelligence platform built for traders who need
          to stay ahead of the market. We aggregate news from hundreds of sources, analyze
          sentiment, and deliver the insights that matter—directly to your device.
        </Text>
        <Text style={styles.sectionContent}>
          Whether you're tracking crude oil movements, monitoring agricultural exports,
          or watching precious metals, our platform keeps you informed without the
          information overload.
        </Text>

        <Text style={styles.sectionTitle}>Key Features</Text>
        <View style={styles.featureItem}>
          <MaterialIcons name="flash-on" size={20} color={colors.accentPositive} />
          <Text style={styles.featureText}>Real-time commodity news and price alerts</Text>
        </View>
        <View style={styles.featureItem}>
          <MaterialIcons name="psychology" size={20} color={colors.accentData} />
          <Text style={styles.featureText}>Sentiment analysis on market news</Text>
        </View>
        <View style={styles.featureItem}>
          <MaterialIcons name="notifications-active" size={20} color="#FFD700" />
          <Text style={styles.featureText}>Customizable alert preferences</Text>
        </View>
        <View style={styles.featureItem}>
          <MaterialIcons name="bookmark" size={20} color="#FF6B6B" />
          <Text style={styles.featureText}>Save and track important news</Text>
        </View>
        <View style={styles.featureItem}>
          <MaterialIcons name="public" size={20} color={colors.accentPositive} />
          <Text style={styles.featureText}>Global market coverage across regions</Text>
        </View>

        <Text style={styles.sectionTitle}>Built For Traders</Text>
        <Text style={styles.sectionContent}>
          Integra was born from the real-world pain points of commodity traders—designed
          to cut through complex, fast-moving market data and turn it into clear,
          actionable insight.
        </Text>
        <Text style={styles.sectionContent}>
          Volatility is everywhere. Data is fragmented. Integra brings structure to
          chaos—so you can trade with confidence.
        </Text>

        <Text style={styles.sectionTitle}>Support & Contact</Text>
        <Text style={styles.sectionContent}>
          Found a bug? Have a feature request? We actually read our emails.
        </Text>

        <TouchableOpacity style={styles.contactButton} onPress={handleContact}>
          <MaterialIcons name="email" size={20} color={colors.bgPrimary} />
          <Text style={styles.contactButtonText}>Contact Us</Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            © 2026 Integra Markets. All rights reserved.
          </Text>
          <Text style={styles.footerSubtext}>
            Built for commodity traders worldwide.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
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
  scrollContainer: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: colors.bgSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.accentPositive,
  },
  logoImage: {
    width: 100,
    height: 100,
    marginBottom: 16,
  },
  appName: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 4,
  },
  appVersion: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '600',
    marginTop: 24,
    marginBottom: 12,
  },
  sectionContent: {
    color: colors.textSecondary,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  featureText: {
    color: colors.textSecondary,
    fontSize: 15,
    flex: 1,
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentPositive,
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 16,
    gap: 8,
  },
  contactButtonText: {
    color: colors.bgPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    marginTop: 32,
    padding: 20,
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
  },
  footerText: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 4,
  },
  footerSubtext: {
    color: colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

export default About;
