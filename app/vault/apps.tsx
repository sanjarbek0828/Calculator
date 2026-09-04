/**
 * vault/apps.tsx — Apps & Games Vault Tab
 *
 * Allows importing APK files and app-related files into the hidden vault.
 * Stored files are in the private app sandbox — invisible to other apps,
 * file managers, and search.
 *
 * NOTE: Full system-level app hiding (removing icons from launcher)
 * requires Device Policy Manager / native plugin — not possible in standard Expo.
 * This tab stores APK files securely so they can't be found by search.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Pressable,
  Text,
  Alert,
  SafeAreaView,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import {
  listFiles,
  importFile,
  deleteFile,
  type VaultFile,
} from '../../src/services/vaultStorage';

// ── Helpers ─────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function getFileIcon(name: string): keyof typeof Ionicons.glyphMap {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'apk') return 'logo-android';
  if (ext === 'ipa') return 'logo-apple';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'mkv', 'avi'].includes(ext)) return 'film';
  return 'apps';
}

// ── App Item Component ───────────────────────────────────────────────

interface AppItemProps {
  file: VaultFile;
  onDelete: (file: VaultFile) => void;
  onLaunch: (file: VaultFile) => void;
}

function AppItem({ file, onDelete, onLaunch }: AppItemProps) {
  const ext = file.originalName.split('.').pop()?.toLowerCase() ?? '';
  const isApk = ext === 'apk';
  const icon = getFileIcon(file.originalName);

  const handleLongPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(file.originalName, `${formatBytes(file.sizeBytes)} · ${formatDate(file.importedAt)}`, [
      isApk
        ? { text: '▶ Install APK', onPress: () => onLaunch(file) }
        : { text: '⬡ Open File', onPress: () => onLaunch(file) },
      {
        text: '🗑 Delete Permanently',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Delete App File', `Permanently delete "${file.originalName}"?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => onDelete(file) },
          ]);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [file, isApk, onDelete, onLaunch]);

  return (
    <Pressable
      style={({ pressed }) => [styles.appItem, pressed && styles.appItemPressed]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        handleLongPress();
      }}
      onLongPress={handleLongPress}
    >
      {/* Icon container */}
      <View style={[
        styles.appIconBox,
        isApk && styles.appIconBoxApk,
      ]}>
        <Ionicons
          name={icon}
          size={28}
          color={isApk ? '#3ddc84' : '#FF9500'}
        />
      </View>

      {/* Info */}
      <View style={styles.appInfo}>
        <Text style={styles.appName} numberOfLines={1}>
          {file.originalName}
        </Text>
        <Text style={styles.appMeta}>
          {formatBytes(file.sizeBytes)} · {formatDate(file.importedAt)}
        </Text>
        {isApk && (
          <View style={styles.apkBadge}>
            <Text style={styles.apkBadgeText}>APK</Text>
          </View>
        )}
      </View>

      {/* Chevron */}
      <Ionicons name="chevron-forward" size={18} color="#48484A" />
    </Pressable>
  );
}

// ── Main Component ───────────────────────────────────────────────────

