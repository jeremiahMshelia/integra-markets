import React from 'react';
import {
    StyleSheet,
    Text,
    View,
    TouchableOpacity,
    TextInput,
    Alert,
    Dimensions,
    Image,
} from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import HollowCircularIcon from './HollowCircularIcon';

// Use the same color palette as App.js
export const colors = {
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
    iconActive: '#4ECCA3',
    iconInactive: '#A0A0A0',
};

const { width } = Dimensions.get('window');

// Onboarding data
export const roleOptions = [
    { value: 'Trader', icon: 'trending-up', description: 'Active market trading' },
    { value: 'Analyst', icon: 'analytics', description: 'Research & analysis' },
    { value: 'Hedge Fund', icon: 'account-balance', description: 'Fund management' },
    { value: 'Bank', icon: 'business', description: 'Banking institution' },
    { value: 'Refiner', icon: 'local-gas-station', description: 'Oil refining operations' },
    { value: 'Blender', icon: 'merge-type', description: 'Fuel blending' },
    { value: 'Producer', icon: 'factory', description: 'Commodity production' },
    { value: 'Shipping and Freight', icon: 'local-shipping', description: 'Transportation & logistics' },
];

export const experienceOptions = [
    { value: '0-2', label: '0-2 years', description: 'New to the industry' },
    { value: '3-5', label: '3-5 years', description: 'Growing expertise' },
    { value: '6-10', label: '6-10 years', description: 'Experienced professional' },
    { value: '10+', label: '10+ years', description: 'Industry veteran' },
];

export const marketFocusOptions = [
    { value: 'Oil & Oil Products', icon: 'local-gas-station', color: colors.accentData },
    { value: 'Metals & Minerals', icon: 'star', color: '#FFD700' },
    { value: 'Agricultural Products', icon: 'eco', color: colors.accentPositive },
    { value: 'Other', icon: 'more-horiz', color: colors.accentNeutral },
];

// Role Selection Component
export const RoleSelectionCard = ({ selectedRole, onSelect }) => (
    <View style={styles.formCard}>
        <Text style={styles.cardTitle}>What's your role? (Optional)</Text>
        <Text style={styles.cardSubtitle}>Help us customize your experience - you can skip this if you prefer</Text>

        <View style={styles.optionsGrid}>
            {roleOptions.map((role) => (
                <TouchableOpacity
                    key={role.value}
                    style={[
                        styles.optionCard,
                        selectedRole === role.value && styles.selectedOptionCard
                    ]}
                    onPress={() => onSelect(selectedRole === role.value ? '' : role.value)}
                >
                    <HollowCircularIcon
                        name={role.icon}
                        size={24}
                        color={selectedRole === role.value ? colors.bgPrimary : colors.accentPositive}
                        padding={6}
                    />
                    <Text style={[
                        styles.optionTitle,
                        selectedRole === role.value && styles.selectedOptionTitle
                    ]}>
                        {role.value}
                    </Text>
                    <Text style={[
                        styles.optionDescription,
                        selectedRole === role.value && styles.selectedOptionDescription
                    ]}>
                        {role.description}
                    </Text>
                    {selectedRole === role.value && (
                        <View style={styles.checkmarkCircle}>
                            <MaterialIcons name="check" size={12} color={colors.accentPositive} />
                        </View>
                    )}
                </TouchableOpacity>
            ))}
        </View>
    </View>
);

// Experience Selection Component
export const ExperienceSelectionCard = ({ selectedExperience, onSelect }) => (
    <View style={styles.formCard}>
        <Text style={styles.cardTitle}>Years of experience? (Optional)</Text>
        <Text style={styles.cardSubtitle}>This helps us tailor content complexity - you can skip this if you prefer</Text>

        <View style={styles.optionsList}>
            {experienceOptions.map((exp) => (
                <TouchableOpacity
                    key={exp.value}
                    style={[
                        styles.listOptionCard,
                        selectedExperience === exp.value && styles.selectedListOptionCard
                    ]}
                    onPress={() => onSelect(selectedExperience === exp.value ? '' : exp.value)}
                >
                    <View style={styles.listOptionContent}>
                        <Text style={[
                            styles.listOptionTitle,
                            selectedExperience === exp.value && styles.selectedListOptionTitle
                        ]}>
                            {exp.label}
                        </Text>
                        <Text style={[
                            styles.listOptionDescription,
                            selectedExperience === exp.value && styles.selectedListOptionDescription
                        ]}>
                            {exp.description}
                        </Text>
                    </View>
                    {selectedExperience === exp.value && (
                        <MaterialIcons name="check-circle" size={24} color={colors.accentPositive} />
                    )}
                </TouchableOpacity>
            ))}
        </View>
    </View>
);

