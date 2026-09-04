/**
 * CalculatorButton.tsx — Premium animated calculator key (v3)
 *
 * Features:
 * - Animated scale + opacity press effect
 * - Premium dark glass design with neon orange accents
 * - Responsive sizing from screen width
 * - Haptic feedback on every press
 */

import React, { useCallback, useRef } from 'react';
import {
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
  Animated,
} from 'react-native';
import * as Haptics from 'expo-haptics';

type ButtonVariant = 'digit' | 'operator' | 'special';

interface Props {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  /** If true, the button spans two columns (e.g. the "0" key) */
  wide?: boolean;
}

// Premium color system
const THEMES: Record<
  ButtonVariant,
  { bg: string; bgPressed: string; text: string; border: string }
> = {
  digit:    { bg: '#1e1e2e', bgPressed: '#2a2a3e', text: '#FFFFFF',  border: 'rgba(255,255,255,0.08)' },
  operator: { bg: '#FF9500', bgPressed: '#e08500', text: '#FFFFFF',  border: 'rgba(255,149,0,0.5)'    },
  special:  { bg: '#2d2d3f', bgPressed: '#3a3a52', text: '#c7c7cc', border: 'rgba(255,255,255,0.10)'  },
};

// Responsive button size
const { width: SCREEN_W } = Dimensions.get('window');
const BUTTON_MARGIN = 5;
const BUTTON_SIZE = Math.floor((SCREEN_W - BUTTON_MARGIN * 10) / 4);

export function CalculatorButton({
  label,
  onPress,
  variant = 'digit',
  wide = false,
}: Props) {
  const theme = THEMES[variant];
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.88,
      useNativeDriver: true,
      speed: 60,
      bounciness: 4,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 40,
      bounciness: 10,
    }).start();
  }, [scaleAnim]);

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }, [onPress]);

  // Font size scales with button size
  const fontSize = wide
    ? BUTTON_SIZE * 0.38
    : label.length > 1
      ? BUTTON_SIZE * 0.34
      : BUTTON_SIZE * 0.42;

  const btnWidth = wide ? BUTTON_SIZE * 2 + BUTTON_MARGIN * 2 : BUTTON_SIZE;

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.pressable, { width: btnWidth }]}
    >
      {({ pressed }) => (
        <Animated.View
          style={[
            styles.button,
            {
              width: btnWidth,
              height: BUTTON_SIZE,
              borderRadius: BUTTON_SIZE / 2,
              backgroundColor: pressed ? theme.bgPressed : theme.bg,
              borderColor: theme.border,
              transform: [{ scale: scaleAnim }],
            },
            wide && { alignItems: 'flex-start', paddingLeft: BUTTON_SIZE * 0.30 },
            variant === 'operator' && styles.operatorShadow,
          ]}
        >
          <Text style={[styles.label, { color: theme.text, fontSize }]}>
            {label}
          </Text>
        </Animated.View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    margin: BUTTON_MARGIN,
    alignItems: 'center',
  },
  button: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  operatorShadow: {
    elevation: 14,
    shadowColor: '#FF9500',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.55,
    shadowRadius: 14,
  },
  label: {
    fontWeight: '500',
  },
});

export { BUTTON_SIZE, BUTTON_MARGIN };
