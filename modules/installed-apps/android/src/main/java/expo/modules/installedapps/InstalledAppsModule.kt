package expo.modules.installedapps

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.ContentResolver
import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.provider.Settings
import android.util.Base64
import androidx.core.content.FileProvider
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.CipherInputStream
import javax.crypto.CipherOutputStream
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.SecretKeySpec

class InstalledAppsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("InstalledApps")

    /**
     * Check if MANAGE_EXTERNAL_STORAGE (All Files Access) is granted on Android 11+ (API 30+)
     */
    AsyncFunction("hasManageExternalStoragePermission") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        return@AsyncFunction Environment.isExternalStorageManager()
      }
      return@AsyncFunction true
    }

    /**
     * Launch the system Settings screen for MANAGE_APP_ALL_FILES_ACCESS_PERMISSION
     */
    AsyncFunction("requestManageExternalStoragePermission") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        try {
          val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION).apply {
            data = Uri.parse("package:${context.packageName}")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
          context.startActivity(intent)
          return@AsyncFunction true
        } catch (e: Exception) {
          try {
            val intent = Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION).apply {
              addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            return@AsyncFunction true
          } catch (e2: Exception) {
            return@AsyncFunction false
          }
        }
      }
      return@AsyncFunction true
    }

    /**
     * Aggressively and reliably delete original media files from device Gallery (MediaStore + Disk)
     * Specifically tuned for Android 14 (API 34) & Scoped Storage
     */
    AsyncFunction("deleteGalleryMedia") { items: List<Map<String, Any?>> ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      val cr = context.contentResolver
      val deletedCount = mutableListOf<String>()
      val scannedPaths = mutableListOf<String>()

      for (item in items) {
        val assetId = (item["id"] as? String) ?: (item["assetId"] as? String)
        val uriStr = item["uri"] as? String
        val rawPath = item["path"] as? String
        val filename = item["filename"] as? String

        var resolvedFilePath: String? = rawPath?.removePrefix("file://")
        var targetContentUri: Uri? = null

        // 1. Resolve from assetId via MediaStore content URIs
        if (!assetId.isNullOrBlank()) {
          val idLong = assetId.toLongOrNull()
          if (idLong != null) {
            val imageUri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, idLong)
            val videoUri = ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, idLong)

            val pathFromImage = getPathFromContentUri(cr, imageUri)
            if (pathFromImage != null) {
              resolvedFilePath = pathFromImage
              targetContentUri = imageUri
            } else {
              val pathFromVideo = getPathFromContentUri(cr, videoUri)
              if (pathFromVideo != null) {
                resolvedFilePath = pathFromVideo
                targetContentUri = videoUri
              }
            }
          }
        }

        // 2. Resolve from URI string if not yet found
        if (targetContentUri == null && !uriStr.isNullOrBlank()) {
          if (uriStr.startsWith("content://")) {
            val parsedUri = Uri.parse(uriStr)
            targetContentUri = parsedUri
            if (resolvedFilePath.isNullOrBlank()) {
              resolvedFilePath = getPathFromContentUri(cr, parsedUri)
            }
          } else if (uriStr.startsWith("file://") || uriStr.startsWith("/")) {
            resolvedFilePath = uriStr.removePrefix("file://")
          }
        }

        // 3. Fallback resolution via filename query in MediaStore
        if (resolvedFilePath.isNullOrBlank() && !filename.isNullOrBlank()) {
          val pair = queryMediaByFilename(cr, filename)
          if (pair != null) {
            resolvedFilePath = pair.first
            if (targetContentUri == null) {
              targetContentUri = pair.second
            }
          }
        }

        var deletedSuccess = false

        // 4. Physical file deletion on disk (succeeds with MANAGE_EXTERNAL_STORAGE)
        if (!resolvedFilePath.isNullOrBlank()) {
          try {
            val file = File(resolvedFilePath)
            if (file.exists()) {
              val ok = file.delete()
              if (ok) {
                deletedSuccess = true
                scannedPaths.add(resolvedFilePath)
              }
            }
          } catch (e: Exception) {
            // continue to content resolver deletion
          }
        }

        // 5. MediaStore ContentResolver deletion
        if (targetContentUri != null) {
          try {
            val rows = cr.delete(targetContentUri, null, null)
            if (rows > 0) {
              deletedSuccess = true
            }
          } catch (e: Exception) {
            // ignore
          }
        }

        // 6. Direct query-based delete in MediaStore by _ID if available
        if (!assetId.isNullOrBlank()) {
          try {
            val rowsImg = cr.delete(
              MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
              "${MediaStore.MediaColumns._ID} = ?",
              arrayOf(assetId)
            )
            val rowsVid = cr.delete(
              MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
              "${MediaStore.MediaColumns._ID} = ?",
              arrayOf(assetId)
            )
            if (rowsImg > 0 || rowsVid > 0) {
              deletedSuccess = true
            }
          } catch (e: Exception) {
            // ignore
          }
        }

        if (deletedSuccess) {
          deletedCount.add(assetId ?: uriStr ?: resolvedFilePath ?: "item")
        }
      }

      // 7. Force MediaScanner to scan and remove deleted files from gallery cache immediately
      if (scannedPaths.isNotEmpty()) {
        try {
          MediaScannerConnection.scanFile(
            context,
            scannedPaths.toTypedArray(),
            null,
            null
          )
        } catch (e: Exception) {
          // ignore
        }
      }

      return@AsyncFunction (deletedCount.isNotEmpty() || scannedPaths.isNotEmpty())
    }

    /**
     * Query 100% of real installed apps on Android 14 (API 34)
     * Zero mock apps. Reads live PackageManager data with icons.
     */
    AsyncFunction("getInstalledApps") { includeSystemApps: Boolean ->
      val context = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any?>>()
      val pm = context.packageManager
      val appList = mutableListOf<Map<String, Any?>>()
      val seenPackages = mutableSetOf<String>()

      // 1. Query all installed packages/applications on the system
      val installedApps: List<ApplicationInfo> = try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          pm.getInstalledApplications(PackageManager.ApplicationInfoFlags.of(PackageManager.MATCH_ALL.toLong()))
        } else {
          @Suppress("DEPRECATION")
          pm.getInstalledApplications(PackageManager.GET_META_DATA)
        }
      } catch (e: Exception) {
        emptyList()
      }

      // 2. Query launcher activities to check if launchable from home screen
      val mainIntent = Intent(Intent.ACTION_MAIN, null).apply {
        addCategory(Intent.CATEGORY_LAUNCHER)
      }
      val launcherActivities = try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          pm.queryIntentActivities(mainIntent, PackageManager.ResolveInfoFlags.of(PackageManager.MATCH_ALL.toLong()))
        } else {
          @Suppress("DEPRECATION")
          pm.queryIntentActivities(mainIntent, 0)
        }
      } catch (e: Exception) {
        emptyList()
      }

      val launcherPackages = launcherActivities.map { it.activityInfo.packageName }.toSet()

      // Process each installed app
      for (appInfo in installedApps) {
        val packageName = appInfo.packageName
        if (packageName == context.packageName || seenPackages.contains(packageName)) {
          continue
        }

        val isSystem = (appInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0
        val isUpdatedSystem = (appInfo.flags and ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) != 0
        val isEffectiveSystem = isSystem && !isUpdatedSystem
        val hasLauncher = launcherPackages.contains(packageName) || (pm.getLaunchIntentForPackage(packageName) != null)

        // If user wants only user apps, exclude pure non-updated system apps without launcher
        if (!includeSystemApps && isEffectiveSystem && !hasLauncher) {
          continue
        }

        // Exclude low-level internal android framework packages
        if (packageName == "android" || packageName == "com.android.systemui") {
          continue
        }

        val label = try {
          pm.getApplicationLabel(appInfo).toString()
        } catch (e: Exception) {
          packageName
        }

        if (label.isBlank()) continue
        seenPackages.add(packageName)

        val versionName = try {
          val pInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            pm.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(0))
          } else {
            @Suppress("DEPRECATION")
            pm.getPackageInfo(packageName, 0)
          }
          pInfo.versionName ?: ""
        } catch (e: Exception) {
          ""
        }

        // Get icon as base64 PNG
        val iconBase64 = try {
          val drawable = pm.getApplicationIcon(appInfo)
          drawableToBase64(drawable)
        } catch (e: Exception) {
          null
        }

        val appMap = mapOf(
          "packageName" to packageName,
          "appName" to label,
          "isSystemApp" to isEffectiveSystem,
          "hasLauncher" to hasLauncher,
          "versionName" to versionName,
          "icon" to iconBase64
        )
        appList.add(appMap)
      }

      // Sort: user-installed apps first, then system apps, alphabetically
      appList.sortedWith(
        compareBy(
          { (it["isSystemApp"] as? Boolean) == true },
          { (it["appName"] as? String)?.lowercase() ?: "" }
        )
      )
    }

    AsyncFunction("launchApp") { packageName: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      val pm = context.packageManager
      val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager
      val admin = ComponentName(context, CalculatorDeviceAdminReceiver::class.java)

      // If app was hidden by DPM, ensure it is temporarily unhidden so it can be launched
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
          intents.add(Intent("com.sec.android.app.launcher.action.SETTINGS"))
        }
        brand.contains("xiaomi") || brand.contains("redmi") || brand.contains("poco") -> {
          intents.add(Intent().setComponent(ComponentName("com.miui.securitycenter", "com.miui.applock.ui.HideAppListActivity")))
          intents.add(Intent().setComponent(ComponentName("com.miui.securitycenter", "com.miui.applock.ui.AppLockSettingsActivity")))
          intents.add(Intent("miui.intent.action.APP_LOCK_MANAGEMENT"))
        }
        brand.contains("oppo") || brand.contains("realme") || brand.contains("oneplus") -> {
          intents.add(Intent().setComponent(ComponentName("com.coloros.safecenter", "com.coloros.safecenter.privacy.view.PrivacySettingsActivity")))
          intents.add(Intent().setComponent(ComponentName("com.coloros.safecenter", "com.coloros.safecenter.privacy.view.AppHideSettingActivity")))
        }
        brand.contains("vivo") || brand.contains("iqoo") -> {
          intents.add(Intent().setComponent(ComponentName("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.HideAppActivity")))
        }
        brand.contains("huawei") || brand.contains("honor") -> {
          intents.add(Intent().setComponent(ComponentName("com.huawei.systemmanager", "com.huawei.applock.ui.AppLockMainActivity")))
        }
      }

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

    AsyncFunction("isAppInstalled") { packageName: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      try {
        context.packageManager.getPackageInfo(packageName, 0)
        return@AsyncFunction true
      } catch (e: PackageManager.NameNotFoundException) {
        return@AsyncFunction false
      } catch (e: Exception) {
        return@AsyncFunction false
      }
    }

    AsyncFunction("installApk") { apkPath: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      try {
        val cleanPath = apkPath.removePrefix("file://")
        val file = File(cleanPath)
        if (!file.exists()) {
          return@AsyncFunction false
        }

        val contentUri = FileProvider.getUriForFile(
          context,
          "${context.packageName}.provider",
          file
        )

        val intent = Intent(Intent.ACTION_VIEW).apply {
          setDataAndType(contentUri, "application/vnd.android.package-archive")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(intent)
        return@AsyncFunction true
      } catch (e: Exception) {
        e.printStackTrace()
        return@AsyncFunction false
      }
    }

    AsyncFunction("encryptFile") { srcPath: String, destPath: String, keyInput: String ->
      try {
        val cleanSrc = srcPath.removePrefix("file://")
        val cleanDest = destPath.removePrefix("file://")
        val srcFile = File(cleanSrc)
        val destFile = File(cleanDest)
        if (!srcFile.exists()) return@AsyncFunction false

        destFile.parentFile?.mkdirs()

        val secretKey = getSecretKey(keyInput)
        val iv = ByteArray(16)
        SecureRandom().nextBytes(iv)

        val cipher = Cipher.getInstance("AES/CBC/PKCS5Padding")
        cipher.init(Cipher.ENCRYPT_MODE, secretKey, IvParameterSpec(iv))

        FileOutputStream(destFile).use { fileOut ->
          fileOut.write(iv)
          CipherOutputStream(fileOut, cipher).use { cipherOut ->
            FileInputStream(srcFile).use { srcIn ->
              val buffer = ByteArray(64 * 1024)
              var bytesRead: Int
              while (srcIn.read(buffer).also { bytesRead = it } != -1) {
                cipherOut.write(buffer, 0, bytesRead)
              }
              cipherOut.flush()
            }
          }
        }
        return@AsyncFunction true
      } catch (e: Exception) {
        e.printStackTrace()
        return@AsyncFunction false
      }
    }

    AsyncFunction("decryptFile") { encPath: String, destPath: String, keyInput: String ->
      try {
        val cleanEnc = encPath.removePrefix("file://")
        val cleanDest = destPath.removePrefix("file://")
        val encFile = File(cleanEnc)
        val destFile = File(cleanDest)
        if (!encFile.exists()) return@AsyncFunction false

        destFile.parentFile?.mkdirs()

        val secretKey = getSecretKey(keyInput)
        FileInputStream(encFile).use { encIn ->
          val iv = ByteArray(16)
          val readIv = encIn.read(iv)
          if (readIv != 16) return@AsyncFunction false

          val cipher = Cipher.getInstance("AES/CBC/PKCS5Padding")
          cipher.init(Cipher.DECRYPT_MODE, secretKey, IvParameterSpec(iv))

          CipherInputStream(encIn, cipher).use { cipherIn ->
            FileOutputStream(destFile).use { fileOut ->
              val buffer = ByteArray(64 * 1024)
              var bytesRead: Int
              while (cipherIn.read(buffer).also { bytesRead = it } != -1) {
                fileOut.write(buffer, 0, bytesRead)
              }
              fileOut.flush()
            }
          }
        }
        return@AsyncFunction true
      } catch (e: Exception) {
        e.printStackTrace()
        return@AsyncFunction false
      }
    }

    AsyncFunction("decryptImageToBase64") { encPath: String, keyInput: String, mimeType: String? ->
      try {
        val cleanEnc = encPath.removePrefix("file://")
        val encFile = File(cleanEnc)
        if (!encFile.exists()) return@AsyncFunction null

        val secretKey = getSecretKey(keyInput)
        FileInputStream(encFile).use { encIn ->
          val iv = ByteArray(16)
          val readIv = encIn.read(iv)
          if (readIv != 16) return@AsyncFunction null

          val cipher = Cipher.getInstance("AES/CBC/PKCS5Padding")
          cipher.init(Cipher.DECRYPT_MODE, secretKey, IvParameterSpec(iv))

          CipherInputStream(encIn, cipher).use { cipherIn ->
            ByteArrayOutputStream().use { byteOut ->
              val buffer = ByteArray(64 * 1024)
              var bytesRead: Int
              while (cipherIn.read(buffer).also { bytesRead = it } != -1) {
                byteOut.write(buffer, 0, bytesRead)
              }
              val bytes = byteOut.toByteArray()
              val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
              val mime = mimeType ?: "image/jpeg"
              return@AsyncFunction "data:$mime;base64,$base64"
            }
          }
        }
      } catch (e: Exception) {
        e.printStackTrace()
        return@AsyncFunction null
      }
    }

    AsyncFunction("decryptToCache") { encPath: String, keyInput: String, tempFileName: String ->
      val context = appContext.reactContext ?: return@AsyncFunction null
      try {
        val cleanEnc = encPath.removePrefix("file://")
        val encFile = File(cleanEnc)
        if (!encFile.exists()) return@AsyncFunction null

        val secretKey = getSecretKey(keyInput)
        val safeName = "vault_temp_" + System.currentTimeMillis() + "_" + tempFileName.replace(Regex("[^a-zA-Z0-9._-]"), "_")
        val outFile = File(context.cacheDir, safeName)

        FileInputStream(encFile).use { encIn ->
          val iv = ByteArray(16)
          val readIv = encIn.read(iv)
          if (readIv != 16) return@AsyncFunction null

          val cipher = Cipher.getInstance("AES/CBC/PKCS5Padding")
          cipher.init(Cipher.DECRYPT_MODE, secretKey, IvParameterSpec(iv))

          CipherInputStream(encIn, cipher).use { cipherIn ->
            FileOutputStream(outFile).use { fileOut ->
              val buffer = ByteArray(64 * 1024)
              var bytesRead: Int
              while (cipherIn.read(buffer).also { bytesRead = it } != -1) {
                fileOut.write(buffer, 0, bytesRead)
              }
              fileOut.flush()
            }
          }
        }
        return@AsyncFunction "file://" + outFile.absolutePath
      } catch (e: Exception) {
        e.printStackTrace()
        return@AsyncFunction null
      }
    }

    AsyncFunction("deleteTempFile") { filePath: String ->
      try {
        val cleanPath = filePath.removePrefix("file://")
        val file = File(cleanPath)
        if (file.exists()) {
          return@AsyncFunction file.delete()
        }
        return@AsyncFunction true
      } catch (e: Exception) {
        return@AsyncFunction false
      }
    }

    AsyncFunction("clearVolatileCache") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      try {
        val cacheDir = context.cacheDir
        val tempFiles = cacheDir.listFiles { file -> file.name.startsWith("vault_temp_") }
        tempFiles?.forEach { it.delete() }
        return@AsyncFunction true
      } catch (e: Exception) {
        return@AsyncFunction false
      }
    }

    AsyncFunction("openXiaomiSecurityCenter") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      val intents = listOf(
        Intent().setComponent(ComponentName("com.miui.securitycenter", "com.miui.securityscan.MainActivity")),
        Intent().setComponent(ComponentName("com.miui.securitycenter", "com.miui.appmanager.AppManagerMainActivity")),
        Intent(Settings.ACTION_SETTINGS)
      )
      for (intent in intents) {
        try {
          intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          context.startActivity(intent)
          return@AsyncFunction true
        } catch (e: Exception) {
          // continue
        }
      }
      return@AsyncFunction false
    }

    AsyncFunction("openXiaomiHiddenAppsSettings") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      val intents = listOf(
        Intent().setComponent(ComponentName("com.miui.securitycenter", "com.miui.applicationlock.AppLockActivity")),
        Intent("miui.intent.action.APP_LOCK"),
        Intent().setComponent(ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity")),
        Intent(Settings.ACTION_APPLICATION_SETTINGS)
      )
      for (intent in intents) {
        try {
          intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          context.startActivity(intent)
          return@AsyncFunction true
        } catch (e: Exception) {
          // continue
        }
      }
      return@AsyncFunction false
    }
  }

  private fun getPathFromContentUri(cr: ContentResolver, uri: Uri): String? {
    return try {
      val projection = arrayOf(MediaStore.MediaColumns.DATA)
      cr.query(uri, projection, null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) {
          val idx = cursor.getColumnIndex(MediaStore.MediaColumns.DATA)
          if (idx != -1) cursor.getString(idx) else null
        } else null
      }
    } catch (e: Exception) {
      null
    }
  }

  private fun queryMediaByFilename(cr: ContentResolver, filename: String): Pair<String?, Uri?>? {
    val uris = arrayOf(
      MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
      MediaStore.Video.Media.EXTERNAL_CONTENT_URI
    )
    val projection = arrayOf(MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DATA)
    val selection = "${MediaStore.MediaColumns.DISPLAY_NAME} = ? OR ${MediaStore.MediaColumns.TITLE} = ?"
    val selectionArgs = arrayOf(filename, filename)

    for (baseUri in uris) {
      try {
        cr.query(baseUri, projection, selection, selectionArgs, null)?.use { cursor ->
          if (cursor.moveToFirst()) {
            val idIdx = cursor.getColumnIndex(MediaStore.MediaColumns._ID)
            val dataIdx = cursor.getColumnIndex(MediaStore.MediaColumns.DATA)
            val id = if (idIdx != -1) cursor.getLong(idIdx) else null
            val path = if (dataIdx != -1) cursor.getString(dataIdx) else null
            val uri = if (id != null) ContentUris.withAppendedId(baseUri, id) else null
            return Pair(path, uri)
          }
        }
      } catch (e: Exception) {
        // continue
      }
    }
    return null
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

  private fun hexStringToByteArray(s: String): ByteArray {
    val len = s.length
    val data = ByteArray(len / 2)
    var i = 0
    while (i < len) {
      data[i / 2] = ((Character.digit(s[i], 16) shl 4) + Character.digit(s[i + 1], 16)).toByte()
      i += 2
    }
    return data
  }

  private fun getSecretKey(keyInput: String): SecretKeySpec {
    val keyBytes = try {
      if (keyInput.length == 64 && keyInput.all { it in "0123456789abcdefABCDEF" }) {
        hexStringToByteArray(keyInput)
      } else {
        MessageDigest.getInstance("SHA-256").digest(keyInput.toByteArray(Charsets.UTF_8))
      }
    } catch (e: Exception) {
      MessageDigest.getInstance("SHA-256").digest(keyInput.toByteArray(Charsets.UTF_8))
    }
    return SecretKeySpec(keyBytes, "AES")
  }
}
