import React, { useState, useEffect } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator, Alert, Dimensions } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, DetailsFormCard, RoleSelectionCard, ExperienceSelectionCard, MarketFocusCard } from './ProfileComponents';
import { supabaseService } from '../services/supabaseService';

export default function EditProfileModal({ visible, onClose, initialProfile, onSave, onSkip, onboarding = false }) {
    const [step, setStep] = useState(0);
    const [formData, setFormData] = useState({
        username: '',
        institution: '',
        bio: '',
        linkedin: '',
        role: '',
        experience: '',
        marketFocus: [],
        profilePhoto: null
    });
    const [loading, setLoading] = useState(false);

    // Reset step when modal opens
    useEffect(() => {
        if (visible) {
            setStep(0);
        }
    }, [visible]);

    useEffect(() => {
        if (initialProfile) {
            setFormData({
                username: initialProfile.username || '',
                institution: initialProfile.company || initialProfile.institution || '',
                bio: initialProfile.bio || '',
                linkedin: initialProfile.linkedin || '',
                role: initialProfile.role || '',
                experience: initialProfile.experience || initialProfile.experience_level || '',
                marketFocus: initialProfile.market_focus || [],
                profilePhoto: initialProfile.avatar_url || null
            });
        }
    }, [initialProfile]);

    const handleUpdate = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleMarketToggle = (market) => {
        setFormData(prev => {
            const current = prev.marketFocus || [];
            if (current.includes(market)) {
                return { ...prev, marketFocus: current.filter(m => m !== market) };
            } else {
                return { ...prev, marketFocus: [...current, market] };
            }
        });
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
            let avatarUrl = formData.profilePhoto;

            // Only upload if it's a local file URI
            if (formData.profilePhoto && typeof formData.profilePhoto === 'string' && formData.profilePhoto.startsWith('file://')) {
                const uploadRes = await supabaseService.uploadAvatar(formData.profilePhoto);
                if (uploadRes.success) {
                    avatarUrl = uploadRes.url;
                } else {
                    console.error('Avatar upload failed:', uploadRes.error);
                }
            }

            const updates = {
                username: formData.username,
                company: formData.institution,
                bio: formData.bio,
                linkedin: formData.linkedin,
                role: formData.role,
                experience_level: formData.experience,
                market_focus: formData.marketFocus,
                avatar_url: avatarUrl
            };

            const result = await supabaseService.updateProfile(updates);

            if (result.success) {
                if (onSave) onSave(result.data);
                if (!onboarding) onClose();
            } else {
                Alert.alert('Error', 'Failed to update profile: ' + (result.error || 'Unknown error'));
            }
        } catch (error) {
            Alert.alert('Error', 'An unexpected error occurred');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleSkipOnboarding = () => {
        Alert.alert(
            'Skip Setup',
            'You can always complete your profile later in settings. Continue?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Skip',
                    onPress: () => {
                        if (onSkip) onSkip();
                        else onClose();
                    }
                }
            ]
        );
    };

    const renderStepContent = () => {
        switch (step) {
            case 0:
                return (
                    <RoleSelectionCard
                        selectedRole={formData.role}
                        onSelect={(role) => handleUpdate('role', role)}
                    />
                );
            case 1:
                return (
                    <ExperienceSelectionCard
                        selectedExperience={formData.experience}
                        onSelect={(exp) => handleUpdate('experience', exp)}
                    />
                );
            case 2:
                // Market Focus Step
                return (
                    <MarketFocusCard
                        selectedMarkets={formData.marketFocus || []}
                        onToggle={handleMarketToggle}
                    />
                );
            case 3:
                return (
                    <DetailsFormCard
                        formData={formData}
                        onUpdate={handleUpdate}
                    />
                );
            default:
                return null;
        }
    };

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.container}>
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                            <MaterialIcons name="arrow-back" size={24} color={colors.textPrimary} />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>{onboarding ? 'Setup Profile' : 'Edit Profile'}</Text>
                        {onboarding ? (
                            <TouchableOpacity onPress={handleSkipOnboarding}>
                                <Text style={styles.skipText}>Skip</Text>
                            </TouchableOpacity>
                        ) : (
                            <View style={{ width: 40 }} />
                        )}
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
                                <ActivityIndicator color={colors.bgPrimary} />
                            ) : (
                                <View style={styles.buttonContent}>
                                    <Text style={styles.buttonText}>
                                        {step === 3 ? (onboarding ? 'Complete Setup' : 'Save Changes') : 'Continue'}
                                    </Text>
                                    {step === 3 ? (
                                        <MaterialIcons name="check" size={20} color={colors.bgPrimary} />
                                    ) : (
                                        <MaterialIcons name="arrow-forward" size={20} color={colors.bgPrimary} />
                                    )}
                                </View>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </SafeAreaView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: colors.bgPrimary,
    },
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
        padding: 8,
        marginLeft: -8,
    },
    headerTitle: {
        color: colors.textPrimary,
        fontSize: 18,
        fontWeight: '600',
    },
    skipText: {
        color: colors.accentData,
        fontSize: 16,
        fontWeight: '500',
    },
    progressContainer: {
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 15,
    },
    track: {
        width: '100%',
        height: 4,
        backgroundColor: colors.bgSecondary,
        borderRadius: 2,
        marginBottom: 8,
    },
    fill: {
        height: '100%',
        backgroundColor: colors.accentPositive,
        borderRadius: 2,
    },
    progressText: {
        color: colors.textSecondary,
        fontSize: 12,
    },
    scrollView: {
        flex: 1,
    },
    content: {
        padding: 20,
        paddingBottom: 40,
    },
    footer: {
        padding: 20,
        borderTopWidth: 1,
        borderTopColor: colors.divider,
        backgroundColor: colors.bgPrimary,
    },
    primaryButton: {
        backgroundColor: colors.accentPositive,
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
        color: colors.bgPrimary,
        fontSize: 16,
        fontWeight: '600',
    }
});
