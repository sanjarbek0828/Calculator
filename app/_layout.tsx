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
import { useVaultStore } from '../src/store/vaultStore';
import { useVaultAuth } from '../src/hooks/useVaultAuth';
import { ensureVaultDirs } from '../src/services/vaultStorage';

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

  // Use a ref for isPickingMedia so the AppState callback always sees
  // the latest value without needing to re-subscribe the listener.
  const isPickingMediaRef = useRef(false);

  // Subscribe to pickingMediaCount changes and keep ref in sync
  const pickingMediaCount = useVaultStore((s) => s.pickingMediaCount);
  useEffect(() => {
    isPickingMediaRef.current = pickingMediaCount > 0;
  }, [pickingMediaCount]);

  // Keep isVaultOpen in a ref too, so the AppState handler always
  // sees the latest value without re-registering the listener.
  const isVaultOpenRef = useRef(isVaultOpen);
  useEffect(() => {
    isVaultOpenRef.current = isVaultOpen;
  }, [isVaultOpen]);

  // ── Auto-lock: return to calculator when app goes to background ──
  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        const prev = appState.current;
        appState.current = nextState;

        // Only lock when transitioning FROM active TO background/inactive
        if (
          prev === 'active' &&
          (nextState === 'background' || nextState === 'inactive')
        ) {
          // CRITICAL: Do NOT lock if user is picking media from gallery.
          // On iOS, opening the system photo picker causes the app to go
          // "inactive" briefly. On Android, it may go to "background".
          // The pickingMediaCount counter tracks this safely.
          if (isPickingMediaRef.current) {
            return;
          }

          // Vault is open and we're going to background — lock it
          if (isVaultOpenRef.current) {
            closeVault();
            router.replace('/');
          }
        }
      }
    );

    return () => subscription.remove();
    // Only depend on stable references — closeVault and router
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
