/**
 * onboarding.tsx — First-launch PIN setup
 *
 * Appears only on first launch. Asks the user to set a 4-6 digit
 * vault PIN, then confirm it. The PIN is hashed and stored securely.
 *
 * Styled to look like a generic "calculator first-time setup" screen
 * so that anyone glancing at the phone won't suspect a vault.
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Pressable,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { storePin } from '../src/services/pinService';
import { setOnboarded } from '../src/services/secureStore';
import { useVaultStore } from '../src/store/vaultStore';

type Step = 'create' | 'confirm';

export default function OnboardingScreen() {
  const router = useRouter();
  const setOnboardedState = useVaultStore((s) => s.setOnboarded);

  const [step, setStep] = useState<Step>('create');
  const [pin, setPin] = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [error, setError] = useState('');
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const maxDigits = 6;
  const minDigits = 4;

  // ── Shake animation for errors ────────────────────────────────
  const shake = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 15, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -15, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  // ── Digit input ─────────────────────────────────────────────────
  const inputDigit = useCallback(
    (digit: string) => {
      if (pin.length >= maxDigits) return;
      setError('');
      setPin((prev) => prev + digit);
    },
    [pin]
  );

  // ── Backspace ──────────────────────────────────────────────────
  const backspace = useCallback(() => {
    setPin((prev) => prev.slice(0, -1));
    setError('');
  }, []);

  // ── Submit ─────────────────────────────────────────────────────
  const submit = useCallback(async () => {
    if (pin.length < minDigits) {
      setError(`PIN must be at least ${minDigits} digits`);
      shake();
      return;
    }

    if (step === 'create') {
      // Move to confirmation
      setFirstPin(pin);
      setPin('');
      setStep('confirm');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      // Confirm step
      if (pin !== firstPin) {
        setError('PINs do not match. Try again.');
        setPin('');
        shake();
        return;
      }

      // PINs match — hash and store
      await storePin(pin);
      await setOnboarded(true);
      setOnboardedState(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/');
    }
  }, [pin, step, firstPin, shake, router, setOnboardedState]);

  const title = step === 'create' ? 'Set Your PIN' : 'Confirm Your PIN';
  const subtitle =
    step === 'create'
      ? 'Enter a 4-6 digit PIN'
      : 'Re-enter your PIN to confirm';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      {/* PIN dots */}
      <Animated.View
        style={[styles.dotsContainer, { transform: [{ translateX: shakeAnim }] }]}
      >
        {Array.from({ length: maxDigits }, (_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i < pin.length && styles.dotFilled,
              i >= minDigits && i >= pin.length && styles.dotOptional,
            ]}
          />
        ))}
      </Animated.View>

      {/* Error message */}
      {error ? <Text style={styles.error}>{error}</Text> : <View style={styles.errorSpacer} />}

      {/* Number pad */}
      <View style={styles.pad}>
        {[
          ['1', '2', '3'],
          ['4', '5', '6'],
          ['7', '8', '9'],
          ['', '0', '⌫'],
        ].map((row, rowIdx) => (
          <View key={rowIdx} style={styles.padRow}>
            {row.map((key) => (
              <Pressable
                key={key || 'empty'}
                onPress={() => {
                  if (key === '⌫') backspace();
                  else if (key) inputDigit(key);
                }}
                disabled={!key}
                style={({ pressed }) => [
                  styles.padKey,
                  pressed && key ? styles.padKeyPressed : null,
                  !key && styles.padKeyEmpty,
                ]}
              >
                <Text style={[styles.padKeyText, !key && { color: 'transparent' }]}>
                  {key || '·'}
                </Text>
              </Pressable>
            ))}
          </View>
        ))}
      </View>

      {/* Submit button */}
      <Pressable
        onPress={submit}
        disabled={pin.length < minDigits}
        style={({ pressed }) => [
          styles.submitButton,
          pin.length < minDigits && styles.submitDisabled,
          pressed && pin.length >= minDigits && styles.submitPressed,
        ]}
      >
        <Text style={styles.submitText}>
          {step === 'create' ? 'Next' : 'Done'}
        </Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#8E8E93',
    fontWeight: '400',
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#48484A',
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: '#FF9500',
    borderColor: '#FF9500',
  },
  dotOptional: {
    borderColor: '#2C2C2E',
  },
  error: {
    color: '#FF453A',
    fontSize: 14,
    height: 20,
    marginBottom: 16,
  },
  errorSpacer: {
    height: 20,
    marginBottom: 16,
  },
  pad: {
    marginBottom: 24,
  },
  padRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  padKey: {
    width: 75,
    height: 75,
    borderRadius: 37.5,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 6,
    backgroundColor: '#1C1C1E',
  },
  padKeyPressed: {
    backgroundColor: '#3A3A3C',
  },
  padKeyEmpty: {
    backgroundColor: 'transparent',
  },
  padKeyText: {
    fontSize: 28,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  submitButton: {
    backgroundColor: '#FF9500',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
    minWidth: 200,
    alignItems: 'center',
  },
  submitDisabled: {
    backgroundColor: '#3A3A3C',
  },
  submitPressed: {
    backgroundColor: '#CC7700',
  },
  submitText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
