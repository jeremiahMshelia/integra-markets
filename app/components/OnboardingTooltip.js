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
 * OnboardingTooltip - Dark themed floating tooltip for first-time users
 * Matches the Integra Markets dark UI aesthetic
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
    const scaleAnim = useRef(new Animated.Value(0.95)).current;

    useEffect(() => {
        checkIfSeen();
    }, []);

    const checkIfSeen = async () => {
        try {
            const seen = await AsyncStorage.getItem(storageKey);
            if (!seen) {
                setVisible(true);
                setTimeout(() => {
                    Animated.parallel([
                        Animated.timing(fadeAnim, {
                            toValue: 1,
                            duration: 250,
                            useNativeDriver: true,
                        }),
                        Animated.spring(scaleAnim, {
                            toValue: 1,
                            friction: 8,
                            tension: 120,
                            useNativeDriver: true,
                        }),
                    ]).start();
                }, 800);
            }
        } catch (e) {
            // Silently fail
        }
    };

    const handleDismiss = async () => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 180,
                useNativeDriver: true,
            }),
            Animated.timing(scaleAnim, {
                toValue: 0.95,
                duration: 180,
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
            ? { left: 28 }
            : arrowAlign === 'right'
                ? { right: 28 }
                : { alignSelf: 'center', left: '46%' };

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
            {position === 'top' && (
                <View style={[styles.arrowUp, arrowStyle]} />
            )}

            <View style={styles.bubble}>
                <View style={styles.header}>
                    <Text style={styles.title}>{title}</Text>
                    <TouchableOpacity
                        onPress={handleDismiss}
                        style={styles.closeBtn}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <Text style={styles.closeBtnText}>✕</Text>
                    </TouchableOpacity>
                </View>
                <Text style={styles.message}>{message}</Text>
                <TouchableOpacity onPress={handleDismiss} style={styles.gotItBtn}>
                    <Text style={styles.gotItText}>Got it</Text>
                </TouchableOpacity>
            </View>

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
        width: SCREEN_WIDTH - 32,
        alignSelf: 'center',
        left: 16,
    },
    bubble: {
        backgroundColor: '#1E1E1E',
        borderRadius: 14,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(78, 204, 163, 0.2)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 10,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    title: {
        fontSize: 15,
        fontWeight: '600',
        color: '#4ECCA3',
        flex: 1,
        letterSpacing: 0.3,
    },
    closeBtn: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.08)',
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 8,
    },
    closeBtnText: {
        fontSize: 12,
        color: '#A0A0A0',
        fontWeight: '500',
    },
    message: {
        fontSize: 13,
        lineHeight: 19,
        color: '#A0A0A0',
        marginBottom: 12,
    },
    gotItBtn: {
        backgroundColor: '#4ECCA3',
        borderRadius: 8,
        paddingVertical: 8,
        paddingHorizontal: 20,
        alignSelf: 'flex-start',
    },
    gotItText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#121212',
    },
    arrowUp: {
        width: 14,
        height: 14,
        backgroundColor: '#1E1E1E',
        borderLeftWidth: 1,
        borderTopWidth: 1,
        borderColor: 'rgba(78, 204, 163, 0.2)',
        transform: [{ rotate: '45deg' }],
        marginBottom: -7,
    },
    arrowDown: {
        width: 14,
        height: 14,
        backgroundColor: '#1E1E1E',
        borderRightWidth: 1,
        borderBottomWidth: 1,
        borderColor: 'rgba(78, 204, 163, 0.2)',
        transform: [{ rotate: '45deg' }],
        marginTop: -7,
    },
});

export default OnboardingTooltip;
