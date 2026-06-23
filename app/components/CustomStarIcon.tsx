import React from 'react';
import { View, Text } from 'react-native';

interface CustomStarIconProps {
  size?: number;
  color?: string;
  style?: any;
}

export const SingleStar: React.FC<CustomStarIconProps> = ({
  size = 35,
  color = '#4a9eff',
  style,
}) => {
  return (
    <View
      style={[
        { width: size, height: size, justifyContent: 'center', alignItems: 'center' },
        style,
      ]}
    >
      <Text style={{ fontSize: size * 0.85, color, lineHeight: size }}>✦</Text>
    </View>
  );
};

export const IconWithStars: React.FC<CustomStarIconProps> = ({
  size = 24,
  color = '#4a9eff',
  style,
}) => {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size * 0.18,
          borderWidth: Math.max(1, size * 0.04),
          borderColor: color,
          justifyContent: 'center',
          alignItems: 'center',
        },
        style,
      ]}
    >
      <Text style={{ fontSize: size * 0.55, color, lineHeight: size * 0.7 }}>✦</Text>
    </View>
  );
};

export default SingleStar;
