/**
 * vault/_layout.tsx — Tab navigator for the vault
 *
 * Bottom tabs: Photos | Videos | Documents | Settings
 * Dark theme, custom icons. Never visible from outside the app.
 * Back button returns to calculator with no confirmation.
 */

import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useVaultStore } from '../../src/store/vaultStore';
import { useEffect } from 'react';
import { BackHandler } from 'react-native';

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
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#FF9500',
        tabBarInactiveTintColor: '#8E8E93',
        tabBarStyle: {
          backgroundColor: '#1C1C1E',
          borderTopColor: '#2C2C2E',
          borderTopWidth: 0.5,
          paddingBottom: 4,
          paddingTop: 4,
          height: 56,
        },
        tabBarLabelStyle: {
          fontSize: 11,
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
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-sharp" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
