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
  /**
   * Counter tracking how many media pickers are currently open.
   * When > 0, AppState changes to "inactive" will NOT close the vault.
   * Using a counter instead of boolean handles edge cases where
   * multiple pickers could be active simultaneously.
   */
  pickingMediaCount: number;

  // ── Computed helper ──────────────────────────────────────────────
  /** True if any media picker is currently open */
  isPickingMedia: boolean;

  // ── Actions ─────────────────────────────────────────────────────
  openVault: () => void;
  closeVault: () => void;
  setOnboarded: (value: boolean) => void;
  setBiometricEnabled: (value: boolean) => void;
  setAutoDeleteOriginal: (value: boolean) => void;
  /** Legacy setter — kept for compatibility, wraps counter internally */
  setPickingMedia: (value: boolean) => void;
  /** Increment the picking media counter */
  incrementPickingMedia: () => void;
  /** Decrement the picking media counter */
  decrementPickingMedia: () => void;
}

export const useVaultStore = create<VaultState>((set) => ({
  isVaultOpen: false,
  isOnboarded: false,
  isBiometricEnabled: false,
  autoDeleteOriginal: true, // Default to always delete from gallery
  pickingMediaCount: 0,
  isPickingMedia: false,

  openVault: () => set({ isVaultOpen: true }),
  closeVault: () => set({ isVaultOpen: false }),
  setOnboarded: (value) => set({ isOnboarded: value }),
  setBiometricEnabled: (value) => set({ isBiometricEnabled: value }),
  setAutoDeleteOriginal: (value) => set({ autoDeleteOriginal: value }),

  setPickingMedia: (value) =>
    set((state) => {
      if (value) {
        const count = state.pickingMediaCount + 1;
        return { pickingMediaCount: count, isPickingMedia: count > 0 };
      } else {
        const count = Math.max(0, state.pickingMediaCount - 1);
        return { pickingMediaCount: count, isPickingMedia: count > 0 };
      }
    }),

  incrementPickingMedia: () =>
    set((state) => {
      const count = state.pickingMediaCount + 1;
      return { pickingMediaCount: count, isPickingMedia: true };
    }),

  decrementPickingMedia: () =>
    set((state) => {
      const count = Math.max(0, state.pickingMediaCount - 1);
      return { pickingMediaCount: count, isPickingMedia: count > 0 };
    }),
}));
