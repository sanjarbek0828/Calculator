/**
 * pinService.ts — PIN hashing, verification, and rate-limiting
 *
 * The PIN is never stored in plain text. It is hashed with SHA-256
 * via expo-crypto, and the hash is stored in expo-secure-store
 * (backed by the platform keychain / Android Keystore).
 *
 * Rate limiting: after 5 consecutive wrong vault-entry attempts,
 * a 30-second cooldown is enforced silently (the calculator just
 * shows normal results during the lockout).
 */

import * as Crypto from 'expo-crypto';
import * as Store from './secureStore';

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30_000; // 30 seconds

/**
 * Hash a raw PIN string using SHA-256.
 * Returns the hex-encoded digest.
 */
export async function hashPin(pin: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    pin,
    { encoding: Crypto.CryptoEncoding.HEX }
  );
}

/**
 * Store a new PIN (hashes it first, then persists the hash).
 */
export async function storePin(pin: string): Promise<void> {
  const hash = await hashPin(pin);
  await Store.setPinHash(hash);
  // Reset any existing failed-attempt state
  await Store.setFailedAttempts(0);
  await Store.setLockoutUntil(null);
}

/**
 * Check whether a PIN has already been configured.
 */
export async function isPinConfigured(): Promise<boolean> {
  const hash = await Store.getPinHash();
  return hash !== null && hash.length > 0;
}

/**
 * Verify a raw PIN against the stored hash.
 *
 * This function also enforces rate limiting:
 * - If currently locked out → returns false silently.
 * - On failure → increments the counter; after MAX_ATTEMPTS
 *   consecutive failures, sets a 30s lockout.
 * - On success → resets the counter.
 *
 * Returns `true` only if the PIN matches AND we're not locked out.
 */
export async function verifyPin(input: string): Promise<boolean> {
  // ── Check lockout ─────────────────────────────────────────────
  const lockoutUntil = await Store.getLockoutUntil();
  if (lockoutUntil !== null) {
    if (Date.now() < lockoutUntil) {
      // Still locked out — silently reject
      return false;
    }
    // Lockout expired — clear it
    await Store.setLockoutUntil(null);
    await Store.setFailedAttempts(0);
  }

  // ── Hash the input and compare ────────────────────────────────
  const storedHash = await Store.getPinHash();
  if (!storedHash) return false;

  const inputHash = await hashPin(input);
  const matches = inputHash === storedHash;

  if (matches) {
    // Success — reset counter
    await Store.setFailedAttempts(0);
    await Store.setLockoutUntil(null);
    return true;
  }

  // ── Failed attempt ────────────────────────────────────────────
  const attempts = (await Store.getFailedAttempts()) + 1;
  await Store.setFailedAttempts(attempts);

  if (attempts >= MAX_ATTEMPTS) {
    // Engage lockout
    await Store.setLockoutUntil(Date.now() + LOCKOUT_DURATION_MS);
  }

  return false;
}

/**
 * Change the vault PIN (requires the old PIN for verification).
 */
export async function changePin(
  oldPin: string,
  newPin: string
): Promise<boolean> {
  const valid = await verifyPin(oldPin);
  if (!valid) return false;

  await storePin(newPin);
  return true;
}
