/**
 * MediaPickerModal.tsx — In-app direct gallery selector for Calculator Vault
 *
 * Directly reads device MediaLibrary assets with authentic asset IDs.
 * Solves the Android Photo Picker issue where assetId is stripped/null.
 * Retains pickingMedia state until Android's delete confirmation is completed.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  SafeAreaView,
  StatusBar,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NUM_COLUMNS = 3;
const ITEM_SIZE = (SCREEN_WIDTH - (NUM_COLUMNS + 1) * 3) / NUM_COLUMNS;

interface Props {
  visible: boolean;
  mediaType: 'photos' | 'videos';
  onClose: () => void;
  onImportAssets: (assets: MediaLibrary.Asset[]) => Promise<void>;
  onOpenSystemPicker: () => void;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function MediaPickerModal({
  visible,
  mediaType,
  onClose,
  onImportAssets,
  onOpenSystemPicker,
}: Props) {
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [importing, setImporting] = useState(false);

  // Load device media assets
  const loadMedia = useCallback(async () => {
    if (!visible) return;
    setLoading(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync(true);
      if (status !== 'granted') {
        setHasPermission(false);
        setLoading(false);
        return;
      }
      setHasPermission(true);

      const targetType: MediaLibrary.MediaTypeValue[] =
        mediaType === 'videos' ? ['video'] : ['photo'];

      const result = await MediaLibrary.getAssetsAsync({
        first: 120,
        mediaType: targetType,
        sortBy: [MediaLibrary.SortBy.creationTime],
      });

      setAssets(result.assets);
    } catch (err) {
      console.warn('Error loading media assets:', err);
    } finally {
      setLoading(false);
    }
  }, [visible, mediaType]);

  useEffect(() => {
    if (visible) {
      setSelectedIds(new Set());
      loadMedia();
    }
  }, [visible, loadMedia]);

  const toggleSelect = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (selectedIds.size === assets.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(assets.map((a) => a.id)));
    }
  }, [assets, selectedIds.size]);

  const handleConfirmImport = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const selected = assets.filter((a) => selectedIds.has(a.id));
    setImporting(true);
    try {
      await onImportAssets(selected);
      onClose();
    } catch (err: any) {
      Alert.alert('Xatolik', 'Fayllarni import qilishda xatolik yuz berdi: ' + (err?.message ?? err));
    } finally {
      setImporting(false);
    }
  }, [selectedIds, assets, onImportAssets, onClose]);

  const isVideo = mediaType === 'videos';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#000000" />

        {/* Top Header */}
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.headerBtn}>
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </Pressable>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>
              {isVideo ? 'Videolar Galereyasi' : 'Rasmlar Galereyasi'}
            </Text>
            <Text style={styles.headerSubtitle}>
              {selectedIds.size > 0
                ? `${selectedIds.size} ta tanlandi`
                : 'Yashirish uchun tanlang'}
            </Text>
          </View>

          <Pressable
            onPress={selectAll}
            style={styles.headerBtn}
            disabled={assets.length === 0}
          >
            <Text style={styles.selectAllText}>
              {selectedIds.size === assets.length && assets.length > 0
                ? 'Bekor'
                : 'Barchasi'}
            </Text>
          </Pressable>
        </View>

        {/* Notice banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="shield-checkmark" size={16} color="#FF9500" />
          <Text style={styles.infoBannerText}>
            Tanlangan fayllar Calculatorga o'tib, galereyadan o'chiriladi.
          </Text>
        </View>

        {/* Content */}
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#FF9500" />
            <Text style={styles.loadingText}>Galereya o'qilmoqda...</Text>
          </View>
        ) : hasPermission === false ? (
          <View style={styles.center}>
            <Ionicons name="images-outline" size={56} color="#FF453A" />
            <Text style={styles.permissionTitle}>Galereyaga ruxsat berilmadi</Text>
            <Text style={styles.permissionSub}>
              Fayllarni ko'rish va galereyadan o'chirish uchun ilovaga ruxsat zarur.
            </Text>
            <Pressable style={styles.permButton} onPress={loadMedia}>
              <Text style={styles.permButtonText}>Qayta urinish</Text>
            </Pressable>
          </View>
        ) : assets.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="images-outline" size={56} color="#8E8E93" />
            <Text style={styles.emptyTitle}>Galereyada fayl topilmadi</Text>
            <Pressable
              style={styles.systemPickerLink}
              onPress={() => {
                onClose();
                onOpenSystemPicker();
              }}
            >
              <Ionicons name="folder-open-outline" size={18} color="#FF9500" />
              <Text style={styles.systemPickerLinkText}>
                Tizim fayl tanlagichidan ochish
              </Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={assets}
            keyExtractor={(item) => item.id}
            numColumns={NUM_COLUMNS}
            renderItem={({ item }) => {
              const isSelected = selectedIds.has(item.id);
              return (
                <Pressable
                  style={[styles.itemContainer, isSelected && styles.itemSelected]}
                  onPress={() => toggleSelect(item.id)}
                >
                  <Image source={{ uri: item.uri }} style={styles.thumbnail} />

                  {/* Video duration badge */}
                  {isVideo && item.duration > 0 && (
                    <View style={styles.durationBadge}>
                      <Ionicons name="play" size={10} color="#FFF" style={{ marginRight: 2 }} />
                      <Text style={styles.durationText}>
                        {formatDuration(item.duration)}
                      </Text>
                    </View>
                  )}

                  {/* Selection checkmark */}
                  <View
                    style={[
                      styles.checkCircle,
                      isSelected && styles.checkCircleSelected,
                    ]}
                  >
                    {isSelected && (
                      <Ionicons name="checkmark" size={14} color="#FFF" />
                    )}
                  </View>
                </Pressable>
              );
            }}
            contentContainerStyle={styles.listContent}
          />
        )}

        {/* Bottom Actions */}
        <View style={styles.bottomBar}>
          <Pressable
            style={styles.systemPickerBtn}
            onPress={() => {
              onClose();
              onOpenSystemPicker();
            }}
          >
            <Ionicons name="folder-open-outline" size={20} color="#8E8E93" />
          </Pressable>

          <Pressable
            style={[
              styles.importBtn,
              selectedIds.size === 0 && styles.importBtnDisabled,
            ]}
            onPress={handleConfirmImport}
            disabled={selectedIds.size === 0 || importing}
          >
            {importing ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Ionicons name="lock-closed" size={18} color="#FFF" />
                <Text style={styles.importBtnText}>
                  Yashirish va O'chirish ({selectedIds.size})
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
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
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1C1C1E',
  },
  headerBtn: {
    padding: 6,
    minWidth: 60,
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  selectAllText: {
    fontSize: 15,
    color: '#FF9500',
    fontWeight: '600',
    textAlign: 'right',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,149,0,0.1)',
    marginHorizontal: 12,
    marginVertical: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: 'rgba(255,149,0,0.25)',
  },
  infoBannerText: {
    fontSize: 12,
    color: '#D1D1D6',
    flex: 1,
  },
  listContent: {
    padding: 2,
    paddingBottom: 90,
  },
  itemContainer: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    margin: 1.5,
    backgroundColor: '#1C1C1E',
    borderRadius: 4,
    overflow: 'hidden',
  },
  itemSelected: {
    borderWidth: 2.5,
    borderColor: '#FF9500',
    borderRadius: 6,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: {
    fontSize: 10,
    color: '#FFF',
    fontWeight: '600',
  },
  checkCircle: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleSelected: {
    backgroundColor: '#FF9500',
    borderColor: '#FFFFFF',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  loadingText: {
    color: '#8E8E93',
    fontSize: 14,
  },
  permissionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  permissionSub: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
  },
  permButton: {
    marginTop: 10,
    backgroundColor: '#FF9500',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  permButtonText: {
    color: '#FFF',
    fontWeight: '600',
  },
  emptyTitle: {
    fontSize: 16,
    color: '#8E8E93',
  },
  systemPickerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  systemPickerLinkText: {
    color: '#FF9500',
    fontSize: 14,
    fontWeight: '600',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    backgroundColor: '#12121E',
    borderTopWidth: 0.5,
    borderTopColor: '#2C2C2E',
  },
  systemPickerBtn: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  importBtn: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    backgroundColor: '#FF9500',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  importBtnDisabled: {
    backgroundColor: '#2C2C2E',
    opacity: 0.6,
  },
  importBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
