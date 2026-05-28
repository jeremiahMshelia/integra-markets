import React from 'react';
import { View, StyleSheet } from 'react-native';

const POLYMARKET_BLUE = '#2F5BFF';
const POLYMARKET_WHITE = '#F8FAFC';

const PolymarketIcon = ({ size = 28, rounded = true, style = undefined }) => {
  const borderWidth = Math.max(2, Math.round(size * 0.11));
  const frameWidth = size * 0.56;
  const frameHeight = size * 0.72;
  const diagonalWidth = Math.max(2, Math.round(size * 0.09));

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: rounded ? size / 2 : size * 0.16,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.frame,
          {
            width: frameWidth,
            height: frameHeight,
            borderWidth,
          },
        ]}
      >
        <View
          style={[
            styles.diagonalTop,
            {
              width: frameWidth * 0.88,
              height: diagonalWidth,
              top: frameHeight * 0.18,
              left: -frameWidth * 0.06,
            },
          ]}
        />
        <View
          style={[
            styles.diagonalBottom,
            {
              width: frameWidth * 0.88,
              height: diagonalWidth,
              bottom: frameHeight * 0.2,
              left: -frameWidth * 0.06,
            },
          ]}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: POLYMARKET_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    borderColor: POLYMARKET_WHITE,
    transform: [{ skewY: '-10deg' }], // RN transform values are angle-strings, not raw numbers
  },
  diagonalTop: {
    position: 'absolute',
    backgroundColor: POLYMARKET_WHITE,
    transform: [{ rotate: '-18deg' }],
  },
  diagonalBottom: {
    position: 'absolute',
    backgroundColor: POLYMARKET_WHITE,
    transform: [{ rotate: '18deg' }],
  },
});

export default PolymarketIcon;
