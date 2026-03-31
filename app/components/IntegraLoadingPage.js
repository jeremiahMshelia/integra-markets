import React from 'react';
import {
    StyleSheet,
    Text,
    View,
    Animated,
    Dimensions,
    StatusBar,
} from 'react-native';
import Logo from '../../components/mediakit/Logo';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Color palette
const colors = {
    bgPrimary: '#000000',
    textPrimary: '#FFFFFF',
    textSecondary: '#A0A0A0',
    accentPositive: '#4ECCA3',
    shinyGreen: '#10b981',
    shinyGray: '#6b7280',
};

const ShinyText = ({ text, disabled = false, speed = 3, style = {} }) => {
    const animatedValue = React.useRef(new Animated.Value(0)).current;
    
    React.useEffect(() => {
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

const IntegraLoadingPage = ({ onLoadingComplete }) => {
    const [progress, setProgress] = React.useState(0);
    const progressAnim = React.useRef(new Animated.Value(0)).current;

    React.useEffect(() => {
        const timer = setInterval(() => {
            setProgress((prev) => {
                if (prev >= 100) {
                    clearInterval(timer);
                    // Call onLoadingComplete when progress reaches 100%
                    setTimeout(() => {
                        onLoadingComplete?.();
                    }, 300); // Small delay for smooth transition
                    return 100;
                }
                return prev + 2;
            });
        }, 30);

        return () => clearInterval(timer);
    }, [onLoadingComplete]);

    React.useEffect(() => {
        Animated.timing(progressAnim, {
            toValue: progress,
            duration: 50,
            useNativeDriver: false,
        }).start();
    }, [progress]);

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#000000" />
            
            {/* Logo */}
            <View style={styles.logoContainer}>
                <Logo variant="full" size="xlarge" style={styles.logo} />
            </View>

            {/* Shiny Text Below */}
            <View style={styles.textContainer}>
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
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.bgPrimary,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    logoContainer: {
        marginBottom: 40,
    },
    logo: {
        width: 200,
        height: 200,
    },
    textContainer: {
        alignItems: 'center',
    },
    brandTextRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },
    brandTextMain: {
        fontSize: 24,
        fontWeight: '500',
        color: colors.textPrimary, // White text as requested
        marginRight: 4,
    },
    brandTextSub: {
        fontSize: 18,
        fontWeight: '300',
        color: colors.textPrimary, // White text as requested
    },
    shinyText: {
        color: colors.shinyGreen,
    },
    shinyTextDisabled: {
        color: colors.shinyGreen,
    },
});

export default IntegraLoadingPage;