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
import Logo from '../../components/mediakit/Logo';

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
          <Logo variant="icon" size="large" />
          <Text style={styles.appName}>Integra Markets</Text>
          <Text style={styles.appVersion}>Version 1.0.0</Text>
        </View>
        
        <Text style={styles.sectionTitle}>About Integra Markets</Text>
        <Text style={styles.sectionContent}>
          Integra Markets is an AI-powered financial analysis platform designed for commodity 
          trading professionals. Our application provides real-time market insights, sentiment 
          analysis, and intelligent news aggregation to help traders make informed decisions.
        </Text>
        
        <Text style={styles.sectionTitle}>Key Features</Text>
        <Text style={styles.sectionContent}>
          • AI-powered market analysis and sentiment tracking{'\n'}
          • Real-time commodity news and price alerts{'\n'}
          • Bring Your Own Key (BYOK) AI integration{'\n'}
          • Customizable alert preferences{'\n'}
          • Secure API key management{'\n'}
          • Professional-grade financial insights
        </Text>
        
        <Text style={styles.sectionTitle}>AI Integration</Text>
        <Text style={styles.sectionContent}>
          Our Bring Your Own Key (BYOK) model ensures you maintain full control over your AI 
          interactions. We support integration with leading AI providers including OpenAI, 
          Anthropic Claude, and Groq, allowing you to leverage cutting-edge AI technology 
          while maintaining data privacy and cost control.
        </Text>
        
        <Text style={styles.sectionTitle}>Data & Privacy</Text>
        <Text style={styles.sectionContent}>
          We prioritize your privacy and data security. Your API keys are encrypted and stored 
          locally on your device. We never access, store, or transmit your API keys to our 
          servers, ensuring your AI interactions remain private and secure.
        </Text>
        
        <Text style={styles.sectionTitle}>Support & Contact</Text>
        <Text style={styles.sectionContent}>
          For technical support, feature requests, or general inquiries:{'\n\n'}
          
          Email: support@integra-markets.com{'\n'}
          Website: www.integra-markets.com{'\n'}
          Response time: Within 24 hours
        </Text>
        
        <Text style={styles.sectionTitle}>Credits</Text>
        <Text style={styles.sectionContent}>
          Integra Markets is built with React Native and powered by Supabase. We use 
          Material Design icons and follow modern mobile development best practices 
          to deliver a professional trading experience.
        </Text>
        
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            © 2024 Integra Markets. All rights reserved.
          </Text>
          <Text style={styles.footerSubtext}>
            Built for professional commodity traders worldwide.
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
    backgroundColor: colors.accentPositive,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  logoText: {
    color: colors.bgPrimary,
    fontSize: 36,
    fontWeight: '700',
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
    marginBottom: 16,
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
