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
import { Platform } from 'react-native';
import { useVaultStore } from '../store/vaultStore';

// ── Types ───────────────────────────────────────────────────────────

export type VaultFileType = 'photos' | 'videos' | 'documents' | 'apps';

export interface VaultFile {
  /** Unique ID (random hash) */
  id: string;
  /** Original file name for display */
  originalName: string;
  /** Path inside the vault directory */
  vaultPath: string;
  /** URI for rendering (file:// prefixed) */
  uri: string;
  /** MIME type or file extension */
  mimeType: string;
  /** Category */
  type: VaultFileType;
  /** When the file was imported */
  importedAt: number;
  /** File size in bytes */
  sizeBytes: number;
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
 * Get the file extension from a filename or URI.
 */
function getExtension(nameOrUri: string): string {
  const parts = nameOrUri.split('.');
  if (parts.length < 2) return '';
  return `.${parts[parts.length - 1].toLowerCase().split('?')[0]}`;
}

/**
 * Aggressively delete the original media files from the device gallery.
 *
 * Strategy:
 * 1. Suspend auto-lock so Android delete confirmation dialog doesn't trigger app lock!
 * 2. Request FULL write permission
 * 3. Delete by assetId via MediaLibrary (standard Android Scoped Storage & iOS)
 * 4. Fallback to direct FileSystem delete if direct file:// path is known
 *
 * @param assetIds - The MediaLibrary asset IDs to delete
 * @param fallbackUris - Optional array of file/content URIs for fallback deletion
 * @returns boolean indicating if deletion was completed
 */
export async function deleteOriginalsFromGallery(
  assetIds: string[],
  fallbackUris?: string[]
): Promise<boolean> {
  const validIds = (assetIds || []).filter((id): id is string => Boolean(id && typeof id === 'string' && id.trim().length > 0));
  const validUris = (fallbackUris || []).filter((uri): uri is string => Boolean(uri && typeof uri === 'string' && uri.trim().length > 0));

  if (validIds.length === 0 && validUris.length === 0) return false;
  if (Platform.OS === 'web') return false;

  // Crucial: keep auto-lock suspended while the system delete confirmation dialog is showing on Android
  useVaultStore.getState().suspendAutoLock(120000);

  let anyDeleted = false;

  try {
    // 1. Delete via MediaLibrary if we have asset IDs
    if (validIds.length > 0) {
      const { status } = await MediaLibrary.requestPermissionsAsync(true);
      if (status === 'granted') {
        try {
          const success = await MediaLibrary.deleteAssetsAsync(validIds);
          if (success) anyDeleted = true;
        } catch (deleteError: any) {
          console.warn('deleteAssetsAsync error:', deleteError?.message ?? deleteError);
        }
      }
    }

    // 2. Fallback: try direct FileSystem delete if external file URI exists
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
  }

  return anyDeleted;
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
    return { id: 'test', originalName: 'test', vaultPath: '', uri: '', mimeType: '', type, importedAt: Date.now(), sizeBytes: 0 };
  }
  await ensureVaultDirs();

  // Generate a random hash filename — strips any identifying info
  const hash = await randomHash();
  const ext = getExtension(originalName || sourceUri);
  const fileName = `${hash}${ext}`;
  const destPath = `${DIRS[type]}${fileName}`;

  // Copy the file into the vault's private sandbox
  await FileSystem.copyAsync({ from: sourceUri, to: destPath });

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
  };

  // Update the index
  const index = await readIndex(type);
  index.unshift(entry); // newest first
  await writeIndex(type, index);

  // We no longer trigger deletion here.
  // The caller (UI) should collect all imported asset IDs and delete them in bulk
  // using deleteOriginalsFromGallery() so we only get one permission prompt.

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
 * Export a file from the vault back to the device gallery.
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

    if (type === 'photos' || type === 'videos') {
      await MediaLibrary.createAssetAsync(entry.vaultPath);
      return true;
    }

    // For documents, copy to a shareable location
    const shareDir = `${FileSystem.cacheDirectory}export/`;
    const shareInfo = await FileSystem.getInfoAsync(shareDir);
    if (!shareInfo.exists) {
      await FileSystem.makeDirectoryAsync(shareDir, { intermediates: true });
    }
    await FileSystem.copyAsync({
      from: entry.vaultPath,
      to: `${shareDir}${entry.originalName}`,
    });
    return true;
  } catch {
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
