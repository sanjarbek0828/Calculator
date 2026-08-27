/**
 * VaultGridItem.tsx — Thumbnail card for vault file grid (v2)
 *
 * Renders a photo/video thumbnail or document icon.
 * Supports:
 * - Long-press for context menu (single mode) OR select (multi-select mode)
 * - Multi-select visual indicator (checkmark overlay)
 * - Haptic feedback
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  Alert,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { VaultFile } from '../services/vaultStorage';

const SCREEN_WIDTH = Dimensions.get('window').width;
const NUM_COLUMNS = 3;
const ITEM_MARGIN = 2;
const ITEM_SIZE = (SCREEN_WIDTH - ITEM_MARGIN * (NUM_COLUMNS + 1) * 2) / NUM_COLUMNS;

interface Props {
  file: VaultFile;
  onPress: (file: VaultFile) => void;
  onLongPress?: (file: VaultFile) => void;
  onExport: (file: VaultFile) => void;
  onDelete: (file: VaultFile) => void;
  isSelected?: boolean;
  isSelectMode?: boolean;
}

export function VaultGridItem({
  file,
  onPress,
  onLongPress,
  onExport,
  onDelete,
  isSelected = false,
  isSelectMode = false,
}: Props) {
  const handleLongPress = useCallback(() => {
    if (onLongPress) {
      onLongPress(file);
    } else {
      // Fallback: context menu
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      Alert.alert(file.originalName, 'Choose an action', [
        { text: 'Export to Gallery', onPress: () => onExport(file) },
        {
          text: 'Delete Permanently',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Delete File',
              'This file will be permanently removed from the vault.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => onDelete(file) },
              ]
            );
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }, [file, onLongPress, onExport, onDelete]);

  const isImage = file.type === 'photos';
  const isVideo = file.type === 'videos';

  return (
    <Pressable
      onPress={() => onPress(file)}
      onLongPress={handleLongPress}
      delayLongPress={400}
      style={({ pressed }) => [
        styles.container,
        pressed && styles.pressed,
        isSelected && styles.selectedContainer,
      ]}
    >
      {isImage || isVideo ? (
        <Image source={{ uri: file.uri }} style={styles.thumbnail} />
      ) : (
        <View style={styles.docPlaceholder}>
          <Ionicons name="document-text" size={36} color="#8E8E93" />
        </View>
      )}

      {/* Video play badge */}
      {isVideo && !isSelected && (
        <View style={styles.videoBadge}>
          <Ionicons name="play" size={10} color="#FFF" />
        </View>
      )}

      {/* Document name overlay */}
      {!isImage && !isVideo && (
        <Text style={styles.docName} numberOfLines={2}>
          {file.originalName}
        </Text>
      )}

      {/* Multi-select overlay */}
      {isSelectMode && (
        <View style={[styles.selectOverlay, isSelected && styles.selectOverlayActive]}>
          {isSelected && (
            <View style={styles.checkCircle}>
              <Ionicons name="checkmark" size={14} color="#FFF" />
            </View>
          )}
          {!isSelected && <View style={styles.emptyCircle} />}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    margin: ITEM_MARGIN,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#1C1C1E',
  },
  pressed: {
    opacity: 0.75,
  },
  selectedContainer: {
    borderWidth: 2,
    borderColor: '#FF9500',
    borderRadius: 6,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  docPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2C2C2E',
  },
  videoBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 10,
    width: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  docName: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    right: 4,
    fontSize: 10,
    color: '#AEAEB2',
    textAlign: 'center',
  },
  selectOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    padding: 5,
  },
  selectOverlayActive: {
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FF9500',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  emptyCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
});

export { ITEM_SIZE, NUM_COLUMNS };
