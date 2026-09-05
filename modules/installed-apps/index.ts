import { requireNativeModule } from 'expo-modules-core';

export interface NativeInstalledApp {
  packageName: string;
  appName: string;
  isSystemApp: boolean;
  versionName: string;
  icon?: string | null;
}

export interface MediaDeleteItem {
  id?: string | null;
  assetId?: string | null;
  uri?: string | null;
  path?: string | null;
  filename?: string | null;
}

let InstalledAppsNative: any = null;

try {
  InstalledAppsNative = requireNativeModule('InstalledApps');
} catch {
  InstalledAppsNative = null;
}

export const isNativeModuleAvailable = !!InstalledAppsNative;

export async function hasManageExternalStoragePermissionNative(): Promise<boolean> {
  if (!InstalledAppsNative?.hasManageExternalStoragePermission) {
    return true;
  }
  return await InstalledAppsNative.hasManageExternalStoragePermission();
}

export async function checkMediaPermissionsNative(): Promise<boolean> {
  if (!InstalledAppsNative?.checkMediaPermissions) {
    return false;
  }
  return await InstalledAppsNative.checkMediaPermissions();
}

export async function canInstallApkNative(): Promise<boolean> {
  if (!InstalledAppsNative?.canInstallApk) {
    return true;
  }
  return await InstalledAppsNative.canInstallApk();
}

export async function openInstallPermissionSettingsNative(): Promise<boolean> {
  if (!InstalledAppsNative?.openInstallPermissionSettings) {
    return false;
  }
  return await InstalledAppsNative.openInstallPermissionSettings();
}

export async function requestManageExternalStoragePermissionNative(): Promise<boolean> {
  if (!InstalledAppsNative?.requestManageExternalStoragePermission) {
    return false;
  }
  return await InstalledAppsNative.requestManageExternalStoragePermission();
}

export async function deleteGalleryMediaNative(
  items: MediaDeleteItem[]
): Promise<boolean> {
  if (!InstalledAppsNative?.deleteGalleryMedia) {
    return false;
  }
  return await InstalledAppsNative.deleteGalleryMedia(items);
}

export async function getInstalledAppsNative(
  includeSystemApps: boolean = true
): Promise<NativeInstalledApp[]> {
  if (!InstalledAppsNative?.getInstalledApps) {
    return [];
  }
  return await InstalledAppsNative.getInstalledApps(includeSystemApps);
}

export async function launchAppNative(packageName: string): Promise<boolean> {
  if (!InstalledAppsNative?.launchApp) {
    return false;
  }
  return await InstalledAppsNative.launchApp(packageName);
}

export async function openAppSettingsNative(packageName: string = ''): Promise<boolean> {
  if (!InstalledAppsNative?.openAppSettings) {
    return false;
  }
  return await InstalledAppsNative.openAppSettings(packageName);
}

export async function isDeviceOwnerNative(): Promise<boolean> {
  if (!InstalledAppsNative?.isDeviceOwner) {
    return false;
  }
  return await InstalledAppsNative.isDeviceOwner();
}

export async function setAppHiddenNative(
  packageName: string,
  hidden: boolean
): Promise<boolean> {
  if (!InstalledAppsNative?.setAppHidden) {
    return false;
  }
  return await InstalledAppsNative.setAppHidden(packageName, hidden);
}

export async function isAppHiddenNative(packageName: string): Promise<boolean> {
  if (!InstalledAppsNative?.isAppHidden) {
    return false;
  }
  return await InstalledAppsNative.isAppHidden(packageName);
}

export async function hideAppViaShellNative(
  packageName: string,
  hide: boolean
): Promise<boolean> {
  if (!InstalledAppsNative?.hideAppViaShell) {
    return false;
  }
  return await InstalledAppsNative.hideAppViaShell(packageName, hide);
}

