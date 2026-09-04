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
