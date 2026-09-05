/**
 * vaultStorage.ts — File storage service for the hidden vault
 *
 * Files are stored inside the app's private sandbox directory
 * (FileSystem.documentDirectory + 'vault/') which other apps
 * cannot access. Files are renamed to random hashes on import
 * to strip any identifying metadata from the filename.
 *
 * A JSON index file per category tracks metadata (original name,
 * import date, file type) for display purposes.
 *
 * Security measures:
 * - .nomedia file in vault root (hides from Android Media Scanner)
 * - Random hash filenames (no metadata in filenames)
 * - Private app sandbox (inaccessible to other apps)
 * - Aggressive original deletion (tries multiple methods)
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import * as MediaLibrary from 'expo-media-library';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { useVaultStore } from '../store/vaultStore';
import {
  deleteGalleryMediaNative,
  hasManageExternalStoragePermissionNative,
  requestManageExternalStoragePermissionNative,
  encryptFileNative,
  decryptFileNative,
  decryptImageToBase64Native,
  decryptToCacheNative,
  deleteTempFileNative,
  clearVolatileCacheNative,
  type MediaDeleteItem,
} from '../../modules/installed-apps';

// ── Types ───────────────────────────────────────────────────────────

export type VaultFileType = 'photos' | 'videos' | 'documents' | 'apps';

export interface VaultFile {
  /** Unique ID (random hash) */
  id: string;
  /** Original file name for display */
  originalName: string;
  /** Path inside the vault directory */
  vaultPath: string;
  /** URI for rendering (file:// prefixed or base64) */
  uri: string;
  /** MIME type or file extension */
  mimeType: string;
  /** Category */
  type: VaultFileType;
  /** When the file was imported */
  importedAt: number;
  /** File size in bytes */
  sizeBytes: number;
  /** Whether the file is strongly encrypted with AES-256 on disk */
  isEncrypted?: boolean;
}

// ── Directory paths ─────────────────────────────────────────────────

const VAULT_ROOT = `${FileSystem.documentDirectory}vault/`;
const DIRS: Record<VaultFileType, string> = {
  photos: `${VAULT_ROOT}photos/`,
  videos: `${VAULT_ROOT}videos/`,
  documents: `${VAULT_ROOT}documents/`,
  apps: `${VAULT_ROOT}apps/`,
};
const INDEX_SUFFIX = '_index.json';

// ── Initialization ──────────────────────────────────────────────────

/**
 * Ensure the vault directory structure exists.
 * Also creates .nomedia file to hide vault from Android Media Scanner.
 * Call this once during app startup.
 */
export async function ensureVaultDirs(): Promise<void> {
  if (Platform.OS === 'web') return;
  for (const dir of Object.values(DIRS)) {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
  }

  // Create .nomedia file in vault root — this tells Android Media Scanner
  // to IGNORE this entire directory tree, so files won't appear in gallery,
  // file manager media views, or any other media browsing app.
  const nomediaPath = `${VAULT_ROOT}.nomedia`;
  const nomediaInfo = await FileSystem.getInfoAsync(nomediaPath);
  if (!nomediaInfo.exists) {
    await FileSystem.writeAsStringAsync(nomediaPath, '');
  }

  // Also add .nomedia in each subdirectory for extra protection
  for (const dir of Object.values(DIRS)) {
    const subNomedia = `${dir}.nomedia`;
    const subInfo = await FileSystem.getInfoAsync(subNomedia);
    if (!subInfo.exists) {
      await FileSystem.writeAsStringAsync(subNomedia, '');
    }
  }
}

// ── Index management ────────────────────────────────────────────────

function indexPath(type: VaultFileType): string {
  return `${VAULT_ROOT}${type}${INDEX_SUFFIX}`;
}

// In-memory cache so repeat tab visits don't re-read JSON from disk
const indexCache = new Map<VaultFileType, VaultFile[]>();

