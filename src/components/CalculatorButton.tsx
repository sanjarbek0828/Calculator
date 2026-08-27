/**
 * CalculatorButton.tsx — A single calculator key (v2)
 *
 * FULLY RESPONSIVE: Button sizes are computed dynamically from
 * screen width instead of being hardcoded. Works on every phone.
 */

import React, { useCallback } from 'react';
import { Text, Pressable, StyleSheet, Dimensions } from 'react-native';
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
  digit:    { bg: '#333333', bgPressed: '#555555', text: '#FFFFFF' },
  operator: { bg: '#FF9500', bgPressed: '#CC7700', text: '#FFFFFF' },
  special:  { bg: '#A5A5A5', bgPressed: '#D4D4D4', text: '#1C1C1C' },
};

// Compute responsive button size from screen width
// 4 columns, each column = (screenWidth - 5 gaps * MARGIN) / 4
const { width: SCREEN_W } = Dimensions.get('window');
const BUTTON_MARGIN = 6;
// 4 buttons per row, 5 gaps (left edge, 3 between, right edge)
const BUTTON_SIZE = Math.floor((SCREEN_W - BUTTON_MARGIN * 10) / 4);

export function CalculatorButton({ label, onPress, variant = 'digit', wide = false }: Props) {
  const colors = COLORS[variant];

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }, [onPress]);

  // Font size scales with button size
  const fontSize = wide
    ? BUTTON_SIZE * 0.4
    : label.length > 1
      ? BUTTON_SIZE * 0.36
      : BUTTON_SIZE * 0.44;

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.button,
        {
          width: BUTTON_SIZE,
          height: BUTTON_SIZE,
          borderRadius: BUTTON_SIZE / 2,
          backgroundColor: pressed ? colors.bgPressed : colors.bg,
        },
        wide && {
          width: BUTTON_SIZE * 2 + BUTTON_MARGIN * 2,
          borderRadius: BUTTON_SIZE / 2,
          alignItems: 'flex-start',
          paddingLeft: BUTTON_SIZE * 0.32,
        },
      ]}
    >
      <Text style={[styles.label, { color: colors.text, fontSize }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    justifyContent: 'center',
    alignItems: 'center',
    margin: BUTTON_MARGIN,
  },
  label: {
    fontWeight: '500',
  },
});

export { BUTTON_SIZE, BUTTON_MARGIN };
