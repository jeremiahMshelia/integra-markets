import React from 'react';
import { View, StyleSheet, Image, ViewStyle } from 'react-native';

export type LogoVariant = 'full' | 'icon' | 'text';
export type LogoSize = 'small' | 'medium' | 'large' | 'xlarge';

interface LogoProps {
  variant?: LogoVariant;
  size?: LogoSize;
  style?: ViewStyle;
}

const LOGO_SIZES: Record<LogoSize, number> = {
  small: 48,
  medium: 72,
  large: 96,
  xlarge: 128,
};

const LOGO_IMAGE = require('../../assets/logoNew.png');

export const Logo: React.FC<LogoProps> = ({
  variant = 'full',
  size = 'medium',
  style
}) => {
  const baseSize = LOGO_SIZES[size] || LOGO_SIZES.medium;
  const isIcon = variant === 'icon';

  return (
    <View style={[styles.container, style]}>
      <Image
        source={LOGO_IMAGE}
        resizeMode="contain"
        style={[
          styles.image,
          {
            width: isIcon ? baseSize : baseSize * 1.6,
            height: isIcon ? baseSize : baseSize * 1.6,
          },
        ]}
        accessible
        accessibilityLabel="Integra Markets logo"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    maxWidth: '100%',
    maxHeight: '100%',
  },
});

export default Logo;
