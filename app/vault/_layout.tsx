/**
 * vault/_layout.tsx — Tab navigator for the vault
 *
 * Bottom tabs: Photos | Videos | Documents | Apps | Settings
 * Dark theme, custom icons. Never visible from outside the app.
 * Back button returns to calculator with no confirmation.
 *
 * GestureHandlerRootView wraps the entire vault so that
 * pinch-to-zoom and other gestures work correctly in photos/videos.
 */

import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useVaultStore } from '../../src/store/vaultStore';
import { useEffect } from 'react';
import { BackHandler } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function VaultLayout() {
  const router = useRouter();
  const closeVault = useVaultStore((s) => s.closeVault);

  // Handle Android hardware back button — go to calculator
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      closeVault();
      router.replace('/');
      return true; // Prevent default back behavior
    });
    return () => handler.remove();
  }, [closeVault, router]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#FF9500',
          tabBarInactiveTintColor: '#48484A',
          tabBarStyle: {
            backgroundColor: '#0f0f17',
            borderTopColor: 'rgba(255,255,255,0.06)',
            borderTopWidth: 0.5,
            paddingBottom: 4,
            paddingTop: 4,
            height: 58,
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '600',
          },
        }}
      >
        <Tabs.Screen
          name="photos"
          options={{
            title: 'Photos',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="images" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="videos"
          options={{
            title: 'Videos',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="videocam" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="documents"
          options={{
            title: 'Docs',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="document-text" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="apps"
          options={{
            title: 'Apps',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="apps" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="settings-sharp" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
    </GestureHandlerRootView>
  );
}

