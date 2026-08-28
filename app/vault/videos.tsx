/**
 * vault/videos.tsx — Video vault tab (v3)
 *
 * Premium video vault with:
 * - Gallery import WITHOUT auto-locking (pickingMediaCount counter)
 * - ALWAYS deletes original from gallery after import
 * - Multi-select mode for batch delete/export
 * - Full-screen video player with native controls
 * - Sort by newest/oldest/size
 * - Import progress indicator
 * - Haptic feedback
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Pressable,
  Text,
  Alert,
  Modal,
  SafeAreaView,
  Dimensions,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
  listFiles,
  importFile,
  deleteFile,
  exportFile,
  type VaultFile,
} from '../../src/services/vaultStorage';
import { VaultGridItem, NUM_COLUMNS } from '../../src/components/VaultGridItem';
import { useVaultStore } from '../../src/store/vaultStore';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type SortMode = 'newest' | 'oldest' | 'largest' | 'smallest';

function sortFiles(files: VaultFile[], mode: SortMode): VaultFile[] {
  const copy = [...files];
  switch (mode) {
    case 'newest':   return copy.sort((a, b) => b.importedAt - a.importedAt);
    case 'oldest':   return copy.sort((a, b) => a.importedAt - b.importedAt);
    case 'largest':  return copy.sort((a, b) => b.sizeBytes - a.sizeBytes);
    case 'smallest': return copy.sort((a, b) => a.sizeBytes - b.sizeBytes);
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function VideosTab() {
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });
  const [viewerFile, setViewerFile] = useState<VaultFile | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelecting, setIsSelecting] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [showSortMenu, setShowSortMenu] = useState(false);

  const incrementPickingMedia = useVaultStore((s) => s.incrementPickingMedia);
  const decrementPickingMedia = useVaultStore((s) => s.decrementPickingMedia);

  // ── Load files ─────────────────────────────────────────────────
  const loadFiles = useCallback(async () => {
    setLoading(true);
    const items = await listFiles('videos');
    setFiles(sortFiles(items, sortMode));
    setLoading(false);
  }, [sortMode]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // ── Import (lock-prevention with counter) ─────────────────────
  const handleImport = useCallback(async () => {
    try {
      // Increment BEFORE picker opens — prevents auto-lock on AppState change
      incrementPickingMedia();

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        quality: 1,
        allowsMultipleSelection: true,
        presentationStyle: ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN,
      });

      // Decrement AFTER picker closes
      decrementPickingMedia();

      if (result.canceled || !result.assets?.length) return;

      setImporting(true);
      setImportProgress({ done: 0, total: result.assets.length });

      for (let i = 0; i < result.assets.length; i++) {
        const asset = result.assets[i];
        await importFile(
          asset.uri,
          'videos',
          asset.fileName || `video_${Date.now()}.mp4`,
          asset.mimeType || 'video/mp4',
          true, // Always delete from gallery
          asset.assetId
        );
        setImportProgress({ done: i + 1, total: result.assets.length });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await loadFiles();
    } catch {
      // Always decrement on error
      decrementPickingMedia();
    } finally {
      setImporting(false);
    }
  }, [loadFiles, incrementPickingMedia, decrementPickingMedia]);

  // ── Multi-select ───────────────────────────────────────────────
  const toggleSelect = useCallback((file: VaultFile) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(file.id)) next.delete(file.id);
      else next.add(file.id);
      return next;
    });
  }, []);

  const handleLongPress = useCallback((file: VaultFile) => {
    if (!isSelecting) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setIsSelecting(true);
      setSelectedIds(new Set([file.id]));
    } else {
      toggleSelect(file);
    }
  }, [isSelecting, toggleSelect]);

  const handlePress = useCallback((file: VaultFile) => {
    if (isSelecting) {
      toggleSelect(file);
    } else {
      setViewerFile(file);
    }
  }, [isSelecting, toggleSelect]);

  const cancelSelect = useCallback(() => {
    setIsSelecting(false);
    setSelectedIds(new Set());
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(files.map((f) => f.id)));
  }, [files]);

  // ── Batch delete ───────────────────────────────────────────────
  const handleBatchDelete = useCallback(() => {
    Alert.alert(
      `Delete ${selectedIds.size} video${selectedIds.size > 1 ? 's' : ''}`,
      'These files will be permanently removed from the vault.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            for (const id of selectedIds) {
              await deleteFile('videos', id);
            }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            cancelSelect();
            loadFiles();
          },
        },
      ]
    );
  }, [selectedIds, cancelSelect, loadFiles]);

  // ── Batch export ───────────────────────────────────────────────
  const handleBatchExport = useCallback(async () => {
    let success = 0;
    for (const id of selectedIds) {
      const ok = await exportFile('videos', id);
      if (ok) success++;
    }
    Alert.alert('Exported', `${success} video${success > 1 ? 's' : ''} restored to gallery.`);
    cancelSelect();
  }, [selectedIds, cancelSelect]);

  // ── Single delete/export ───────────────────────────────────────
  const handleExport = useCallback(async (file: VaultFile) => {
    const success = await exportFile('videos', file.id);
    Alert.alert(
      success ? 'Exported' : 'Error',
      success ? 'Video restored to your gallery.' : 'Failed to export.'
    );
  }, []);

  const handleDelete = useCallback(async (file: VaultFile) => {
    await deleteFile('videos', file.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    loadFiles();
  }, [loadFiles]);

  const totalSize = files.reduce((s, f) => s + f.sizeBytes, 0);

  const sortLabels: Record<SortMode, string> = {
    newest: 'Newest First',
    oldest: 'Oldest First',
    largest: 'Largest First',
    smallest: 'Smallest First',
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        {isSelecting ? (
          <View style={styles.selectHeader}>
            <Pressable onPress={cancelSelect} style={styles.selectAction}>
              <Text style={styles.selectActionText}>Cancel</Text>
            </Pressable>
            <Text style={styles.selectCount}>{selectedIds.size} selected</Text>
            <Pressable onPress={selectAll} style={styles.selectAction}>
              <Text style={styles.selectActionText}>All</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.headerTitle}>Videos</Text>
              <Text style={styles.headerMeta}>
                {files.length} items · {formatBytes(totalSize)}
              </Text>
            </View>
            <Pressable
              onPress={() => setShowSortMenu(true)}
              style={styles.sortButton}
            >
              <Ionicons name="funnel-outline" size={18} color="#FF9500" />
              <Text style={styles.sortButtonText}>Sort</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Import progress */}
      {importing && (
        <View style={styles.progressBanner}>
          <ActivityIndicator size="small" color="#FF9500" />
          <View style={styles.progressTextContainer}>
            <Text style={styles.progressText}>
              Importing {importProgress.done}/{importProgress.total}...
            </Text>
            <Text style={styles.progressSubText}>Removing from gallery</Text>
          </View>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: importProgress.total > 0
                    ? `${(importProgress.done / importProgress.total) * 100}%`
                    : '0%',
                },
              ]}
            />
          </View>
        </View>
      )}

      {/* Content */}
      {loading ? (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color="#FF9500" />
        </View>
      ) : files.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconWrapper}>
            <Ionicons name="videocam-outline" size={56} color="#FF9500" />
          </View>
          <Text style={styles.emptyText}>No videos yet</Text>
          <Text style={styles.emptySubtext}>Tap + to add videos from gallery</Text>
          <Text style={styles.emptySubtext}>Originals will be auto-deleted</Text>
        </View>
      ) : (
        <FlatList
          data={files}
          keyExtractor={(item) => item.id}
          numColumns={NUM_COLUMNS}
          renderItem={({ item }) => (
            <VaultGridItem
              file={item}
              onPress={handlePress}
              onLongPress={handleLongPress}
              onExport={handleExport}
              onDelete={handleDelete}
              isSelected={selectedIds.has(item.id)}
              isSelectMode={isSelecting}
            />
          )}
          contentContainerStyle={styles.grid}
        />
      )}

      {/* FAB or batch actions */}
      {isSelecting ? (
        <View style={styles.batchActions}>
          <Pressable
            style={[styles.batchBtn, { backgroundColor: '#1C1C1E' }]}
            onPress={handleBatchExport}
            disabled={selectedIds.size === 0}
          >
            <Ionicons name="share-outline" size={22} color="#FF9500" />
            <Text style={styles.batchBtnText}>Export</Text>
          </Pressable>
          <Pressable
            style={[styles.batchBtn, { backgroundColor: '#3A1C1C' }]}
            onPress={handleBatchDelete}
            disabled={selectedIds.size === 0}
          >
            <Ionicons name="trash-outline" size={22} color="#FF453A" />
            <Text style={[styles.batchBtnText, { color: '#FF453A' }]}>Delete</Text>
          </Pressable>
        </View>
      ) : (
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
      )}

      {/* Sort menu modal */}
      <Modal
        visible={showSortMenu}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSortMenu(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowSortMenu(false)}>
          <View style={styles.sortMenu}>
            <View style={styles.sortMenuHandle} />
            <Text style={styles.sortMenuTitle}>Sort by</Text>
            {(Object.keys(sortLabels) as SortMode[]).map((mode) => (
              <Pressable
                key={mode}
                style={styles.sortMenuItem}
                onPress={() => {
                  setSortMode(mode);
                  setShowSortMenu(false);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <Text style={[
                  styles.sortMenuItemText,
                  sortMode === mode && styles.sortMenuItemActive,
                ]}>
                  {sortLabels[mode]}
                </Text>
                {sortMode === mode && (
                  <Ionicons name="checkmark" size={18} color="#FF9500" />
                )}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Full-screen video player */}
      <Modal
        visible={!!viewerFile}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setViewerFile(null)}
      >
        <View style={styles.viewer}>
          <View style={styles.viewerTopBar}>
            <Pressable style={styles.viewerClose} onPress={() => setViewerFile(null)}>
              <Ionicons name="close" size={24} color="#FFF" />
            </Pressable>
            {viewerFile && (
              <Text style={styles.viewerTopTitle} numberOfLines={1}>
                {viewerFile.originalName}
              </Text>
            )}
            <View style={{ width: 40 }} />
          </View>

          {viewerFile && (
            <>
              <VideoPlayerView uri={viewerFile.uri} />
              <View style={styles.viewerInfo}>
                <Text style={styles.viewerMeta}>
                  {formatDate(viewerFile.importedAt)} · {formatBytes(viewerFile.sizeBytes)}
                </Text>
                <View style={styles.viewerActions}>
                  <Pressable
                    style={styles.viewerActionBtn}
                    onPress={() => {
                      handleExport(viewerFile);
                      setViewerFile(null);
                    }}
                  >
                    <Ionicons name="share-outline" size={18} color="#FF9500" />
                    <Text style={styles.viewerActionText}>Restore to Gallery</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.viewerActionBtn, styles.viewerDeleteBtn]}
                    onPress={() => {
                      Alert.alert('Delete Video', 'Permanently remove from vault?', [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: () => {
                            handleDelete(viewerFile);
                            setViewerFile(null);
                          },
                        },
                      ]);
                    }}
                  >
                    <Ionicons name="trash-outline" size={18} color="#FF453A" />
                    <Text style={[styles.viewerActionText, { color: '#FF453A' }]}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            </>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function VideoPlayerView({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.play();
  });

  return (
    <VideoView
      player={player}
      style={styles.videoPlayer}
      allowsFullscreen
      allowsPictureInPicture={false}
      nativeControls
    />
  );
}

const styles = StyleSheet.create({
  container:            { flex: 1, backgroundColor: '#000000' },
  header:               { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  headerRow:            { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  headerTitle:          { fontSize: 28, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.5 },
  headerMeta:           { fontSize: 13, color: '#8E8E93', marginTop: 2 },
  sortButton:           { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#1C1C1E', borderRadius: 8 },
  sortButtonText:       { fontSize: 13, color: '#FF9500', fontWeight: '600' },
  selectHeader:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectAction:         { paddingVertical: 4, paddingHorizontal: 8 },
  selectActionText:     { fontSize: 16, color: '#FF9500', fontWeight: '600' },
  selectCount:          { fontSize: 16, color: '#FFFFFF', fontWeight: '600' },
  progressBanner:       { marginHorizontal: 16, marginBottom: 8, padding: 14, backgroundColor: '#1C1C1E', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,149,0,0.2)', gap: 10 },
  progressTextContainer:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressText:         { color: '#FF9500', fontSize: 14, fontWeight: '600' },
  progressSubText:      { color: '#636366', fontSize: 12 },
  progressBar:          { height: 3, backgroundColor: '#2C2C2E', borderRadius: 2, overflow: 'hidden' },
  progressBarFill:      { height: '100%', backgroundColor: '#FF9500', borderRadius: 2 },
  grid:                 { paddingHorizontal: 2, paddingBottom: 100 },
  emptyState:           { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  emptyIconWrapper:     { width: 96, height: 96, borderRadius: 24, backgroundColor: 'rgba(255,149,0,0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  emptyText:            { fontSize: 18, color: '#FFFFFF', fontWeight: '700', marginTop: 4 },
  emptySubtext:         { fontSize: 13, color: '#48484A', textAlign: 'center' },
  fab:                  { position: 'absolute', bottom: 24, right: 20, width: 58, height: 58, borderRadius: 29, backgroundColor: '#FF9500', justifyContent: 'center', alignItems: 'center', elevation: 10, shadowColor: '#FF9500', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 12 },
  fabPressed:           { backgroundColor: '#CC7700', transform: [{ scale: 0.93 }] },
  batchActions:         { position: 'absolute', bottom: 24, left: 16, right: 16, flexDirection: 'row', gap: 12 },
  batchBtn:             { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: 16 },
  batchBtnText:         { fontSize: 16, fontWeight: '600', color: '#FF9500' },
  modalOverlay:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sortMenu:             { backgroundColor: '#1C1C1E', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  sortMenuHandle:       { width: 36, height: 4, backgroundColor: '#3A3A3C', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sortMenuTitle:        { fontSize: 13, fontWeight: '600', color: '#8E8E93', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  sortMenuItem:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 0.5, borderBottomColor: '#2C2C2E' },
  sortMenuItemText:     { fontSize: 16, color: '#FFFFFF' },
  sortMenuItemActive:   { color: '#FF9500', fontWeight: '600' },
  viewer:               { flex: 1, backgroundColor: '#000000' },
  viewerTopBar:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 52, paddingBottom: 12 },
  viewerClose:          { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  viewerTopTitle:       { flex: 1, fontSize: 15, fontWeight: '600', color: '#FFFFFF', textAlign: 'center', marginHorizontal: 8 },
  videoPlayer:          { width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.55, alignSelf: 'center' },
  viewerInfo:           { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 16 },
  viewerMeta:           { fontSize: 13, color: '#8E8E93', marginBottom: 14, textAlign: 'center' },
  viewerActions:        { flexDirection: 'row', gap: 10 },
  viewerActionBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, backgroundColor: '#1C1C1E', borderRadius: 12 },
  viewerDeleteBtn:      { backgroundColor: '#2D1515' },
  viewerActionText:     { fontSize: 14, fontWeight: '600', color: '#FF9500' },
});
