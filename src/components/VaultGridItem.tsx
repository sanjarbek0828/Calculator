/**
 * VaultGridItem.tsx — Thumbnail card for vault file grid
 *
 * Renders a photo/video thumbnail or document icon with
 * long-press support for export/delete actions.
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
import type { VaultFile } from '../services/vaultStorage';

const SCREEN_WIDTH = Dimensions.get('window').width;
const NUM_COLUMNS = 3;
const ITEM_MARGIN = 2;
const ITEM_SIZE = (SCREEN_WIDTH - ITEM_MARGIN * (NUM_COLUMNS + 1) * 2) / NUM_COLUMNS;

interface Props {
  file: VaultFile;
  onPress: (file: VaultFile) => void;
  onExport: (file: VaultFile) => void;
  onDelete: (file: VaultFile) => void;
}

export function VaultGridItem({ file, onPress, onExport, onDelete }: Props) {
  const handleLongPress = useCallback(() => {
    Alert.alert(file.originalName, 'Choose an action', [
      {
        text: 'Export to Gallery',
        onPress: () => onExport(file),
      },
      {
        text: 'Delete Permanently',
        style: 'destructive',
        onPress: () => {
          Alert.alert(
            'Delete File',
            'This file will be permanently removed from the vault. This cannot be undone.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => onDelete(file),
              },
            ]
          );
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [file, onExport, onDelete]);

  const isImage = file.type === 'photos';
  const isVideo = file.type === 'videos';

  return (
    <Pressable
      onPress={() => onPress(file)}
      onLongPress={handleLongPress}
      delayLongPress={500}
      style={({ pressed }) => [
        styles.container,
        pressed && styles.pressed,
      ]}
    >
      {isImage || isVideo ? (
        <Image source={{ uri: file.uri }} style={styles.thumbnail} />
      ) : (
        <View style={styles.docPlaceholder}>
          <Ionicons name="document-text" size={36} color="#8E8E93" />
        </View>
      )}

      {/* Video duration badge */}
      {isVideo && (
        <View style={styles.videoBadge}>
          <Ionicons name="play" size={10} color="#FFF" />
        </View>
      )}

      {/* File name overlay for documents */}
      {!isImage && !isVideo && (
        <Text style={styles.docName} numberOfLines={2}>
          {file.originalName}
        </Text>
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
    opacity: 0.7,
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
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
    width: 20,
    height: 20,
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
});

export { ITEM_SIZE, NUM_COLUMNS };
