package expo.modules.installedapps

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.io.File

class InstalledAppsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("InstalledApps")

    AsyncFunction("getInstalledApps") { includeSystemApps: Boolean ->
      val context = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any?>>()
      val pm = context.packageManager
      val mainIntent = Intent(Intent.ACTION_MAIN, null).apply {
        addCategory(Intent.CATEGORY_LAUNCHER)
      }

      val activities = pm.queryIntentActivities(mainIntent, 0)
      val appList = mutableListOf<Map<String, Any?>>()
      val seenPackages = mutableSetOf<String>()

      for (resolveInfo in activities) {
        val packageName = resolveInfo.activityInfo.packageName
        if (packageName == context.packageName || seenPackages.contains(packageName)) {
          continue
        }
        seenPackages.add(packageName)

        val appInfo = resolveInfo.activityInfo.applicationInfo
        val isSystem = (appInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0
        if (!includeSystemApps && isSystem) {
          continue
        }

        val appName = resolveInfo.loadLabel(pm)?.toString() ?: packageName
        val versionName = try {
          val pInfo = pm.getPackageInfo(packageName, 0)
          pInfo.versionName ?: ""
        } catch (e: Exception) {
          ""
        }

        // Get icon as base64 PNG
        val iconBase64 = try {
          val drawable = resolveInfo.loadIcon(pm)
          drawableToBase64(drawable)
        } catch (e: Exception) {
          null
        }

        val appMap = mapOf(
          "packageName" to packageName,
          "appName" to appName,
          "isSystemApp" to isSystem,
          "versionName" to versionName,
          "icon" to iconBase64
        )
        appList.add(appMap)
      }

      appList.sortedBy { (it["appName"] as? String)?.lowercase() ?: "" }
    }

    AsyncFunction("launchApp") { packageName: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      val pm = context.packageManager
      val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager
      val admin = ComponentName(context, CalculatorDeviceAdminReceiver::class.java)

      // If app was hidden by DPM, ensure it is unhidden so it can be launched
      if (dpm != null && (dpm.isDeviceOwnerApp(context.packageName) || dpm.isProfileOwnerApp(context.packageName))) {
        try {
          if (dpm.isApplicationHidden(admin, packageName)) {
            dpm.setApplicationHidden(admin, packageName, false)
          }
        } catch (e: Exception) {
          // ignore
        }
      }

      val launchIntent = pm.getLaunchIntentForPackage(packageName) ?: return@AsyncFunction false
      launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(launchIntent)
      return@AsyncFunction true
    }

    AsyncFunction("openAppSettings") { packageName: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
        data = Uri.fromParts("package", packageName, null)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(intent)
      return@AsyncFunction true
    }

    AsyncFunction("isDeviceOwner") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager ?: return@AsyncFunction false
      return@AsyncFunction dpm.isDeviceOwnerApp(context.packageName) || dpm.isProfileOwnerApp(context.packageName)
    }

    AsyncFunction("setAppHidden") { packageName: String, hidden: Boolean ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager ?: return@AsyncFunction false
      val admin = ComponentName(context, CalculatorDeviceAdminReceiver::class.java)

      if (dpm.isDeviceOwnerApp(context.packageName) || dpm.isProfileOwnerApp(context.packageName)) {
        try {
          val success = dpm.setApplicationHidden(admin, packageName, hidden)
          return@AsyncFunction success
        } catch (e: Exception) {
          e.printStackTrace()
        }
      }
      return@AsyncFunction false
    }

    AsyncFunction("isAppHidden") { packageName: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager ?: return@AsyncFunction false
      val admin = ComponentName(context, CalculatorDeviceAdminReceiver::class.java)

      if (dpm.isDeviceOwnerApp(context.packageName) || dpm.isProfileOwnerApp(context.packageName)) {
        try {
          return@AsyncFunction dpm.isApplicationHidden(admin, packageName)
        } catch (e: Exception) {
          e.printStackTrace()
        }
      }
      return@AsyncFunction false
    }

    AsyncFunction("hideAppViaShell") { packageName: String, hide: Boolean ->
      val command = if (hide) {
        "pm disable-user --user 0 $packageName || pm hide $packageName"
      } else {
        "pm enable $packageName || pm unhide $packageName"
      }
      try {
        val process = Runtime.getRuntime().exec(arrayOf("su", "-c", command))
        val exitCode = process.waitFor()
        return@AsyncFunction (exitCode == 0)
      } catch (e: Exception) {
        return@AsyncFunction false
      }
    }

    AsyncFunction("openOemHideSettings") { brandOverride: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      val brand = (if (brandOverride.isNotBlank()) brandOverride else Build.MANUFACTURER).lowercase()
      val intents = mutableListOf<Intent>()

      when {
        brand.contains("samsung") -> {
          // Samsung Home & Apps hide settings
          intents.add(Intent("com.sec.android.app.launcher.action.SETTINGS"))
        }
        brand.contains("xiaomi") || brand.contains("redmi") || brand.contains("poco") -> {
          // Xiaomi Security Center - Hide App list activity
          intents.add(Intent().setComponent(ComponentName("com.miui.securitycenter", "com.miui.applock.ui.HideAppListActivity")))
          intents.add(Intent().setComponent(ComponentName("com.miui.securitycenter", "com.miui.applock.ui.AppLockSettingsActivity")))
          intents.add(Intent("miui.intent.action.APP_LOCK_MANAGEMENT"))
        }
        brand.contains("oppo") || brand.contains("realme") || brand.contains("oneplus") -> {
          // Oppo / Realme privacy settings (contains Hide Apps)
          intents.add(Intent().setComponent(ComponentName("com.coloros.safecenter", "com.coloros.safecenter.privacy.view.PrivacySettingsActivity")))
          intents.add(Intent().setComponent(ComponentName("com.coloros.safecenter", "com.coloros.safecenter.privacy.view.AppHideSettingActivity")))
        }
        brand.contains("vivo") || brand.contains("iqoo") -> {
          // Vivo iQOO secure hide app activity
          intents.add(Intent().setComponent(ComponentName("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.HideAppActivity")))
        }
        brand.contains("huawei") || brand.contains("honor") -> {
          intents.add(Intent().setComponent(ComponentName("com.huawei.systemmanager", "com.huawei.applock.ui.AppLockMainActivity")))
        }
      }

      // Fallbacks
      intents.add(Intent(Settings.ACTION_MANAGE_APPLICATIONS_SETTINGS))
      intents.add(Intent(Settings.ACTION_SETTINGS))

      for (intent in intents) {
        try {
          intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          context.startActivity(intent)
          return@AsyncFunction true
        } catch (e: Exception) {
          // try next intent
        }
      }
      return@AsyncFunction false
    }

    AsyncFunction("extractAppApk") { packageName: String, destPath: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      val pm = context.packageManager
      try {
        val appInfo = pm.getApplicationInfo(packageName, 0)
        val sourceApk = File(appInfo.sourceDir)
        if (!sourceApk.exists()) return@AsyncFunction false

        val cleanDest = destPath.removePrefix("file://")
        val destFile = File(cleanDest)
        destFile.parentFile?.mkdirs()
        sourceApk.copyTo(destFile, overwrite = true)
        return@AsyncFunction true
      } catch (e: Exception) {
        e.printStackTrace()
        return@AsyncFunction false
      }
    }

    AsyncFunction("requestUninstallApp") { packageName: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      try {
        val intent = Intent(Intent.ACTION_DELETE).apply {
          data = Uri.parse("package:$packageName")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
        return@AsyncFunction true
      } catch (e: Exception) {
        return@AsyncFunction false
      }
    }

    AsyncFunction("getDeviceOwnerCommand") {
      val context = appContext.reactContext ?: return@AsyncFunction ""
      return@AsyncFunction "adb shell dpm set-device-owner " + context.packageName + "/expo.modules.installedapps.CalculatorDeviceAdminReceiver"
    }

    AsyncFunction("getDeviceManufacturer") {
      return@AsyncFunction Build.MANUFACTURER ?: "Android"
    }
  }

  private fun drawableToBase64(drawable: Drawable): String {
    val bitmap = when (drawable) {
      is BitmapDrawable -> drawable.bitmap
      else -> {
        val width = if (drawable.intrinsicWidth > 0) Math.min(drawable.intrinsicWidth, 128) else 96
        val height = if (drawable.intrinsicHeight > 0) Math.min(drawable.intrinsicHeight, 128) else 96
        val bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        drawable.setBounds(0, 0, canvas.width, canvas.height)
        drawable.draw(canvas)
        bmp
      }
    }
    val scaledBitmap = if (bitmap.width > 96 || bitmap.height > 96) {
      Bitmap.createScaledBitmap(bitmap, 96, 96, true)
    } else {
      bitmap
    }
    val outputStream = ByteArrayOutputStream()
    scaledBitmap.compress(Bitmap.CompressFormat.PNG, 85, outputStream)
    val byteArray = outputStream.toByteArray()
    return "data:image/png;base64," + Base64.encodeToString(byteArray, Base64.NO_WRAP)
  }
}
