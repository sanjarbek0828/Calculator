/**
 * index.tsx — CalculatorScreen (the main, always-visible screen)
 *
 * A fully functional calculator that looks and behaves exactly like
 * a standard iOS calculator. No vault references, icons, or hints.
 *
 * Secretly, when the user types their vault PIN and presses "=",
 * it navigates to the hidden vault screen.
 */

import React, { useEffect, useCallback } from 'react';
import { View, StyleSheet, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { CalculatorDisplay } from '../src/components/CalculatorDisplay';
import { CalculatorButton } from '../src/components/CalculatorButton';
import { useCalculator } from '../src/hooks/useCalculator';
import { useVaultStore } from '../src/store/vaultStore';
import { isPinConfigured } from '../src/services/pinService';
import { getOnboarded } from '../src/services/secureStore';

export default function CalculatorScreen() {
  const router = useRouter();
  const openVault = useVaultStore((s) => s.openVault);
  const setOnboarded = useVaultStore((s) => s.setOnboarded);

  // Check onboarding status on mount
  useEffect(() => {
    (async () => {
      const onboarded = await getOnboarded();
      const pinExists = await isPinConfigured();

      if (!onboarded || !pinExists) {
        // First launch — show onboarding
        router.replace('/onboarding');
      } else {
        setOnboarded(true);
      }
    })();
  }, []);

  // Callback when vault PIN is entered correctly
  const handleVaultUnlocked = useCallback(() => {
    openVault();
    router.push('/vault');
  }, [openVault, router]);

  const calc = useCalculator(handleVaultUnlocked);

  return (
    <SafeAreaView style={styles.container}>
      {/* Display area */}
      <View style={styles.displayArea}>
        <CalculatorDisplay display={calc.display} expression={calc.expression} />
      </View>

      {/* Button grid */}
      <View style={styles.buttonGrid}>
        {/* Row 1: AC/C | ± | % | ÷ */}
        <View style={styles.row}>
          <CalculatorButton
            label={calc.showAC ? 'AC' : 'C'}
            onPress={calc.showAC ? calc.allClear : calc.clear}
            variant="special"
          />
          <CalculatorButton label="±" onPress={calc.toggleSign} variant="special" />
          <CalculatorButton label="%" onPress={calc.percent} variant="special" />
          <CalculatorButton
            label="÷"
            onPress={() => calc.selectOperation('÷')}
            variant="operator"
          />
        </View>

        {/* Row 2: 7 | 8 | 9 | × */}
        <View style={styles.row}>
          <CalculatorButton label="7" onPress={() => calc.inputDigit('7')} />
          <CalculatorButton label="8" onPress={() => calc.inputDigit('8')} />
          <CalculatorButton label="9" onPress={() => calc.inputDigit('9')} />
          <CalculatorButton
            label="×"
            onPress={() => calc.selectOperation('×')}
            variant="operator"
          />
        </View>

        {/* Row 3: 4 | 5 | 6 | - */}
        <View style={styles.row}>
          <CalculatorButton label="4" onPress={() => calc.inputDigit('4')} />
          <CalculatorButton label="5" onPress={() => calc.inputDigit('5')} />
          <CalculatorButton label="6" onPress={() => calc.inputDigit('6')} />
          <CalculatorButton
            label="-"
            onPress={() => calc.selectOperation('-')}
            variant="operator"
          />
        </View>

        {/* Row 4: 1 | 2 | 3 | + */}
        <View style={styles.row}>
          <CalculatorButton label="1" onPress={() => calc.inputDigit('1')} />
          <CalculatorButton label="2" onPress={() => calc.inputDigit('2')} />
          <CalculatorButton label="3" onPress={() => calc.inputDigit('3')} />
          <CalculatorButton
            label="+"
            onPress={() => calc.selectOperation('+')}
            variant="operator"
          />
        </View>

        {/* Row 5: 0 (wide) | . | = */}
        <View style={styles.row}>
          <CalculatorButton label="0" onPress={() => calc.inputDigit('0')} wide />
          <CalculatorButton label="." onPress={calc.inputDecimal} />
          <CalculatorButton label="=" onPress={calc.pressEquals} variant="operator" />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  displayArea: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  buttonGrid: {
    paddingBottom: 20,
    paddingHorizontal: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
});
