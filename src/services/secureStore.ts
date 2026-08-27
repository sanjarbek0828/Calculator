/**
 * secureStore.ts — Thin wrapper around expo-secure-store
 *
 * Centralises all key names and provides typed getters/setters
 * backed by the platform keychain / Android Keystore.
 */

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// ── Key constants (never expose these outside this module) ──────────
const KEYS = {
  PIN_HASH: 'vault_pin_hash',
  BIOMETRIC_ENABLED: 'vault_biometric_enabled',
  AUTO_DELETE_ORIGINAL: 'vault_auto_delete_original',
  ONBOARDED: 'vault_onboarded',
  FAILED_ATTEMPTS: 'vault_failed_attempts',
  LOCKOUT_UNTIL: 'vault_lockout_until',
} as const;

// ── Generic helpers ─────────────────────────────────────────────────

async function getString(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

async function setString(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {}
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function deleteKey(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      window.localStorage.removeItem(key);
    } catch (e) {}
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

// ── PIN ─────────────────────────────────────────────────────────────

export async function getPinHash(): Promise<string | null> {
  return getString(KEYS.PIN_HASH);
}

export async function setPinHash(hash: string): Promise<void> {
  await setString(KEYS.PIN_HASH, hash);
}

export async function deletePinHash(): Promise<void> {
  await deleteKey(KEYS.PIN_HASH);
}

// ── Onboarding flag ─────────────────────────────────────────────────

export async function getOnboarded(): Promise<boolean> {
  const v = await getString(KEYS.ONBOARDED);
  return v === 'true';
}

export async function setOnboarded(value: boolean): Promise<void> {
  await setString(KEYS.ONBOARDED, value ? 'true' : 'false');
}

// ── Biometric toggle ────────────────────────────────────────────────

export async function getBiometricEnabled(): Promise<boolean> {
  const v = await getString(KEYS.BIOMETRIC_ENABLED);
  return v === 'true';
}

export async function setBiometricEnabled(value: boolean): Promise<void> {
  await setString(KEYS.BIOMETRIC_ENABLED, value ? 'true' : 'false');
}

// ── Auto-delete originals toggle ────────────────────────────────────

export async function getAutoDeleteOriginal(): Promise<boolean> {
  const v = await getString(KEYS.AUTO_DELETE_ORIGINAL);
  return v === 'true';
}

export async function setAutoDeleteOriginal(value: boolean): Promise<void> {
  await setString(KEYS.AUTO_DELETE_ORIGINAL, value ? 'true' : 'false');
}

// ── Failed attempt tracking ─────────────────────────────────────────

export async function getFailedAttempts(): Promise<number> {
  const v = await getString(KEYS.FAILED_ATTEMPTS);
  return v ? parseInt(v, 10) : 0;
}

export async function setFailedAttempts(count: number): Promise<void> {
  await setString(KEYS.FAILED_ATTEMPTS, count.toString());
}

export async function getLockoutUntil(): Promise<number | null> {
  const v = await getString(KEYS.LOCKOUT_UNTIL);
  return v ? parseInt(v, 10) : null;
}

export async function setLockoutUntil(timestamp: number | null): Promise<void> {
  if (timestamp === null) {
    await deleteKey(KEYS.LOCKOUT_UNTIL);
  } else {
    await setString(KEYS.LOCKOUT_UNTIL, timestamp.toString());
  }
}
