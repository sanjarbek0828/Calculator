/**
 * index.tsx — CalculatorScreen (v2 — fully responsive)
 *
 * Uses flex layout instead of fixed margins so it adapts to any screen size.
 * Button grid fills the available space perfectly.
 */

import React, { useEffect, useCallback } from 'react';
import { View, StyleSheet, SafeAreaView, StatusBar } from 'react-native';
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
        router.replace('/onboarding');
      } else {
        setOnboarded(true);
      }
    })();
  }, []);

  const handleVaultUnlocked = useCallback(() => {
    openVault();
    router.push('/vault/photos');
  }, [openVault, router]);

  const calc = useCalculator(handleVaultUnlocked);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      {/* Display fills all available space above buttons */}
      <View style={styles.displayArea}>
        <CalculatorDisplay display={calc.display} expression={calc.expression} />
      </View>

      {/* Button grid — uses flex so it never overflows */}
      <View style={styles.buttonGrid}>
        <View style={styles.row}>
          <CalculatorButton label={calc.showAC ? 'AC' : 'C'} onPress={calc.showAC ? calc.allClear : calc.clear} variant="special" />
          <CalculatorButton label="±" onPress={calc.toggleSign} variant="special" />
          <CalculatorButton label="%" onPress={calc.percent} variant="special" />
          <CalculatorButton label="÷" onPress={() => calc.selectOperation('÷')} variant="operator" />
        </View>
        <View style={styles.row}>
          <CalculatorButton label="7" onPress={() => calc.inputDigit('7')} />
          <CalculatorButton label="8" onPress={() => calc.inputDigit('8')} />
          <CalculatorButton label="9" onPress={() => calc.inputDigit('9')} />
          <CalculatorButton label="×" onPress={() => calc.selectOperation('×')} variant="operator" />
        </View>
        <View style={styles.row}>
          <CalculatorButton label="4" onPress={() => calc.inputDigit('4')} />
          <CalculatorButton label="5" onPress={() => calc.inputDigit('5')} />
          <CalculatorButton label="6" onPress={() => calc.inputDigit('6')} />
          <CalculatorButton label="-" onPress={() => calc.selectOperation('-')} variant="operator" />
        </View>
        <View style={styles.row}>
          <CalculatorButton label="1" onPress={() => calc.inputDigit('1')} />
          <CalculatorButton label="2" onPress={() => calc.inputDigit('2')} />
          <CalculatorButton label="3" onPress={() => calc.inputDigit('3')} />
          <CalculatorButton label="+" onPress={() => calc.selectOperation('+')} variant="operator" />
        </View>
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
    paddingBottom: 12,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
