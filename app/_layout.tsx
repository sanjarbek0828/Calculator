/**
 * _layout.tsx — Root layout for the entire app
 *
 * Uses a Stack navigator with no headers. Handles:
 * - Routing between calculator, onboarding, and vault
 * - Auto-lock: returns to calculator when app goes to background
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

  // ── Auto-lock: return to calculator when app goes to background ──
  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (
          appState.current === 'active' &&
          (nextState === 'background' || nextState === 'inactive')
        ) {
          // App is going to background — close vault and go to calculator
          if (isVaultOpen) {
            closeVault();
            router.replace('/');
          }
        }
        appState.current = nextState;
      }
    );

    return () => subscription.remove();
  }, [isVaultOpen, closeVault, router]);

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
