// IntegraIcon.js - Official Integra branded icon component (matches media kit)
import React, { useEffect, useRef } from 'react';
import { View, Animated, Image } from 'react-native';

const LOGO_IMAGE = require('../../assets/logoNew.png');

const IntegraIcon = ({ 
    size = 192, 
    animated = false, 
    variant = 'default', // 'default', 'loading', 'app-icon'
    style = {} 
}) => {
    const scaleAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (animated) {
            const loop = Animated.loop(
                Animated.sequence([
                    Animated.timing(scaleAnim, {
                        toValue: 1.05,
                        duration: 1200,
                        useNativeDriver: true,
                    }),
                    Animated.timing(scaleAnim, {
                        toValue: 1,
                        duration: 1200,
                        useNativeDriver: true,
                    }),
                ])
            );
            loop.start();
            return () => loop.stop();
        }
        scaleAnim.setValue(1);
    }, [animated, scaleAnim]);

    const cornerRadius = variant === 'app-icon' ? size * 0.2 : 0;
    const backgroundColor = variant === 'app-icon' ? '#000000' : 'transparent';

    return (
        <View
            style={[
                {
                    width: size,
                    height: size,
                    justifyContent: 'center',
                    alignItems: 'center',
                    backgroundColor,
                    borderRadius: cornerRadius,
                },
                style,
            ]}
        >
            <Animated.Image
                source={LOGO_IMAGE}
                resizeMode="contain"
                style={[
                    {
                        width: '100%',
                        height: '100%',
                        transform: [{ scale: scaleAnim }],
                    },
                ]}
                accessibilityLabel="Integra Markets logo"
            />
        </View>
    );
};

export default IntegraIcon;