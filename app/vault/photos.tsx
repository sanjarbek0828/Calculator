/**
 * vault/photos.tsx — Photo vault tab
 *
 * Grid view of stored photos with thumbnails.
 * - FAB "+" button to import from gallery
 * - Tap: full-screen image viewer with pinch-to-zoom
 * - Long press: export or delete
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
  Image,
  SafeAreaView,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import {
  listFiles,
  importFile,
  deleteFile,
  exportFile,
  type VaultFile,
} from '../../src/services/vaultStorage';
import { VaultGridItem, NUM_COLUMNS } from '../../src/components/VaultGridItem';
import { useVaultStore } from '../../src/store/vaultStore';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function PhotosTab() {
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewerFile, setViewerFile] = useState<VaultFile | null>(null);
  const autoDelete = useVaultStore((s) => s.autoDeleteOriginal);

  // ── Load files ────────────────────────────────────────────────
  const loadFiles = useCallback(async () => {
    setLoading(true);
    const items = await listFiles('photos');
    setFiles(items);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // ── Import from gallery ───────────────────────────────────────
  const handleImport = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsMultipleSelection: true,
    });

    if (result.canceled || !result.assets?.length) return;

    for (const asset of result.assets) {
      await importFile(
        asset.uri,
        'photos',
        asset.fileName || `photo_${Date.now()}.jpg`,
        asset.mimeType || 'image/jpeg',
        autoDelete,
        asset.assetId
      );
    }

    loadFiles();
  }, [autoDelete, loadFiles]);

  // ── Export ────────────────────────────────────────────────────
  const handleExport = useCallback(
    async (file: VaultFile) => {
      const success = await exportFile('photos', file.id);
      Alert.alert(
        success ? 'Exported' : 'Error',
        success
          ? 'Photo restored to your gallery.'
          : 'Failed to export the photo.'
      );
    },
    []
  );

  // ── Delete ────────────────────────────────────────────────────
  const handleDelete = useCallback(
    async (file: VaultFile) => {
      await deleteFile('photos', file.id);
      loadFiles();
    },
    [loadFiles]
  );

  // ── Full-screen viewer ────────────────────────────────────────
  const handlePress = useCallback((file: VaultFile) => {
    setViewerFile(file);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Photos</Text>
        <Text style={styles.headerCount}>{files.length} items</Text>
      </View>

      {loading ? (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color="#FF9500" />
        </View>
      ) : files.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="images-outline" size={64} color="#3A3A3C" />
          <Text style={styles.emptyText}>No photos yet</Text>
          <Text style={styles.emptySubtext}>Tap + to add photos</Text>
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
              onExport={handleExport}
              onDelete={handleDelete}
            />
          )}
          contentContainerStyle={styles.grid}
        />
      )}

      {/* FAB */}
      <Pressable
        onPress={handleImport}
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
      >
        <Ionicons name="add" size={28} color="#FFF" />
      </Pressable>

      {/* Full-screen image viewer modal */}
      <Modal
        visible={!!viewerFile}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerFile(null)}
      >
        <View style={styles.viewer}>
          <Pressable style={styles.viewerClose} onPress={() => setViewerFile(null)}>
            <Ionicons name="close" size={28} color="#FFF" />
          </Pressable>
          {viewerFile && (
            <Image
              source={{ uri: viewerFile.uri }}
              style={styles.viewerImage}
              resizeMode="contain"
            />
          )}
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
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerCount: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 2,
  },
  grid: {
    paddingHorizontal: 2,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 18,
    color: '#8E8E93',
    fontWeight: '600',
    marginTop: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#48484A',
  },
  fab: {
    position: 'absolute',
    bottom: 80,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FF9500',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#FF9500',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  fabPressed: {
    backgroundColor: '#CC7700',
    transform: [{ scale: 0.95 }],
  },
  viewer: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  viewerImage: {
    width: SCREEN_WIDTH,
    height: '80%',
  },
});
