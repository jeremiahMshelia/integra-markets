import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    TouchableWithoutFeedback,
    StyleSheet,
    Animated,
    Dimensions,
    Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * OnboardingTooltip - Dark themed floating tooltip for first-time users
 * Uses Modal to render above ALL content (fixes z-index/overflow issues)
 */
const OnboardingTooltip = ({
    storageKey,
    title,
    message,
    verticalPosition = 120,
    onDismiss,
}) => {
    const [visible, setVisible] = useState(false);
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(10)).current;

    useEffect(() => {
        checkIfSeen();
    }, []);

    const checkIfSeen = async () => {
        try {
            const seen = await AsyncStorage.getItem(storageKey);
            console.log(`[Tooltip] Key=${storageKey} seen=${seen}`);
            if (!seen) {
                // Delay showing to let the main UI render first
                setTimeout(() => {
                    console.log(`[Tooltip] Showing tooltip: ${title}`);
                    setVisible(true);
                    Animated.parallel([
                        Animated.timing(fadeAnim, {
                            toValue: 1,
                            duration: 300,
                            useNativeDriver: true,
                        }),
                        Animated.timing(slideAnim, {
                            toValue: 0,
                            duration: 300,
                            useNativeDriver: true,
                        }),
                    ]).start();
                }, 1200);
            } else {
                console.log(`[Tooltip] Already dismissed: ${title}`);
            }
        } catch (e) {
            console.log(`[Tooltip] Error checking: ${e.message}`);
        }
    };

    const handleDismiss = async () => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }),
            Animated.timing(slideAnim, {
                toValue: 10,
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


    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            statusBarTranslucent
            onRequestClose={handleDismiss}
        >
            <TouchableWithoutFeedback onPress={handleDismiss}>
                <View style={styles.overlay}>
                    <TouchableWithoutFeedback>
                        <Animated.View
                            style={[
                                styles.tooltipWrapper,
                                {
                                    top: verticalPosition,
                                    opacity: fadeAnim,
                                    transform: [{ translateY: slideAnim }],
                                },
                            ]}
                        >
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
                        </Animated.View>
                    </TouchableWithoutFeedback>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    tooltipWrapper: {
        position: 'absolute',
        left: 16,
        right: 16,
    },
    arrow: {
        position: 'absolute',
        top: -6,
        width: 12,
        height: 12,
        backgroundColor: '#1E1E1E',
        borderLeftWidth: 1,
        borderTopWidth: 1,
        borderColor: 'rgba(78, 204, 163, 0.25)',
        transform: [{ rotate: '45deg' }],
        zIndex: 2,
    },
    bubble: {
        backgroundColor: '#1E1E1E',
        borderRadius: 14,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(78, 204, 163, 0.15)',
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
        letterSpacing: 0.2,
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
        marginBottom: 14,
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
});

export default OnboardingTooltip;
