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

const TermsOfService = ({ onBack }) => {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bgPrimary} />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <MaterialIcons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.content}>
        <Text style={styles.lastUpdated}>Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
        <Text style={styles.sectionTitle}>1. Agreement to Terms</Text>
        <Text style={styles.sectionContent}>
          These Terms of Service constitute a legally binding agreement made between you,
          whether personally or on behalf of an entity ("you") and Integra Markets ("Company",
          "we", "us", or "our"), concerning your access to and use of the Integra Markets mobile
          application as well as any other form of media, media channel, mobile website, or
          mobile application related, linked, or otherwise connected thereto (collectively, the
          "Site"). You agree that by accessing the Site, you have read, understood, and agreed
          to be bound by all of these Terms of Service.
        </Text>
        <Text style={styles.sectionTitle}>2. Intellectual Property Rights</Text>
        <Text style={styles.sectionContent}>
          Unless otherwise indicated, the Site is our proprietary property and all source code,
          databases, functionality, software, website designs, audio, video, text, photographs,
          and graphics on the Site (collectively, the "Content") and the trademarks, service
          marks, and logos contained therein (the "Marks") are owned or controlled by us or
          licensed to us, and are protected by copyright and trademark laws and various other
          intellectual property rights and unfair competition laws of the United States,
          international copyright laws, and international conventions.
        </Text>
        <Text style={styles.sectionTitle}>3. User Representations</Text>
        <Text style={styles.sectionContent}>
          By using the Site, you represent and warrant that: (1) you have the legal capacity
          and you agree to comply with these Terms of Service; (2) you are not a minor in the
          jurisdiction in which you reside, or if a minor, you have received parental permission
          to use the Site; (3) you will not access the Site through automated or non-human means,
          whether through a bot, script, or otherwise; (4) you will not use the Site for any
          illegal or unauthorized purpose; and (5) your use of the Site will not violate any
          applicable law or regulation.
        </Text>

        <Text style={styles.sectionTitle}>4. Financial Information Disclaimer</Text>
        <Text style={styles.sectionContent}>
          Integra Markets provides AI-powered financial analysis and market insights for informational
          purposes only. This information does not constitute financial advice, investment recommendations,
          or trading signals. You acknowledge that:

          • All market analysis is based on AI interpretation and may contain errors
          • Past performance does not guarantee future results
          • Trading and investment decisions carry inherent risks
          • You should consult with qualified financial advisors before making investment decisions
          • Integra Markets is not liable for any financial losses resulting from use of our services
        </Text>

        <Text style={styles.sectionTitle}>5. API Key Management (BYOK)</Text>
        <Text style={styles.sectionContent}>
          Our Bring Your Own Key (BYOK) model requires you to:

          • Maintain valid API keys with supported AI providers (OpenAI, Anthropic, Groq)
          • Be responsible for all costs and usage associated with your API keys
          • Ensure your API keys comply with the respective provider's terms of service
          • Understand that we do not monitor or control your API usage
          • Accept that service interruptions may occur due to API key issues or provider downtime
        </Text>

        <Text style={styles.sectionTitle}>6. Prohibited Uses</Text>
        <Text style={styles.sectionContent}>
          You may not use our service:

          • For any unlawful purpose or to solicit others to unlawful acts
          • To violate any international, federal, provincial, or state regulations or laws
          • To transmit or procure the sending of any advertising or promotional material
          • To impersonate or attempt to impersonate the Company, employees, or other users
          • To harass, abuse, insult, harm, defame, slander, disparage, intimidate, or discriminate
          • To submit false or misleading information
          • To engage in any automated use of the system
        </Text>

        <Text style={styles.sectionTitle}>7. User Generated Content</Text>
        <Text style={styles.sectionContent}>
          You may post, upload, or contribute content to the service. By doing so, you grant us
          a license to use, reproduce, adapt, modify, publish, or distribute such content. You
          represent that you own or have the necessary rights to such content and that use of
          your content does not infringe any third-party rights.
        </Text>

        <Text style={styles.sectionTitle}>8. Privacy Policy</Text>
        <Text style={styles.sectionContent}>
          Your privacy is important to us. Please review our Privacy Policy, which also governs
          your use of the Site, to understand our practices.
        </Text>

        <Text style={styles.sectionTitle}>9. Termination</Text>
        <Text style={styles.sectionContent}>
          We may terminate or suspend your account and bar access to the service immediately,
          without prior notice or liability, under our sole discretion, for any reason whatsoever
          and without limitation, including but not limited to a breach of the Terms.
        </Text>

        <Text style={styles.sectionTitle}>10. Disclaimer</Text>
        <Text style={styles.sectionContent}>
          The information on this site is provided on an "as is" basis. To the fullest extent
          permitted by law, this Company excludes all representations, warranties, conditions
          and terms related to our service.
        </Text>

        <Text style={styles.sectionTitle}>11. Governing Law</Text>
        <Text style={styles.sectionContent}>
          These Terms shall be interpreted and governed by the laws of the United States,
          without regard to its conflict of law provisions.
        </Text>

        <Text style={styles.sectionTitle}>12. Changes to Terms</Text>
        <Text style={styles.sectionContent}>
          We reserve the right to modify these terms at any time. We will notify users of
          any material changes via email or through the application.
        </Text>

        <Text style={styles.sectionTitle}>13. Contact Information</Text>
        <Text style={styles.sectionContent}>
          Questions about the Terms of Service should be sent to us at legal@integra-markets.com
        </Text>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            By using Integra Markets, you acknowledge that you have read and agree to these Terms of Service.
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

export default TermsOfService;