export default function AppsTab() {
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);

  // ── Load files ─────────────────────────────────────────────────
  const loadFiles = useCallback(async () => {
    setLoading(true);
    const items = await listFiles('apps');
    setFiles(items);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // ── Import APK or any file ─────────────────────────────────────
  const handleImport = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) return;

      setImporting(true);

      for (const asset of result.assets) {
        await importFile(
          asset.uri,
          'apps',
          asset.name || `app_${Date.now()}`,
          asset.mimeType || 'application/octet-stream',
          false // Don't delete documents from their source
        );
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await loadFiles();
    } catch (err) {
      Alert.alert('Import Failed', 'Could not import the selected file(s).');
    } finally {
      setImporting(false);
    }
  }, [loadFiles]);

  // ── Launch / Install ────────────────────────────────────────────
  const handleLaunch = useCallback(async (file: VaultFile) => {
    const ext = file.originalName.split('.').pop()?.toLowerCase() ?? '';

    if (ext === 'apk') {
      // Copy APK to a cache location and open with system installer
      try {
        const cacheDir = `${FileSystem.cacheDirectory}apk_install/`;
        const cacheInfo = await FileSystem.getInfoAsync(cacheDir);
        if (!cacheInfo.exists) {
          await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });
        }
        const destPath = `${cacheDir}${file.originalName}`;
        await FileSystem.copyAsync({ from: file.vaultPath, to: destPath });

        // Try to open with content:// URI (Android)
        const canOpen = await Linking.canOpenURL(destPath);
        if (canOpen) {
          await Linking.openURL(destPath);
        } else {
          Alert.alert(
            'APK Install',
            'To install this APK:\n1. Copy it from vault\n2. Enable "Unknown sources" in Settings\n3. Open the APK file\n\nThe APK has been prepared in cache.',
            [{ text: 'OK' }]
          );
        }
      } catch {
        Alert.alert(
          'Install APK',
          'Enable "Install from unknown sources" in your Android settings, then try again.',
          [{ text: 'OK' }]
        );
      }
      return;
    }

    Alert.alert(
      file.originalName,
      `Size: ${formatBytes(file.sizeBytes)}\nImported: ${formatDate(file.importedAt)}\n\nThis file is stored securely in your vault.`,
      [{ text: 'OK' }]
    );
  }, []);

  // ── Delete ──────────────────────────────────────────────────────
  const handleDelete = useCallback(async (file: VaultFile) => {
    await deleteFile('apps', file.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    loadFiles();
  }, [loadFiles]);

  const totalSize = files.reduce((s, f) => s + f.sizeBytes, 0);

  // ── Render ──────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Apps & Games</Text>
          <Text style={styles.headerMeta}>
            {files.length} {files.length === 1 ? 'file' : 'files'} · {formatBytes(totalSize)}
          </Text>
        </View>
      </View>

      {/* Info banner */}
      <View style={styles.infoBanner}>
        <Ionicons name="shield-checkmark" size={16} color="#FF9500" />
        <Text style={styles.infoText}>
          Files stored here are hidden from gallery, search, and file managers
        </Text>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FF9500" />
        </View>
      ) : files.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyIconWrapper}>
            <Ionicons name="apps" size={56} color="#FF9500" />
          </View>
          <Text style={styles.emptyTitle}>No hidden apps yet</Text>
          <Text style={styles.emptySubtext}>
            Tap + to import APK files or app data
          </Text>
          <Text style={styles.emptySubtext}>
            Imported files won't appear in search or file manager
          </Text>
        </View>
      ) : (
        <FlatList
          data={files}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <AppItem
              file={item}
              onDelete={handleDelete}
              onLaunch={handleLaunch}
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      {/* FAB */}
      <Pressable
        onPress={handleImport}
        disabled={importing}
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
      >
        {importing ? (
          <ActivityIndicator size="small" color="#FFF" />
        ) : (
          <Ionicons name="add" size={28} color="#FFF" />
        )}
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  headerMeta: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  infoBanner: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,149,0,0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,149,0,0.2)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#8E8E93',
    lineHeight: 17,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 80,
  },
  emptyIconWrapper: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: 'rgba(255,149,0,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 4,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#48484A',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  separator: {
    height: 1,
    backgroundColor: '#1C1C1E',
    marginLeft: 72,
  },
  appItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 14,
  },
  appItemPressed: {
    opacity: 0.6,
  },
  appIconBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(255,149,0,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,149,0,0.15)',
  },
  appIconBoxApk: {
    backgroundColor: 'rgba(61,220,132,0.1)',
    borderColor: 'rgba(61,220,132,0.2)',
  },
  appInfo: {
    flex: 1,
    gap: 3,
  },
  appName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  appMeta: {
    fontSize: 12,
    color: '#8E8E93',
  },
  apkBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(61,220,132,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 2,
  },
  apkBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#3ddc84',
    letterSpacing: 0.5,
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
    elevation: 10,
    shadowColor: '#FF9500',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
  },
  fabPressed: {
    backgroundColor: '#CC7700',
    transform: [{ scale: 0.93 }],
  },
});
