package expo.modules.installedapps

import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.net.Uri
import android.provider.Settings
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream

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
