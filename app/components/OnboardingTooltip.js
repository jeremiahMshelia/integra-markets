import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Animated,
    Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * OnboardingTooltip - Uber-style floating tooltip for first-time users
 * 
 * Props:
 *  - storageKey: unique AsyncStorage key to track dismissal (required)
 *  - title: bold heading text
 *  - message: descriptive body text
 *  - position: 'top' | 'bottom' (where the arrow points)
 *  - arrowAlign: 'left' | 'center' | 'right' (arrow horizontal position)
 *  - style: additional container style overrides
 *  - onDismiss: optional callback when dismissed
 */
const OnboardingTooltip = ({
    storageKey,
    title,
    message,
    position = 'top',
    arrowAlign = 'center',
    style,
    onDismiss,
}) => {
    const [visible, setVisible] = useState(false);
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0.9)).current;

    useEffect(() => {
        checkIfSeen();
    }, []);

    const checkIfSeen = async () => {
        try {
            const seen = await AsyncStorage.getItem(storageKey);
            if (!seen) {
                setVisible(true);
                // Slight delay so the main UI renders first
                setTimeout(() => {
                    Animated.parallel([
                        Animated.timing(fadeAnim, {
                            toValue: 1,
                            duration: 300,
                            useNativeDriver: true,
                        }),
                        Animated.spring(scaleAnim, {
                            toValue: 1,
                            friction: 8,
                            tension: 100,
                            useNativeDriver: true,
                        }),
                    ]).start();
                }, 600);
            }
        } catch (e) {
            // Silently fail
        }
    };

    const handleDismiss = async () => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }),
            Animated.timing(scaleAnim, {
                toValue: 0.9,
                duration: 200,
                useNativeDriver: true,
            }),
        ]).start(async () => {
            setVisible(false);
            try {
                await AsyncStorage.setItem(storageKey, 'true');
            } catch (e) {
                // Silently fail
            }
            if (onDismiss) onDismiss();
        });
    };

    if (!visible) return null;

    const arrowStyle =
        arrowAlign === 'left'
            ? { left: 24 }
            : arrowAlign === 'right'
                ? { right: 24 }
                : { alignSelf: 'center', left: '45%' };

    return (
        <Animated.View
            style={[
                styles.container,
                {
                    opacity: fadeAnim,
                    transform: [{ scale: scaleAnim }],
                },
                style,
            ]}
        >
            {/* Arrow pointing up (when tooltip is below the target) */}
            {position === 'top' && (
                <View style={[styles.arrowUp, arrowStyle]} />
            )}

            <View style={styles.bubble}>
                <View style={styles.header}>
                    <Text style={styles.title}>{title}</Text>
                    <TouchableOpacity onPress={handleDismiss} style={styles.closeBtn}>
                        <Text style={styles.closeBtnText}>✕</Text>
                    </TouchableOpacity>
                </View>
                <Text style={styles.message}>{message}</Text>
                <TouchableOpacity onPress={handleDismiss} style={styles.gotItBtn}>
                    <Text style={styles.gotItText}>Got it</Text>
                </TouchableOpacity>
            </View>

            {/* Arrow pointing down (when tooltip is above the target) */}
            {position === 'bottom' && (
                <View style={[styles.arrowDown, arrowStyle]} />
            )}
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        zIndex: 9999,
        width: SCREEN_WIDTH - 40,
        alignSelf: 'center',
        left: 20,
    },
    bubble: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 18,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
        elevation: 12,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    title: {
        fontSize: 17,
        fontWeight: '700',
        color: '#1A1A2E',
        flex: 1,
    },
    closeBtn: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#F0F0F0',
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 8,
    },
    closeBtnText: {
        fontSize: 14,
        color: '#666',
        fontWeight: '600',
    },
    message: {
        fontSize: 14,
        lineHeight: 20,
        color: '#555',
        marginBottom: 14,
    },
    gotItBtn: {
        backgroundColor: '#1A1A2E',
        borderRadius: 10,
        paddingVertical: 10,
        paddingHorizontal: 22,
        alignSelf: 'flex-start',
    },
    gotItText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    arrowUp: {
        width: 16,
        height: 16,
        backgroundColor: '#FFFFFF',
        transform: [{ rotate: '45deg' }],
        marginBottom: -8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 4,
    },
    arrowDown: {
        width: 16,
        height: 16,
        backgroundColor: '#FFFFFF',
        transform: [{ rotate: '45deg' }],
        marginTop: -8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 4,
    },
});

export default OnboardingTooltip;
