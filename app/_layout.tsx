/**
 * _layout.tsx — Root layout for the entire app
 *
 * Uses a Stack navigator with no headers. Handles:
 * - Routing between calculator, onboarding, and vault
 * - Auto-lock: returns to calculator when app goes to background
 *   (EXCEPT when media picker is open — uses pickingMediaCount counter)
 * - Screenshot prevention when vault is open
 * - Loading onboarding/auth state on startup
 */

import { useEffect, useRef } from 'react';
import { AppState, Platform, type AppStateStatus, StatusBar } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as ScreenCapture from 'expo-screen-capture';
import { useVaultStore, isAutoLockSuspendedSync } from '../src/store/vaultStore';
import { useVaultAuth } from '../src/hooks/useVaultAuth';
import { ensureVaultDirs } from '../src/services/vaultStorage';
import { reApplySystemHiding } from '../src/services/vaultAppsService';

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const isVaultOpen = useVaultStore((s) => s.isVaultOpen);
  const closeVault = useVaultStore((s) => s.closeVault);
  const { loadAuthPreferences } = useVaultAuth();
  const appState = useRef(AppState.currentState);

  // ── Load preferences and ensure vault dirs on mount ───────────
  useEffect(() => {
    loadAuthPreferences();
    ensureVaultDirs();
  }, []);

  // ── Auto-lock: return to calculator when app goes to background ──
  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        const prev = appState.current;
        appState.current = nextState;

        if (nextState === 'active') {
          reApplySystemHiding();
        }

        // Synchronously check if auto-lock is currently suspended
        // (e.g., photo picker, document picker, permission dialog, delete confirmation)
        if (isAutoLockSuspendedSync()) {
          return;
        }

        // On Android, "inactive" occurs whenever ANY system dialog (permission request,
        // file chooser, delete confirmation prompt, notification pull-down) appears.
        // Locking on "inactive" on Android causes instant crashes/lockouts!
        // Therefore, on Android we only lock when truly transitioning to "background".
        const isLockTransition =
          Platform.OS === 'ios'
            ? prev === 'active' && (nextState === 'background' || nextState === 'inactive')
            : nextState === 'background';

        if (isLockTransition) {
          // Check synchronous vault state directly from Zustand
          if (useVaultStore.getState().isVaultOpen) {
            closeVault();
            router.replace('/');
          }
        }
      }
    );

    return () => subscription.remove();
  }, [closeVault, router]);

  // ── Screenshot prevention ─────────────────────────────────────
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (isVaultOpen) {
      ScreenCapture.preventScreenCaptureAsync();
    } else {
      ScreenCapture.allowScreenCaptureAsync();
    }
  }, [isVaultOpen]);

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'none', // No animation between calc↔vault (stealth)
          contentStyle: { backgroundColor: '#000000' },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen
          name="vault"
          options={{
            gestureEnabled: false, // Prevent swipe-back revealing vault nav
          }}
        />
      </Stack>
    </>
  );
}
