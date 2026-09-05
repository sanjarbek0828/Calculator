/**
 * vaultAppsService.ts — Service for discovering, hiding, and launching apps inside Calculator Vault
 *
 * Supports:
 * - Native Android query of all installed applications via PackageManager (APK build)
 * - Launching apps directly from inside Calculator via Android Intent
 * - Hiding apps from Android launcher & search using Device Policy Manager (dpm.setApplicationHidden)
 * - Fallback hide via Shell (pm hide / pm disable-user)
 * - 1-tap deep links to OEM Hide Apps settings (Samsung, Xiaomi, Oppo, Vivo)
 * - Extracting APK to vault and prompting to uninstall from phone
 * - Persistent hidden apps registry stored in vault sandbox
 */

import { Platform, Linking } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import {
  getInstalledAppsNative,
  launchAppNative,
  openAppSettingsNative,
  isDeviceOwnerNative,
  setAppHiddenNative,
  hideAppViaShellNative,
  openOemHideSettingsNative,
  extractAppApkNative,
  requestUninstallAppNative,
  getDeviceOwnerCommandNative,
  getDeviceManufacturerNative,
  isNativeModuleAvailable,
} from '../../modules/installed-apps';

export interface AppInfo {
  packageName: string;
  appName: string;
  isSystemApp: boolean;
  versionName?: string;
  icon?: string | null;
  category?: string;
}

export interface VaultApp extends AppInfo {
  hiddenAt: number;
  lastLaunchedAt?: number | null;
  isPinLocked: boolean;
  isSystemHidden?: boolean;
  apkPath?: string | null;
}

const VAULT_APPS_FILE = `${FileSystem.documentDirectory}vault/apps_hidden.json`;
const VAULT_APK_DIR = `${FileSystem.documentDirectory}vault/apps/`;

// Cache in memory for lightning fast navigation
let cachedVaultApps: VaultApp[] | null = null;

/**
 * Fallback catalogue for testing or when running in Expo Go
 */
const DEFAULT_CATALOGUE: AppInfo[] = [
  { packageName: 'org.telegram.messenger', appName: 'Telegram', isSystemApp: false, category: 'Messengers' },
  { packageName: 'com.whatsapp', appName: 'WhatsApp', isSystemApp: false, category: 'Messengers' },
  { packageName: 'com.instagram.android', appName: 'Instagram', isSystemApp: false, category: 'Social' },
  { packageName: 'com.zhiliaoapp.musically', appName: 'TikTok', isSystemApp: false, category: 'Social' },
  { packageName: 'com.google.android.youtube', appName: 'YouTube', isSystemApp: true, category: 'Media' },
  { packageName: 'com.android.chrome', appName: 'Chrome', isSystemApp: true, category: 'Browser' },
  { packageName: 'com.facebook.katana', appName: 'Facebook', isSystemApp: false, category: 'Social' },
  { packageName: 'com.twitter.android', appName: 'X (Twitter)', isSystemApp: false, category: 'Social' },
  { packageName: 'com.spotify.music', appName: 'Spotify', isSystemApp: false, category: 'Music' },
  { packageName: 'com.netflix.mediaclient', appName: 'Netflix', isSystemApp: false, category: 'Media' },
  { packageName: 'com.tencent.ig', appName: 'PUBG Mobile', isSystemApp: false, category: 'Games' },
  { packageName: 'com.kiloo.subwaysurf', appName: 'Subway Surfers', isSystemApp: false, category: 'Games' },
  { packageName: 'uz.click.clickuz', appName: 'Click Up', isSystemApp: false, category: 'Finance' },
  { packageName: 'uz.dida.payme', appName: 'Payme', isSystemApp: false, category: 'Finance' },
  { packageName: 'com.google.android.gm', appName: 'Gmail', isSystemApp: true, category: 'Tools' },
  { packageName: 'com.google.android.apps.photos', appName: 'Google Photos', isSystemApp: true, category: 'Photos' },
  { packageName: 'com.sec.android.app.camera', appName: 'Camera', isSystemApp: true, category: 'Tools' },
  { packageName: 'com.android.settings', appName: 'Settings', isSystemApp: true, category: 'System' },
];

/**
 * Get all installed apps on the device.
 * In Android APK, queries real PackageManager with icons.
 * In Expo Go / Web, returns default catalog.
 */
