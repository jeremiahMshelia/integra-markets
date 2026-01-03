import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  TextInput,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { DEFAULT_WEBSITE_SOURCES, getSuggestedWebsiteURLs } from '../config/default_sources';
import { supabaseService } from '../services/supabaseService';

// Color palette
const colors = {
  bgPrimary: '#121212',
  bgSecondary: '#1E1E1E',
  textPrimary: '#ECECEC',
  textSecondary: '#A0A0A0',
  accentPositive: '#4ECCA3',
  accentData: '#30A5FF',
  divider: '#333333',
};

const AlertPreferencesForm = ({ onComplete, onSkip, showSkipOption = false }) => {
  // Step-based wizard (1: Commodities, 2: Regions, 3: Currencies, 4: Websites, 5: Settings)
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 5;

  // All selections start empty - user must choose
  const [selectedCommodities, setSelectedCommodities] = useState([]);
  const [selectedRegions, setSelectedRegions] = useState([]);
  const [selectedCurrencies, setSelectedCurrencies] = useState([]);
  const [alertFrequency, setAlertFrequency] = useState('Daily');
  const [alertThreshold, setAlertThreshold] = useState('Medium');
  const [pushNotifications, setPushNotifications] = useState(true);
  const [emailAlerts, setEmailAlerts] = useState(false);
  const [customCommodity, setCustomCommodity] = useState('');
  const [customRegion, setCustomRegion] = useState('');
  const [customCurrency, setCustomCurrency] = useState('');
  const [websiteURL, setWebsiteURL] = useState('');
  const [websiteURLs, setWebsiteURLs] = useState([]);
  const [customKeyword, setCustomKeyword] = useState('');
  const [keywords, setKeywords] = useState([]);

  const tabs = ['Commodities', 'Regions', 'Currencies', 'Websites', 'Keywords'];
  const frequencies = ['Real-time', 'Daily', 'Weekly'];
  const thresholds = ['Low', 'Medium', 'High'];

  const suggestedCommodities = [
    'Crude Oil', 'WTI', 'Brent', 'Natural Gas', 'Gold', 'Silver',
    'Copper', 'Corn', 'Soybeans', 'Wheat', 'Tin', 'Zinc'
  ];

  const suggestedRegions = [
    'North America', 'Europe', 'Asia Pacific', 'Middle East',
    'South America', 'Africa', 'Eastern Europe', 'Southeast Asia'
  ];

  const suggestedCurrencies = [
    'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD',
    'AUD', 'CNY', 'RUB', 'INR', 'BRL', 'SAR'
  ];

  const suggestedWebsites = DEFAULT_WEBSITE_SOURCES;

  // Commodities functions
  const removeCommodity = (commodity) => {
    setSelectedCommodities(prev => prev.filter(item => item !== commodity));
  };

  const addCommodity = (commodity) => {
    if (!selectedCommodities.includes(commodity)) {
      setSelectedCommodities(prev => [...prev, commodity]);
    }
  };

  const addCustomCommodity = () => {
    if (customCommodity.trim() && !selectedCommodities.includes(customCommodity.trim())) {
      setSelectedCommodities(prev => [...prev, customCommodity.trim()]);
      setCustomCommodity('');
    }
  };

  // Regions functions
  const removeRegion = (region) => {
    setSelectedRegions(prev => prev.filter(item => item !== region));
  };

  const addRegion = (region) => {
    if (!selectedRegions.includes(region)) {
      setSelectedRegions(prev => [...prev, region]);
    }
  };

  const addCustomRegion = () => {
    if (customRegion.trim() && !selectedRegions.includes(customRegion.trim())) {
      setSelectedRegions(prev => [...prev, customRegion.trim()]);
      setCustomRegion('');
    }
  };

  // Currencies functions
  const removeCurrency = (currency) => {
    setSelectedCurrencies(prev => prev.filter(item => item !== currency));
  };

  const addCurrency = (currency) => {
    if (!selectedCurrencies.includes(currency)) {
      setSelectedCurrencies(prev => [...prev, currency]);
    }
  };

  const addCustomCurrency = () => {
    if (customCurrency.trim() && !selectedCurrencies.includes(customCurrency.trim())) {
      setSelectedCurrencies(prev => [...prev, customCurrency.trim()]);
      setCustomCurrency('');
    }
  };

  // Keywords functions
  const removeKeyword = (keyword) => {
    setKeywords(prev => prev.filter(item => item !== keyword));
  };

  const addKeyword = (keyword) => {
    if (!keywords.includes(keyword)) {
      setKeywords(prev => [...prev, keyword]);
    }
  };

  const addCustomKeyword = () => {
    if (customKeyword.trim() && !keywords.includes(customKeyword.trim())) {
      setKeywords(prev => [...prev, customKeyword.trim()]);
      setCustomKeyword('');
    }
  };

  // Website URLs functions
  const removeWebsiteURL = (url) => {
    setWebsiteURLs(prev => prev.filter(item => item !== url));
  };

  const addWebsiteURL = () => {
    if (websiteURL.trim() && !websiteURLs.includes(websiteURL.trim())) {
      // Basic URL validation
      const urlPattern = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;
      if (urlPattern.test(websiteURL.trim())) {
        setWebsiteURLs(prev => [...prev, websiteURL.trim()]);
        setWebsiteURL('');
      } else {
        Alert.alert('Invalid URL', 'Please enter a valid website URL');
      }
    }
  };

  const handleSavePreferences = async () => {
    const preferences = {
      commodities: selectedCommodities,
      regions: selectedRegions,
      currencies: selectedCurrencies,
      keywords: keywords,
      websiteUrls: websiteURLs,
      alertFrequency,
      alertThreshold,
      pushEnabled: pushNotifications,
      emailEnabled: emailAlerts,
    };

    // Save to Supabase
    const result = await supabaseService.saveAlertPreferences(preferences);

    if (result.success) {
      const totalItems = selectedCommodities.length + selectedRegions.length + selectedCurrencies.length + keywords.length + websiteURLs.length;

      Alert.alert(
        'Preferences Saved',
        `Your alert preferences have been saved${result.local ? ' locally' : ' to your account'}:\n• ${selectedCommodities.length} commodities\n• ${selectedRegions.length} regions\n• ${selectedCurrencies.length} currencies\n• ${keywords.length} keywords\n• ${websiteURLs.length} website sources\n\nTotal: ${totalItems} tracking items`,
        [
          {
            text: 'Continue',
            onPress: () => onComplete(preferences)
          }
        ]
      );
    } else {
      Alert.alert('Error', result.error || 'Failed to save preferences. Please try again.');
    }
  };

  const handleSkipPreferences = () => {
    Alert.alert(
      'Skip Alert Setup',
      'You can always set up alerts later in the app. Continue without setting up alerts?',
      [
        { text: 'Continue Setup', style: 'cancel' },
        {
          text: 'Skip for Now',
          onPress: () => {
            console.log('Alert preferences skipped');
            onSkip && onSkip();
          }
        }
      ]
    );
  };

  const renderCommoditiesTab = () => (
    <View style={styles.tabContent}>
      {/* Selected Commodities */}
      <Text style={styles.sectionTitle}>Selected Commodities</Text>
      {selectedCommodities.length > 0 ? (
        <View style={styles.selectedCommoditiesContainer}>
          {selectedCommodities.map((commodity, index) => (
            <View key={index} style={styles.commodityTag}>
              <Text style={styles.commodityTagText}>{commodity}</Text>
              <TouchableOpacity onPress={() => removeCommodity(commodity)}>
                <MaterialIcons name="close" size={16} color={colors.accentData} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyCommoditiesText}>No commodities selected yet.</Text>
      )}

      {/* Custom Commodity Input */}
      <View style={styles.customInputContainer}>
        <TextInput
          style={styles.customInput}
          placeholder="Enter custom commodity"
          placeholderTextColor={colors.textSecondary}
          value={customCommodity}
          onChangeText={setCustomCommodity}
        />
        <TouchableOpacity style={styles.addButton} onPress={addCustomCommodity}>
          <MaterialIcons name="add" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Suggested Options */}
      <Text style={styles.sectionTitle}>Suggested Options:</Text>
      <View style={styles.suggestedOptionsContainer}>
        {suggestedCommodities.map((commodity, index) => (
          <TouchableOpacity
            key={index}
            style={[
              styles.suggestedOption,
              selectedCommodities.includes(commodity) && styles.selectedSuggestedOption
            ]}
            onPress={() => addCommodity(commodity)}
          >
            <Text style={[
              styles.suggestedOptionText,
              selectedCommodities.includes(commodity) && styles.selectedSuggestedOptionText
            ]}>
              {commodity}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderRegionsTab = () => (
    <View style={styles.tabContent}>
      {/* Selected Regions */}
      <Text style={styles.sectionTitle}>Selected Regions</Text>
      {selectedRegions.length > 0 ? (
        <View style={styles.selectedCommoditiesContainer}>
          {selectedRegions.map((region, index) => (
            <View key={index} style={[styles.commodityTag, { backgroundColor: colors.accentData }]}>
              <Text style={styles.commodityTagText}>{region}</Text>
              <TouchableOpacity onPress={() => removeRegion(region)}>
                <MaterialIcons name="close" size={16} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyCommoditiesText}>No regions selected yet.</Text>
      )}

      {/* Custom Region Input */}
      <View style={styles.customInputContainer}>
        <TextInput
          style={styles.customInput}
          placeholder="Enter custom region"
          placeholderTextColor={colors.textSecondary}
          value={customRegion}
          onChangeText={setCustomRegion}
        />
        <TouchableOpacity style={styles.addButton} onPress={addCustomRegion}>
          <MaterialIcons name="add" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Suggested Options */}
      <Text style={styles.sectionTitle}>Suggested Options:</Text>
      <View style={styles.suggestedOptionsContainer}>
        {suggestedRegions.map((region, index) => (
          <TouchableOpacity
            key={index}
            style={[
              styles.suggestedOption,
              selectedRegions.includes(region) && styles.selectedSuggestedOption
            ]}
            onPress={() => addRegion(region)}
          >
            <Text style={[
              styles.suggestedOptionText,
              selectedRegions.includes(region) && styles.selectedSuggestedOptionText
            ]}>
              {region}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderCurrenciesTab = () => (
    <View style={styles.tabContent}>
      {/* Selected Currencies */}
      <Text style={styles.sectionTitle}>Selected Currencies</Text>
      {selectedCurrencies.length > 0 ? (
        <View style={styles.selectedCommoditiesContainer}>
          {selectedCurrencies.map((currency, index) => (
            <View key={index} style={[styles.commodityTag, { backgroundColor: colors.accentData }]}>
              <Text style={styles.commodityTagText}>{currency}</Text>
              <TouchableOpacity onPress={() => removeCurrency(currency)}>
                <MaterialIcons name="close" size={16} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyCommoditiesText}>No currencies selected yet.</Text>
      )}

      {/* Custom Currency Input */}
      <View style={styles.customInputContainer}>
        <TextInput
          style={styles.customInput}
          placeholder="Enter custom currency"
          placeholderTextColor={colors.textSecondary}
          value={customCurrency}
          onChangeText={setCustomCurrency}
        />
        <TouchableOpacity style={styles.addButton} onPress={addCustomCurrency}>
          <MaterialIcons name="add" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Suggested Options */}
      <Text style={styles.sectionTitle}>Suggested Options:</Text>
      <View style={styles.suggestedOptionsContainer}>
        {suggestedCurrencies.map((currency, index) => (
          <TouchableOpacity
            key={index}
            style={[
              styles.suggestedOption,
              selectedCurrencies.includes(currency) && styles.selectedSuggestedOption
            ]}
            onPress={() => addCurrency(currency)}
          >
            <Text style={[
              styles.suggestedOptionText,
              selectedCurrencies.includes(currency) && styles.selectedSuggestedOptionText
            ]}>
              {currency}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderWebsitesTab = () => (
    <View style={styles.tabContent}>
      {/* Selected Websites */}
      <Text style={styles.sectionTitle}>Selected Websites</Text>
      {websiteURLs.length > 0 ? (
        <View style={styles.selectedCommoditiesContainer}>
          {websiteURLs.map((url, index) => (
            <View key={index} style={[styles.commodityTag, { backgroundColor: colors.accentData }]}>
              <Text style={styles.commodityTagText} numberOfLines={1}>{url}</Text>
              <TouchableOpacity onPress={() => removeWebsiteURL(url)}>
                <MaterialIcons name="close" size={16} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyCommoditiesText}>No websites added yet.</Text>
      )}

      {/* Website URL Input */}
      <View style={styles.customInputContainer}>
        <TextInput
          style={styles.customInput}
          placeholder="Enter website URL"
          placeholderTextColor={colors.textSecondary}
          value={websiteURL}
          onChangeText={setWebsiteURL}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity style={styles.addButton} onPress={addWebsiteURL}>
          <MaterialIcons name="add" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Suggested Websites */}
      <Text style={styles.sectionTitle}>Suggested Sources:</Text>
      <View style={styles.suggestedOptionsContainer}>
        {suggestedWebsites.map((website, index) => (
          <TouchableOpacity
            key={index}
            style={[
              styles.suggestedOption,
              websiteURLs.includes(website.url) && styles.selectedSuggestedOption
            ]}
            onPress={() => {
              if (!websiteURLs.includes(website.url)) {
                setWebsiteURLs(prev => [...prev, website.url]);
              }
            }}
          >
            <Text style={[
              styles.suggestedOptionText,
              websiteURLs.includes(website.url) && styles.selectedSuggestedOptionText
            ]}>
              {website.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
  const renderKeywordsTab = () => (
    <View style={styles.tabContent}>
      {/* Selected Keywords */}
      <Text style={styles.sectionTitle}>Selected Keywords</Text>
      {keywords.length > 0 ? (
        <View style={styles.selectedCommoditiesContainer}>
          {keywords.map((keyword, index) => (
            <View key={index} style={[styles.commodityTag, { backgroundColor: colors.accentPositive }]}>
              <Text style={[styles.commodityTagText, { color: colors.bgPrimary }]}>{keyword}</Text>
              <TouchableOpacity onPress={() => removeKeyword(keyword)}>
                <MaterialIcons name="close" size={16} color={colors.bgPrimary} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyCommoditiesText}>No keywords selected yet.</Text>
      )}

      {/* Custom Keyword Input */}
      <View style={styles.customInputContainer}>
        <TextInput
          style={styles.customInput}
          placeholder="Enter keyword to track"
          placeholderTextColor={colors.textSecondary}
          value={customKeyword}
          onChangeText={setCustomKeyword}
        />
        <TouchableOpacity style={styles.addButton} onPress={addCustomKeyword}>
          <MaterialIcons name="add" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <Text style={styles.thresholdDescription}>
        Track specific keywords in news articles and market reports
      </Text>
    </View>
  );

  const renderSourcesTab = () => (
    <View style={styles.tabContent}>
      <Text style={styles.sectionTitle}>News Sources</Text>
      <Text style={styles.emptyCommoditiesText}>Configure your preferred news sources and RSS feeds here.</Text>

      <Text style={styles.thresholdDescription}>
        This section will allow you to configure various news sources, RSS feeds, and other information sources for your alerts.
      </Text>
    </View>
  );

  // Step navigation
  const handleNextStep = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1: return selectedCommodities.length > 0;
      case 2: return selectedRegions.length > 0;
      case 3: return selectedCurrencies.length > 0;
      case 4: return true; // Websites are optional
      case 5: return true;
      default: return true;
    }
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case 1: return 'Select Commodities';
      case 2: return 'Select Regions';
      case 3: return 'Select Currencies';
      case 4: return 'Website Sources';
      case 5: return 'Notification Settings';
      default: return 'Alert Preferences';
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return renderCommoditiesTab();
      case 2:
        return renderRegionsTab();
      case 3:
        return renderCurrenciesTab();
      case 4:
        return renderWebsitesTab();
      case 5:
        return (
          <View style={styles.tabContent}>
            {/* Alert Frequency */}
            <Text style={styles.sectionTitle}>Alert Frequency</Text>
            <View style={styles.frequencyContainer}>
              {frequencies.map((freq) => (
                <TouchableOpacity
                  key={freq}
                  style={[styles.frequencyButton, alertFrequency === freq && styles.activeFrequencyButton]}
                  onPress={() => setAlertFrequency(freq)}
                >
                  <Text style={[styles.frequencyText, alertFrequency === freq && styles.activeFrequencyText]}>
                    {freq}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Alert Threshold */}
            <Text style={styles.sectionTitle}>Alert Threshold</Text>
            <View style={styles.frequencyContainer}>
              {thresholds.map((threshold) => (
                <TouchableOpacity
                  key={threshold}
                  style={[styles.frequencyButton, alertThreshold === threshold && styles.activeFrequencyButton]}
                  onPress={() => setAlertThreshold(threshold)}
                >
                  <Text style={[styles.frequencyText, alertThreshold === threshold && styles.activeFrequencyText]}>
                    {threshold}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.thresholdDescription}>
              Receive updates for significant market changes only
            </Text>

            {/* Notification Settings */}
            <Text style={styles.sectionTitle}>Notifications</Text>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Push Notifications</Text>
              <TouchableOpacity
                style={[styles.toggle, pushNotifications && styles.toggleActive]}
                onPress={() => setPushNotifications(!pushNotifications)}
              >
                <View style={[styles.toggleKnob, pushNotifications && styles.toggleKnobActive]} />
              </TouchableOpacity>
            </View>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Email Alerts</Text>
              <TouchableOpacity
                style={[styles.toggle, emailAlerts && styles.toggleActive]}
                onPress={() => setEmailAlerts(!emailAlerts)}
              >
                <View style={[styles.toggleKnob, emailAlerts && styles.toggleKnobActive]} />
              </TouchableOpacity>
            </View>
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header with step indicator */}
      <View style={styles.header}>
        {currentStep > 1 ? (
          <TouchableOpacity onPress={handlePreviousStep}>
            <MaterialIcons name="arrow-back" size={24} color={colors.accentData} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 24 }} />
        )}
        <Text style={styles.headerTitle}>{getStepTitle()}</Text>
        <Text style={styles.stepIndicator}>{currentStep}/{totalSteps}</Text>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressBarContainer}>
        <View style={[styles.progressBarFill, { width: `${(currentStep / totalSteps) * 100}%` }]} />
      </View>

      <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        {/* Step Content */}
        {renderStepContent()}

        {/* Navigation Buttons */}
        <View style={styles.buttonContainer}>
          {currentStep < totalSteps ? (
            <TouchableOpacity
              style={[styles.saveButton, !canProceed() && styles.disabledButton]}
              onPress={handleNextStep}
              disabled={!canProceed()}
            >
              <Text style={styles.saveButtonText}>
                {currentStep === 4 ? (websiteURLs.length > 0 ? 'Next' : 'Skip') :
                  canProceed() ? 'Next' : `Select at least 1 ${currentStep === 1 ? 'commodity' : currentStep === 2 ? 'region' : 'currency'}`}
              </Text>
              {canProceed() && <MaterialIcons name="arrow-forward" size={20} color="#121212" style={{ marginLeft: 8 }} />}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.saveButton} onPress={handleSavePreferences}>
              <Text style={styles.saveButtonText}>Save Preferences</Text>
              <MaterialIcons name="check" size={20} color="#121212" style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          )}
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '600',
  },
  skipHeaderText: {
    color: colors.accentData,
    fontSize: 16,
    fontWeight: '500',
  },
  stepIndicator: {
    color: colors.accentPositive,
    fontSize: 16,
    fontWeight: '600',
  },
  progressBarContainer: {
    height: 4,
    backgroundColor: colors.divider,
  },
  progressBarFill: {
    height: 4,
    backgroundColor: colors.accentPositive,
  },
  disabledButton: {
    backgroundColor: colors.divider,
    opacity: 0.7,
  },
  scrollContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  description: {
    color: colors.textSecondary,
    fontSize: 16,
    marginVertical: 20,
    lineHeight: 22,
  },
  tabsContainer: {
    marginBottom: 20,
  },
  tab: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginRight: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: colors.accentData,
  },
  tabText: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  activeTabText: {
    color: colors.accentData,
    fontWeight: '600',
  },
  tabContent: {
    marginBottom: 30,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 15,
    marginTop: 20,
  },
  selectedCommoditiesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 20,
  },
  commodityTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accentData,
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 8,
    marginRight: 10,
    marginBottom: 10,
  },
  commodityTagText: {
    color: colors.textPrimary,
    marginRight: 8,
    fontWeight: '500',
  },
  emptyCommoditiesText: {
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginBottom: 20,
  },
  customInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  customInput: {
    flex: 1,
    backgroundColor: colors.bgSecondary,
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 12,
    color: colors.textPrimary,
    fontSize: 16,
  },
  addButton: {
    backgroundColor: colors.accentData,
    borderRadius: 8,
    padding: 12,
    marginLeft: 10,
  },
  suggestedOptionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  suggestedOption: {
    backgroundColor: colors.accentPositive + '20',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginRight: 10,
    marginBottom: 10,
  },
  selectedSuggestedOption: {
    backgroundColor: colors.accentData,
  },
  suggestedOptionText: {
    color: colors.accentPositive,
    fontSize: 14,
  },
  selectedSuggestedOptionText: {
    color: colors.bgPrimary,
    fontWeight: '500',
  },
  frequencyContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  frequencyButton: {
    flex: 1,
    backgroundColor: colors.bgSecondary,
    borderRadius: 8,
    paddingVertical: 12,
    marginHorizontal: 5,
    alignItems: 'center',
  },
  activeFrequencyButton: {
    backgroundColor: colors.accentData,
  },
  frequencyText: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  activeFrequencyText: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  settingLabel: {
    color: colors.textPrimary,
    fontSize: 16,
  },
  toggle: {
    width: 50,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.bgSecondary,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleActive: {
    backgroundColor: colors.accentPositive,
  },
  toggleKnob: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.textSecondary,
  },
  toggleKnobActive: {
    backgroundColor: colors.textPrimary,
    alignSelf: 'flex-end',
  },
  thresholdDescription: {
    color: colors.textSecondary,
    fontSize: 14,
    fontStyle: 'italic',
    marginTop: 5,
    marginBottom: 30,
  },
  buttonContainer: {
    marginVertical: 30,
  },
  saveButton: {
    backgroundColor: colors.accentPositive,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  saveButtonText: {
    color: colors.bgPrimary,
    fontSize: 18,
    fontWeight: '600',
  },
  skipButton: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 15,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  skipButtonText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '500',
  },
  comingSoonContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  comingSoonTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '500',
    marginTop: 15,
    marginBottom: 5,
  },
  comingSoonText: {
    color: colors.textSecondary,
    fontSize: 16,
  },
});

export default AlertPreferencesForm;