import React, { useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import NewsCard from './NewsCard';
import AIAnalysisOverlay from './AIAnalysisOverlay';

const samplePolymarketItem = {
  id: 'polymarket-preview-1',
  title: 'What will WTI Crude Oil (WTI) hit in May 2026?',
  summary:
    'Recent Iran and Middle East headlines skew constructive for crude, with geopolitical risk and shipping concerns keeping the near-term tone supportive for oil prices. Overall sentiment for oil across the last 20 relevant headlines is bullish.',
  content:
    'US-Iran diplomacy, Strait of Hormuz risk, and regional escalation headlines continue to shape the oil narrative for prediction markets.',
  source: 'Polymarket',
  sourceUrl: 'https://polymarket.com/event/us-x-iran-permanent-peace-deal-by',
  timeAgo: '18m ago',
  sentiment: 'BULLISH',
  sentimentScore: '0.81',
  commodities: ['OIL', 'GOLD', 'SILVER'],
  marketImpact: 'HIGH',
};

const sampleReutersItem = {
  id: 'standard-preview-1',
  title: 'OPEC+ ministers signal continued output discipline into summer',
  summary:
    'Energy traders are watching for tighter balances as supply discipline and stronger seasonal demand support the broader crude complex.',
  source: 'Reuters',
  sourceUrl: 'https://www.reuters.com',
  timeAgo: '1h ago',
  sentiment: 'BULLISH',
  sentimentScore: '0.74',
  commodities: ['OIL'],
  marketImpact: 'MEDIUM',
};

const PolymarketPreviewScreen = ({ onBack }) => {
  const [selectedArticle, setSelectedArticle] = useState(null);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#ECECEC" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Polymarket Card Preview</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>React Native Preview</Text>
          <Text style={styles.heroText}>
            This screen uses the real `NewsCard` and `AIAnalysisOverlay` components so you can verify the
            Polymarket badge, summary styling, and branded analysis header inside the Expo app.
          </Text>
        </View>

        <Text style={styles.sectionLabel}>Polymarket Card</Text>
        <NewsCard item={samplePolymarketItem} onAIClick={setSelectedArticle} />

        <Text style={styles.sectionLabel}>Standard Card</Text>
        <NewsCard item={sampleReutersItem} onAIClick={setSelectedArticle} />
      </ScrollView>

      <AIAnalysisOverlay
        newsData={selectedArticle}
        isVisible={Boolean(selectedArticle)}
        onClose={() => setSelectedArticle(null)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    color: '#ECECEC',
    fontSize: 18,
    fontWeight: '600',
  },
  headerSpacer: {
    width: 32,
  },
  content: {
    paddingVertical: 20,
  },
  hero: {
    marginHorizontal: 20,
    marginBottom: 18,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  heroTitle: {
    color: '#ECECEC',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  heroText: {
    color: '#A0A0A0',
    fontSize: 14,
    lineHeight: 22,
  },
  sectionLabel: {
    color: '#8FA7FF',
    fontSize: 13,
    fontWeight: '600',
    marginHorizontal: 20,
    marginBottom: 8,
    marginTop: 8,
  },
});

export default PolymarketPreviewScreen;