export async function getInstalledApps(): Promise<AppInfo[]> {
  if (Platform.OS === 'android' && isNativeModuleAvailable) {
    try {
      const nativeApps = await getInstalledAppsNative(true);
      if (nativeApps && nativeApps.length > 0) {
        return nativeApps.map((a) => ({
          packageName: a.packageName,
          appName: a.appName,
          isSystemApp: a.isSystemApp,
          versionName: a.versionName,
          icon: a.icon || null,
        }));
      }
    } catch (err) {
      console.warn('Native installed apps query failed, using catalogue:', err);
    }
  }

  return DEFAULT_CATALOGUE;
}

/**
 * Read the list of hidden apps saved in Calculator Vault.
 */
export async function getHiddenApps(): Promise<VaultApp[]> {
  if (cachedVaultApps !== null) return cachedVaultApps;

  if (Platform.OS === 'web') {
    cachedVaultApps = [];
    return [];
  }

  try {
    const info = await FileSystem.getInfoAsync(VAULT_APPS_FILE);
    if (!info.exists) {
      cachedVaultApps = [];
      return [];
    }
    const content = await FileSystem.readAsStringAsync(VAULT_APPS_FILE);
    const list = JSON.parse(content) as VaultApp[];
    cachedVaultApps = Array.isArray(list) ? list : [];
    return cachedVaultApps;
  } catch {
    cachedVaultApps = [];
    return [];
  }
}

/**
 * Save the hidden apps list to vault storage.
 */
async function saveHiddenApps(apps: VaultApp[]): Promise<void> {
  cachedVaultApps = apps;
  if (Platform.OS === 'web') return;

  try {
    await FileSystem.writeAsStringAsync(VAULT_APPS_FILE, JSON.stringify(apps, null, 2));
  } catch (err) {
    console.warn('Failed to write hidden apps index:', err);
  }
}

/**
 * Add one or more installed apps to Calculator Vault.
 */
export async function addAppsToVault(newApps: AppInfo[]): Promise<void> {
  const current = await getHiddenApps();
  const existingPackages = new Set(current.map((a) => a.packageName));

  const toAdd: VaultApp[] = newApps
    .filter((a) => !existingPackages.has(a.packageName))
    .map((a) => ({
      ...a,
      hiddenAt: Date.now(),
      lastLaunchedAt: null,
      isPinLocked: false,
      isSystemHidden: false,
      apkPath: null,
    }));

  const updated = [...toAdd, ...current];
  await saveHiddenApps(updated);
}

/**
 * Remove an app from Calculator Vault. Also unhides it from the system if previously hidden.
 */
export async function removeAppFromVault(packageName: string): Promise<void> {
  const current = await getHiddenApps();
  const app = current.find((a) => a.packageName === packageName);
  if (app?.isSystemHidden) {
    await unhideAppFromSystem(packageName);
  }

  const updated = current.filter((a) => a.packageName !== packageName);
  await saveHiddenApps(updated);
}

/**
 * Toggle extra PIN protection for an app inside the vault.
 */
export async function toggleAppLock(packageName: string): Promise<boolean> {
  const current = await getHiddenApps();
  const app = current.find((a) => a.packageName === packageName);
  if (!app) return false;

  app.isPinLocked = !app.isPinLocked;
  await saveHiddenApps([...current]);
  return app.isPinLocked;
}

/**
 * Check if the Calculator has Device Owner / Profile Owner status
 * which allows natively hiding apps from launcher and search.
 */
export async function checkIsDeviceOwner(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  return await isDeviceOwnerNative();
}

/**
 * Completely hide an application from Android launcher and search.
 * Tries:
 * 1. Device Policy Manager (official Android system hide)
 * 2. Shell / Root / Shizuku
 */
export async function hideAppFromSystem(packageName: string): Promise<{ success: boolean; method: string }> {
  if (Platform.OS !== 'android') return { success: false, method: 'unsupported' };

  // 1. Try Device Policy Manager
  const dpmSuccess = await setAppHiddenNative(packageName, true);
  if (dpmSuccess) {
    await markAppSystemHidden(packageName, true);
    return { success: true, method: 'device_owner' };
  }

  // 2. Try Shell / Root / Shizuku
  const shellSuccess = await hideAppViaShellNative(packageName, true);
  if (shellSuccess) {
    await markAppSystemHidden(packageName, true);
    return { success: true, method: 'shell_root' };
  }

  return { success: false, method: 'needs_permission' };
}