// Market Focus Selection Component
export const MarketFocusCard = ({ selectedMarkets, onToggle }) => (
    <View style={styles.formCard}>
        <Text style={styles.cardTitle}>Market focus areas</Text>
        <Text style={styles.cardSubtitle}>Select your primary interests (multiple allowed)</Text>

        <View style={styles.marketGrid}>
            {marketFocusOptions.map((market) => (
                <TouchableOpacity
                    key={market.value}
                    style={[
                        styles.marketOptionCard,
                        selectedMarkets.includes(market.value) && styles.selectedMarketCard
                    ]}
                    onPress={() => onToggle(market.value)}
                >
                    <HollowCircularIcon
                        name={market.icon}
                        size={32}
                        color={selectedMarkets.includes(market.value) ? colors.bgPrimary : market.color}
                        padding={8}
                    />
                    <Text style={[
                        styles.marketOptionTitle,
                        selectedMarkets.includes(market.value) && styles.selectedMarketTitle
                    ]}>
                        {market.value}
                    </Text>
                    {selectedMarkets.includes(market.value) && (
                        <View style={styles.marketCheckmark}>
                            <MaterialIcons name="check" size={16} color={colors.accentPositive} />
                        </View>
                    )}
                </TouchableOpacity>
            ))}
        </View>
    </View>
);

