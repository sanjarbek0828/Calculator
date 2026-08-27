/**
 * CalculatorButton.tsx — A single calculator key
 *
 * Color-coded by type: digit (dark), operator (orange), special (light gray).
 * Includes press animation and haptic feedback for a premium feel.
 */

import React, { useCallback } from 'react';
import {
  Text,
  Pressable,
  StyleSheet,
  type ViewStyle,
  type TextStyle,
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

const COLORS: Record<ButtonVariant, { bg: string; bgPressed: string; text: string }> = {
  digit: {
    bg: '#333333',
    bgPressed: '#555555',
    text: '#FFFFFF',
  },
  operator: {
    bg: '#FF9500',
    bgPressed: '#CC7700',
    text: '#FFFFFF',
  },
  special: {
    bg: '#A5A5A5',
    bgPressed: '#D4D4D4',
    text: '#1C1C1C',
  },
};

export function CalculatorButton({ label, onPress, variant = 'digit', wide = false }: Props) {
  const colors = COLORS[variant];

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }, [onPress]);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: pressed ? colors.bgPressed : colors.bg },
        wide && styles.wideButton,
      ]}
    >
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const BUTTON_SIZE = 75;
const BUTTON_MARGIN = 6;

const styles = StyleSheet.create({
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    margin: BUTTON_MARGIN,
  },
  wideButton: {
    width: BUTTON_SIZE * 2 + BUTTON_MARGIN * 2,
    alignItems: 'flex-start',
    paddingLeft: BUTTON_SIZE * 0.35,
  },
  label: {
    fontSize: 30,
    fontWeight: '500',
  },
});