async function readIndex(type: VaultFileType): Promise<VaultFile[]> {
  if (Platform.OS === 'web') return [];

  // Return cached value if available
  if (indexCache.has(type)) return indexCache.get(type)!;

  const path = indexPath(type);
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) return [];

  try {
    const raw = await FileSystem.readAsStringAsync(path);
    const parsed = JSON.parse(raw) as VaultFile[];
    indexCache.set(type, parsed);
    return parsed;
  } catch {
    return [];
  }
}

async function writeIndex(
  type: VaultFileType,
  files: VaultFile[]
): Promise<void> {
  if (Platform.OS === 'web') return;
  indexCache.set(type, files); // Update cache immediately
  const path = indexPath(type);
  await FileSystem.writeAsStringAsync(path, JSON.stringify(files, null, 2));
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Generate a random filename hash.
 */
async function randomHash(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(16);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Master AES-256 Key Management via Expo SecureStore
 */
const MASTER_KEY_STORAGE_KEY = 'vault_aes_master_key_v1';
let cachedMasterKey: string | null = null;

export async function getMasterKey(): Promise<string> {
  if (cachedMasterKey) return cachedMasterKey;
  try {
    let key = await SecureStore.getItemAsync(MASTER_KEY_STORAGE_KEY);
    if (!key) {
      const bytes = await Crypto.getRandomBytesAsync(32);
      key = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      await SecureStore.setItemAsync(MASTER_KEY_STORAGE_KEY, key);
    }
    cachedMasterKey = key;
    return key;
  } catch (err) {
    if (!cachedMasterKey) {
      const bytes = await Crypto.getRandomBytesAsync(32);
      cachedMasterKey = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    }
    return cachedMasterKey;
  }
}

// In-memory cache for decrypted image Base64 strings (never saved to disk)
const decryptedImageCache = new Map<string, string>();

/**
 * Purge in-memory image cache and temp decrypted playback files
 */
export function clearDecryptedCache(): void {
  decryptedImageCache.clear();
  clearVolatileCacheNative().catch(() => {});
}

/**
 * Decrypt an encrypted image in-memory to base64 for instant display.
 * Decrypted bytes are NEVER written to disk!
 */
export async function getDecryptedImageUri(file: VaultFile): Promise<string> {
  if (Platform.OS === 'web' || !file.isEncrypted) {
    return file.uri;
  }
  if (decryptedImageCache.has(file.id)) {
    return decryptedImageCache.get(file.id)!;
  }
  try {
    const key = await getMasterKey();
    const base64Uri = await decryptImageToBase64Native(file.vaultPath, key, file.mimeType);
    if (base64Uri) {
      if (decryptedImageCache.size > 80) {
        const firstKey = decryptedImageCache.keys().next().value;
        if (firstKey) decryptedImageCache.delete(firstKey);
      }
      decryptedImageCache.set(file.id, base64Uri);
      return base64Uri;
    }
  } catch (err) {
    console.warn('Decryption failed for image:', err);
  }
  return file.uri;
}

/**
 * Decrypt an encrypted video to a volatile temporary cache file for playback.
 * Returns the URI and a cleanup callback that deletes the temp file immediately.
 */
export async function getDecryptedVideoPlaybackUri(
  file: VaultFile
): Promise<{ uri: string; cleanup: () => Promise<void> }> {
  if (Platform.OS === 'web' || !file.isEncrypted) {
    return { uri: file.uri, cleanup: async () => {} };
  }
  try {
    const key = await getMasterKey();
    const tempUri = await decryptToCacheNative(file.vaultPath, key, file.originalName);
    if (tempUri) {
      return {
        uri: tempUri,
        cleanup: async () => {
          try {
            await deleteTempFileNative(tempUri);
          } catch {
            // Ignore cleanup error
          }
        },
      };
    }
  } catch (err) {
    console.warn('Decryption failed for video:', err);
  }
  return { uri: file.uri, cleanup: async () => {} };
}

/**
 * Get the file extension from a filename or URI.
 */
function getExtension(nameOrUri: string): string {
  const parts = nameOrUri.split('.');
  if (parts.length < 2) return '';
  return `.${parts[parts.length - 1].toLowerCase().split('?')[0]}`;
}

/**
 * Aggressively delete the original media files from the device gallery.
 * Specifically tuned for Android 14 (API 34) and Scoped Storage.
 *
 * Strategy:
 * 1. Suspend auto-lock so Android delete confirmation / MediaScanner doesn't trigger app lock.
 * 2. Primary engine on Android: Native Module (ContentResolver + disk delete + MediaScanner).
 * 3. Secondary engine: MediaLibrary.deleteAssetsAsync (standard Expo MediaLibrary).
 * 4. Fallback: direct FileSystem delete for file:// paths.
 *
 * @param assetIds - The MediaLibrary asset IDs to delete
 * @param fallbackUris - Optional array of file/content URIs for fallback deletion
 * @param metadata - Optional metadata items for precise identification
 * @returns boolean indicating if deletion was completed
 */
export async function deleteOriginalsFromGallery(
  assetIds: string[],
  fallbackUris?: string[],
  metadata?: { id?: string; uri?: string; filename?: string; path?: string }[]
): Promise<boolean> {
  const validIds = (assetIds || []).filter((id): id is string => Boolean(id && typeof id === 'string' && id.trim().length > 0));
  const validUris = (fallbackUris || []).filter((uri): uri is string => Boolean(uri && typeof uri === 'string' && uri.trim().length > 0));

  if (validIds.length === 0 && validUris.length === 0 && (!metadata || metadata.length === 0)) return false;
  if (Platform.OS === 'web') return false;

  // Crucial: keep auto-lock suspended while the system delete confirmation dialog is showing on Android
  useVaultStore.getState().startMediaPick();

  let anyDeleted = false;

  try {
    // 1. Primary engine on Android: Native Module (handles ContentResolver, direct disk delete, MediaScanner)
    if (Platform.OS === 'android') {
      const nativeItems: MediaDeleteItem[] = [];

      if (metadata && metadata.length > 0) {
        for (const m of metadata) {
          nativeItems.push({
            id: m.id,
            assetId: m.id,
            uri: m.uri,
            path: m.path,
            filename: m.filename,
          });
        }
      } else {
        const maxLength = Math.max(validIds.length, validUris.length);
        for (let i = 0; i < maxLength; i++) {
          nativeItems.push({
            id: validIds[i] || null,
            assetId: validIds[i] || null,
            uri: validUris[i] || null,
          });
        }
      }

      if (nativeItems.length > 0) {
        try {
          const nativeSuccess = await deleteGalleryMediaNative(nativeItems);
          if (nativeSuccess) {
            anyDeleted = true;
          }
        } catch (nativeErr) {
          console.warn('deleteGalleryMediaNative error:', nativeErr);
        }
      }
    }

    // 2. Secondary engine: MediaLibrary.deleteAssetsAsync
    if (validIds.length > 0) {
      try {
        const { status } = await MediaLibrary.requestPermissionsAsync(true);
        if (status === 'granted') {
          const success = await MediaLibrary.deleteAssetsAsync(validIds);
          if (success) anyDeleted = true;
        }
      } catch (deleteError: any) {
        console.warn('deleteAssetsAsync error:', deleteError?.message ?? deleteError);
      }
    }

    // 3. Fallback: try direct FileSystem delete if external file URI exists
    if (validUris.length > 0) {
      for (const uri of validUris) {
        if (uri.startsWith('file://') && !uri.includes(VAULT_ROOT)) {
          try {
            await FileSystem.deleteAsync(uri, { idempotent: true });
            anyDeleted = true;
          } catch {
            // Ignored if protected or content resolver
          }
        }
      }
    }
  } catch (error: any) {
    console.warn('Failed to delete originals from gallery:', error?.message ?? error);
  } finally {
    useVaultStore.getState().endMediaPick(5000);
  }

  return anyDeleted;
}

/**
 * Check if the app has All Files Access permission (Android 11+ / Android 14)
 */
export async function hasAllFilesAccess(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  return await hasManageExternalStoragePermissionNative();
}

/**
 * Open Settings to request All Files Access permission
 */
export async function requestAllFilesAccess(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  useVaultStore.getState().startMediaPick();
  try {
    return await requestManageExternalStoragePermissionNative();
  } finally {
    useVaultStore.getState().endMediaPick(5000);
  }
}

/**
 * Request all required initial permissions for Media and Storage
 */
export async function requestInitialPermissions(): Promise<{
  mediaGranted: boolean;
  allFilesGranted: boolean;
}> {
  if (Platform.OS === 'web') {
    return { mediaGranted: true, allFilesGranted: true };
  }

  let mediaGranted = false;
  try {
    const res = await MediaLibrary.requestPermissionsAsync(true);
    mediaGranted = res.status === 'granted';
  } catch (err) {
    console.warn('requestPermissionsAsync error:', err);
  }

  let allFilesGranted = true;
  if (Platform.OS === 'android') {
    try {
      allFilesGranted = await hasManageExternalStoragePermissionNative();
    } catch {
      allFilesGranted = true;
    }
  }

  return { mediaGranted, allFilesGranted };
}

export interface AssetMatchCriteria {
  filename?: string | null;
  fileSize?: number | null;
  width?: number | null;
  height?: number | null;
  mediaType?: 'photo' | 'video';
}

/**
 * Search MediaLibrary to find an asset ID by filename, approximate dimensions, or size.
 */
export async function findAssetIdByFilename(
  filename: string,
  mediaType?: 'photo' | 'video'
): Promise<string | null> {
  return findMatchingAssetId({ filename, mediaType });
}

export async function findMatchingAssetId(
  criteria: AssetMatchCriteria
): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync(true);
    if (status !== 'granted') return null;

    const types: MediaLibrary.MediaTypeValue[] =
      criteria.mediaType === 'video' ? ['video'] : ['photo'];

    const res = await MediaLibrary.getAssetsAsync({
      first: 100,
      mediaType: types,
      sortBy: [MediaLibrary.SortBy.creationTime],
    });

    const cleanTarget = criteria.filename ? criteria.filename.toLowerCase().trim() : null;

    for (const item of res.assets) {
      const itemFilename = item.filename.toLowerCase().trim();

      // 1. Exact filename match
      if (cleanTarget && itemFilename === cleanTarget) {
        return item.id;
      }

      // 2. Partial filename match
      if (cleanTarget && (cleanTarget.includes(itemFilename) || itemFilename.includes(cleanTarget))) {
        return item.id;
      }

      // 3. Dimension match (if provided)
      if (
        criteria.width &&
        criteria.height &&
        item.width === criteria.width &&
        item.height === criteria.height
      ) {
        return item.id;
      }
    }
  } catch (err) {
    console.warn('findMatchingAssetId error:', err);
  }
  return null;
}

