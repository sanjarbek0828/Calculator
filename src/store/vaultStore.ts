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

  /**
   * Timestamp (ms) until which auto-lock should be completely suspended.
   * Prevents premature locking during system dialogs (e.g. Android permissions,
   * delete confirmation prompts, file pickers).
   */
  autoLockSuspendedUntil: number;

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
  /** Suspend auto-lock for a given duration in milliseconds (default: 60s) */
  suspendAutoLock: (durationMs?: number) => void;
  /** Resume auto-lock immediately */
  resumeAutoLock: () => void;
}

export const useVaultStore = create<VaultState>((set, get) => ({
  isVaultOpen: false,
  isOnboarded: false,
  isBiometricEnabled: false,
  autoDeleteOriginal: true, // Default to always delete from gallery
  pickingMediaCount: 0,
  isPickingMedia: false,
  autoLockSuspendedUntil: 0,

  openVault: () => set({ isVaultOpen: true }),
  closeVault: () => set({ isVaultOpen: false, pickingMediaCount: 0, isPickingMedia: false, autoLockSuspendedUntil: 0 }),
  setOnboarded: (value) => set({ isOnboarded: value }),
  setBiometricEnabled: (value) => set({ isBiometricEnabled: value }),
  setAutoDeleteOriginal: (value) => set({ autoDeleteOriginal: value }),

  setPickingMedia: (value) =>
    set((state) => {
      if (value) {
        const count = state.pickingMediaCount + 1;
        return {
          pickingMediaCount: count,
          isPickingMedia: true,
          autoLockSuspendedUntil: Math.max(state.autoLockSuspendedUntil, Date.now() + 60000),
        };
      } else {
        const count = Math.max(0, state.pickingMediaCount - 1);
        return { pickingMediaCount: count, isPickingMedia: count > 0 };
      }
    }),

  incrementPickingMedia: () =>
    set((state) => {
      const count = state.pickingMediaCount + 1;
      return {
        pickingMediaCount: count,
        isPickingMedia: true,
        autoLockSuspendedUntil: Math.max(state.autoLockSuspendedUntil, Date.now() + 60000),
      };
    }),

  decrementPickingMedia: () =>
    set((state) => {
      const count = Math.max(0, state.pickingMediaCount - 1);
      return {
        pickingMediaCount: count,
        isPickingMedia: count > 0,
        // Keep a 2-second grace period after decrement so quick transitions don't lock
        autoLockSuspendedUntil: count === 0 ? Date.now() + 2000 : state.autoLockSuspendedUntil,
      };
    }),

  suspendAutoLock: (durationMs = 60000) =>
    set((state) => ({
      autoLockSuspendedUntil: Math.max(state.autoLockSuspendedUntil, Date.now() + durationMs),
      isPickingMedia: true,
      pickingMediaCount: Math.max(state.pickingMediaCount, 1),
    })),

  resumeAutoLock: () =>
    set({
      autoLockSuspendedUntil: 0,
      isPickingMedia: false,
      pickingMediaCount: 0,
    }),
}));

/**
 * Synchronously checks if auto-lock is currently suspended.
 * Safe to call directly inside AppState callbacks without React render delays.
 */
export function isAutoLockSuspendedSync(): boolean {
  const state = useVaultStore.getState();
  if (state.pickingMediaCount > 0 || state.isPickingMedia) return true;
  if (Date.now() < state.autoLockSuspendedUntil) return true;
  return false;
}

