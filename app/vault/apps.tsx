/**
 * vault/apps.tsx — Apps & Games Vault Tab (v5 - Ultimate App Hider)
 *
 * Professional App Hider & Vault for Android:
 * - Scans all installed apps on device (Play Store & System apps)
 * - Multi-select to hide any number of apps inside Calculator Vault
 * - 1-tap System Hide: removes app icon from Android launcher & search
 *   (via Device Policy Manager dpm.setApplicationHidden, Root/Shell, or OEM deep-link)
 * - 1-tap direct launch from inside Calculator
 * - OEM Launcher direct shortcuts (Samsung, Xiaomi, Oppo, Vivo, OnePlus)
 * - APK extraction to vault & safe uninstall from phone
 * - Haptic feedback & modern dark aesthetic
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Pressable,
  Text,
  Alert,
  Modal,
  Image,
  SafeAreaView,
  ActivityIndicator,
  TextInput,
  ScrollView,
  StatusBar,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as DocumentPicker from 'expo-document-picker';
import {
  getInstalledApps,
  getHiddenApps,
  addAppsToVault,
  removeAppFromVault,
  launchApp,
  openAppInfo,
  checkIsDeviceOwner,
  hideAppFromSystem,
  unhideAppFromSystem,
  openOemHideSettings,
  backupAppApkAndUninstall,
  getDeviceOwnerCommand,
  getDeviceManufacturer,
  installVaultApk,
  openXiaomiSecurityCenter,
  openXiaomiHiddenApps,
  type AppInfo,
  type VaultApp,
} from '../../src/services/vaultAppsService';
import { importFile, listFiles, deleteFile, type VaultFile } from '../../src/services/vaultStorage';
import { useVaultStore } from '../../src/store/vaultStore';

type AppTabMode = 'apps' | 'files';
type FilterCategory = 'all' | 'user' | 'system';

export default function AppsTab() {
  const [tabMode, setTabMode] = useState<AppTabMode>('apps');
  const [hiddenApps, setHiddenApps] = useState<VaultApp[]>([]);
  const [installedApps, setInstalledApps] = useState<AppInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDeviceOwner, setIsDeviceOwner] = useState(false);
  const [deviceManufacturer, setDeviceManufacturer] = useState('Android');
  const [deviceOwnerCommand, setDeviceOwnerCommand] = useState('');

  // Add App Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalSearch, setModalSearch] = useState('');
  const [modalFilter, setModalFilter] = useState<FilterCategory>('all');
  const [selectedPackages, setSelectedPackages] = useState<Set<string>>(new Set());

  // Hide Assistant Modal state
  const [showAssistantModal, setShowAssistantModal] = useState(false);
  const [selectedTargetApp, setSelectedTargetApp] = useState<VaultApp | null>(null);

  // APK files state
  const [apkFiles, setApkFiles] = useState<VaultFile[]>([]);

  // ── Load data on mount ─────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [apps, files, isDO, manufacturer, adbCmd] = await Promise.all([
        getHiddenApps(),
        listFiles('apps'),
        checkIsDeviceOwner(),
        getDeviceManufacturer(),
        getDeviceOwnerCommand(),
      ]);
      setHiddenApps(apps);
      setApkFiles(files);
      setIsDeviceOwner(isDO);
      setDeviceManufacturer(manufacturer);
      setDeviceOwnerCommand(adbCmd);
    } catch (e) {
      console.warn('Failed to load apps data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Open Add Apps Modal ────────────────────────────────────────
  const handleOpenAddModal = useCallback(async () => {
    setShowAddModal(true);
    setSelectedPackages(new Set());
    setScanning(true);
    try {
      const apps = await getInstalledApps();
      setInstalledApps(apps);
    } catch (err) {
      console.warn('Scan apps error:', err);
    } finally {
      setScanning(false);
    }
  }, []);

  // ── Toggle app selection in Add Modal ──────────────────────────
  const toggleSelectPackage = useCallback((pkg: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPackages((prev) => {
      const next = new Set(prev);
      if (next.has(pkg)) next.delete(pkg);
      else next.add(pkg);
      return next;
    });
  }, []);

  // ── Select / Deselect All in Add Modal ─────────────────────────
  const toggleSelectAll = useCallback(
    (availableApps: AppInfo[]) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const hiddenSet = new Set(hiddenApps.map((a) => a.packageName));
      const selectable = availableApps.filter((a) => !hiddenSet.has(a.packageName));

      if (selectedPackages.size === selectable.length && selectable.length > 0) {
        setSelectedPackages(new Set());
      } else {
        setSelectedPackages(new Set(selectable.map((a) => a.packageName)));
      }
    },
    [hiddenApps, selectedPackages.size]
  );

  // ── Confirm adding apps to Vault ───────────────────────────────
  const handleConfirmAddApps = useCallback(async () => {
    if (selectedPackages.size === 0) return;

    const toAdd = installedApps.filter((a) => selectedPackages.has(a.packageName));
    await addAppsToVault(toAdd);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowAddModal(false);
    await loadData();

    if (toAdd.length > 0) {
      const first = toAdd[0] as VaultApp;
      setSelectedTargetApp(first);
      Alert.alert(
        'Ilovalar Calculatorga joylandi!',
        `${toAdd.length} ta ilova Calculator ichiga saqlandi. Endi ularni telefonning asosiy menyusi va qidiruvidan ham yo'qotishni xohlaysizmi?`,
        [
          { text: 'Keyinroq', style: 'cancel' },
          {
            text: "Qidiruvdan yashirish",
            onPress: () => setShowAssistantModal(true),
          },
        ]
      );
    }
  }, [selectedPackages, installedApps, loadData]);

  // ── Install APK from Vault (Reinstall or direct install) ───────
  const handleInstallVaultApk = useCallback(
    async (apkPath: string, appName?: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      useVaultStore.getState().startMediaPick();
      try {
        const ok = await installVaultApk(apkPath);
        if (!ok) {
          Alert.alert(
            'O\'rnatish xatoligi',
            'APK faylini o\'rnatuvchi oynasini ochib bo\'lmadi. Sozlamalardan Calculator ilovasi uchun "Noma\'lum ilovalarni o\'rnatish" ruxsatini yoqing.'
          );
        } else {
          // Refresh installed status shortly after user returns from package installer
          setTimeout(() => {
            loadData();
          }, 4000);
        }
      } finally {
        useVaultStore.getState().endMediaPick(5000);
      }
    },
    [loadData]
  );

  // ── Launch an app ──────────────────────────────────────────────
  const handleLaunchApp = useCallback(
    async (app: VaultApp) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // If app is uninstalled from phone
      if (app.isInstalled === false) {
        if (app.apkPath) {
          Alert.alert(
            `${app.appName} o'chirilgan`,
            `"${app.appName}" telefondan o'chirilgan, lekin uning APK fayli Calculator ichida xavfsiz zaxiralangan.\n\nIlovani qayta o'rnatishni xohlaysizmi?`,
            [
              { text: 'Bekor', style: 'cancel' },
              {
                text: "🚀 Qayta o'rnatish",
                onPress: () => handleInstallVaultApk(app.apkPath!, app.appName),
              },
            ]
          );
        } else {
          Alert.alert(
            app.appName,
            "Bu ilova telefonda o'rnatilmagan yoki o'chirib tashlangan.",
            [{ text: 'Tushundim' }]
          );
        }
        return;
      }

      const ok = await launchApp(app.packageName);
      if (!ok) {
        Alert.alert(
          app.appName,
          `Ilovani to'g'ridan-to'g'ri ochib bo'lmadi.\nPaket: ${app.packageName}`,
          [
            { text: 'Bekor', style: 'cancel' },
            {
              text: 'Ilova sozlamalarini ochish',
              onPress: () => openAppInfo(app.packageName),
            },
          ]
        );
      }
    },
    [handleInstallVaultApk]
  );

  // ── Toggle System Hide (Remove from Launcher & Search) ─────────
  const handleToggleSystemHide = useCallback(
    async (app: VaultApp) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      if (app.isSystemHidden) {
        // Unhide
        const ok = await unhideAppFromSystem(app.packageName);
        if (ok) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert(app.appName, 'Ilova qayta ko\'rsatildi.');
        }
        await loadData();
        return;
      }

      // Try system hide
      const result = await hideAppFromSystem(app.packageName);
      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          'Muvaffaqiyatli!',
          `"${app.appName}" ilovasi telefon menyusi va qidiruvidan butunlay yashirildi! Faqat Calculator ichidan ochishingiz mumkin.`
        );
        await loadData();
      } else {
        // Open assistant modal with tailored options
        setSelectedTargetApp(app);
        setShowAssistantModal(true);
      }
    },
    [loadData]
  );

  // ── Extract APK & Uninstall original ───────────────────────────
  const handleBackupAndUninstall = useCallback(
    async (app: VaultApp) => {
      Alert.alert(
        'APK zaxiralash va Aslini o\'chirish',
        `"${app.appName}" ilovasining APK fayli Calculator ichida xavfsiz saqlanadi, so'ngra u telefondan o'chiriladi. Shunda ilova telefon qidiruvida 100% yo'qoladi.\n\nDavom etilsinmi?`,
        [
          { text: 'Bekor', style: 'cancel' },
          {
            text: 'Ha, o\'chirish',
            style: 'destructive',
            onPress: async () => {
              useVaultStore.getState().startMediaPick();
              try {
                await backupAppApkAndUninstall(app.packageName, app.appName);
                setShowAssistantModal(false);
                await loadData();
              } finally {
                useVaultStore.getState().endMediaPick(5000);
              }
            },
          },
        ]
      );
    },
    [loadData]
  );

  // ── Remove app from Vault ──────────────────────────────────────
  const handleRemoveApp = useCallback(
    (app: VaultApp) => {
      Alert.alert(
        'Kalkulyatordan chiqarish',
        `"${app.appName}" ilovasi Calculator maxfiy ro'yxatidan chiqarilsinmi?`,
        [
          { text: 'Bekor', style: 'cancel' },
          {
            text: 'Chiqarish',
            style: 'destructive',
            onPress: async () => {
              await removeAppFromVault(app.packageName);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              loadData();
            },
          },
        ]
      );
    },
    [loadData]
  );

  // ── Show App Options Sheet ─────────────────────────────────────
  const handleAppOptions = useCallback(
    (app: VaultApp) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const options: { text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }[] = [];

      if (app.isInstalled === false && app.apkPath) {
        options.push({
          text: "🚀 Qayta o'rnatish (Install APK)",
          onPress: () => handleInstallVaultApk(app.apkPath!, app.appName),
        });
      } else {
        options.push({
          text: '▶ Ishga tushirish (Ochish)',
          onPress: () => handleLaunchApp(app),
        });
      }

      options.push({
        text: app.isSystemHidden ? '👁️ Qayta ko\'rsatish' : '🛡️ Qidiruv va Menyudan yashirish',
        onPress: () => handleToggleSystemHide(app),
      });

      if (app.isInstalled !== false) {
        options.push({
          text: '📦 APK zaxiralab, telefondan o\'chirish',
          onPress: () => handleBackupAndUninstall(app),
        });
      } else if (app.apkPath) {
        options.push({
          text: '📦 Zaxiralangan APK ni o\'rnatish',
          onPress: () => handleInstallVaultApk(app.apkPath!, app.appName),
        });
      }

      options.push({
        text: '⚙️ Ilova tizim sozlamalari (App Info)',
        onPress: () => {
          useVaultStore.getState().startMediaPick();
          openAppInfo(app.packageName);
          useVaultStore.getState().endMediaPick(5000);
        },
      });

      options.push({
        text: '🗑️ Kalkulyatordan chiqarish',
        style: 'destructive',
        onPress: () => handleRemoveApp(app),
      });

      options.push({ text: 'Bekor', style: 'cancel' });

      Alert.alert(app.appName, `Paket: ${app.packageName}`, options);
    },
    [handleLaunchApp, handleInstallVaultApk, handleToggleSystemHide, handleBackupAndUninstall, handleRemoveApp]
  );

  // ── Import APK / App Document ──────────────────────────────────
  const handleImportApk = useCallback(async () => {
    try {
      useVaultStore.getState().startMediaPick();

      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) return;

      setLoading(true);
      for (const asset of result.assets) {
        await importFile(
          asset.uri,
          'apps',
          asset.name || `app_${Date.now()}`,
          asset.mimeType || 'application/octet-stream',
          false
        );
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await loadData();
    } catch {
      Alert.alert('Xatolik', 'Faylni import qilib bo\'lmadi.');
    } finally {
      useVaultStore.getState().endMediaPick(5000);
      setLoading(false);
    }
  }, [loadData]);

  // ── Filtered hidden apps for display ───────────────────────────
  const filteredHiddenApps = useMemo(() => {
    if (!searchQuery.trim()) return hiddenApps;
    const q = searchQuery.toLowerCase().trim();
    return hiddenApps.filter(
      (a) =>
        a.appName.toLowerCase().includes(q) ||
        a.packageName.toLowerCase().includes(q)
    );
  }, [hiddenApps, searchQuery]);

  // ── Filtered installed apps for Add Modal ──────────────────────
  const filteredInstalledApps = useMemo(() => {
    let list = installedApps;
    if (modalFilter === 'user') {
      list = list.filter((a) => !a.isSystemApp);
    } else if (modalFilter === 'system') {
      list = list.filter((a) => a.isSystemApp);
    }

    if (modalSearch.trim()) {
      const q = modalSearch.toLowerCase().trim();
      list = list.filter(
        (a) =>
          a.appName.toLowerCase().includes(q) ||
          a.packageName.toLowerCase().includes(q)
      );
    }
    return list;
  }, [installedApps, modalFilter, modalSearch]);

  const hiddenPackageSet = useMemo(
    () => new Set(hiddenApps.map((a) => a.packageName)),
    [hiddenApps]
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a14" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Yashirin Ilovalar</Text>
          <Text style={styles.headerMeta}>
            {hiddenApps.length} ta ilova · Calculator himoyasida
          </Text>
        </View>

        <View style={styles.headerActions}>
          <Pressable
            style={styles.addAppTopBtn}
            onPress={handleOpenAddModal}
          >
            <Ionicons name="add" size={18} color="#000" />
            <Text style={styles.addAppTopBtnText}>Ilova yashirish</Text>
          </Pressable>
        </View>
      </View>

      {/* System Status Banner */}
      <View style={styles.statusBanner}>
        <Ionicons
          name={isDeviceOwner ? 'shield-checkmark' : 'shield-outline'}
          size={18}
          color={isDeviceOwner ? '#30D158' : '#FF9500'}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.statusBannerTitle}>
            {isDeviceOwner
              ? 'Tizim darajasidagi himoya faol'
              : 'Qidiruvdan yashirish yordamchisi tayyor'}
          </Text>
          <Text style={styles.statusBannerSub}>
            {isDeviceOwner
              ? 'Ilovalar launcher va qidiruvdan 100% yashiriladi'
              : `${deviceManufacturer} tizimida ilovalarni menyudan yo'qotish mumkin`}
          </Text>
        </View>
        {!isDeviceOwner && (
          <Pressable
            style={styles.statusBannerBtn}
            onPress={() => {
              setSelectedTargetApp(hiddenApps[0] || null);
              setShowAssistantModal(true);
            }}
          >
            <Text style={styles.statusBannerBtnText}>Sozlash</Text>
          </Pressable>
        )}
      </View>

      {/* Tab Switcher: Hidden Apps vs Backup APKs */}
      <View style={styles.tabSwitcher}>
        <Pressable
          style={[styles.tabBtn, tabMode === 'apps' && styles.tabBtnActive]}
          onPress={() => setTabMode('apps')}
        >
          <Ionicons
            name="apps"
            size={16}
            color={tabMode === 'apps' ? '#FF9500' : '#8E8E93'}
          />
          <Text
            style={[
              styles.tabBtnText,
              tabMode === 'apps' && styles.tabBtnTextActive,
            ]}
          >
            Ilovalar ({hiddenApps.length})
          </Text>
        </Pressable>

        <Pressable
          style={[styles.tabBtn, tabMode === 'files' && styles.tabBtnActive]}
          onPress={() => setTabMode('files')}
        >
          <Ionicons
            name="logo-android"
            size={16}
            color={tabMode === 'files' ? '#3ddc84' : '#8E8E93'}
          />
          <Text
            style={[
              styles.tabBtnText,
              tabMode === 'files' && { color: '#3ddc84', fontWeight: '700' },
            ]}
          >
            APK Fayllar ({apkFiles.length})
          </Text>
        </Pressable>
      </View>

      {/* Search bar for apps */}
      {tabMode === 'apps' && hiddenApps.length > 0 && (
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#8E8E93" />
          <TextInput
            style={styles.searchInput}
            placeholder="Yashirilgan ilovani qidirish..."
            placeholderTextColor="#636366"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color="#8E8E93" />
            </Pressable>
          )}
        </View>
      )}

      {/* Content */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FF9500" />
        </View>
      ) : tabMode === 'apps' ? (
        filteredHiddenApps.length === 0 ? (
          <View style={styles.center}>
            <View style={styles.emptyIconWrapper}>
              <Ionicons name="apps" size={56} color="#FF9500" />
            </View>
            <Text style={styles.emptyTitle}>
              {hiddenApps.length === 0
                ? 'Hozircha yashirin ilovalar yo\'q'
                : 'Qidiruv bo\'yicha topilmadi'}
            </Text>
            <Text style={styles.emptySubtext}>
              {"Telefoningizdagi istalgan ilovani tanlang va uni Calculator ichiga yashirib, telefon menyusi va qidiruvidan yo'qoting."}
            </Text>
            <Pressable
              style={styles.emptyAddBtn}
              onPress={handleOpenAddModal}
            >
              <Ionicons name="add-circle" size={20} color="#000" />
              <Text style={styles.emptyAddBtnText}>Ilova tanlash va yashirish</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={filteredHiddenApps}
            keyExtractor={(item) => item.packageName}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [
                  styles.appCard,
                  pressed && styles.appCardPressed,
                ]}
                onPress={() => handleLaunchApp(item)}
                onLongPress={() => handleAppOptions(item)}
              >
                {/* App Icon */}
                <View style={styles.appIconWrapper}>
                  {item.icon ? (
                    <Image source={{ uri: item.icon }} style={styles.appIconImage} />
                  ) : (
                    <View style={styles.appIconFallback}>
                      <Text style={styles.appIconFallbackText}>
                        {item.appName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>

                {/* App Details */}
                <View style={styles.appDetails}>
                  <Text style={styles.appNameText} numberOfLines={1}>
                    {item.appName}
                  </Text>
                  <Text style={styles.appPackageText} numberOfLines={1}>
                    {item.packageName}
                  </Text>
                  <View style={styles.badgeRow}>
                    {item.isInstalled === false ? (
                      <View style={styles.uninstalledBadge}>
                        <Ionicons name="alert-circle" size={10} color="#FF9F0A" />
                        <Text style={styles.uninstalledBadgeText}>{"Telefonda o'chirilgan"}</Text>
                      </View>
                    ) : item.isSystemHidden ? (
                      <View style={styles.systemHiddenBadge}>
                        <Ionicons name="shield-checkmark" size={10} color="#30D158" />
                        <Text style={styles.systemHiddenBadgeText}>Qidiruvda chiqmaydi</Text>
                      </View>
                    ) : (
                      <View style={styles.shieldBadge}>
                        <Ionicons name="lock-closed" size={10} color="#FF9500" />
                        <Text style={styles.shieldBadgeText}>Calculatorda saqlangan</Text>
                      </View>
                    )}
                    {item.apkPath && (
                      <View style={styles.apkSavedBadge}>
                        <Text style={styles.apkSavedBadgeText}>APK Zaxira</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Launch & Options Buttons */}
                <View style={styles.appRightActions}>
                  {item.isInstalled === false && item.apkPath ? (
                    <Pressable
                      style={styles.reinstallBtn}
                      onPress={() => handleInstallVaultApk(item.apkPath!, item.appName)}
                    >
                      <Ionicons name="download" size={14} color="#000" />
                      <Text style={styles.reinstallBtnText}>{"O'rnatish"}</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      style={styles.launchBtn}
                      onPress={() => handleLaunchApp(item)}
                    >
                      <Ionicons name="play" size={14} color="#FFF" />
                      <Text style={styles.launchBtnText}>Ochish</Text>
                    </Pressable>
                  )}

                  <Pressable
                    style={styles.moreBtn}
                    onPress={() => handleAppOptions(item)}
                  >
                    <Ionicons name="ellipsis-vertical" size={18} color="#8E8E93" />
                  </Pressable>
                </View>
              </Pressable>
            )}
            contentContainerStyle={styles.listContainer}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )
      ) : (
        /* APK Files Tab */
        <FlatList
          data={apkFiles}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.apkCard}>
              <Ionicons name="logo-android" size={32} color="#3ddc84" />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.appNameText} numberOfLines={1}>
                  {item.originalName}
                </Text>
                <Text style={styles.appPackageText}>
                  {(item.sizeBytes / (1024 * 1024)).toFixed(1)} MB
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Pressable
                  style={styles.installApkBtn}
                  onPress={() => handleInstallVaultApk(item.uri, item.originalName)}
                >
                  <Ionicons name="download" size={14} color="#000" />
                  <Text style={styles.installApkBtnText}>{"O'rnatish"}</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    Alert.alert('O\'chirish', 'APK xotiradan o\'chirilsinmi?', [
                      { text: 'Bekor', style: 'cancel' },
                      {
                        text: 'O\'chirish',
                        style: 'destructive',
                        onPress: async () => {
                          await deleteFile('apps', item.id);
                          loadData();
                        },
                      },
                    ]);
                  }}
                  style={{ padding: 6 }}
                >
                  <Ionicons name="trash-outline" size={20} color="#FF453A" />
                </Pressable>
              </View>
            </View>
          )}
          ListEmptyComponent={() => (
            <View style={styles.center}>
              <Ionicons name="logo-android" size={56} color="#3ddc84" />
              <Text style={styles.emptyTitle}>Hech qanday APK yuklanmagan</Text>
              <Pressable style={styles.emptyAddBtn} onPress={handleImportApk}>
                <Ionicons name="add-circle" size={20} color="#000" />
                <Text style={styles.emptyAddBtnText}>APK yuklash</Text>
              </Pressable>
            </View>
          )}
          contentContainerStyle={styles.listContainer}
        />
      )}

      {/* Floating Action Button */}
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={tabMode === 'apps' ? handleOpenAddModal : handleImportApk}
      >
        <Ionicons name="add" size={28} color="#000" />
      </Pressable>

      {/* ── MODAL: O'rnatilgan Ilovalarni Tanlash va Yashirish ── */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <StatusBar barStyle="light-content" backgroundColor="#12121E" />

          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <Pressable
              onPress={() => setShowAddModal(false)}
              style={styles.modalCloseBtn}
            >
              <Ionicons name="close" size={24} color="#FFF" />
            </Pressable>
            <View style={{ alignItems: 'center' }}>
              <Text style={styles.modalTitle}>Ilovalarni Tanlash</Text>
              <Text style={styles.modalSubtitle}>
                {selectedPackages.size > 0
                  ? `${selectedPackages.size} ta ilova belgilandi`
                  : 'Yashirish uchun belgilang'}
              </Text>
            </View>
            <Pressable
              onPress={() => toggleSelectAll(filteredInstalledApps)}
              style={styles.modalCloseBtn}
            >
              <Text style={styles.modalSelectAllText}>
                {selectedPackages.size === filteredInstalledApps.filter(a => !hiddenPackageSet.has(a.packageName)).length && selectedPackages.size > 0
                  ? 'Bekor'
                  : 'Barchasi'}
              </Text>
            </Pressable>
          </View>

          {/* Modal Search */}
          <View style={styles.modalSearchBar}>
            <Ionicons name="search" size={18} color="#8E8E93" />
            <TextInput
              style={styles.searchInput}
              placeholder="Ilova nomi yoki paketini qidirish..."
              placeholderTextColor="#636366"
              value={modalSearch}
              onChangeText={setModalSearch}
            />
            {modalSearch.length > 0 && (
              <Pressable onPress={() => setModalSearch('')}>
                <Ionicons name="close-circle" size={18} color="#8E8E93" />
              </Pressable>
            )}
          </View>

          {/* Filter Chips */}
          <View style={styles.filterChipsRow}>
            <Pressable
              style={[
                styles.chip,
                modalFilter === 'all' && styles.chipActive,
              ]}
              onPress={() => setModalFilter('all')}
            >
              <Text
                style={[
                  styles.chipText,
                  modalFilter === 'all' && styles.chipTextActive,
                ]}
              >
                Barchasi ({installedApps.length})
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.chip,
                modalFilter === 'user' && styles.chipActive,
              ]}
              onPress={() => setModalFilter('user')}
            >
              <Text
                style={[
                  styles.chipText,
                  modalFilter === 'user' && styles.chipTextActive,
                ]}
              >
                Play Market ({installedApps.filter((a) => !a.isSystemApp).length})
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.chip,
                modalFilter === 'system' && styles.chipActive,
              ]}
              onPress={() => setModalFilter('system')}
            >
              <Text
                style={[
                  styles.chipText,
                  modalFilter === 'system' && styles.chipTextActive,
                ]}
              >
                Tizim ({installedApps.filter((a) => a.isSystemApp).length})
              </Text>
            </Pressable>
          </View>

          {/* Installed Apps List */}
          {scanning ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#FF9500" />
              <Text style={styles.loadingText}>Ilovalar aniqlanmoqda...</Text>
            </View>
          ) : (
            <FlatList
              data={filteredInstalledApps}
              keyExtractor={(item) => item.packageName}
              renderItem={({ item }) => {
                const isAlreadyHidden = hiddenPackageSet.has(item.packageName);
                const isSelected = selectedPackages.has(item.packageName);

                return (
                  <Pressable
                    style={[
                      styles.installItem,
                      isSelected && styles.installItemSelected,
                      isAlreadyHidden && styles.installItemDisabled,
                    ]}
                    onPress={() => {
                      if (!isAlreadyHidden) {
                        toggleSelectPackage(item.packageName);
                      }
                    }}
                  >
                    {/* App Icon */}
                    <View style={styles.appIconWrapper}>
                      {item.icon ? (
                        <Image source={{ uri: item.icon }} style={styles.appIconImage} />
                      ) : (
                        <View style={styles.appIconFallback}>
                          <Text style={styles.appIconFallbackText}>
                            {item.appName.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* App Info */}
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.appNameText} numberOfLines={1}>
                        {item.appName}
                      </Text>
                      <Text style={styles.appPackageText} numberOfLines={1}>
                        {item.packageName}
                      </Text>
                      {isAlreadyHidden ? (
                        <Text style={styles.alreadyHiddenText}>
                          ✓ Allaqachon Calculator ichida
                        </Text>
                      ) : (
                        item.isSystemApp && (
                          <Text style={styles.systemAppText}>Tizim ilovasi</Text>
                        )
                      )}
                    </View>

                    {/* Checkbox */}
                    <View
                      style={[
                        styles.checkbox,
                        isSelected && styles.checkboxActive,
                        isAlreadyHidden && styles.checkboxDisabled,
                      ]}
                    >
                      {isSelected && (
                        <Ionicons name="checkmark" size={16} color="#000" />
                      )}
                    </View>
                  </Pressable>
                );
              }}
              contentContainerStyle={{ paddingBottom: 90 }}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          )}

          {/* Bottom Confirm Button */}
          <View style={styles.modalBottomBar}>
            <Pressable
              style={[
                styles.confirmHideBtn,
                selectedPackages.size === 0 && styles.confirmHideBtnDisabled,
              ]}
              onPress={handleConfirmAddApps}
              disabled={selectedPackages.size === 0}
            >
              <Ionicons name="lock-closed" size={18} color="#000" />
              <Text style={styles.confirmHideBtnText}>
                Tanlanganlarni Calculatorga yashirish ({selectedPackages.size})
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>

      {/* ── MODAL: Qidiruv va Menyudan Yashirish Yordamchisi (Hide Center) ── */}
      <Modal
        visible={showAssistantModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAssistantModal(false)}
      >
        <View style={styles.guideOverlay}>
          <View style={styles.guideContent}>
            <View style={styles.guideHeader}>
              <View style={styles.guideIconBox}>
                <Ionicons name="eye-off" size={28} color="#FF9500" />
              </View>
              <Text style={styles.guideTitle}>Qidiruv va Menyudan Yashirish</Text>
              <Text style={styles.guideSubtitle}>
                {selectedTargetApp ? `"${selectedTargetApp.appName}"` : 'Tanlangan ilova'} {"telefon qidiruvida va menyusida ko'rinmasligi uchun 3 ta qulay yo'l:"}
              </Text>
            </View>

            <ScrollView style={styles.guideBody}>
              {/* Method 0: If app is uninstalled but has backup APK: 1-Tap Reinstall */}
              {selectedTargetApp && selectedTargetApp.isInstalled === false && selectedTargetApp.apkPath && (
                <View style={[styles.guideCard, { borderColor: '#3ddc84', borderWidth: 1.5 }]}>
                  <View style={styles.guideCardHeader}>
                    <View style={[styles.methodBadge, { backgroundColor: '#3ddc84' }]}>
                      <Text style={[styles.methodBadgeText, { color: '#000' }]}>ZAXIRADAN TIKLASH</Text>
                    </View>
                    <Text style={styles.guideCardTitle}>{"Ilovani Qayta O'rnatish"}</Text>
                  </View>
                  <Text style={styles.guideCardDesc}>
                    {"Bu ilova telefondan o'chirilgan, lekin uning to'liq APK fayli Calculator ichida xavfsiz saqlangan. 1 bosishda qayta o'rnatishingiz mumkin."}
                  </Text>
                  <Pressable
                    style={[styles.backupBtn, { backgroundColor: '#3ddc84' }]}
                    onPress={() => {
                      setShowAssistantModal(false);
                      handleInstallVaultApk(selectedTargetApp.apkPath!, selectedTargetApp.appName);
                    }}
                  >
                    <Ionicons name="download-outline" size={18} color="#000" />
                    <Text style={[styles.backupBtnText, { color: '#000' }]}>
                      {"🚀 Qayta o'rnatish (Install APK)"}
                    </Text>
                  </Pressable>
                </View>
              )}

              {/* Method 1: OEM Hide Settings */}
              <View style={styles.guideCard}>
                <View style={styles.guideCardHeader}>
                  <View style={styles.methodBadge}>
                    <Text style={styles.methodBadgeText}>1-USUL: ENG OSON</Text>
                  </View>
                  <Text style={styles.guideCardTitle}>{deviceManufacturer} Yashirin Menyu</Text>
                </View>
                <Text style={styles.guideCardDesc}>
                  {"Telefoningizning o'z tizimli \"Ilovalarni yashirish\" sozlamasini to'g'ridan-to'g'ri 1 bosishda oching va ilovani belgilang."}
                </Text>
                <Pressable
                  style={styles.oemLaunchBtn}
                  onPress={async () => {
                    useVaultStore.getState().startMediaPick();
                    try {
                      const opened = await openOemHideSettings(deviceManufacturer);
                      if (!opened) {
                        openAppInfo(selectedTargetApp?.packageName || '');
                      }
                    } finally {
                      useVaultStore.getState().endMediaPick(5000);
                    }
                  }}
                >
                  <Ionicons name="open-outline" size={18} color="#000" />
                  <Text style={styles.oemLaunchBtnText}>
                    {deviceManufacturer} Yashirish Sozlamasini Ochish
                  </Text>
                </Pressable>
              </View>

              {/* Xiaomi / Redmi / Poco Special Controls */}
              <View style={styles.guideCard}>
                <View style={styles.guideCardHeader}>
                  <View style={[styles.methodBadge, { backgroundColor: '#FF6900' }]}>
                    <Text style={[styles.methodBadgeText, { color: '#FFF' }]}>XIAOMI / REDMI / POCO</Text>
                  </View>
                  <Text style={styles.guideCardTitle}>MIUI & HyperOS Sozlamalari</Text>
                </View>
                <Text style={styles.guideCardDesc}>
                  {"Redmi, Poco va Xiaomi telefonlarida maxfiy ilovalar bo'limi tizimning o'zida mavjud:"}
                </Text>
                <View style={{ gap: 8, marginTop: 4 }}>
                  <Pressable
                    style={styles.xiaomiBtn}
                    onPress={async () => {
                      useVaultStore.getState().startMediaPick();
                      try {
                        await openXiaomiHiddenApps();
                      } finally {
                        useVaultStore.getState().endMediaPick(5000);
                      }
                    }}
                  >
                    <Ionicons name="eye-off-outline" size={18} color="#FFF" />
                    <Text style={styles.xiaomiBtnText}>
                      Maxfiy Ilovalar Sozlamasini Ochish
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.xiaomiBtn, { backgroundColor: '#2C2C3E' }]}
                    onPress={async () => {
                      useVaultStore.getState().startMediaPick();
                      try {
                        await openXiaomiSecurityCenter();
                      } finally {
                        useVaultStore.getState().endMediaPick(5000);
                      }
                    }}
                  >
                    <Ionicons name="shield-checkmark-outline" size={18} color="#FFF" />
                    <Text style={styles.xiaomiBtnText}>
                      Xavfsizlik Markazi (Security)
                    </Text>
                  </Pressable>
                </View>
              </View>

              {/* Method 2: Backup APK & Uninstall */}
              {selectedTargetApp && (
                <View style={styles.guideCard}>
                  <View style={styles.guideCardHeader}>
                    <View style={[styles.methodBadge, { backgroundColor: '#3ddc84' }]}>
                      <Text style={[styles.methodBadgeText, { color: '#000' }]}>2-USUL: 100% KAFOLATLI</Text>
                    </View>
                    <Text style={styles.guideCardTitle}>{"APK Saqlash va Aslini O'chirish"}</Text>
                  </View>
                  <Text style={styles.guideCardDesc}>
                    {"Ilovaning o'rnatish fayli (APK) Calculator ichiga ko'chiriladi, so'ng telefondan o'chiriladi. Shunda u qidiruvda umuman chiqmaydi!"}
                  </Text>
                  <Pressable
                    style={styles.backupBtn}
                    onPress={() => handleBackupAndUninstall(selectedTargetApp)}
                  >
                    <Ionicons name="cloud-download-outline" size={18} color="#FFF" />
                    <Text style={styles.backupBtnText}>
                      {"APK Zaxiralash va Telefondan O'chirish"}
                    </Text>
                  </Pressable>
                </View>
              )}

              {/* Method 3: Device Owner ADB */}
              <View style={styles.guideCard}>
                <View style={styles.guideCardHeader}>
                  <View style={[styles.methodBadge, { backgroundColor: '#0A84FF' }]}>
                    <Text style={styles.methodBadgeText}>3-USUL: TIZIMLI DEVICE OWNER</Text>
                  </View>
                  <Text style={styles.guideCardTitle}>Avtomatik Tizimli Yashirish</Text>
                </View>
                <Text style={styles.guideCardDesc}>
                  {"Calculatorga Device Owner ruxsati berilsa, ilovalar hech qanday sozlamasiz to'g'ridan-to'g'ri tizimdan va qidiruvdan yo'qoladi."}
                </Text>
                <View style={styles.codeBox}>
                  <Text style={styles.codeText} selectable numberOfLines={2}>
                    {deviceOwnerCommand}
                  </Text>
                </View>
                <Pressable
                  style={styles.copyBtn}
                  onPress={() => {
                    Share.share({
                      message: deviceOwnerCommand,
                      title: 'Device Owner ADB Buyrug\'i',
                    });
                  }}
                >
                  <Ionicons name="share-social-outline" size={16} color="#0A84FF" />
                  <Text style={styles.copyBtnText}>Buyruqni yuborish / saqlash</Text>
                </Pressable>
              </View>
            </ScrollView>

            <View style={styles.guideActions}>
              <Pressable
                style={styles.guideCloseBtn}
                onPress={() => setShowAssistantModal(false)}
              >
                <Text style={styles.guideCloseBtnText}>Yopish</Text>
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
    backgroundColor: '#0a0a14',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  headerMeta: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  addAppTopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FF9500',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  addAppTopBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#161622',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,149,0,0.2)',
  },
  statusBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  statusBannerSub: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 1,
  },
  statusBannerBtn: {
    backgroundColor: '#FF9500',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  statusBannerBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#000',
  },
  tabSwitcher: {
    flexDirection: 'row',
    backgroundColor: '#1C1C1E',
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    padding: 3,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
  },
  tabBtnActive: {
    backgroundColor: '#2C2C2E',
  },
  tabBtnText: {
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '600',
  },
  tabBtnTextActive: {
    color: '#FF9500',
    fontWeight: '700',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    padding: 0,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  separator: {
    height: 1,
    backgroundColor: '#1C1C1E',
  },
  appCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  appCardPressed: {
    opacity: 0.7,
  },
  appIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appIconImage: {
    width: 48,
    height: 48,
    resizeMode: 'contain',
  },
  appIconFallback: {
    width: 48,
    height: 48,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appIconFallbackText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FF9500',
  },
  appDetails: {
    flex: 1,
    gap: 2,
  },
  appNameText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  appPackageText: {
    fontSize: 11,
    color: '#636366',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  shieldBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,149,0,0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  shieldBadgeText: {
    fontSize: 10,
    color: '#FF9500',
    fontWeight: '600',
  },
  systemHiddenBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(48,209,88,0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  systemHiddenBadgeText: {
    fontSize: 10,
    color: '#30D158',
    fontWeight: '700',
  },
  apkSavedBadge: {
    backgroundColor: 'rgba(61,220,132,0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  apkSavedBadgeText: {
    fontSize: 10,
    color: '#3ddc84',
    fontWeight: '600',
  },
  appRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  launchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FF9500',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  launchBtnText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '700',
  },
  moreBtn: {
    padding: 6,
  },
  apkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
    backgroundColor: '#1C1C1E',
    paddingHorizontal: 12,
    borderRadius: 12,
    marginVertical: 4,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  emptyIconWrapper: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255,149,0,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    backgroundColor: '#FF9500',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyAddBtnText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 14,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FF9500',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#FF9500',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  fabPressed: {
    transform: [{ scale: 0.95 }],
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#0a0a14',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1C1C1E',
  },
  modalCloseBtn: {
    padding: 6,
    minWidth: 50,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 1,
  },
  modalSelectAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF9500',
    textAlign: 'right',
  },
  modalSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    marginHorizontal: 16,
    marginVertical: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 8,
  },
  filterChipsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1C1C1E',
  },
  chipActive: {
    backgroundColor: 'rgba(255,149,0,0.2)',
    borderWidth: 1,
    borderColor: '#FF9500',
  },
  chipText: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#FF9500',
  },
  installItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  installItemSelected: {
    backgroundColor: 'rgba(255,149,0,0.08)',
  },
  installItemDisabled: {
    opacity: 0.4,
  },
  alreadyHiddenText: {
    fontSize: 11,
    color: '#30D158',
    fontWeight: '600',
  },
  systemAppText: {
    fontSize: 11,
    color: '#636366',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#636366',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: '#FF9500',
    borderColor: '#FF9500',
  },
  checkboxDisabled: {
    borderColor: '#3A3A3C',
    backgroundColor: '#2C2C2E',
  },
  modalBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#12121E',
    borderTopWidth: 0.5,
    borderTopColor: '#2C2C2E',
  },
  confirmHideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FF9500',
    height: 48,
    borderRadius: 12,
  },
  confirmHideBtnDisabled: {
    backgroundColor: '#2C2C2E',
    opacity: 0.5,
  },
  confirmHideBtnText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 15,
  },
  loadingText: {
    color: '#8E8E93',
    fontSize: 14,
  },
  guideOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  guideContent: {
    backgroundColor: '#161622',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
    maxHeight: '85%',
  },
  guideHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  guideIconBox: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,149,0,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  guideTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  guideSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  guideBody: {
    marginBottom: 16,
  },
  guideCard: {
    backgroundColor: '#1F1F2E',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  guideCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  methodBadge: {
    backgroundColor: '#FF9500',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  methodBadgeText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '800',
  },
  guideCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  guideCardDesc: {
    fontSize: 12,
    color: '#8E8E93',
    lineHeight: 16,
  },
  oemLaunchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FF9500',
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 4,
  },
  oemLaunchBtnText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 13,
  },
  backupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#3ddc84',
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 4,
  },
  backupBtnText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 13,
  },
  codeBox: {
    backgroundColor: '#0a0a14',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  codeText: {
    color: '#30D158',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    backgroundColor: 'rgba(10,132,255,0.15)',
    borderRadius: 8,
  },
  copyBtnText: {
    color: '#0A84FF',
    fontSize: 12,
    fontWeight: '600',
  },
  guideActions: {
    paddingTop: 8,
  },
  guideCloseBtn: {
    backgroundColor: '#2C2C2E',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  guideCloseBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
  reinstallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#3ddc84',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  reinstallBtnText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '700',
  },
  uninstalledBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,159,10,0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  uninstalledBadgeText: {
    fontSize: 10,
    color: '#FF9F0A',
    fontWeight: '700',
  },
  installApkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#3ddc84',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  installApkBtnText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '700',
  },
  xiaomiBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FF6900',
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 4,
  },
  xiaomiBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 13,
  },
});
