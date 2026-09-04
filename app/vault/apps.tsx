/**
 * vault/apps.tsx — Apps & Games Vault Tab (v4)
 *
 * Professional App Hider & Vault for Android:
 * - Scans all installed apps on device (Play Store & System apps)
 * - Multi-select to hide any number of apps inside Calculator Vault
 * - Direct 1-tap launch from inside Calculator
 * - System App Info & OEM launcher hide guidance (Samsung, Xiaomi, Oppo, Vivo, Android)
 * - Optional APK file import support
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
  type AppInfo,
  type VaultApp,
} from '../../src/services/vaultAppsService';
import { importFile, listFiles, deleteFile, type VaultFile } from '../../src/services/vaultStorage';

type AppTabMode = 'apps' | 'files';
type FilterCategory = 'all' | 'user' | 'system';

export default function AppsTab() {
  const [tabMode, setTabMode] = useState<AppTabMode>('apps');
  const [hiddenApps, setHiddenApps] = useState<VaultApp[]>([]);
  const [installedApps, setInstalledApps] = useState<AppInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Add App Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalSearch, setModalSearch] = useState('');
  const [modalFilter, setModalFilter] = useState<FilterCategory>('all');
  const [selectedPackages, setSelectedPackages] = useState<Set<string>>(new Set());

  // Hide Guide Modal state
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [targetGuideApp, setTargetGuideApp] = useState<VaultApp | null>(null);

  // APK files state
  const [apkFiles, setApkFiles] = useState<VaultFile[]>([]);

  // ── Load data on mount ─────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [apps, files] = await Promise.all([
        getHiddenApps(),
        listFiles('apps'),
      ]);
      setHiddenApps(apps);
      setApkFiles(files);
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

    // Show guide suggestion
    if (toAdd.length > 0) {
      setTargetGuideApp(toAdd[0] as VaultApp);
      Alert.alert(
        'Ilovalar Calculatorga joylandi!',
        `${toAdd.length} ta ilova Calculator ichiga yashirildi. Endi ularni asosiy telefon ekranidan qanday yashirishni bilmoqchimisiz?`,
        [
          { text: 'Yoq, kerakmas', style: 'cancel' },
          {
            text: "Yo'riqnomani ko'rish",
            onPress: () => setShowGuideModal(true),
          },
        ]
      );
    }
  }, [selectedPackages, installedApps, loadData]);

  // ── Launch an app ──────────────────────────────────────────────
  const handleLaunchApp = useCallback(async (app: VaultApp) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const ok = await launchApp(app.packageName);
    if (!ok) {
      Alert.alert(
        app.appName,
        `Ilovani to'g'ridan-to'g'ri ishga tushirib bo'lmadi.\nPaket: ${app.packageName}\n\nTizim sozlamalari orqali ochishni xohlaysizmi?`,
        [
          { text: 'Bekor', style: 'cancel' },
          {
            text: 'Sozlamalarni ochish',
            onPress: () => openAppInfo(app.packageName),
          },
        ]
      );
    }
  }, []);

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

  // ── Show App Actions Sheet ─────────────────────────────────────
  const handleAppOptions = useCallback(
    (app: VaultApp) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      Alert.alert(app.appName, `Paket: ${app.packageName}`, [
        { text: '▶ Ishga tushirish', onPress: () => handleLaunchApp(app) },
        {
          text: "👁️ Asosiy ekrandan yashirish yo'riqnomasi",
          onPress: () => {
            setTargetGuideApp(app);
            setShowGuideModal(true);
          },
        },
        {
          text: "⚙️ Ilova tizim sozlamalari (App Info)",
          onPress: () => openAppInfo(app.packageName),
        },
        {
          text: "🗑️ Kalkulyatordan chiqarish",
          style: 'destructive',
          onPress: () => handleRemoveApp(app),
        },
        { text: 'Bekor', style: 'cancel' },
      ]);
    },
    [handleLaunchApp, handleRemoveApp]
  );

  // ── Import APK / App Document ──────────────────────────────────
  const handleImportApk = useCallback(async () => {
    try {
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
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

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
              Telefoningizdagi istalgan ilovani (Play Market yoki tizim) tanlab, Calculator ichiga yashirib qo'yishingiz mumkin.
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
                    <View style={styles.shieldBadge}>
                      <Ionicons name="shield-checkmark" size={10} color="#FF9500" />
                      <Text style={styles.shieldBadgeText}>Yashiringan</Text>
                    </View>
                    {item.isSystemApp && (
                      <View style={styles.systemBadge}>
                        <Text style={styles.systemBadgeText}>Tizim</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Launch & Options Buttons */}
                <View style={styles.appRightActions}>
                  <Pressable
                    style={styles.launchBtn}
                    onPress={() => handleLaunchApp(item)}
                  >
                    <Ionicons name="play" size={14} color="#FFF" />
                    <Text style={styles.launchBtnText}>Ochish</Text>
                  </Pressable>

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
              >
                <Ionicons name="trash-outline" size={20} color="#FF453A" />
              </Pressable>
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

      {/* ── MODAL: Asosiy Ekrandan Yashirish Yo'riqnomasi ── */}
      <Modal
        visible={showGuideModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowGuideModal(false)}
      >
        <View style={styles.guideOverlay}>
          <View style={styles.guideContent}>
            <View style={styles.guideHeader}>
              <View style={styles.guideIconBox}>
                <Ionicons name="eye-off-outline" size={28} color="#FF9500" />
              </View>
              <Text style={styles.guideTitle}>Asosiy Ekrandan Yashirish</Text>
              <Text style={styles.guideSubtitle}>
                {targetGuideApp?.appName || 'Tanlangan ilova'} ni telefon menyusidan yo'qotish usullari
              </Text>
            </View>

            <ScrollView style={styles.guideBody}>
              <View style={styles.guideSection}>
                <Text style={styles.guideBrand}>Samsung telefonlarda:</Text>
                <Text style={styles.guideStep}>
                  1. Bosh ekranni bosib turing → <Text style={{ color: '#FF9500' }}>Sozlamalar (Settings)</Text>
                </Text>
                <Text style={styles.guideStep}>
                  2. <Text style={{ color: '#FF9500' }}>"Bosh va ilovalar ekranlaridagi ilovalarni yashirish"</Text> bo'limiga kiring.
                </Text>
                <Text style={styles.guideStep}>
                  3. Ilovani tanlab "Tayyor" (Done) tugmasini bosing.
                </Text>
              </View>

              <View style={styles.guideSection}>
                <Text style={styles.guideBrand}>Xiaomi / Redmi / POCO:</Text>
                <Text style={styles.guideStep}>
                  1. <Text style={{ color: '#FF9500' }}>Sozlamalar → Ilovalar → Ilovalarni qulflash</Text> ga kiring.
                </Text>
                <Text style={styles.guideStep}>
                  2. Yuqoridagi <Text style={{ color: '#FF9500' }}>"Yashirin ilovalar" (Hidden apps)</Text> yorlig'ini tanlang va yoqing.
                </Text>
              </View>

              <View style={styles.guideSection}>
                <Text style={styles.guideBrand}>OPPO / Realme / OnePlus / Vivo:</Text>
                <Text style={styles.guideStep}>
                  1. <Text style={{ color: '#FF9500' }}>Sozlamalar → Maxfiylik (Privacy) → Ilovalarni yashirish (Hide apps)</Text>.
                </Text>
                <Text style={styles.guideStep}>
                  2. Yashirmoqchi bo'lgan ilovani tanlang.
                </Text>
              </View>

              <View style={styles.guideSection}>
                <Text style={styles.guideBrand}>Ixtiyoriy Android telefonda (Disable):</Text>
                <Text style={styles.guideStep}>
                  Ilova ma'lumotlari (App Info) ga kirib <Text style={{ color: '#FF453A' }}>"O'chirish" (Disable)</Text> yoki bildirishnomalarni o'chirib qo'yish mumkin.
                </Text>
              </View>
            </ScrollView>

            <View style={styles.guideActions}>
              {targetGuideApp && (
                <Pressable
                  style={styles.guideAppInfoBtn}
                  onPress={() => {
                    openAppInfo(targetGuideApp.packageName);
                    setShowGuideModal(false);
                  }}
                >
                  <Ionicons name="settings-outline" size={18} color="#FFF" />
                  <Text style={styles.guideAppInfoBtnText}>
                    Ilova tizim sozlamalarini ochish
                  </Text>
                </Pressable>
              )}

              <Pressable
                style={styles.guideCloseBtn}
                onPress={() => setShowGuideModal(false)}
              >
                <Text style={styles.guideCloseBtnText}>Tushunarli</Text>
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
  tabSwitcher: {
    flexDirection: 'row',
    backgroundColor: '#1C1C1E',
    marginHorizontal: 16,
    marginVertical: 10,
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
    borderRadius: 12,
    backgroundColor: 'rgba(255,149,0,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,149,0,0.3)',
  },
  appIconFallbackText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FF9500',
  },
  appDetails: {
    flex: 1,
    gap: 2,
  },
  appNameText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  appPackageText: {
    fontSize: 12,
    color: '#8E8E93',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  shieldBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255,149,0,0.12)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  shieldBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FF9500',
  },
  systemBadge: {
    backgroundColor: 'rgba(142,142,147,0.15)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  systemBadgeText: {
    fontSize: 10,
    color: '#8E8E93',
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
    borderRadius: 14,
  },
  launchBtnText: {
    color: '#000',
    fontSize: 12,
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
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyIconWrapper: {
    width: 90,
    height: 90,
    borderRadius: 24,
    backgroundColor: 'rgba(255,149,0,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
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
    backgroundColor: '#FF9500',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 10,
  },
  emptyAddBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#FF9500',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#FF9500',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  fabPressed: {
    transform: [{ scale: 0.94 }],
  },

  // Modal styles
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
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  modalSelectAllText: {
    color: '#FF9500',
    fontSize: 14,
    fontWeight: '700',
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
    marginBottom: 8,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#1C1C1E',
  },
  chipActive: {
    backgroundColor: '#FF9500',
  },
  chipText: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#000',
    fontWeight: '700',
  },
  loadingText: {
    color: '#8E8E93',
    fontSize: 14,
    marginTop: 8,
  },
  installItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  installItemSelected: {
    backgroundColor: 'rgba(255,149,0,0.08)',
  },
  installItemDisabled: {
    opacity: 0.5,
  },
  alreadyHiddenText: {
    fontSize: 11,
    color: '#FF9500',
    fontWeight: '600',
  },
  systemAppText: {
    fontSize: 11,
    color: '#8E8E93',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#48484A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: '#FF9500',
    borderColor: '#FF9500',
  },
  checkboxDisabled: {
    backgroundColor: '#2C2C2E',
    borderColor: '#3A3A3C',
  },
  modalBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    backgroundColor: '#12121E',
    borderTopWidth: 0.5,
    borderTopColor: '#2C2C2E',
  },
  confirmHideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 14,
    backgroundColor: '#FF9500',
  },
  confirmHideBtnDisabled: {
    backgroundColor: '#2C2C2E',
    opacity: 0.6,
  },
  confirmHideBtnText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '700',
  },

  // Guide styles
  guideOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  guideContent: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
  },
  guideHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  guideIconBox: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(255,149,0,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  guideTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  guideSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 2,
  },
  guideBody: {
    marginBottom: 16,
  },
  guideSection: {
    backgroundColor: '#2C2C2E',
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
  },
  guideBrand: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  guideStep: {
    fontSize: 12,
    color: '#D1D1D6',
    lineHeight: 18,
  },
  guideActions: {
    gap: 10,
  },
  guideAppInfoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2C2C2E',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3A3A3C',
  },
  guideAppInfoBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  guideCloseBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF9500',
    paddingVertical: 14,
    borderRadius: 12,
  },
  guideCloseBtnText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '700',
  },
});
