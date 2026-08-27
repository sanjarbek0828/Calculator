/**
 * CalculatorDisplay.tsx — The calculator screen display area
 *
 * Shows the expression chain (small, gray) and the current result
 * (large, white). Auto-shrinks font size for long numbers.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  /** The current number or result being displayed */
  display: string;
  /** The expression chain shown above (e.g. "12 + 3 =") */
  expression: string;
}

export function CalculatorDisplay({ display, expression }: Props) {
  // Auto-scale font size based on display length
  const fontSize = useMemo(() => {
    const len = display.length;
    if (len <= 6) return 72;
    if (len <= 9) return 56;
    if (len <= 12) return 42;
    if (len <= 15) return 34;
    return 26;
  }, [display]);

  // Format number with commas for readability (only for integers/simple decimals)
  const formattedDisplay = useMemo(() => {
    if (display === 'Error') return display;

    // Don't format if it contains 'e' (scientific notation) or ends with '.'
    if (display.includes('e') || display.endsWith('.')) return display;

    const parts = display.split('.');
    const intPart = parts[0];

    // Add thousands separators
    const isNegative = intPart.startsWith('-');
    const absInt = isNegative ? intPart.slice(1) : intPart;
    const formatted = absInt.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const result = isNegative ? `-${formatted}` : formatted;

    return parts.length > 1 ? `${result}.${parts[1]}` : result;
  }, [display]);

  return (
    <View style={styles.container}>
      {/* Expression line */}
      <Text style={styles.expression} numberOfLines={1} adjustsFontSizeToFit>
        {expression}
      </Text>

      {/* Main display */}
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
    paddingHorizontal: 20,
    paddingBottom: 12,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    minHeight: 140,
  },
  expression: {
    fontSize: 24,
    color: '#8E8E93',
    fontWeight: '400',
    marginBottom: 4,
    textAlign: 'right',
    width: '100%',
  },
  display: {
    color: '#FFFFFF',
    fontWeight: '300',
    textAlign: 'right',
    width: '100%',
  },
});
