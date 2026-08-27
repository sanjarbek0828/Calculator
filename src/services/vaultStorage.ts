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
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';

// ── Types ───────────────────────────────────────────────────────────

export type VaultFileType = 'photos' | 'videos' | 'documents';

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
};
const INDEX_SUFFIX = '_index.json';

// ── Initialization ──────────────────────────────────────────────────

/**
 * Ensure the vault directory structure exists.
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
 * Import a file from a source URI into the vault.
 *
 * @param sourceUri - The file URI to import (e.g. from image picker)
 * @param type - Category to file under (photos, videos, documents)
 * @param originalName - Original file name for display
 * @param mimeType - MIME type or extension string
 * @param deleteOriginal - Whether to delete the source from the gallery
 * @returns The VaultFile entry created
 */
export async function importFile(
  sourceUri: string,
  type: VaultFileType,
  originalName: string,
  mimeType: string,
  deleteOriginal: boolean = false,
  assetId?: string | null
): Promise<VaultFile> {
  if (Platform.OS === 'web') {
    return { id: 'test', originalName: 'test', vaultPath: '', uri: '', mimeType: '', type, importedAt: Date.now(), sizeBytes: 0 };
  }
  await ensureVaultDirs();

  // Generate a random hash filename
  const hash = await randomHash();
  const ext = getExtension(originalName || sourceUri);
  const fileName = `${hash}${ext}`;
  const destPath = `${DIRS[type]}${fileName}`;

  // Copy the file into the vault
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

  // Optionally delete the original from the device gallery
  if (deleteOriginal && (type === 'photos' || type === 'videos')) {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status === 'granted' && assetId) {
        // Delete the original asset using its ID
        await MediaLibrary.deleteAssetsAsync([assetId]);
      }
    } catch {
      // Silently fail — the file is already safely in the vault
    }
  }

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
  const [photos, videos, documents] = await Promise.all([
    readIndex('photos'),
    readIndex('videos'),
    readIndex('documents'),
  ]);
  return {
    photos: photos.length,
    videos: videos.length,
    documents: documents.length,
  };
}
