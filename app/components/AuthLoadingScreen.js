import React, { useState, useEffect } from 'react';
import {
    StyleSheet,
    Text,
    View,
    TouchableOpacity,
    TextInput,
    Alert,
    Animated,
    Dimensions,
    StatusBar,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
} from 'react-native';
import { BlurView as ExpoBlurView } from 'expo-blur';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import IntegraIcon from './IntegraIcon';
import { authService } from '../services/authService';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Color palette
const colors = {
    bgPrimary: '#000000',
    bgSecondary: '#1E1E1E',
    textPrimary: '#FFFFFF',
    textSecondary: '#A0A0A0',
    accentPositive: '#4ECCA3',
    accentData: '#30A5FF',
    divider: '#333333',
    inputBg: '#2A2A2A',
    googleRed: '#EA4335',
    shinyGreen: '#10b981',
    shinyGray: '#6b7280',
};

const ShinyText = ({ text, disabled = false, speed = 3, style = {} }) => {
    const animatedValue = new Animated.Value(0);
    
    useEffect(() => {
        if (!disabled) {
            Animated.loop(
                Animated.timing(animatedValue, {
                    toValue: 1,
                    duration: speed * 1000,
                    useNativeDriver: false,
                })
            ).start();
        }
    }, [disabled, speed]);

    if (disabled) {
        return <Text style={[styles.shinyTextDisabled, style]}>{text}</Text>;
    }

    return (
        <Animated.Text
            style={[
                styles.shinyText,
                style,
                {
                    opacity: animatedValue.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0.7, 1, 0.7]
                    })
                }
            ]}
        >
            {text}
        </Animated.Text>
    );
};

