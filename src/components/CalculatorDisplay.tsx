/**
 * CalculatorDisplay.tsx — Premium calculator screen display (v3)
 *
 * - Bold main number with auto-scaling font
 * - Subtle expression chain above
 * - Separator line for visual depth
 * - Gradient-ready container
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  display: string;
  expression: string;
}

export function CalculatorDisplay({ display, expression }: Props) {
  // Auto-scale font size based on display length
  const fontSize = useMemo(() => {
    const len = display.length;
    if (len <= 6)  return 82;
    if (len <= 9)  return 64;
    if (len <= 12) return 48;
    if (len <= 15) return 36;
    return 28;
  }, [display]);

  // Format number with commas
  const formattedDisplay = useMemo(() => {
    if (display === 'Error') return display;
    if (display.includes('e') || display.endsWith('.')) return display;

    const parts = display.split('.');
    const intPart = parts[0];
    const isNegative = intPart.startsWith('-');
    const absInt = isNegative ? intPart.slice(1) : intPart;
    const formatted = absInt.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const result = isNegative ? `-${formatted}` : formatted;

    return parts.length > 1 ? `${result}.${parts[1]}` : result;
  }, [display]);

  return (
    <View style={styles.container}>
      {/* Thin accent line */}
      <View style={styles.accentLine} />

      {/* Expression line */}
      <Text style={styles.expression} numberOfLines={1} adjustsFontSizeToFit>
        {expression || ' '}
      </Text>

      {/* Main display number */}
      <Text
        style={[styles.display, { fontSize }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.3}
      >
        {formattedDisplay}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 24,
    paddingBottom: 16,
    paddingTop: 12,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    minHeight: 160,
  },
  accentLine: {
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: 16,
    borderRadius: 1,
  },
  expression: {
    fontSize: 22,
    color: 'rgba(255,149,0,0.65)',
    fontWeight: '400',
    letterSpacing: 0.3,
    marginBottom: 6,
    textAlign: 'right',
    width: '100%',
  },
  display: {
    color: '#FFFFFF',
    fontWeight: '300',
    textAlign: 'right',
    width: '100%',
    letterSpacing: -1,
  },
});

