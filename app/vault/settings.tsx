/**
 * vault/settings.tsx — Vault settings screen
 *
 * Only accessible from inside the vault. Options:
 * - Change vault PIN
 * - Toggle biometric lock
 * - Toggle auto-delete originals
 * - Exit to calculator
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Switch,
  Pressable,
  Alert,
  ScrollView,
  TextInput,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import { changePin } from '../../src/services/pinService';
import * as Store from '../../src/services/secureStore';
import { useVaultStore } from '../../src/store/vaultStore';
import { getFileCounts } from '../../src/services/vaultStorage';

export default function SettingsTab() {
  const router = useRouter();
  const closeVault = useVaultStore((s) => s.closeVault);
  const isBiometricEnabled = useVaultStore((s) => s.isBiometricEnabled);
  const autoDeleteOriginal = useVaultStore((s) => s.autoDeleteOriginal);
  const setBiometricEnabled = useVaultStore((s) => s.setBiometricEnabled);
  const setAutoDeleteOriginal = useVaultStore((s) => s.setAutoDeleteOriginal);

  const [showPinModal, setShowPinModal] = useState(false);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinStep, setPinStep] = useState<'old' | 'new' | 'confirm'>('old');

  // ── Toggle biometric ──────────────────────────────────────────
  const handleBiometricToggle = useCallback(
    async (value: boolean) => {
      if (value) {
        // Check if biometrics are available
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        if (!hasHardware) {
          Alert.alert('Not Available', 'Your device does not support biometric authentication.');
          return;
        }
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        if (!isEnrolled) {
          Alert.alert('Not Set Up', 'Please set up biometrics in your device settings first.');
          return;
        }
      }

      setBiometricEnabled(value);
      await Store.setBiometricEnabled(value);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [setBiometricEnabled]
  );

  // ── Toggle auto-delete ────────────────────────────────────────
  const handleAutoDeleteToggle = useCallback(
    async (value: boolean) => {
      if (value) {
        Alert.alert(
          'Enable Auto-Delete',
          'When enabled, original files will be removed from your gallery after importing to the vault. This requires gallery permissions.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Enable',
              onPress: async () => {
                setAutoDeleteOriginal(true);
                await Store.setAutoDeleteOriginal(true);
              },
            },
          ]
        );
      } else {
        setAutoDeleteOriginal(false);
        await Store.setAutoDeleteOriginal(false);
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [setAutoDeleteOriginal]
  );

  // ── Change PIN flow ───────────────────────────────────────────
  const handleChangePinStart = useCallback(() => {
    setOldPin('');
    setNewPin('');
    setConfirmPin('');
    setPinStep('old');
    setShowPinModal(true);
  }, []);

  const handlePinSubmit = useCallback(async () => {
    if (pinStep === 'old') {
      if (oldPin.length < 4) {
        Alert.alert('Error', 'PIN must be at least 4 digits.');
        return;
      }
      setPinStep('new');
    } else if (pinStep === 'new') {
      if (newPin.length < 4) {
        Alert.alert('Error', 'New PIN must be at least 4 digits.');
        return;
      }
      setPinStep('confirm');
    } else {
      if (newPin !== confirmPin) {
        Alert.alert('Error', 'New PINs do not match.');
        setConfirmPin('');
        return;
      }

      const success = await changePin(oldPin, newPin);
      if (success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Success', 'Your vault PIN has been changed.');
        setShowPinModal(false);
      } else {
        Alert.alert('Error', 'Current PIN is incorrect.');
        setOldPin('');
        setPinStep('old');
      }
    }
  }, [pinStep, oldPin, newPin, confirmPin]);

  // ── Exit to calculator ────────────────────────────────────────
  const handleExit = useCallback(() => {
    closeVault();
    router.replace('/');
  }, [closeVault, router]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Settings</Text>
        </View>

        {/* Security section */}
        <Text style={styles.sectionTitle}>SECURITY</Text>
        <View style={styles.section}>
          <Pressable style={styles.settingRow} onPress={handleChangePinStart}>
            <Ionicons name="key" size={22} color="#FF9500" style={styles.settingIcon} />
            <Text style={styles.settingLabel}>Change Vault PIN</Text>
            <Ionicons name="chevron-forward" size={18} color="#48484A" />
          </Pressable>

          <View style={styles.divider} />

          <View style={styles.settingRow}>
            <Ionicons name="finger-print" size={22} color="#FF9500" style={styles.settingIcon} />
            <Text style={styles.settingLabel}>Biometric Lock</Text>
            <Switch
              value={isBiometricEnabled}
              onValueChange={handleBiometricToggle}
              trackColor={{ false: '#3A3A3C', true: '#FF9500' }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Privacy section */}
        <Text style={styles.sectionTitle}>PRIVACY</Text>
        <View style={styles.section}>
          <View style={styles.settingRow}>
            <Ionicons name="trash-bin" size={22} color="#FF9500" style={styles.settingIcon} />
            <View style={styles.settingLabelGroup}>
              <Text style={styles.settingLabel}>Auto-Delete Originals</Text>
              <Text style={styles.settingDescription}>
                Remove files from gallery after importing
              </Text>
            </View>
            <Switch
              value={autoDeleteOriginal}
              onValueChange={handleAutoDeleteToggle}
              trackColor={{ false: '#3A3A3C', true: '#FF9500' }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Exit */}
        <Pressable
          style={({ pressed }) => [styles.exitButton, pressed && styles.exitButtonPressed]}
          onPress={handleExit}
        >
          <Ionicons name="calculator" size={20} color="#FF9500" />
          <Text style={styles.exitText}>Return to Calculator</Text>
        </Pressable>

        {/* Version info */}
        <Text style={styles.version}>Calculator v1.0.0</Text>
      </ScrollView>

      {/* Change PIN modal */}
      <Modal
        visible={showPinModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPinModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {pinStep === 'old'
                ? 'Enter Current PIN'
                : pinStep === 'new'
                ? 'Enter New PIN'
                : 'Confirm New PIN'}
            </Text>

            <TextInput
              style={styles.pinInput}
              value={pinStep === 'old' ? oldPin : pinStep === 'new' ? newPin : confirmPin}
              onChangeText={pinStep === 'old' ? setOldPin : pinStep === 'new' ? setNewPin : setConfirmPin}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              autoFocus
              placeholder="4-6 digits"
              placeholderTextColor="#48484A"
            />

            <View style={styles.modalButtons}>
              <Pressable
                style={styles.modalButton}
                onPress={() => setShowPinModal(false)}
              >
                <Text style={[styles.modalButtonText, { color: '#8E8E93' }]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable style={styles.modalButton} onPress={handlePinSubmit}>
                <Text style={[styles.modalButtonText, { color: '#FF9500' }]}>
                  {pinStep === 'confirm' ? 'Save' : 'Next'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    letterSpacing: 0.5,
  },
  section: {
    backgroundColor: '#1C1C1E',
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  settingIcon: {
    marginRight: 14,
  },
  settingLabel: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
  },
  settingLabelGroup: {
    flex: 1,
  },
  settingDescription: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  divider: {
    height: 0.5,
    backgroundColor: '#2C2C2E',
    marginLeft: 52,
  },
  exitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 32,
    paddingVertical: 14,
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    gap: 8,
  },
  exitButtonPressed: {
    backgroundColor: '#2C2C2E',
  },
  exitText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF9500',
  },
  version: {
    textAlign: 'center',
    fontSize: 13,
    color: '#48484A',
    marginTop: 24,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#2C2C2E',
    borderRadius: 16,
    padding: 24,
    width: '80%',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 20,
  },
  pinInput: {
    width: '100%',
    fontSize: 24,
    color: '#FFFFFF',
    textAlign: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#FF9500',
    letterSpacing: 8,
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 16,
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