const AuthLoadingScreen = ({ onAuthComplete, onSkip }) => {
    const [currentScreen, setCurrentScreen] = useState('loading'); // 'loading', 'auth', 'login', 'signup'
    const [progress, setProgress] = useState(0);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [appleAvailable, setAppleAvailable] = useState(false);
    const progressAnim = new Animated.Value(0);

    // Check Apple Sign-In availability once on mount. The button is hidden
    // on Android, web, and iOS < 13 where the native sheet doesn't exist.
    useEffect(() => {
        let cancelled = false;
        authService.isAppleSignInAvailable().then((available) => {
            if (!cancelled) setAppleAvailable(available);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (currentScreen === 'loading') {
            const timer = setInterval(() => {
                setProgress((prev) => {
                    if (prev >= 100) {
                        clearInterval(timer);
                        setTimeout(() => setCurrentScreen('auth'), 500);
                        return 100;
                    }
                    return prev + 1;
                });
            }, 30); // Faster loading
            return () => clearInterval(timer);
        }
    }, [currentScreen]);

    useEffect(() => {
        Animated.timing(progressAnim, {
            toValue: progress,
            duration: 30,
            useNativeDriver: false,
        }).start();
    }, [progress]);

    const handleEmailAuth = async (isSignUp) => {
        if (!email.trim()) {
            Alert.alert('Error', 'Please enter your email address');
            return;
        }

        if (!password.trim()) {
            Alert.alert('Error', 'Please enter a password');
            return;
        }

        if (isSignUp) {
            if (!fullName.trim()) {
                Alert.alert('Error', 'Please enter your full name');
                return;
            }
            if (password !== confirmPassword) {
                Alert.alert('Error', 'Passwords do not match');
                return;
            }
            if (password.length < 6) {
                Alert.alert('Error', 'Password must be at least 6 characters');
                return;
            }
        }

        setIsLoading(true);

        try {
            // Use the actual authService to authenticate with Supabase
            let result;
            if (isSignUp) {
                result = await authService.signUpWithEmail(email.trim(), password, fullName.trim());
            } else {
                result = await authService.signInWithEmail(email.trim(), password);
            }

            setIsLoading(false);

            if (result.success) {
                // Check if email confirmation is required
                if (result.requiresConfirmation) {
                    Alert.alert(
                        'Confirm Your Email',
                        result.message || 'Please check your email to confirm your account',
                        [{ text: 'OK' }]
                    );
                    return;
                }

                // Successful authentication
                const userData = {
                    id: result.user?.id || Date.now().toString(),
                    email: result.user?.email || email.trim(),
                    fullName: result.user?.fullName || (isSignUp ? fullName.trim() : email.split('@')[0]),
                    username: email.split('@')[0],
                    authMethod: 'email',
                    isNewUser: isSignUp,
                };
                onAuthComplete(userData);
            } else {
                // Show error message
                Alert.alert(
                    'Authentication Failed',
                    result.error || 'Unable to ' + (isSignUp ? 'sign up' : 'sign in'),
                    [{ text: 'Try Again' }]
                );
            }
        } catch (error) {
            setIsLoading(false);
            console.error('Email auth error:', error);
            Alert.alert(
                'Error',
                'An unexpected error occurred. Please try again.',
                [{ text: 'OK' }]
            );
        }
    };

    const handleAppleSignIn = async () => {
        setIsLoading(true);
        try {
            const result = await authService.signInWithApple();
            setIsLoading(false);
            if (result.success) {
                onAuthComplete({
                    id: Date.now().toString(),
                    email: '',
                    fullName: '',
                    username: 'apple_user',
                    authMethod: 'apple',
                    isNewUser: false,
                });
            } else if (result.error && result.error !== 'cancelled') {
                Alert.alert('Sign in Failed', result.error);
            }
        } catch (error) {
            setIsLoading(false);
            console.error('Apple sign-in error:', error);
            Alert.alert('Error', 'An unexpected error occurred. Please try again.');
        }
    };

    const handleGoogleSignIn = async () => {
        setIsLoading(true);
        try {
            const result = await authService.signInWithGoogle();
            setIsLoading(false);
            if (result.success) {
                onAuthComplete({
                    id: Date.now().toString(),
                    email: '',
                    fullName: '',
                    username: 'google_user',
                    authMethod: 'google',
                    isNewUser: false,
                });
            } else if (result.error) {
                Alert.alert('Sign in Failed', result.error);
            }
        } catch (error) {
            setIsLoading(false);
            console.error('Google sign-in error:', error);
            Alert.alert('Error', 'An unexpected error occurred. Please try again.');
        }
    };

    const handleSkip = () => {
        Alert.alert(
            'Skip Authentication',
            'You can sign up later to sync your preferences and alerts across devices.',
            [
                { text: 'Go Back', style: 'cancel' },
                { 
                    text: 'Continue Without Account', 
                    onPress: () => {
                        const guestData = {
                            id: 'guest_' + Date.now().toString(),
                            username: 'Guest User',
                            fullName: 'Guest User',
                            authMethod: 'guest',
                            isNewUser: true,
                        };
                        onSkip(guestData);
                    }
                },
            ]
        );
    };

    if (currentScreen === 'loading') {
        return (
            <View style={styles.loadingContainer}>
                <StatusBar barStyle="light-content" backgroundColor="#000000" />
                
                <View style={styles.loadingIconContainer}>
                    <IntegraIcon 
                        size={192} 
                        animated={progress < 100} 
                        variant="loading"
                    />
                </View>

                <View style={styles.loadingTextContainer}>
                    <View style={styles.brandTextRow}>
                        <ShinyText 
                            text="integra" 
                            speed={3} 
                            style={styles.brandTextMain}
                            disabled={progress >= 100}
                        />
                        <ShinyText 
                            text="Markets" 
                            speed={3} 
                            style={styles.brandTextSub}
                            disabled={progress >= 100}
                        />
                    </View>
                </View>

                {progress < 100 && (
                    <View style={styles.progressContainer}>
                        <View style={styles.progressBar}>
                            <Animated.View
                                style={[
                                    styles.progressFill,
                                    {
                                        width: progressAnim.interpolate({
                                            inputRange: [0, 100],
                                            outputRange: ['0%', '100%'],
                                            extrapolate: 'clamp',
                                        }),
                                    }
                                ]}
                            />
                        </View>
                        <Text style={styles.progressText}>{progress}%</Text>
                    </View>
                )}
            </View>
        );
    }

    if (currentScreen === 'auth') {
        return (
            <View style={styles.authContainer}>
                <StatusBar barStyle="light-content" backgroundColor="#000000" />
                
                {/* Animated Background */}
                <View style={styles.animatedBackground}>
                    <IntegraIcon 
                        size={320} 
                        animated={false} 
                        variant="static"
                        style={styles.backgroundIcon}
                    />
                </View>

                {/* Blurred Glass Overlay */}
                <ExpoBlurView intensity={15} style={styles.blurOverlay}>
                    <View style={styles.overlayContent}>
                        <View style={styles.authHeader}>
                            <Text style={styles.welcomeTitle}>Welcome to</Text>
                            <View style={styles.brandTextRow}>
                                <Text style={styles.brandTextMain}>integra</Text>
                                <Text style={styles.brandTextSub}>Markets</Text>
                            </View>
                            <Text style={styles.authSubtitle}>
                                Stay ahead of commodity markets with AI-powered insights
                            </Text>
                        </View>

                        <View style={styles.emailOptions}>
                            {appleAvailable && (
                                <AppleAuthentication.AppleAuthenticationButton
                                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                                    buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                                    cornerRadius={12}
                                    style={styles.appleAuthButton}
                                    onPress={handleAppleSignIn}
                                />
                            )}

                            <TouchableOpacity
                                style={[styles.socialButton, styles.googleButton]}
                                onPress={handleGoogleSignIn}
                                disabled={isLoading}
                            >
                                <MaterialCommunityIcons name="google" size={22} color={colors.googleRed} />
                                <Text style={styles.googleButtonText}>Continue with Google</Text>
                            </TouchableOpacity>

                            <View style={styles.dividerContainer}>
                                <View style={styles.divider} />
                                <Text style={styles.dividerText}>or</Text>
                                <View style={styles.divider} />
                            </View>

                            <TouchableOpacity
                                style={styles.emailButton}
                                onPress={() => setCurrentScreen('login')}
                                disabled={isLoading}
                            >
                                <MaterialCommunityIcons name="email-outline" size={24} color={colors.accentPositive} />
                                <Text style={styles.emailButtonText}>Sign in with Email</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.signupButton}
                                onPress={() => setCurrentScreen('signup')}
                                disabled={isLoading}
                            >
                                <Text style={styles.signupButtonText}>Create New Account</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.skipContainer}>
                            <TouchableOpacity 
                                style={styles.skipButton}
                                onPress={handleSkip}
                                disabled={isLoading}
                            >
                                <Text style={styles.skipButtonText}>Skip for now</Text>
                                <MaterialIcons name="arrow-forward" size={16} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>
                    </View>
                </ExpoBlurView>

                {isLoading && (
                    <View style={styles.loadingOverlay}>
                        <View style={styles.loadingSpinner}>
                            <Text style={styles.loadingText}>Authenticating...</Text>
                        </View>
                    </View>
                )}
            </View>
        );
    }

    if (currentScreen === 'login' || currentScreen === 'signup') {
        const isSignUp = currentScreen === 'signup';
        
        return (
            <KeyboardAvoidingView 
                style={styles.authContainer}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <StatusBar barStyle="light-content" backgroundColor="#000000" />
                
                <ScrollView contentContainerStyle={styles.formScrollContainer}>
                    <TouchableOpacity 
                        style={styles.backButton}
                        onPress={() => setCurrentScreen('auth')}
                    >
                        <MaterialIcons name="arrow-back" size={24} color={colors.textPrimary} />
                    </TouchableOpacity>

                    <View style={styles.formHeader}>
                        <Text style={styles.formTitle}>
                            {isSignUp ? 'Create Account' : 'Welcome Back'}
                        </Text>
                        <Text style={styles.formSubtitle}>
                            {isSignUp 
                                ? 'Join thousands of traders getting AI-powered market insights' 
                                : 'Sign in to access your personalized market dashboard'
                            }
                        </Text>
                    </View>

                    <View style={styles.form}>
                        {isSignUp && (
                            <View style={styles.inputContainer}>
                                <Text style={styles.inputLabel}>Full Name</Text>
                                <TextInput
                                    style={styles.textInput}
                                    value={fullName}
                                    onChangeText={setFullName}
                                    placeholder="Enter your full name"
                                    placeholderTextColor={colors.textSecondary}
                                    autoCapitalize="words"
                                />
                            </View>
                        )}

                        <View style={styles.inputContainer}>
                            <Text style={styles.inputLabel}>Email Address</Text>
                            <TextInput
                                style={styles.textInput}
                                value={email}
                                onChangeText={setEmail}
                                placeholder="Enter your email"
                                placeholderTextColor={colors.textSecondary}
                                keyboardType="email-address"
                                autoCapitalize="none"
                                autoCorrect={false}
                                autoComplete="email"
                                textContentType="emailAddress"
                            />
                        </View>

                        <View style={styles.inputContainer}>
                            <Text style={styles.inputLabel}>Password</Text>
                            <TextInput
                                style={styles.textInput}
                                value={password}
                                onChangeText={setPassword}
                                placeholder="Enter your password"
                                placeholderTextColor={colors.textSecondary}
                                secureTextEntry
                                autoComplete="off"
                                autoCorrect={false}
                                autoCapitalize="none"
                                textContentType="none"
                            />
                        </View>

                        {isSignUp && (
                            <View style={styles.inputContainer}>
                                <Text style={styles.inputLabel}>Confirm Password</Text>
                                <TextInput
                                    style={styles.textInput}
                                    value={confirmPassword}
                                    onChangeText={setConfirmPassword}
                                    placeholder="Confirm your password"
                                    placeholderTextColor={colors.textSecondary}
                                    secureTextEntry
                                    autoComplete="off"
                                    autoCorrect={false}
                                    autoCapitalize="none"
                                    textContentType="none"
                                />
                            </View>
                        )}

                        <TouchableOpacity 
                            style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
                            onPress={() => handleEmailAuth(isSignUp)}
                            disabled={isLoading}
                        >
                            <Text style={styles.submitButtonText}>
                                {isLoading 
                                    ? (isSignUp ? 'Creating Account...' : 'Signing In...') 
                                    : (isSignUp ? 'Create Account' : 'Sign In')
                                }
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity 
                            style={styles.switchModeButton}
                            onPress={() => setCurrentScreen(isSignUp ? 'login' : 'signup')}
                            disabled={isLoading}
                        >
                            <Text style={styles.switchModeText}>
                                {isSignUp 
                                    ? 'Already have an account? Sign In' 
                                    : "Don't have an account? Sign Up"
                                }
                            </Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        );
    }

    return null;
};