/**
 * Unhide an application to make it visible on Android launcher and search again.
 */
export async function unhideAppFromSystem(packageName: string): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  const dpmSuccess = await setAppHiddenNative(packageName, false);
  const shellSuccess = await hideAppViaShellNative(packageName, false);

  const success = dpmSuccess || shellSuccess;
  await markAppSystemHidden(packageName, false);
  return success;
}

async function markAppSystemHidden(packageName: string, isHidden: boolean): Promise<void> {
  const current = await getHiddenApps();
  const app = current.find((a) => a.packageName === packageName);
  if (app) {
    app.isSystemHidden = isHidden;
    await saveHiddenApps([...current]);
  }
}

/**
 * Open OEM-specific Hide Apps settings screen (Samsung, Xiaomi, Oppo, Vivo, etc.)
 */
export async function openOemHideSettings(brandOverride?: string): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  return await openOemHideSettingsNative(brandOverride || '');
}

/**
 * Back up the app's APK into Calculator Vault, then prompt user to uninstall
 * the original from the phone so it completely disappears from launcher and search.
 */
export async function backupAppApkAndUninstall(packageName: string, appName: string): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  const apkDest = `${VAULT_APK_DIR}${packageName}.apk`;
  const extracted = await extractAppApkNative(packageName, apkDest);

  if (extracted) {
    const current = await getHiddenApps();
    const app = current.find((a) => a.packageName === packageName);
    if (app) {
      app.apkPath = apkDest;
      await saveHiddenApps([...current]);
    }
  }

  return await requestUninstallAppNative(packageName);
}

/**
 * Get the exact ADB command to grant Device Owner permission
 */
export async function getDeviceOwnerCommand(): Promise<string> {
  return await getDeviceOwnerCommandNative();
}

/**
 * Get device manufacturer brand
 */
export async function getDeviceManufacturer(): Promise<string> {
  if (Platform.OS !== 'android') return 'Android';
  return await getDeviceManufacturerNative();
}

/**
 * Launch an app directly from Calculator Vault.
 */
export async function launchApp(packageName: string): Promise<boolean> {
  // Update lastLaunchedAt
  const current = await getHiddenApps();
  const app = current.find((a) => a.packageName === packageName);
  if (app) {
    app.lastLaunchedAt = Date.now();
    saveHiddenApps([...current]);
  }

  // 1. Try native Intent launch (Android APK)
  if (Platform.OS === 'android' && isNativeModuleAvailable) {
    try {
      const launched = await launchAppNative(packageName);
      if (launched) return true;
    } catch (e) {
      console.warn('Native launch failed:', e);
    }
  }

  // 2. Try common URL schemes
  const SCHEMES: Record<string, string> = {
    'org.telegram.messenger': 'tg://',
    'com.whatsapp': 'whatsapp://',
    'com.instagram.android': 'instagram://',
    'com.google.android.youtube': 'vnd.youtube://',
    'com.twitter.android': 'twitter://',
    'com.facebook.katana': 'fb://',
    'com.spotify.music': 'spotify://',
  };

  const scheme = SCHEMES[packageName];
  if (scheme) {
    const canOpen = await Linking.canOpenURL(scheme);
    if (canOpen) {
      await Linking.openURL(scheme);
      return true;
    }
  }

  // 3. Fallback Android Intent URL scheme
  if (Platform.OS === 'android') {
    try {
      const intentUrl = `intent:#Intent;package=${packageName};end`;
      await Linking.openURL(intentUrl);
      return true;
    } catch {
      // Ignore
    }
  }

  return false;
}

/**
 * Open the app's system App Info page (where user can Disable or turn off notifications).
 */
export async function openAppInfo(packageName: string): Promise<void> {
  if (Platform.OS === 'android' && isNativeModuleAvailable) {
    try {
      const opened = await openAppSettingsNative(packageName);
      if (opened) return;
    } catch {
      // Fallback
    }
  }

  // Fallback to general settings
  Linking.openSettings();
}
