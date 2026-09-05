/**
 * vault/settings.tsx — Vault settings screen
 *
 * Only accessible from inside the vault. Options:
 * - Change vault PIN
 * - Toggle biometric lock
 * - Toggle auto-delete originals
 * - Exit to calculator
 */

import React, { useState, useCallback, useEffect } from 'react';
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
  AppState,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import { changePin } from '../../src/services/pinService';
import * as Store from '../../src/services/secureStore';
import { useVaultStore } from '../../src/store/vaultStore';
import {
  getFileCounts,
  type VaultFileType,
  hasMediaPermissions,
  requestMediaPermissions,
  hasAllFilesAccess,
  requestAllFilesAccess,
  canInstallUnknownApps,
  requestInstallUnknownApps,
  openAppSystemSettings,
} from '../../src/services/vaultStorage';
import { getHiddenApps } from '../../src/services/vaultAppsService';

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
  const [fileCounts, setFileCounts] = useState<Record<VaultFileType, number>>({ photos: 0, videos: 0, documents: 0, apps: 0 });
  const [hiddenAppsCount, setHiddenAppsCount] = useState(0);

  const [mediaGranted, setMediaGranted] = useState(false);
  const [allFilesGranted, setAllFilesGranted] = useState(false);
  const [installApkGranted, setInstallApkGranted] = useState(false);

  const checkPermissions = useCallback(async () => {
    const mg = await hasMediaPermissions();
    const fg = await hasAllFilesAccess();
    const ig = await canInstallUnknownApps();
    setMediaGranted(mg);
    setAllFilesGranted(fg);
    setInstallApkGranted(ig);
  }, []);

  useEffect(() => {
    getFileCounts().then(setFileCounts);
    getHiddenApps().then((apps) => setHiddenAppsCount(apps.length));
    checkPermissions();
  }, [checkPermissions]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        checkPermissions();
      }
    });
    return () => sub.remove();
  }, [checkPermissions]);

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

  // ── Permissions management handlers ─────────────────────────
  const handleRequestMedia = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const ok = await requestMediaPermissions();
    setMediaGranted(ok);
    if (!ok) {
      Alert.alert(
        'Galereyaga ruxsat',
        'Galereyaga ruxsat berish uchun telefon sozlamalariga o\'tasizmi?',
        [
          { text: 'Bekor', style: 'cancel' },
          { text: 'Sozlamalarni ochish', onPress: () => openAppSystemSettings() },
        ]
      );
    }
  }, []);

  const handleRequestAllFiles = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await requestAllFilesAccess();
    setTimeout(() => {
      checkPermissions();
    }, 1500);
  }, [checkPermissions]);

  const handleRequestInstallApk = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await requestInstallUnknownApps();
    setTimeout(() => {
      checkPermissions();
    }, 1500);
  }, [checkPermissions]);

  const handleOpenAppSettings = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await openAppSystemSettings();
  }, []);

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

        {/* Vault Stats section */}
        <Text style={styles.sectionTitle}>VAULT STORAGE</Text>
        <View style={styles.section}>
          <View style={styles.settingRow}>
            <Ionicons name="images" size={22} color="#FF9500" style={styles.settingIcon} />
            <Text style={styles.settingLabel}>Photos</Text>
            <Text style={styles.settingValue}>{fileCounts.photos} files</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.settingRow}>
            <Ionicons name="videocam" size={22} color="#FF9500" style={styles.settingIcon} />
            <Text style={styles.settingLabel}>Videos</Text>
            <Text style={styles.settingValue}>{fileCounts.videos} files</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.settingRow}>
            <Ionicons name="document-text" size={22} color="#FF9500" style={styles.settingIcon} />
            <Text style={styles.settingLabel}>Documents</Text>
            <Text style={styles.settingValue}>{fileCounts.documents} files</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.settingRow}>
            <Ionicons name="apps" size={22} color="#FF9500" style={styles.settingIcon} />
            <Text style={styles.settingLabel}>Hidden Apps</Text>
            <Text style={styles.settingValue}>{hiddenAppsCount} apps</Text>
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
                Files are always removed from gallery on import
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

        {/* Permissions & System section */}
        <Text style={styles.sectionTitle}>TIZIM RUXSATLARI</Text>
        <View style={styles.section}>
          {/* Gallery Permission */}
          <View style={styles.settingRow}>
            <Ionicons name="images" size={22} color="#FF9500" style={styles.settingIcon} />
            <View style={styles.settingLabelGroup}>
              <Text style={styles.settingLabel}>Galereya ruxsati</Text>
              <Text style={styles.settingDescription}>
                {mediaGranted ? "Rasmlar va videolarga ruxsat berilgan" : "Ruxsat berilmagan"}
              </Text>
            </View>
            {mediaGranted ? (
              <View style={styles.badgeGranted}>
                <Ionicons name="checkmark-circle" size={16} color="#34C759" />
                <Text style={styles.badgeTextGranted}>Berilgan</Text>
              </View>
            ) : (
              <Pressable style={styles.actionBtn} onPress={handleRequestMedia}>
                <Text style={styles.actionBtnText}>Ruxsat berish</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.divider} />

          {/* All Files Access Permission */}
          <View style={styles.settingRow}>
            <Ionicons name="folder-open" size={22} color="#FF9500" style={styles.settingIcon} />
            <View style={styles.settingLabelGroup}>
              <Text style={styles.settingLabel}>Barcha fayllarga ruxsat</Text>
              <Text style={styles.settingDescription}>
                {allFilesGranted ? "Fayllarni to'liq o'chirish faol" : "Android 14 da asl nusxalarni o'chirish"}
              </Text>
            </View>
            {allFilesGranted ? (
              <View style={styles.badgeGranted}>
                <Ionicons name="checkmark-circle" size={16} color="#34C759" />
                <Text style={styles.badgeTextGranted}>Berilgan</Text>
              </View>
            ) : (
              <Pressable style={styles.actionBtn} onPress={handleRequestAllFiles}>
                <Text style={styles.actionBtnText}>Yoqish</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.divider} />

          {/* Unknown Apps Install Permission */}
          <View style={styles.settingRow}>
            <Ionicons name="cube" size={22} color="#FF9500" style={styles.settingIcon} />
            <View style={styles.settingLabelGroup}>
              <Text style={styles.settingLabel}>{"APK o'rnatish ruxsati"}</Text>
              <Text style={styles.settingDescription}>
                {installApkGranted ? "APK larni qayta o'rnatish faol" : "Zaxiralangan ilovalarni o'rnatish"}
              </Text>
            </View>
            {installApkGranted ? (
              <View style={styles.badgeGranted}>
                <Ionicons name="checkmark-circle" size={16} color="#34C759" />
                <Text style={styles.badgeTextGranted}>Berilgan</Text>
              </View>
            ) : (
              <Pressable style={styles.actionBtn} onPress={handleRequestInstallApk}>
                <Text style={styles.actionBtnText}>Yoqish</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.divider} />

          {/* App Info / System Settings */}
          <Pressable style={styles.settingRow} onPress={handleOpenAppSettings}>
            <Ionicons name="settings" size={22} color="#FF9500" style={styles.settingIcon} />
            <View style={styles.settingLabelGroup}>
              <Text style={styles.settingLabel}>Ilova tizim sozlamalari</Text>
              <Text style={styles.settingDescription}>
                Android sozlamalaridan ruxsatlarni boshqarish
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#48484A" />
          </Pressable>
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
  settingValue: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '500',
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
  badgeGranted: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(52, 199, 89, 0.12)',
    borderRadius: 8,
  },
  badgeTextGranted: {
    fontSize: 12,
    fontWeight: '600',
    color: '#34C759',
  },
  actionBtn: {
    backgroundColor: 'rgba(255, 149, 0, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FF9500',
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF9500',
  },
});
