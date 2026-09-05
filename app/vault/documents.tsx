/**
 * vault/documents.tsx — Document vault tab
 *
 * List view of stored documents (PDFs, text files, etc.).
 * - FAB "+" to import via expo-document-picker
 * - Tap: open file info (system sharing for viewing)
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
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import {
  listFiles,
  importFile,
  deleteFile,
  exportFile,
  type VaultFile,
} from '../../src/services/vaultStorage';
import { useVaultStore } from '../../src/store/vaultStore';

export default function DocumentsTab() {
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    const items = await listFiles('documents');
    setFiles(items);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // ── Import ────────────────────────────────────────────────────
  const handleImport = useCallback(async () => {
    useVaultStore.getState().suspendAutoLock(120000);
    useVaultStore.getState().incrementPickingMedia();

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        multiple: true,
      });

      if (result.canceled || !result.assets?.length) return;

      for (const asset of result.assets) {
        await importFile(
          asset.uri,
          'documents',
          asset.name || `document_${Date.now()}`,
          asset.mimeType || 'application/octet-stream',
          false // Never auto-delete document originals
        );
      }

      loadFiles();
    } finally {
      useVaultStore.getState().decrementPickingMedia();
    }
  }, [loadFiles]);

  const handleExport = useCallback(async (file: VaultFile) => {
    const success = await exportFile('documents', file.id);
    Alert.alert(
      success ? 'Exported' : 'Error',
      success
        ? 'Document exported to the cache directory.'
        : 'Failed to export.'
    );
  }, []);

  const handleDelete = useCallback(
    async (file: VaultFile) => {
      Alert.alert(
        'Delete Document',
        `Are you sure you want to permanently delete "${file.originalName}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              await deleteFile('documents', file.id);
              loadFiles();
            },
          },
        ]
      );
    },
    [loadFiles]
  );

  const handlePress = useCallback((file: VaultFile) => {
    // Show file info (can't easily open arbitrary files in-app)
    const sizeMB = (file.sizeBytes / (1024 * 1024)).toFixed(2);
    const date = new Date(file.importedAt).toLocaleDateString();
    Alert.alert(file.originalName, `Size: ${sizeMB} MB\nImported: ${date}\nType: ${file.mimeType}`);
  }, []);

  // ── Format file size ──────────────────────────────────────────
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // ── Get icon for file type ────────────────────────────────────
  const getDocIcon = (mimeType: string): string => {
    if (mimeType.includes('pdf')) return 'document-text';
    if (mimeType.includes('word') || mimeType.includes('doc')) return 'document';
    if (mimeType.includes('sheet') || mimeType.includes('xls')) return 'grid';
    if (mimeType.includes('presentation') || mimeType.includes('ppt')) return 'easel';
    if (mimeType.includes('text')) return 'reader';
    if (mimeType.includes('zip') || mimeType.includes('archive')) return 'archive';
    return 'document-attach';
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Documents</Text>
        <Text style={styles.headerCount}>{files.length} items</Text>
      </View>

      {loading ? (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color="#FF9500" />
        </View>
      ) : files.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="document-text-outline" size={64} color="#3A3A3C" />
          <Text style={styles.emptyText}>No documents yet</Text>
          <Text style={styles.emptySubtext}>Tap + to add documents</Text>
        </View>
      ) : (
        <FlatList
          data={files}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => handlePress(item)}
              onLongPress={() => {
                Alert.alert(item.originalName, 'Choose an action', [
                  { text: 'Export', onPress: () => handleExport(item) },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => handleDelete(item),
                  },
                  { text: 'Cancel', style: 'cancel' },
                ]);
              }}
              delayLongPress={500}
              style={({ pressed }) => [
                styles.listItem,
                pressed && styles.listItemPressed,
              ]}
            >
              <View style={styles.listItemIcon}>
                <Ionicons
                  name={getDocIcon(item.mimeType) as any}
                  size={28}
                  color="#FF9500"
                />
              </View>
              <View style={styles.listItemInfo}>
                <Text style={styles.listItemName} numberOfLines={1}>
                  {item.originalName}
                </Text>
                <Text style={styles.listItemMeta}>
                  {formatSize(item.sizeBytes)} · {new Date(item.importedAt).toLocaleDateString()}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#48484A" />
            </Pressable>
          )}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      {/* FAB */}
      <Pressable
        onPress={handleImport}
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
      >
        <Ionicons name="add" size={28} color="#FFF" />
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
  list: {
    paddingHorizontal: 16,
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
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  listItemPressed: {
    opacity: 0.6,
  },
  listItemIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#1C1C1E',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  listItemInfo: {
    flex: 1,
  },
  listItemName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  listItemMeta: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  separator: {
    height: 0.5,
    backgroundColor: '#2C2C2E',
    marginLeft: 60,
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
});