/**
 * Import a file from a source URI into the vault.
 *
 * IMPORTANT: Files are ALWAYS deleted from the gallery after import
 * regardless of the deleteOriginal flag value, because the vault is
 * a secure storage — having the original in the gallery defeats the purpose.
 *
 * @param sourceUri - The file URI to import (e.g. from image picker)
 * @param type - Category to file under (photos, videos, documents)
 * @param originalName - Original file name for display
 * @param mimeType - MIME type or extension string
 * @param deleteOriginal - Whether to delete the source from the gallery (ALWAYS true in practice)
 * @param assetId - Optional MediaLibrary asset ID for more reliable deletion
 * @returns The VaultFile entry created
 */
export async function importFile(
  sourceUri: string,
  type: VaultFileType,
  originalName: string,
  mimeType: string,
  deleteOriginal: boolean = true,
  assetId?: string | null
): Promise<VaultFile> {
  if (Platform.OS === 'web') {
    return { id: 'test', originalName: 'test', vaultPath: '', uri: '', mimeType: '', type, importedAt: Date.now(), sizeBytes: 0, isEncrypted: false };
  }
  await ensureVaultDirs();

  // Generate a random hash filename — strips any identifying info
  const hash = await randomHash();
  const ext = getExtension(originalName || sourceUri);
  // Encrypted vault files use .enc so external file managers & gallery scanners cannot open or identify them
  const fileName = `${hash}.enc`;
  const destPath = `${DIRS[type]}${fileName}`;

  let isEncrypted = false;
  try {
    const key = await getMasterKey();
    const ok = await encryptFileNative(sourceUri, destPath, key);
    if (ok) {
      isEncrypted = true;
    } else {
      await FileSystem.copyAsync({ from: sourceUri, to: destPath });
    }
  } catch (encErr) {
    console.warn('Native encryption failed, falling back to copy:', encErr);
    await FileSystem.copyAsync({ from: sourceUri, to: destPath });
  }

  // Get file info for size
  const fileInfo = await FileSystem.getInfoAsync(destPath);

  // Build the index entry
  const entry: VaultFile = {
    id: hash,
    originalName: originalName || `file${ext}`,
    vaultPath: destPath,
    uri: destPath,
    mimeType,
    type,
    importedAt: Date.now(),
    sizeBytes: (fileInfo as any).size || 0,
    isEncrypted,
  };

  // Update the index
  const index = await readIndex(type);
  index.unshift(entry); // newest first
  await writeIndex(type, index);

  return entry;
}