export async function openOemHideSettingsNative(
  brandOverride: string = ''
): Promise<boolean> {
  if (!InstalledAppsNative?.openOemHideSettings) {
    return false;
  }
  return await InstalledAppsNative.openOemHideSettings(brandOverride);
}

export async function extractAppApkNative(
  packageName: string,
  destPath: string
): Promise<boolean> {
  if (!InstalledAppsNative?.extractAppApk) {
    return false;
  }
  return await InstalledAppsNative.extractAppApk(packageName, destPath);
}

export async function requestUninstallAppNative(
  packageName: string
): Promise<boolean> {
  if (!InstalledAppsNative?.requestUninstallApp) {
    return false;
  }
  return await InstalledAppsNative.requestUninstallApp(packageName);
}

export async function getDeviceOwnerCommandNative(): Promise<string> {
  if (!InstalledAppsNative?.getDeviceOwnerCommand) {
    return 'adb shell dpm set-device-owner com.calculator.app/expo.modules.installedapps.CalculatorDeviceAdminReceiver';
  }
  return await InstalledAppsNative.getDeviceOwnerCommand();
}

export async function getDeviceManufacturerNative(): Promise<string> {
  if (!InstalledAppsNative?.getDeviceManufacturer) {
    return 'Android';
  }
  return await InstalledAppsNative.getDeviceManufacturer();
}

export async function isAppInstalledNative(packageName: string): Promise<boolean> {
  if (!InstalledAppsNative?.isAppInstalled) {
    return false;
  }
  return await InstalledAppsNative.isAppInstalled(packageName);
}

export async function installApkNative(apkPath: string): Promise<boolean> {
  if (!InstalledAppsNative?.installApk) {
    return false;
  }
  return await InstalledAppsNative.installApk(apkPath);
}

export async function encryptFileNative(
  srcPath: string,
  destPath: string,
  keyHex: string
): Promise<boolean> {
  if (!InstalledAppsNative?.encryptFile) {
    return false;
  }
  return await InstalledAppsNative.encryptFile(srcPath, destPath, keyHex);
}

export async function decryptFileNative(
  encPath: string,
  destPath: string,
  keyHex: string
): Promise<boolean> {
  if (!InstalledAppsNative?.decryptFile) {
    return false;
  }
  return await InstalledAppsNative.decryptFile(encPath, destPath, keyHex);
}

export async function decryptImageToBase64Native(
  encPath: string,
  keyHex: string,
  mimeType?: string
): Promise<string | null> {
  if (!InstalledAppsNative?.decryptImageToBase64) {
    return null;
  }
  return await InstalledAppsNative.decryptImageToBase64(encPath, keyHex, mimeType || 'image/jpeg');
}

export async function decryptToCacheNative(
  encPath: string,
  keyHex: string,
  tempFileName: string
): Promise<string | null> {
  if (!InstalledAppsNative?.decryptToCache) {
    return null;
  }
  return await InstalledAppsNative.decryptToCache(encPath, keyHex, tempFileName);
}

export async function deleteTempFileNative(filePath: string): Promise<boolean> {
  if (!InstalledAppsNative?.deleteTempFile) {
    return false;
  }
  return await InstalledAppsNative.deleteTempFile(filePath);
}

export async function clearVolatileCacheNative(): Promise<boolean> {
  if (!InstalledAppsNative?.clearVolatileCache) {
    return false;
  }
  return await InstalledAppsNative.clearVolatileCache();
}

export async function openXiaomiSecurityCenterNative(): Promise<boolean> {
  if (!InstalledAppsNative?.openXiaomiSecurityCenter) {
    return false;
  }
  return await InstalledAppsNative.openXiaomiSecurityCenter();
}

export async function openXiaomiHiddenAppsSettingsNative(): Promise<boolean> {
  if (!InstalledAppsNative?.openXiaomiHiddenAppsSettings) {
    return false;
  }
  return await InstalledAppsNative.openXiaomiHiddenAppsSettings();
}
