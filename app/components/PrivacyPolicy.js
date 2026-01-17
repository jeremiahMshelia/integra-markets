import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  StatusBar
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

// Use the same color palette as the main app
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

const PrivacyPolicy = ({ onBack }) => {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bgPrimary} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <MaterialIcons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.content}>
        <Text style={styles.lastUpdated}>Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>

        <Text style={styles.sectionTitle}>1. Introduction</Text>
        <Text style={styles.sectionContent}>
          Integra Markets ("we", "our", or "us") is committed to protecting your privacy while providing advanced AI-powered financial market analysis. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application and related services, including our Bring Your Own Key (BYOK) AI integration features.
        </Text>

        <Text style={styles.sectionTitle}>2. Information We Collect</Text>
        <Text style={styles.sectionContent}>
          We collect different types of information to provide and improve our services:

          • Account Information: Email address, preferences, and settings
          • Usage Data: App interactions, feature usage patterns, and session data
          • Device Information: Device type, operating system, app version, and unique identifiers
          • Financial Data Queries: Market analysis requests and trading-related questions (anonymized)
          • Third-Party API Keys: Encrypted storage of your AI service API keys (OpenAI, Anthropic, Groq)
        </Text>

        <Text style={styles.sectionTitle}>3. Bring Your Own Key (BYOK) Model</Text>
        <Text style={styles.sectionContent}>
          Our BYOK approach ensures:

          • Your API keys are encrypted and stored locally on your device
          • Direct communication between your device and your chosen AI provider
          • We never access, store, or transmit your API keys to our servers
          • You maintain full control over your AI service costs and usage
          • Your API provider's privacy policy governs the handling of your queries
        </Text>

        <Text style={styles.sectionTitle}>4. Data Usage for Service Improvement</Text>
        <Text style={styles.sectionContent}>
          To enhance our financial analysis accuracy and relevance:

          • We may analyze anonymized and aggregated usage patterns
          • Market queries and interactions are obfuscated to remove personal identifiers
          • Proprietary trading strategies and personal financial data are never stored or shared
          • Data analysis helps improve news relevance, market sentiment accuracy, and feature development
          • All personal information and specific trading queries remain confidential
        </Text>

        <Text style={styles.sectionTitle}>5. Third-Party AI Services</Text>
        <Text style={styles.sectionContent}>
          When using BYOK with third-party AI providers:

          • OpenAI, Anthropic, Groq: Your queries are subject to their respective privacy policies
          • We recommend reviewing your chosen AI provider's data usage policies
          • Your interactions with AI services are direct and not monitored by Integra Markets
          • We do not store or access the content of your AI conversations
        </Text>

        <Text style={styles.sectionTitle}>6. Data Security & Protection</Text>
        <Text style={styles.sectionContent}>
          We implement robust security measures:

          • End-to-end encryption for sensitive data transmission
          • Secure local storage for API keys using device keychain services
          • Regular security audits and updates
          • No storage of personal financial decisions or trading strategies
          • Compliance with financial data protection standards
        </Text>

        <Text style={styles.sectionTitle}>7. Information Sharing & Disclosure</Text>
        <Text style={styles.sectionContent}>
          We do not sell, trade, or share your personal information. Limited disclosure may occur:

          • When required by law or legal process
          • To protect our rights or prevent fraud
          • With your explicit consent
          • In anonymized, aggregated form for market research (no personal identifiers)
        </Text>

        <Text style={styles.sectionTitle}>8. Your Privacy Rights</Text>
        <Text style={styles.sectionContent}>
          You have comprehensive control over your data:

          • Access and review your stored information
          • Correct or update your account details
          • Delete your account and associated data
          • Revoke API key permissions at any time
          • Opt-out of anonymized usage analytics
          • Request data portability in standard formats
        </Text>

        <Text style={styles.sectionTitle}>9. Data Retention</Text>
        <Text style={styles.sectionContent}>
          • Account data: Retained while your account is active
          • Usage analytics: Anonymized data retained for service improvement
          • API keys: Deleted immediately upon account deletion or key removal
          • Cached market data: Automatically expired and refreshed regularly
        </Text>

        <Text style={styles.sectionTitle}>10. International Data Transfers</Text>
        <Text style={styles.sectionContent}>
          Your data may be processed in different countries where our service providers operate. We ensure appropriate safeguards are in place to protect your information in accordance with this policy.
        </Text>

        <Text style={styles.sectionTitle}>11. Changes to This Policy</Text>
        <Text style={styles.sectionContent}>
          We may update this Privacy Policy periodically. Significant changes will be communicated through the app or via email. Your continued use of Integra Markets constitutes acceptance of any updates.
        </Text>

        <Text style={styles.sectionTitle}>12. Contact Information</Text>
        <Text style={styles.sectionContent}>
          For privacy-related questions or concerns:

          Email: privacy@integra-markets.com
          Data Protection Officer: dpo@integra-markets.com

          Response time: We aim to respond within 72 hours
        </Text>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            By using Integra Markets, you acknowledge that you have read and understand this Privacy Policy.
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
  lastUpdated: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: 24,
    fontStyle: 'italic',
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
    marginBottom: 16,
  },
  footer: {
    marginTop: 32,
    padding: 20,
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  footerText: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

export default PrivacyPolicy;

