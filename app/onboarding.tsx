/**
 * onboarding.tsx — First-launch PIN setup & Automated Permission Request
 *
 * Appears only on first launch.
 * 1. Automatically requests necessary storage & media permissions on entry.
 * 2. Asks user to set 4-6 digit vault PIN.
 * 3. Confirms PIN and checks All Files Access (MANAGE_EXTERNAL_STORAGE) for Android 14.
 * 4. Ensures uploaded photos/videos can be deleted from gallery seamlessly.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Pressable,
  Animated,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { storePin } from '../src/services/pinService';
import { setOnboarded } from '../src/services/secureStore';
import { useVaultStore } from '../src/store/vaultStore';
import {
  requestInitialPermissions,
  hasAllFilesAccess,
  requestAllFilesAccess,
} from '../src/services/vaultStorage';

type Step = 'create' | 'confirm' | 'permissions';

export default function OnboardingScreen() {
  const router = useRouter();
  const setOnboardedState = useVaultStore((s) => s.setOnboarded);

  const [step, setStep] = useState<Step>('create');
  const [pin, setPin] = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [error, setError] = useState('');
  const [allFilesGranted, setAllFilesGranted] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const maxDigits = 6;
  const minDigits = 4;

  // ── Automatically request media permissions on initial entry ──
  useEffect(() => {
    (async () => {
      useVaultStore.getState().startMediaPick();
      try {
        const res = await requestInitialPermissions();
        setAllFilesGranted(res.allFilesGranted);
      } finally {
        useVaultStore.getState().endMediaPick(5000);
      }
    })();
  }, []);

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

  // ── Finish onboarding ──────────────────────────────────────────
  const finishOnboarding = useCallback(async () => {
    await setOnboarded(true);
    setOnboardedState(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/');
  }, [router, setOnboardedState]);

  // ── Submit PIN ─────────────────────────────────────────────────
  const submit = useCallback(async () => {
    if (pin.length < minDigits) {
      setError(`PIN kamida ${minDigits} xonali bo'lishi kerak`);
      shake();
      return;
    }

    if (step === 'create') {
      setFirstPin(pin);
      setPin('');
      setStep('confirm');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else if (step === 'confirm') {
      if (pin !== firstPin) {
        setError('PIN mos kelmadi. Qaytadan urinib ko\'ring.');
        setPin('');
        shake();
        return;
      }

      // PINs match — hash and store
      await storePin(pin);

      // Check if All Files Access is granted on Android 11+ / Android 14
      if (Platform.OS === 'android') {
        const hasAccess = await hasAllFilesAccess();
        setAllFilesGranted(hasAccess);
        if (!hasAccess) {
          setStep('permissions');
          return;
        }
      }

      await finishOnboarding();
    }
  }, [pin, step, firstPin, shake, finishOnboarding]);

  // ── Request All Files Permission in Permissions step ───────────
  const handleRequestAllFiles = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    useVaultStore.getState().startMediaPick();
    try {
      await requestAllFilesAccess();

      // Check again after user returns
      setTimeout(async () => {
        const has = await hasAllFilesAccess();
        setAllFilesGranted(has);
      }, 1500);
    } finally {
      useVaultStore.getState().endMediaPick(5000);
    }
  }, []);

  // ── Render Permissions Step ────────────────────────────────────
  if (step === 'permissions') {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.permIconWrapper}>
            <Ionicons name="shield-checkmark" size={64} color="#FF9500" />
          </View>

          <Text style={styles.permTitle}>Kerakli Ruxsatlar</Text>
          <Text style={styles.permSub}>
            {"Calculatorga yuklangan rasm va videolar telefondan to'liq o'chishi va faqat ilova ichida qolishi uchun quyidagi ruxsat talab qilinadi."}
          </Text>

          {/* Feature highlights */}
          <View style={styles.permCard}>
            <View style={styles.permRow}>
              <Ionicons name="images-outline" size={24} color="#FF9500" style={styles.permRowIcon} />
              <View style={styles.permRowText}>
                <Text style={styles.permRowTitle}>Galereya ruxsati</Text>
                <Text style={styles.permRowDesc}>Rasmlar va videolarni tanlash uchun</Text>
              </View>
              <Ionicons name="checkmark-circle" size={24} color="#34C759" />
            </View>

            <View style={styles.divider} />

            <View style={styles.permRow}>
              <Ionicons name="folder-open-outline" size={24} color="#FF9500" style={styles.permRowIcon} />
              <View style={styles.permRowText}>
                <Text style={styles.permRowTitle}>Barcha fayllarga ruxsat (Android 14)</Text>
                <Text style={styles.permRowDesc}>
                  {"Yuklangan asl fayllarni galereyadan avtomatik o'chirish uchun zarur"}
                </Text>
              </View>
              {allFilesGranted ? (
                <Ionicons name="checkmark-circle" size={24} color="#34C759" />
              ) : (
                <Pressable style={styles.grantBtn} onPress={handleRequestAllFiles}>
                  <Text style={styles.grantBtnText}>Yoqish</Text>
                </Pressable>
              )}
            </View>
          </View>

          {!allFilesGranted && (
            <Pressable style={styles.fullGrantBtn} onPress={handleRequestAllFiles}>
              <Ionicons name="lock-open-outline" size={20} color="#000000" style={{ marginRight: 8 }} />
              <Text style={styles.fullGrantBtnText}>Barcha fayllarga ruxsat berish</Text>
            </Pressable>
          )}

          <Pressable style={styles.continueBtn} onPress={finishOnboarding}>
            <Text style={styles.continueBtnText}>
              {allFilesGranted ? 'Kalkulyatorni boshlash' : 'Davom etish'}
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Render PIN Setup Step ──────────────────────────────────────
  const title = step === 'create' ? 'PIN Kod O\'rnatish' : 'PIN Kodni Tasdiqlang';
  const subtitle =
    step === 'create'
      ? 'Kalkulyator uchun 4-6 xonali maxfiy PIN kiriting'
      : 'Tasdiqlash uchun PIN kodni qayta kiriting';

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
          {step === 'create' ? 'Keyingisi' : 'Tayyor'}
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
  scrollContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#8E8E93',
    fontWeight: '400',
    textAlign: 'center',
    paddingHorizontal: 16,
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
    textAlign: 'center',
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
    borderRadius: 14,
    minWidth: 220,
    alignItems: 'center',
  },
  submitDisabled: {
    backgroundColor: '#2C2C2E',
  },
  submitPressed: {
    backgroundColor: '#CC7700',
  },
  submitText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // ── Permissions step styles ──
  permIconWrapper: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 149, 0, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 149, 0, 0.3)',
  },
  permTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 10,
    textAlign: 'center',
  },
  permSub: {
    fontSize: 14,
    color: '#A0A0A5',
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  permCard: {
    width: '100%',
    backgroundColor: '#161618',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    marginBottom: 20,
  },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  permRowIcon: {
    marginRight: 14,
  },
  permRowText: {
    flex: 1,
    marginRight: 10,
  },
  permRowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 3,
  },
  permRowDesc: {
    fontSize: 12,
    color: '#8E8E93',
    lineHeight: 16,
  },
  divider: {
    height: 1,
    backgroundColor: '#2C2C2E',
    marginVertical: 12,
  },
  grantBtn: {
    backgroundColor: 'rgba(255, 149, 0, 0.2)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FF9500',
  },
  grantBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FF9500',
  },
  fullGrantBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF9500',
    width: '100%',
    paddingVertical: 16,
    borderRadius: 14,
    marginBottom: 12,
  },
  fullGrantBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
  },
  continueBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2C2C2E',
    width: '100%',
    paddingVertical: 15,
    borderRadius: 14,
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
