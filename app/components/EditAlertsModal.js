import React, { useState, useEffect } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator, Alert, Dimensions, TextInput } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from './ProfileComponents';
import { supabaseService } from '../services/supabaseService';
import { DEFAULT_WEBSITE_SOURCES } from '../config/default_sources';

const { width } = Dimensions.get('window');

// Data matching Web
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
    'AUD', 'CNY', 'RUB', 'INR', 'BRL', 'SAR',
    'Bitcoin', 'Ethereum', 'Solana'
];

// Fallback colors to prevent crash
const safeColors = colors || {
    bgPrimary: '#121212',
    bgSecondary: '#1E1E1E',
    textPrimary: '#ECECEC',
    textSecondary: '#A0A0A0',
    accentPositive: '#4ECCA3',
    divider: '#333333',
    cardBorder: '#333333'
};

const SelectionStep = ({ title, subtitle, items, selectedItems, onToggle }) => {
    return (
        <View style={styles.stepContainer}>
            <View style={styles.headerContainer}>
                <Text style={styles.stepTitle}>{title}</Text>
                <Text style={styles.stepSubtitle}>{subtitle}</Text>
            </View>

            <View style={styles.chipsContainer}>
                {items.map((item) => {
                    const isSelected = selectedItems.includes(item);
                    return (
                        <TouchableOpacity
                            key={item}
                            onPress={() => onToggle(item)}
                            style={[
                                styles.chip,
                                isSelected ? styles.chipSelected : styles.chipUnselected
                            ]}
                        >
                            <Text style={[
                                styles.chipText,
                                isSelected ? styles.chipTextSelected : styles.chipTextUnselected
                            ]}>
                                {item}
                            </Text>
                            {isSelected && (
                                <MaterialIcons name="check" size={16} color={safeColors.bgPrimary} style={styles.checkIcon} />
                            )}
                        </TouchableOpacity>
                    );
                })}
            </View>

            {selectedItems.length > 0 && (
                <Text style={styles.selectionCount}>{selectedItems.length} selected</Text>
            )}
        </View>
    );
};