// Details Form Component
export const DetailsFormCard = ({ formData, onUpdate }) => {
    const pickImage = async () => {
        // Request permission
        const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (permissionResult.granted === false) {
            Alert.alert("Permission required", "You need to grant camera roll permission to upload a photo.");
            return;
        }

        // Show action sheet
        Alert.alert(
            "Select Profile Photo",
            "Choose how you'd like to add your profile photo",
            [
                {
                    text: "Camera",
                    onPress: takePhoto,
                },
                {
                    text: "Photo Library",
                    onPress: pickFromLibrary,
                },
                {
                    text: "Cancel",
                    style: "cancel",
                },
            ]
        );
    };

    const takePhoto = async () => {
        const permissionResult = await ImagePicker.requestCameraPermissionsAsync();

        if (permissionResult.granted === false) {
            Alert.alert("Permission required", "You need to grant camera permission to take a photo.");
            return;
        }

        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
        });

        if (!result.canceled) {
            await processImage(result.assets[0].uri);
        }
    };

    const pickFromLibrary = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
        });

        if (!result.canceled) {
            await processImage(result.assets[0].uri);
        }
    };

    const processImage = async (uri) => {
        try {
            // Temporarily disable image processing to prevent crashes
            console.log('Image processing temporarily disabled');
            onUpdate('profilePhoto', uri); // Use original URI for now
        } catch (error) {
            Alert.alert("Error", "Failed to process image. Please try again.");
        }
    };

    const removePhoto = () => {
        Alert.alert(
            "Remove Photo",
            "Are you sure you want to remove your profile photo?",
            [
                {
                    text: "Cancel",
                    style: "cancel",
                },
                {
                    text: "Remove",
                    style: "destructive",
                    onPress: () => onUpdate('profilePhoto', null),
                },
            ]
        );
    };

    return (
        <View style={styles.formCard}>
            <Text style={styles.cardTitle}>Complete Your Profile</Text>
            <Text style={styles.cardSubtitle}>Set up your trading identity</Text>

            {/* Username - Required */}
            <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Username <Text style={styles.required}>*</Text></Text>
                <TextInput
                    style={[styles.textInput, !formData.username && styles.requiredInput]}
                    value={formData.username}
                    onChangeText={(text) => onUpdate('username', text)}
                    placeholder="Choose a unique username"
                    placeholderTextColor={colors.textSecondary}
                    autoCapitalize="none"
                />
                {!formData.username && (
                    <Text style={styles.requiredHint}>Required to identify you in the community</Text>
                )}
            </View>

            {/* Profile Photo */}
            <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Profile Photo</Text>
                <View style={styles.photoSection}>
                    <View style={styles.photoContainer}>
                        {formData.profilePhoto ? (
                            <Image source={{ uri: formData.profilePhoto }} style={styles.profilePhoto} />
                        ) : (
                            <View style={styles.photoPlaceholder}>
                                <MaterialIcons name="person" size={40} color={colors.textSecondary} />
                            </View>
                        )}
                    </View>
                    <View style={styles.photoActions}>
                        <TouchableOpacity style={styles.photoButton} onPress={pickImage}>
                            <MaterialIcons name="camera-alt" size={20} color={colors.accentPositive} />
                            <Text style={styles.photoButtonText}>
                                {formData.profilePhoto ? 'Change Photo' : 'Add Photo'}
                            </Text>
                        </TouchableOpacity>
                        {formData.profilePhoto && (
                            <TouchableOpacity style={styles.removePhotoButton} onPress={removePhoto}>
                                <MaterialIcons name="delete" size={20} color={colors.accentNegative} />
                                <Text style={styles.removePhotoButtonText}>Remove</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </View>

            <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Company / Institution</Text>
                <TextInput
                    style={styles.textInput}
                    value={formData.institution}
                    onChangeText={(text) => onUpdate('institution', text)}
                    placeholder="e.g., Goldman Sachs, Shell, etc."
                    placeholderTextColor={colors.textSecondary}
                    autoCapitalize="words"
                />
            </View>

            <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Bio</Text>
                <TextInput
                    style={[styles.textInput, styles.textArea]}
                    value={formData.bio}
                    onChangeText={(text) => onUpdate('bio', text)}
                    placeholder="Tell us about your trading background"
                    placeholderTextColor={colors.textSecondary}
                    multiline={true}
                    numberOfLines={3}
                    textAlignVertical="top"
                />
            </View>

            <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>LinkedIn</Text>
                <TextInput
                    style={styles.textInput}
                    value={formData.linkedin}
                    onChangeText={(text) => onUpdate('linkedin', text)}
                    placeholder="linkedin.com/in/yourprofile"
                    placeholderTextColor={colors.textSecondary}
                    autoCapitalize="none"
                    keyboardType="url"
                />
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    formCard: {
        backgroundColor: colors.bgSecondary,
        borderRadius: 12,
        padding: 24,
    },
    cardTitle: {
        color: colors.textPrimary,
        fontSize: 24,
        fontWeight: '600',
        marginBottom: 8,
    },
    cardSubtitle: {
        color: colors.textSecondary,
        fontSize: 16,
        marginBottom: 24,
        lineHeight: 22,
    },
    optionsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    optionCard: {
        width: '48%',
        backgroundColor: colors.bgPrimary,
        borderRadius: 8,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: colors.divider,
        position: 'relative',
        alignItems: 'center',
    },
    selectedOptionCard: {
        backgroundColor: colors.accentPositive,
        borderColor: colors.accentPositive,
    },
    optionTitle: {
        color: colors.textPrimary,
        fontSize: 14,
        fontWeight: '600',
        marginTop: 8,
        marginBottom: 4,
        textAlign: 'center',
    },
    selectedOptionTitle: {
        color: colors.bgPrimary,
    },
    optionDescription: {
        color: colors.textSecondary,
        fontSize: 12,
        textAlign: 'center',
    },
    selectedOptionDescription: {
        color: colors.bgPrimary,
        opacity: 0.8,
    },
    checkmarkCircle: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: colors.bgPrimary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    optionsList: {
        width: '100%',
    },
    listOptionCard: {
        backgroundColor: colors.bgPrimary,
        borderRadius: 8,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: colors.divider,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    selectedListOptionCard: {
        backgroundColor: colors.accentPositiveBg,
        borderColor: colors.accentPositive,
    },
    listOptionContent: {
        flex: 1,
    },
    listOptionTitle: {
        color: colors.textPrimary,
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 4,
    },
    selectedListOptionTitle: {
        color: colors.accentPositive,
    },
    listOptionDescription: {
        color: colors.textSecondary,
        fontSize: 14,
    },
    selectedListOptionDescription: {
        color: colors.textPrimary,
    },
    marketGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    marketOptionCard: {
        width: '48%',
        backgroundColor: colors.bgPrimary,
        borderRadius: 8,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: colors.divider,
        alignItems: 'center',
        position: 'relative',
    },
    selectedMarketCard: {
        backgroundColor: colors.accentPositive,
        borderColor: colors.accentPositive,
    },
    marketOptionTitle: {
        color: colors.textPrimary,
        fontSize: 14,
        fontWeight: '600',
        marginTop: 8,
        textAlign: 'center',
    },
    selectedMarketTitle: {
        color: colors.bgPrimary,
    },
    marketCheckmark: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: colors.bgPrimary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    inputGroup: {
        marginBottom: 20,
    },
    inputLabel: {
        color: colors.textPrimary,
        fontSize: 16,
        fontWeight: '500',
        marginBottom: 8,
    },
    textInput: {
        backgroundColor: colors.bgPrimary,
        borderRadius: 8,
        padding: 16,
        color: colors.textPrimary,
        fontSize: 16,
        borderWidth: 1,
        borderColor: colors.divider,
    },
    textArea: {
        height: 80,
    },
    required: {
        color: colors.accentNegative,
        fontWeight: '600',
    },
    requiredInput: {
        borderColor: colors.accentPositive,
        borderWidth: 1.5,
    },
    requiredHint: {
        color: colors.accentPositive,
        fontSize: 12,
        marginTop: 4,
    },
    photoSection: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    photoContainer: {
        marginRight: 16,
    },
    profilePhoto: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: colors.bgPrimary,
    },
    photoPlaceholder: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: colors.bgPrimary,
        borderWidth: 2,
        borderColor: colors.divider,
        borderStyle: 'dashed',
        justifyContent: 'center',
        alignItems: 'center',
    },
    photoActions: {
        flex: 1,
    },
    photoButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.accentPositiveBg,
        borderRadius: 8,
        paddingVertical: 12,
        paddingHorizontal: 16,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: colors.accentPositive,
    },
    photoButtonText: {
        color: colors.accentPositive,
        fontSize: 14,
        fontWeight: '500',
        marginLeft: 8,
    },
    removePhotoButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.accentNegativeBg,
        borderRadius: 8,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: colors.accentNegative,
    },
    removePhotoButtonText: {
        color: colors.accentNegative,
        fontSize: 14,
        fontWeight: '500',
        marginLeft: 8,
    },
});
