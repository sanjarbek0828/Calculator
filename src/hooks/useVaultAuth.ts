/**
 * useVaultAuth.ts — Hook for vault authentication logic
 *
 * Combines PIN verification with optional biometric authentication.
 * Used by the calculator's "=" button and the vault settings screen.
 */

import { useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as PinService from '../services/pinService';
import { useVaultStore } from '../store/vaultStore';
import * as Store from '../services/secureStore';

export function useVaultAuth() {
  const isBiometricEnabled = useVaultStore((s) => s.isBiometricEnabled);

  /**
   * Attempt to authenticate with a PIN value.
   * Returns true if the vault should be opened.
   *
   * This runs silently — no alerts, no visible feedback.
   * The caller (calculator) decides what to do based on the result.
   */
  const attemptPinEntry = useCallback(
    async (pinCandidate: string): Promise<boolean> => {
      // Only check PINs that are 4-6 digits (our PIN format)
      if (!/^\d{4,6}$/.test(pinCandidate)) {
        return false;
      }

      const pinValid = await PinService.verifyPin(pinCandidate);
      if (!pinValid) return false;

      // PIN is correct — now check biometric if enabled
      if (isBiometricEnabled) {
        const biometricOk = await checkBiometric();
        return biometricOk;
      }

      return true;
    },
    [isBiometricEnabled]
  );

  /**
   * Trigger biometric authentication prompt.
   */
  const checkBiometric = useCallback(async (): Promise<boolean> => {
    try {
      const hasHardware =
        await LocalAuthentication.hasHardwareAsync();
      if (!hasHardware) return true; // Skip if no hardware

      const isEnrolled =
        await LocalAuthentication.isEnrolledAsync();
      if (!isEnrolled) return true; // Skip if no biometrics enrolled

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Verify identity',
        fallbackLabel: 'Use PIN',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });

      return result.success;
    } catch {
      return false;
    }
  }, []);

  /**
   * Load saved auth preferences from secure store.
   */
  const loadAuthPreferences = useCallback(async () => {
    const biometric = await Store.getBiometricEnabled();
    const autoDelete = await Store.getAutoDeleteOriginal();
    const onboarded = await Store.getOnboarded();

    useVaultStore.getState().setBiometricEnabled(biometric);
    useVaultStore.getState().setAutoDeleteOriginal(autoDelete);
    useVaultStore.getState().setOnboarded(onboarded);
  }, []);

  return {
    attemptPinEntry,
    checkBiometric,
    loadAuthPreferences,
  };
}