/**
 * List all files in a vault category.
 */
export async function listFiles(type: VaultFileType): Promise<VaultFile[]> {
  return readIndex(type);
}

/**
 * Delete a file from the vault permanently.
 */
export async function deleteFile(
  type: VaultFileType,
  fileId: string
): Promise<void> {
  if (Platform.OS === 'web') return;
  const index = await readIndex(type);
  const entry = index.find((f) => f.id === fileId);

  if (entry) {
    // Delete the actual file
    try {
      await FileSystem.deleteAsync(entry.vaultPath, { idempotent: true });
    } catch {
      // File may already be gone
    }

    // Update the index
    const updated = index.filter((f) => f.id !== fileId);
    await writeIndex(type, updated);
  }
}

/**
 * Export a file from the vault back to the device gallery (decrypting first if needed).
 */
export async function exportFile(
  type: VaultFileType,
  fileId: string
): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const index = await readIndex(type);
  const entry = index.find((f) => f.id === fileId);
  if (!entry) return false;

  try {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') return false;

    let exportSourcePath = entry.vaultPath;
    let tempDecryptedPath: string | null = null;

    if (entry.isEncrypted) {
      const key = await getMasterKey();
      tempDecryptedPath = await decryptToCacheNative(
        entry.vaultPath,
        key,
        entry.originalName
      );
      if (tempDecryptedPath) {
        exportSourcePath = tempDecryptedPath;
      }
    }

    try {
      if (type === 'photos' || type === 'videos') {
        await MediaLibrary.createAssetAsync(exportSourcePath);
        return true;
      }

      // For documents, copy to a shareable location
      const shareDir = `${FileSystem.cacheDirectory}export/`;
      const shareInfo = await FileSystem.getInfoAsync(shareDir);
      if (!shareInfo.exists) {
        await FileSystem.makeDirectoryAsync(shareDir, { intermediates: true });
      }
      await FileSystem.copyAsync({
        from: exportSourcePath,
        to: `${shareDir}${entry.originalName}`,
      });
      return true;
    } finally {
      if (tempDecryptedPath) {
        await deleteTempFileNative(tempDecryptedPath);
      }
    }
  } catch (err) {
    console.warn('exportFile error:', err);
    return false;
  }
}

/**
 * Get the count of files in each category.
 */
export async function getFileCounts(): Promise<
  Record<VaultFileType, number>
> {
  const [photos, videos, documents, apps] = await Promise.all([
    readIndex('photos'),
    readIndex('videos'),
    readIndex('documents'),
    readIndex('apps'),
  ]);
  return {
    photos: photos.length,
    videos: videos.length,
    documents: documents.length,
    apps: apps.length,
  };
}