const AdditionalSettingsStep = ({ formData, onUpdate, keywordInput, setKeywordInput, onAddKeyword, onRemoveKeyword, customUrl, setCustomUrl, onAddCustomUrl }) => {
    return (
        <View style={styles.stepContainer}>
            <View style={styles.headerContainer}>
                <Text style={styles.stepTitle}>Select Alert Details</Text>
                <Text style={styles.stepSubtitle}>Customize how and when you receive alerts</Text>
            </View>

            {/* Keywords */}
            <View style={styles.section}>
                <Text style={styles.sectionLabel}>Keywords</Text>
                <View style={styles.inputRow}>
                    <TextInput
                        style={styles.input}
                        placeholder="Add keywords (e.g. 'OPEC')"
                        placeholderTextColor={safeColors.textSecondary}
                        value={keywordInput}
                        onChangeText={setKeywordInput}
                        onSubmitEditing={onAddKeyword}
                    />
                    <TouchableOpacity
                        style={[styles.addButton, !keywordInput.trim() && styles.addButtonDisabled]}
                        onPress={onAddKeyword}
                        disabled={!keywordInput.trim()}
                    >
                        <Text style={styles.addButtonText}>Add</Text>
                    </TouchableOpacity>
                </View>
                <View style={styles.chipsContainer}>
                    {formData.keywords.map((keyword) => (
                        <View key={keyword} style={styles.keywordChip}>
                            <Text style={styles.keywordText}>{keyword}</Text>
                            <TouchableOpacity onPress={() => onRemoveKeyword(keyword)}>
                                <MaterialIcons name="close" size={16} color={safeColors.textSecondary} />
                            </TouchableOpacity>
                        </View>
                    ))}
                    {formData.keywords.length === 0 && (
                        <Text style={styles.emptyText}>No keywords added</Text>
                    )}
                </View>
            </View>

            {/* Sources */}
            <View style={styles.section}>
                <Text style={styles.sectionLabel}>Preferred Sources</Text>
                <View style={[styles.chipsContainer, { marginBottom: 12 }]}>
                    {DEFAULT_WEBSITE_SOURCES.map((source) => {
                        const isSelected = formData.websiteURLs.includes(source.url);
                        return (
                            <TouchableOpacity
                                key={source.url}
                                onPress={() => {
                                    const current = formData.websiteURLs;
                                    const updated = current.includes(source.url)
                                        ? current.filter(u => u !== source.url)
                                        : [...current, source.url];
                                    onUpdate('websiteURLs', updated);
                                }}
                                style={[styles.chip, isSelected ? styles.chipSelected : styles.chipUnselected]}
                            >
                                <Text style={[styles.chipText, isSelected ? styles.chipTextSelected : styles.chipTextUnselected]}>
                                    {source.name}
                                </Text>
                                {isSelected && (
                                    <MaterialIcons name="check" size={16} color={safeColors.bgPrimary} style={styles.checkIcon} />
                                )}
                            </TouchableOpacity>
                        );
                    })}

                    {formData.websiteURLs
                        .filter(url => !DEFAULT_WEBSITE_SOURCES.some(s => s.url === url))
                        .map(url => (
                            <TouchableOpacity
                                key={url}
                                onPress={() => {
                                    const current = formData.websiteURLs;
                                    const updated = current.filter(u => u !== url);
                                    onUpdate('websiteURLs', updated);
                                }}
                                style={[styles.chip, styles.chipSelected]}
                            >
                                <Text style={[styles.chipText, styles.chipTextSelected]}>
                                    {url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
                                </Text>
                                <MaterialIcons name="close" size={16} color={safeColors.bgPrimary} style={styles.checkIcon} />
                            </TouchableOpacity>
                        ))
                    }
                </View>

                {/* Custom URL Input */}
                <View style={styles.inputRow}>
                    <TextInput
                        style={styles.input}
                        placeholder="Add source URL (e.g. bloomberg.com)"
                        placeholderTextColor={safeColors.textSecondary}
                        value={customUrl}
                        onChangeText={setCustomUrl}
                        onSubmitEditing={onAddCustomUrl}
                        autoCapitalize="none"
                        keyboardType="url"
                    />
                    <TouchableOpacity
                        style={[styles.addButton, !customUrl.trim() && styles.addButtonDisabled]}
                        onPress={onAddCustomUrl}
                        disabled={!customUrl.trim()}
                    >
                        <Text style={styles.addButtonText}>Add</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Alert Frequency */}
            <View style={styles.section}>
                <Text style={styles.sectionLabel}>Alert Frequency</Text>
                <View style={styles.row}>
                    {['Real-time', 'Daily', 'Weekly'].map(freq => (
                        <TouchableOpacity
                            key={freq}
                            style={[styles.optionButton, formData.alertFrequency === freq && styles.optionSelected]}
                            onPress={() => onUpdate('alertFrequency', freq)}
                        >
                            <Text style={[styles.optionText, formData.alertFrequency === freq && styles.optionTextSelected]}>
                                {freq}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            {/* Alert Threshold */}
            <View style={styles.section}>
                <Text style={styles.sectionLabel}>Relevance Threshold</Text>
                <View style={styles.row}>
                    {['High', 'Medium', 'Low'].map(thresh => (
                        <TouchableOpacity
                            key={thresh}
                            style={[styles.optionButton, formData.alertThreshold === thresh && styles.optionSelected]}
                            onPress={() => onUpdate('alertThreshold', thresh)}
                        >
                            <Text style={[styles.optionText, formData.alertThreshold === thresh && styles.optionTextSelected]}>
                                {thresh}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>
        </View>
    );
};

export default function EditAlertsModal({ visible, onClose, initialPreferences, onSave, wrapInModal = true }) {
    const [step, setStep] = useState(0);
    const [formData, setFormData] = useState({
        commodities: [],
        regions: [],
        currencies: [],
        keywords: [],
        websiteURLs: [],
        alertFrequency: 'Daily',
        alertThreshold: 'Medium'
    });
    const [keywordInput, setKeywordInput] = useState('');
    const [customUrl, setCustomUrl] = useState('');
    const [loading, setLoading] = useState(false);

    console.log('EditAlertsModal rendering. steps:', step, 'visible:', visible, 'colors loaded:', !!colors, 'wrapInModal:', wrapInModal);

    // Reset step when modal opens
    useEffect(() => {
        if (visible) {
            setStep(0);
        }
    }, [visible]);

    // Helper to normalize and filter selections against available options
    const filterValidSelections = (selected = [], options = []) => {
        if (!Array.isArray(selected)) return [];
        return selected.map(item => {
            // Find exact or case-insensitive match
            const match = options.find(opt => opt.toLowerCase() === item.toLowerCase());
            return match || null;
        }).filter(item => item !== null);
    };

    useEffect(() => {
        if (initialPreferences) {
            setFormData({
                commodities: filterValidSelections(initialPreferences.commodities, suggestedCommodities),
                regions: filterValidSelections(initialPreferences.regions, suggestedRegions),
                currencies: filterValidSelections(initialPreferences.currencies, suggestedCurrencies),
                keywords: initialPreferences.keywords || [],
                websiteURLs: initialPreferences.website_urls || initialPreferences.websiteURLs || [],
                alertFrequency: initialPreferences.alert_frequency || initialPreferences.alertFrequency || 'Daily',
                alertThreshold: initialPreferences.alert_threshold || initialPreferences.alertThreshold || 'Medium'
            });
        }
    }, [initialPreferences]);

    const handleToggle = (field, value) => {
        setFormData(prev => {
            const list = prev[field] || [];
            if (list.includes(value)) {
                return { ...prev, [field]: list.filter(item => item !== value) };
            } else {
                return { ...prev, [field]: [...list, value] };
            }
        });
    };

    const handleAddKeyword = () => {
        if (keywordInput.trim() && !formData.keywords.includes(keywordInput.trim())) {
            setFormData(prev => ({ ...prev, keywords: [...prev.keywords, keywordInput.trim()] }));
            setKeywordInput('');
        }
    };

    const handleRemoveKeyword = (keyword) => {
        setFormData(prev => ({ ...prev, keywords: prev.keywords.filter(k => k !== keyword) }));
    };

    const handleAddCustomUrl = () => {
        if (!customUrl.trim()) return;
        let url = customUrl.trim();
        if (!url.startsWith('http')) {
            url = 'https://' + url;
        }
        if (!formData.websiteURLs.includes(url)) {
            setFormData(prev => ({ ...prev, websiteURLs: [...prev.websiteURLs, url] }));
        }
        setCustomUrl('');
    };

    const handleBack = () => {
        if (step > 0) {
            setStep(step - 1);
        } else {
            onClose();
        }
    };

    const handleNext = () => {
        if (step < 3) {
            setStep(step + 1);
        } else {
            handleSave();
        }
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            const updates = {
                commodities: formData.commodities,
                regions: formData.regions,
                currencies: formData.currencies,
                keywords: formData.keywords,
                websiteUrls: formData.websiteURLs,
                alertFrequency: formData.alertFrequency,
                alertThreshold: formData.alertThreshold,
                pushEnabled: initialPreferences?.push_enabled !== false,
                emailEnabled: initialPreferences?.email_enabled || false,
            };

            const result = await supabaseService.saveAlertPreferences(updates);

            if (result.success) {
                if (onSave) onSave(result.data);
                onClose();
            } else {
                Alert.alert('Error', 'Failed to update alert preferences: ' + (result.error || 'Unknown error'));
            }
        } catch (error) {
            Alert.alert('Error', 'An unexpected error occurred');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const renderStepContent = () => {
        switch (step) {
            case 0:
                return (
                    <SelectionStep
                        title="Select Commodities"
                        subtitle="Choose commodities you want to track"
                        items={suggestedCommodities}
                        selectedItems={formData.commodities}
                        onToggle={(item) => handleToggle('commodities', item)}
                    />
                );
            case 1:
                return (
                    <SelectionStep
                        title="Select Regions"
                        subtitle="Choose regions you want news from"
                        items={suggestedRegions}
                        selectedItems={formData.regions}
                        onToggle={(item) => handleToggle('regions', item)}
                    />
                );
            case 2:
                return (
                    <SelectionStep
                        title="Select Currencies"
                        subtitle="Choose currencies to monitor"
                        items={suggestedCurrencies}
                        selectedItems={formData.currencies}
                        onToggle={(item) => handleToggle('currencies', item)}
                    />
                );
            case 3:
                return (
                    <AdditionalSettingsStep
                        formData={formData}
                        onUpdate={(field, value) => {
                            setFormData(prev => ({ ...prev, [field]: value }));
                        }}
                        keywordInput={keywordInput}
                        setKeywordInput={setKeywordInput}
                        onAddKeyword={handleAddKeyword}
                        onRemoveKeyword={handleRemoveKeyword}
                        customUrl={customUrl}
                        setCustomUrl={setCustomUrl}
                        onAddCustomUrl={handleAddCustomUrl}
                    />
                );
            default:
                return null;
        }
    };

    const content = (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                        <MaterialIcons name="arrow-back" size={24} color={safeColors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Edit Alerts</Text>
                    <View style={{ width: 40 }} />
                </View>

                {/* Progress Bar */}
                <View style={styles.progressContainer}>
                    <View style={styles.track}>
                        <View style={[styles.fill, { width: `${((step + 1) / 4) * 100}%` }]} />
                    </View>
                    <Text style={styles.progressText}>{step + 1} of 4</Text>
                </View>

                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={styles.content}
                >
                    {renderStepContent()}
                </ScrollView>

                {/* Footer Button */}
                <View style={styles.footer}>
                    <TouchableOpacity
                        style={styles.primaryButton}
                        onPress={handleNext}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color={safeColors.bgPrimary} />
                        ) : (
                            <View style={styles.buttonContent}>
                                <Text style={styles.buttonText}>
                                    {step === 3 ? 'Save Changes' : 'Continue'}
                                </Text>
                                {step === 3 ? (
                                    <MaterialIcons name="check" size={20} color={safeColors.bgPrimary} />
                                ) : (
                                    <MaterialIcons name="arrow-forward" size={20} color={safeColors.bgPrimary} />
                                )}
                            </View>
                        )}
                    </TouchableOpacity>
                </View>
            </View>
        </SafeAreaView>
    );

    if (wrapInModal) {
        return (
            <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
                {content}
            </Modal>
        );
    }

    // When not wrapped in modal, rely on parent mounting validation or return null if not visible
    if (!visible) return null;
    return content;
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: safeColors.bgPrimary,
    },
    container: {
        flex: 1,
        backgroundColor: safeColors.bgPrimary,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: safeColors.divider,
    },
    backButton: {
        padding: 8,
        marginLeft: -8,
    },
    headerTitle: {
        color: safeColors.textPrimary,
        fontSize: 18,
        fontWeight: '600',
    },
    progressContainer: {
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 15,
    },
    track: {
        width: '100%',
        height: 4,
        backgroundColor: safeColors.bgSecondary,
        borderRadius: 2,
        marginBottom: 8,
    },
    fill: {
        height: '100%',
        backgroundColor: safeColors.accentPositive,
        borderRadius: 2,
    },
    progressText: {
        color: safeColors.textSecondary,
        fontSize: 12,
    },
    scrollView: {
        flex: 1,
    },
    content: {
        padding: 20,
        paddingBottom: 40,
    },
    stepContainer: {
        flex: 1,
    },
    headerContainer: {
        marginBottom: 24,
    },
    stepTitle: {
        fontSize: 24,
        fontWeight: '600',
        color: safeColors.textPrimary,
        marginBottom: 8,
    },
    stepSubtitle: {
        fontSize: 16,
        color: safeColors.textSecondary,
    },
    chipsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    chip: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 8,
        marginBottom: 8,
    },
    chipUnselected: {
        backgroundColor: safeColors.bgSecondary,
        borderColor: safeColors.cardBorder,
    },
    chipSelected: {
        backgroundColor: safeColors.accentPositive,
        borderColor: safeColors.accentPositive,
    },
    chipText: {
        fontSize: 14,
        fontWeight: '500',
    },
    chipTextUnselected: {
        color: safeColors.textPrimary,
    },
    chipTextSelected: {
        color: safeColors.bgPrimary,
    },
    checkIcon: {
        marginLeft: 6,
    },
    selectionCount: {
        marginTop: 16,
        color: safeColors.accentPositive,
        fontSize: 14,
        fontWeight: '500',
    },
    footer: {
        padding: 20,
        borderTopWidth: 1,
        borderTopColor: safeColors.divider,
        backgroundColor: safeColors.bgPrimary,
    },
    primaryButton: {
        backgroundColor: safeColors.accentPositive,
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    buttonText: {
        color: safeColors.bgPrimary,
        fontSize: 16,
        fontWeight: '600',
    },
    section: {
        marginBottom: 24,
    },
    sectionLabel: {
        fontSize: 16,
        fontWeight: '500',
        color: safeColors.textSecondary,
        marginBottom: 12,
    },
    inputRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 12,
    },
    input: {
        flex: 1,
        backgroundColor: safeColors.bgSecondary,
        borderWidth: 1,
        borderColor: safeColors.cardBorder,
        borderRadius: 12,
        paddingHorizontal: 15,
        paddingVertical: 12,
        fontSize: 14,
        color: safeColors.textPrimary,
    },
    addButton: {
        backgroundColor: 'rgba(78, 204, 163, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(78, 204, 163, 0.5)',
        borderRadius: 12,
        paddingHorizontal: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    addButtonDisabled: {
        opacity: 0.5,
    },
    addButtonText: {
        color: safeColors.accentPositive,
        fontWeight: '600',
    },
    keywordChip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: safeColors.bgSecondary,
        borderWidth: 1,
        borderColor: safeColors.cardBorder,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 6,
        gap: 8,
    },
    keywordText: {
        fontSize: 14,
        color: safeColors.textPrimary,
    },
    emptyText: {
        color: safeColors.textSecondary,
        fontSize: 14,
        fontStyle: 'italic',
    },
    row: {
        flexDirection: 'row',
        gap: 8,
        flexWrap: 'wrap',
    },
    optionButton: {
        flex: 1,
        borderWidth: 1,
        borderColor: safeColors.cardBorder,
        backgroundColor: safeColors.bgSecondary,
        borderRadius: 10,
        paddingVertical: 12,
        paddingHorizontal: 10,
        alignItems: 'center',
        minWidth: '30%',
    },
    optionSelected: {
        backgroundColor: 'rgba(78, 204, 163, 0.1)',
        borderColor: safeColors.accentPositive,
    },
    optionText: {
        fontSize: 13,
        color: safeColors.textSecondary,
        fontWeight: '500',
    },
    optionTextSelected: {
        color: safeColors.accentPositive,
    },
    checkIcon: {
        marginLeft: 6,
    }
});
