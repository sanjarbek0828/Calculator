import { requireNativeModule } from 'expo-modules-core';

export interface NativeInstalledApp {
  packageName: string;
  appName: string;
  isSystemApp: boolean;
  versionName: string;
  icon?: string | null;
}

let InstalledAppsNative: any = null;

try {
  InstalledAppsNative = requireNativeModule('InstalledApps');
} catch {
  InstalledAppsNative = null;
}

export const isNativeModuleAvailable = !!InstalledAppsNative;

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

export async function openAppSettingsNative(packageName: string): Promise<boolean> {
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
