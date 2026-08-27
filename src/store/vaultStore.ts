/**
 * vaultStore.ts — Global state management via Zustand
 *
 * Tracks vault open/close status, onboarding state, and user
 * preferences. This store is the single source of truth for
 * whether the vault UI should be visible.
 */

import { create } from 'zustand';

interface VaultState {
  /** Whether the vault screen is currently open */
  isVaultOpen: boolean;
  /** Whether the user has completed onboarding (PIN setup) */
  isOnboarded: boolean;
  /** Whether biometric auth is enabled as an extra layer */
  isBiometricEnabled: boolean;
  /** Whether to auto-delete originals after importing to vault */
  autoDeleteOriginal: boolean;

  // ── Actions ─────────────────────────────────────────────────────
  openVault: () => void;
  closeVault: () => void;
  setOnboarded: (value: boolean) => void;
  setBiometricEnabled: (value: boolean) => void;
  setAutoDeleteOriginal: (value: boolean) => void;
}

export const useVaultStore = create<VaultState>((set) => ({
  isVaultOpen: false,
  isOnboarded: false,
  isBiometricEnabled: false,
  autoDeleteOriginal: false,

  openVault: () => set({ isVaultOpen: true }),
  closeVault: () => set({ isVaultOpen: false }),
  setOnboarded: (value) => set({ isOnboarded: value }),
  setBiometricEnabled: (value) => set({ isBiometricEnabled: value }),
  setAutoDeleteOriginal: (value) => set({ autoDeleteOriginal: value }),
}));