const styles = StyleSheet.create({
    // Loading Screen Styles
    loadingContainer: {
        flex: 1,
        backgroundColor: colors.bgPrimary,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    loadingIconContainer: {
        marginBottom: 40,
    },
    loadingTextContainer: {
        marginBottom: 60,
    },
    brandTextRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },
    brandTextMain: {
        fontSize: 24,
        fontWeight: '500',
        color: colors.shinyGreen,
        marginRight: 4,
    },
    brandTextSub: {
        fontSize: 18,
        fontWeight: '300',
        color: colors.shinyGreen,
    },
    shinyText: {
        color: colors.shinyGreen,
    },
    shinyTextDisabled: {
        color: colors.shinyGreen,
    },
    progressContainer: {
        alignItems: 'center',
        width: '100%',
    },
    progressBar: {
        width: '80%',
        height: 3,
        backgroundColor: colors.bgSecondary,
        borderRadius: 2,
        marginBottom: 10,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: colors.accentPositive,
        borderRadius: 2,
    },
    progressText: {
        color: colors.textSecondary,
        fontSize: 12,
        fontWeight: '500',
    },

    // Auth Screen Styles
    authContainer: {
        flex: 1,
        backgroundColor: colors.bgPrimary,
    },
    authHeader: {
        alignItems: 'center',
        paddingTop: 80,
        paddingHorizontal: 30,
        marginBottom: 60,
    },
    authSubtitle: {
        color: colors.textSecondary,
        fontSize: 16,
        textAlign: 'center',
        marginTop: 16,
        lineHeight: 22,
    },
    authOptions: {
        paddingHorizontal: 30,
        marginBottom: 40,
    },
    emailOptions: {
        paddingHorizontal: 30,
        marginBottom: 40,
    },
    socialButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 12,
        paddingVertical: 16,
        marginBottom: 12,
        gap: 12,
    },
    appleAuthButton: {
        width: '100%',
        height: 50,
        marginBottom: 12,
    },
    appleButton: {
        backgroundColor: '#000000',
        borderWidth: 1,
        borderColor: '#FFFFFF',
    },
    socialButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
    googleButton: {
        backgroundColor: colors.bgSecondary,
        borderWidth: 1,
        borderColor: colors.divider,
    },
    googleButtonText: {
        color: colors.textPrimary,
        fontSize: 16,
        fontWeight: '500',
    },
    dividerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 20,
    },
    divider: {
        flex: 1,
        height: 1,
        backgroundColor: colors.divider,
    },
    dividerText: {
        color: colors.textSecondary,
        paddingHorizontal: 16,
        fontSize: 14,
    },
    emailButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.accentPositive,
        borderRadius: 12,
        paddingVertical: 16,
        marginBottom: 16,
        gap: 12,
    },
    emailButtonText: {
        color: colors.bgPrimary,
        fontSize: 16,
        fontWeight: '600',
    },
    signupButton: {
        alignItems: 'center',
        paddingVertical: 16,
    },
    signupButtonText: {
        color: colors.accentData,
        fontSize: 16,
        fontWeight: '500',
    },
    skipContainer: {
        flex: 1,
        justifyContent: 'flex-end',
        paddingHorizontal: 30,
        paddingBottom: 40,
    },
    skipButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    skipButtonText: {
        color: colors.textSecondary,
        fontSize: 16,
    },

    // Form Styles
    formScrollContainer: {
        flexGrow: 1,
        paddingHorizontal: 30,
    },
    backButton: {
        alignSelf: 'flex-start',
        padding: 8,
        marginTop: 60,
        marginBottom: 20,
    },
    formHeader: {
        marginBottom: 40,
    },
    formTitle: {
        color: colors.textPrimary,
        fontSize: 28,
        fontWeight: '600',
        marginBottom: 8,
    },
    formSubtitle: {
        color: colors.textSecondary,
        fontSize: 16,
        lineHeight: 22,
    },
    form: {
        flex: 1,
    },
    inputContainer: {
        marginBottom: 20,
    },
    inputLabel: {
        color: colors.textPrimary,
        fontSize: 16,
        fontWeight: '500',
        marginBottom: 8,
    },
    textInput: {
        backgroundColor: colors.inputBg,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 16,
        color: colors.textPrimary,
        fontSize: 16,
        borderWidth: 1,
        borderColor: colors.divider,
    },
    submitButton: {
        backgroundColor: colors.accentPositive,
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 20,
        marginBottom: 20,
    },
    submitButtonDisabled: {
        opacity: 0.6,
    },
    submitButtonText: {
        color: colors.bgPrimary,
        fontSize: 16,
        fontWeight: '600',
    },
    switchModeButton: {
        alignItems: 'center',
        paddingVertical: 16,
    },
    switchModeText: {
        color: colors.accentData,
        fontSize: 16,
    },

    // Loading Overlay
    loadingOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingSpinner: {
        backgroundColor: colors.bgSecondary,
        borderRadius: 12,
        padding: 20,
        alignItems: 'center',
    },
    loadingText: {
        color: colors.textPrimary,
        fontSize: 16,
        marginTop: 10,
    },

    // Animated Background Styles
    animatedBackground: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1,
    },
    backgroundIcon: {
        opacity: 0.1,
    },
    backgroundIconContainer: {
        marginBottom: 40,
    },
    backgroundIconSquare: {
        width: 192,
        height: 192,
        borderWidth: 4,
        borderColor: colors.accentPositive,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    backgroundIconDot: {
        width: 16,
        height: 16,
        backgroundColor: colors.accentPositive,
        borderRadius: 4,
        marginBottom: 24,
    },
    backgroundIconLine: {
        width: 16,
        height: 96,
        backgroundColor: colors.accentPositive,
        borderRadius: 4,
    },
    backgroundTextContainer: {
        alignItems: 'center',
    },
    backgroundBrandTextMain: {
        fontSize: 24,
        fontWeight: '500',
        color: colors.shinyGreen,
        marginRight: 4,
    },
    backgroundBrandTextSub: {
        fontSize: 18,
        fontWeight: '300',
        color: colors.shinyGreen,
    },

    // Blurred Glass Overlay Styles
    blurOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 2,
    },
    overlayContent: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
    },
    welcomeTitle: {
        color: colors.textPrimary,
        fontSize: 20,
        fontWeight: '400',
        marginBottom: 8,
        textAlign: 'center',
    },
});

export default AuthLoadingScreen;