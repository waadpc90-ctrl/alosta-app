package com.example

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import android.widget.Toast
import java.util.Locale

object AlOstaApkUpdater {
    private val mainHandler by lazy { Handler(Looper.getMainLooper()) }
    @Volatile
    private var isDownloading = false
    @Volatile
    private var lastDownloadedApk: java.io.File? = null
    @Volatile
    private var pendingInstallOnResume = false
    @Volatile
    private var baselineLastUpdateTime = 0L
    @Volatile
    private var lastWebViewRef: (() -> WebView?)? = null

    fun getInstalledLastUpdateTime(context: Context): Long {
        return try {
            context.packageManager.getPackageInfo(context.packageName, 0).lastUpdateTime
        } catch (_: Exception) {
            0L
        }
    }

    fun getInstalledFirstInstallTime(context: Context): Long {
        return try {
            context.packageManager.getPackageInfo(context.packageName, 0).firstInstallTime
        } catch (_: Exception) {
            0L
        }
    }

    fun extractGoogleDriveFileId(rawUrl: String): String? {
        val url = rawUrl.trim()
        if (!url.contains("drive.google.com", ignoreCase = true) &&
            !url.contains("docs.google.com", ignoreCase = true) &&
            !url.contains("drive.usercontent.google.com", ignoreCase = true)
        ) {
            return null
        }
        val patterns = listOf(
            Regex("""/file/d/([a-zA-Z0-9_-]{10,})"""),
            Regex("""/d/([a-zA-Z0-9_-]{10,})"""),
            Regex("""[?&]id=([a-zA-Z0-9_-]{10,})""")
        )
        for (p in patterns) {
            val match = p.find(url)
            if (match != null) {
                return match.groupValues[1]
            }
        }
        return null
    }

    fun toDirectDownloadUrl(rawUrl: String): String {
        val clean = rawUrl.trim()
        val gdriveId = extractGoogleDriveFileId(clean)
        if (!gdriveId.isNullOrBlank()) {
            return "https://drive.usercontent.google.com/download?id=$gdriveId&export=download&confirm=t&authuser=0"
        }
        if (clean.contains("dropbox.com", ignoreCase = true)) {
            return clean.replace("?dl=0", "?dl=1").replace("&dl=0", "&dl=1")
        }
        return clean
    }

    fun notifyWebView(
        webViewProvider: (() -> WebView?)?,
        status: String,
        progress: Int,
        message: String
    ) {
        val safeMsg = org.json.JSONObject.quote(message)
        val safeStatus = org.json.JSONObject.quote(status)
        mainHandler.post {
            try {
                val wv = webViewProvider?.invoke()
                wv?.evaluateJavascript(
                    "if(window.onApkUpdateState){window.onApkUpdateState({status:$safeStatus,progress:$progress,message:$safeMsg});}",
                    null
                )
            } catch (_: Exception) {
            }
        }
    }

    fun onActivityResume(context: Context) {
        if (baselineLastUpdateTime > 0L) {
            val nowUpdateTime = getInstalledLastUpdateTime(context)
            if (nowUpdateTime > baselineLastUpdateTime) {
                baselineLastUpdateTime = 0L
                pendingInstallOnResume = false
                try {
                    lastDownloadedApk?.delete()
                } catch (_: Exception) {
                }
                lastDownloadedApk = null
                notifyWebView(lastWebViewRef, "installed", 100, "تم تثبيت التحديث بنجاح! ✓")
                return
            }
        }
        if (pendingInstallOnResume) {
            val apk = lastDownloadedApk
            if (apk != null && apk.exists() && apk.length() > 50_000L) {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context.packageManager.canRequestPackageInstalls()) {
                    pendingInstallOnResume = false
                    launchPackageInstaller(context, apk, lastWebViewRef)
                }
            }
        }
    }

    fun launchPackageInstaller(
        context: Context,
        apkFile: java.io.File? = lastDownloadedApk,
        webViewProvider: (() -> WebView?)? = lastWebViewRef
    ): Boolean {
        val target = apkFile ?: getTargetApkFile(context)
        if (!target.exists() || target.length() < 50_000L) {
            return false
        }
        lastDownloadedApk = target
        lastWebViewRef = webViewProvider
        if (baselineLastUpdateTime == 0L) {
            baselineLastUpdateTime = getInstalledLastUpdateTime(context)
        }

        mainHandler.post {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.packageManager.canRequestPackageInstalls()) {
                    pendingInstallOnResume = true
                    notifyWebView(
                        webViewProvider,
                        "permission_needed",
                        100,
                        "يرجى تفعيل خيار (السماح من هذا المصدر) لتثبيت التحديث فوراً"
                    )
                    Toast.makeText(
                        context,
                        "يرجى تفعيل (السماح من هذا المصدر) لتثبيت التحديث",
                        Toast.LENGTH_LONG
                    ).show()
                    val permIntent = Intent(
                        android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:${context.packageName}")
                    ).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(permIntent)
                    return@post
                }

                pendingInstallOnResume = false
                val apkUri = androidx.core.content.FileProvider.getUriForFile(
                    context,
                    "${context.packageName}.fileprovider",
                    target
                )
                val installIntent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(apkUri, "application/vnd.android.package-archive")
                    clipData = ClipData.newRawUri("apk", apkUri)
                    addFlags(
                        Intent.FLAG_GRANT_READ_URI_PERMISSION or
                            Intent.FLAG_ACTIVITY_NEW_TASK
                    )
                }
                notifyWebView(
                    webViewProvider,
                    "installing",
                    100,
                    "تم فتح نافذة تثبيت التحديث! اضغط على (تثبيت / تحديث)."
                )
                try {
                    context.startActivity(installIntent)
                } catch (_: Exception) {
                    @Suppress("DEPRECATION")
                    val fallbackIntent = Intent(Intent.ACTION_INSTALL_PACKAGE).apply {
                        data = apkUri
                        clipData = ClipData.newRawUri("apk", apkUri)
                        putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true)
                        putExtra(Intent.EXTRA_RETURN_RESULT, true)
                        addFlags(
                            Intent.FLAG_GRANT_READ_URI_PERMISSION or
                                Intent.FLAG_ACTIVITY_NEW_TASK
                        )
                    }
                    context.startActivity(fallbackIntent)
                }
            } catch (e: Exception) {
                notifyWebView(
                    webViewProvider,
                    "ready",
                    100,
                    "تم تحميل التحديث. اضغط على زر تثبيت التحديث الآن."
                )
                Toast.makeText(context, "تعذر فتح المثبت تلقائياً، جرب فتح الرابط المباشر", Toast.LENGTH_SHORT).show()
            }
        }
        return true
    }

    private fun getTargetApkFile(context: Context): java.io.File {
        val baseDir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: context.cacheDir
        val updateDir = java.io.File(baseDir, "apk_updates")
        if (!updateDir.exists()) updateDir.mkdirs()
        return java.io.File(updateDir, "AlOsta_Update.apk")
    }

    private fun parseGoogleDriveConfirmationUrl(html: String, fallbackFileId: String?): String? {
        val actionMatch = Regex("""<form[^>]*action=["']([^"']+)["']""", RegexOption.IGNORE_CASE).find(html)
        val actionUrl = actionMatch?.groupValues?.get(1)?.replace("&amp;", "&")
            ?: "https://drive.usercontent.google.com/download"

        val inputRegex = Regex(
            """<input[^>]*name=["']([^"']+)["'][^>]*value=["']([^"']*)["']""",
            RegexOption.IGNORE_CASE
        )
        val params = mutableMapOf<String, String>()
        for (m in inputRegex.findAll(html)) {
            params[m.groupValues[1]] = m.groupValues[2]
        }
        val revInputRegex = Regex(
            """<input[^>]*value=["']([^"']*)["'][^>]*name=["']([^"']+)["']""",
            RegexOption.IGNORE_CASE
        )
        for (m in revInputRegex.findAll(html)) {
            params[m.groupValues[2]] = m.groupValues[1]
        }

        if (!fallbackFileId.isNullOrBlank() && !params.containsKey("id")) {
            params["id"] = fallbackFileId
        }
        if (params.isNotEmpty() && (params.containsKey("uuid") || params.containsKey("confirm") || params.containsKey("id"))) {
            if (!params.containsKey("export")) params["export"] = "download"
            if (!params.containsKey("confirm")) params["confirm"] = "t"
            val query = params.entries.joinToString("&") { (k, v) ->
                "${java.net.URLEncoder.encode(k, "UTF-8")}=${java.net.URLEncoder.encode(v, "UTF-8")}"
            }
            return if (actionUrl.contains("?")) "$actionUrl&$query" else "$actionUrl?$query"
        }

        val hrefMatch = Regex("""href=["']([^"']*export=download[^"']*)["']""", RegexOption.IGNORE_CASE).find(html)
        if (hrefMatch != null) {
            val rawHref = hrefMatch.groupValues[1].replace("&amp;", "&")
            return if (rawHref.startsWith("http")) rawHref else "https://drive.google.com$rawHref"
        }
        return null
    }

    private fun openConnectionFollowingRedirects(
        startUrl: String,
        cookieJar: MutableMap<String, String>
    ): java.net.HttpURLConnection {
        var currentUrl = startUrl
        var hops = 0
        while (hops < 10) {
            if (!AlOstaSecurityVault.isSafeExternalHttpUrl(currentUrl)) {
                throw SecurityException("Blocked unsafe redirect URL: $currentUrl")
            }
            val conn = (java.net.URL(currentUrl).openConnection() as java.net.HttpURLConnection).apply {
                instanceFollowRedirects = false
                connectTimeout = 15000
                readTimeout = 30000
                setRequestProperty(
                    "User-Agent",
                    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
                )
                setRequestProperty("Accept", "*/*")
                if (cookieJar.isNotEmpty()) {
                    setRequestProperty(
                        "Cookie",
                        cookieJar.entries.joinToString("; ") { "${it.key}=${it.value}" }
                    )
                }
            }
            val code = conn.responseCode
            val setCookies = conn.headerFields["Set-Cookie"] ?: conn.headerFields["set-cookie"]
            setCookies?.forEach { header ->
                val pair = header.substringBefore(";").split("=", limit = 2)
                if (pair.size == 2) {
                    cookieJar[pair[0].trim()] = pair[1].trim()
                }
            }
            if (code in 300..399) {
                val loc = conn.getHeaderField("Location") ?: break
                val nextUrl = try {
                    java.net.URL(java.net.URL(currentUrl), loc).toString()
                } catch (_: Exception) {
                    loc
                }
                conn.disconnect()
                currentUrl = nextUrl
                hops++
            } else {
                return conn
            }
        }
        return (java.net.URL(currentUrl).openConnection() as java.net.HttpURLConnection).apply {
            instanceFollowRedirects = true
            connectTimeout = 15000
            readTimeout = 30000
        }
    }

    fun startSmartUpdate(
        context: Context,
        rawUrl: String,
        webViewProvider: () -> WebView?
    ) {
        lastWebViewRef = webViewProvider
        val cleanUrl = rawUrl.trim()
        if (cleanUrl.isEmpty()) return

        if (isDownloading) {
            notifyWebView(webViewProvider, "downloading", 50, "جاري تحميل التحديث بالفعل...")
            return
        }

        val gdriveFileId = extractGoogleDriveFileId(cleanUrl)
        val initialUrl = toDirectDownloadUrl(cleanUrl)

        isDownloading = true
        notifyWebView(webViewProvider, "downloading", 5, "جاري الاتصال وتجهيز ملف التحديث...")

        Thread {
            val cookieJar = mutableMapOf<String, String>()
            val targetApk = getTargetApkFile(context)
            val tempApk = java.io.File(targetApk.parentFile, "AlOsta_Update.apk.tmp")

            try {
                var conn = openConnectionFollowingRedirects(initialUrl, cookieJar)
                var input = java.io.BufferedInputStream(conn.inputStream)
                input.mark(8192)
                val headerBytes = ByteArray(4)
                var headerRead = 0
                while (headerRead < 4) {
                    val r = input.read(headerBytes, headerRead, 4 - headerRead)
                    if (r <= 0) break
                    headerRead += r
                }
                val isZipMagic = headerRead == 4 &&
                    headerBytes[0] == 0x50.toByte() &&
                    headerBytes[1] == 0x4B.toByte() &&
                    headerBytes[2] == 0x03.toByte() &&
                    headerBytes[3] == 0x04.toByte()

                if (!isZipMagic) {
                    input.reset()
                    val htmlBytes = ByteArray(262144)
                    var totalHtml = 0
                    while (totalHtml < htmlBytes.size) {
                        val r = input.read(htmlBytes, totalHtml, htmlBytes.size - totalHtml)
                        if (r <= 0) break
                        totalHtml += r
                    }
                    input.close()
                    conn.disconnect()

                    val htmlText = String(htmlBytes, 0, totalHtml, Charsets.UTF_8)
                    val confirmedUrl = parseGoogleDriveConfirmationUrl(htmlText, gdriveFileId)
                        ?: if (!gdriveFileId.isNullOrBlank()) {
                            "https://drive.google.com/uc?export=download&id=$gdriveFileId&confirm=t"
                        } else {
                            null
                        }

                    if (confirmedUrl != null) {
                        notifyWebView(webViewProvider, "downloading", 12, "تم تخطي فحص كوكل درايف، جاري تنزيل الحزمة...")
                        conn = openConnectionFollowingRedirects(confirmedUrl, cookieJar)
                        input = java.io.BufferedInputStream(conn.inputStream)
                        input.mark(8192)
                        val secondHeader = ByteArray(4)
                        val secondRead = input.read(secondHeader)
                        val secondIsZip = secondRead == 4 &&
                            secondHeader[0] == 0x50.toByte() &&
                            secondHeader[1] == 0x4B.toByte() &&
                            secondHeader[2] == 0x03.toByte() &&
                            secondHeader[3] == 0x04.toByte()

                        if (!secondIsZip) {
                            input.close()
                            conn.disconnect()
                            isDownloading = false
                            notifyWebView(
                                webViewProvider,
                                "external",
                                100,
                                "الرابط يتطلب فتح المتصفح أو تطبيق الدرايف للتنزيل المباشر"
                            )
                            openInExternalBrowser(context, confirmedUrl)
                            return@Thread
                        }
                        input.reset()
                    } else {
                        isDownloading = false
                        notifyWebView(
                            webViewProvider,
                            "external",
                            100,
                            "تم تحويلك للمتصفح لإكمال تنزيل التحديث"
                        )
                        openInExternalBrowser(context, initialUrl)
                        return@Thread
                    }
                } else {
                    input.reset()
                }

                val contentLength = conn.contentLengthLong
                var downloadedBytes = 0L
                val buffer = ByteArray(32768)
                var lastReportedPct = 10

                java.io.FileOutputStream(tempApk).use { out ->
                    while (true) {
                        val read = input.read(buffer)
                        if (read <= 0) break
                        out.write(buffer, 0, read)
                        downloadedBytes += read

                        val pct = if (contentLength > 0L) {
                            ((downloadedBytes * 100L) / contentLength).toInt().coerceIn(10, 99)
                        } else {
                            (15 + ((downloadedBytes * 80L) / (15L * 1024L * 1024L)).toInt()).coerceIn(15, 95)
                        }

                        if (pct >= lastReportedPct + 4) {
                            lastReportedPct = pct
                            val mbStr = String.format(Locale.US, "%.1f MB", downloadedBytes / (1024.0 * 1024.0))
                            notifyWebView(
                                webViewProvider,
                                "downloading",
                                pct,
                                "جاري تحميل التحديث... $pct% ($mbStr)"
                            )
                        }
                    }
                    out.flush()
                }
                input.close()
                conn.disconnect()

                if (tempApk.exists() && tempApk.length() > 50_000L) {
                    if (targetApk.exists()) targetApk.delete()
                    tempApk.renameTo(targetApk)
                    val readyApk = unwrapIfNestedZip(targetApk)

                    val archiveInfo = try {
                        context.packageManager.getPackageArchiveInfo(readyApk.absolutePath, 0)
                    } catch (_: Exception) {
                        null
                    }
                    if (archiveInfo != null) {
                        val downloadedPkg = archiveInfo.packageName ?: ""
                        if (downloadedPkg.isNotEmpty() && downloadedPkg != context.packageName) {
                            isDownloading = false
                            val mismatchMsg = if (downloadedPkg.contains("dashboard", ignoreCase = true)) {
                                "⚠️ الملف المرفوع في الرابط هو (تطبيق الداشبورد) وليس التطبيق الرئيسي (الأسطة)! يرجى رفع AlOsta_App.apk الصحيح في الإعدادات."
                            } else {
                                "⚠️ ملف التحديث يخص حزمة أخرى ($downloadedPkg) وليس هذا التطبيق (${context.packageName})."
                            }
                            notifyWebView(webViewProvider, "error", 0, mismatchMsg)
                            return@Thread
                        }
                        val archiveVersionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                            archiveInfo.longVersionCode
                        } else {
                            @Suppress("DEPRECATION")
                            archiveInfo.versionCode.toLong()
                        }
                        val installedPkgInfo = try {
                            context.packageManager.getPackageInfo(context.packageName, 0)
                        } catch (_: Exception) {
                            null
                        }
                        val currentVersionCode = if (installedPkgInfo != null) {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                                installedPkgInfo.longVersionCode
                            } else {
                                @Suppress("DEPRECATION")
                                installedPkgInfo.versionCode.toLong()
                            }
                        } else {
                            0L
                        }
                        if (archiveVersionCode in 1 until currentVersionCode) {
                            isDownloading = false
                            notifyWebView(
                                webViewProvider,
                                "error",
                                0,
                                "⚠️ إصدار ملف التحديث (بناء $archiveVersionCode) أقدم من النسخة المثبتة على جهازك حالياً ($currentVersionCode)."
                            )
                            return@Thread
                        }
                    }

                    lastDownloadedApk = readyApk
                    isDownloading = false
                    notifyWebView(
                        webViewProvider,
                        "ready",
                        100,
                        "اكتمل التحميل بنجاح! جاري فتح نافذة تثبيت التطبيق..."
                    )
                    launchPackageInstaller(context, readyApk, webViewProvider)
                } else {
                    tempApk.delete()
                    isDownloading = false
                    notifyWebView(
                        webViewProvider,
                        "external",
                        100,
                        "تم فتح رابط التحديث المباشر في المتصفح"
                    )
                    openInExternalBrowser(context, initialUrl)
                }
            } catch (e: Exception) {
                try {
                    tempApk.delete()
                } catch (_: Exception) {
                }
                isDownloading = false
                notifyWebView(
                    webViewProvider,
                    "error",
                    0,
                    "تعذر التحميل المباشر داخل التطبيق، جرب الضغط على (فتح الرابط في المتصفح)"
                )
                openInExternalBrowser(context, initialUrl)
            }
        }.start()
    }

    private fun unwrapIfNestedZip(downloadedFile: java.io.File): java.io.File {
        return try {
            java.util.zip.ZipFile(downloadedFile).use { zip ->
                if (zip.getEntry("AndroidManifest.xml") != null) {
                    return downloadedFile
                }
                val entries = zip.entries().asSequence().toList()
                val apkEntry = entries.firstOrNull {
                    !it.name.contains("..") && it.name.endsWith("AlOsta_App.apk", ignoreCase = true)
                } ?: entries.firstOrNull {
                    !it.name.contains("..") && it.name.endsWith(".apk", ignoreCase = true) && !it.isDirectory
                }
                if (apkEntry != null) {
                    val maxAllowedApkBytes = 150L * 1024L * 1024L // 150 MB guard against Zip Bomb
                    val extractedFile = java.io.File(downloadedFile.parentFile, "AlOsta_Extracted_Update.apk")
                    if (extractedFile.exists()) extractedFile.delete()
                    zip.getInputStream(apkEntry).use { input ->
                        java.io.FileOutputStream(extractedFile).use { out ->
                            val buf = ByteArray(16384)
                            var totalCopied = 0L
                            while (true) {
                                val r = input.read(buf)
                                if (r <= 0) break
                                totalCopied += r
                                if (totalCopied > maxAllowedApkBytes) {
                                    throw SecurityException("APK entry exceeds maximum safe size")
                                }
                                out.write(buf, 0, r)
                            }
                        }
                    }
                    if (extractedFile.exists() && extractedFile.length() > 50_000L) {
                        downloadedFile.delete()
                        extractedFile.renameTo(downloadedFile)
                    }
                }
            }
            downloadedFile
        } catch (_: Exception) {
            downloadedFile
        }
    }

    fun exportAndShareCurrentApk(context: Context): String {
        return try {
            val sourceApk = java.io.File(context.applicationInfo.sourceDir)
            if (!sourceApk.exists()) return ""

            val isDashPkg = context.packageName.contains("dashboard", ignoreCase = true)
            val exportFileName = if (isDashPkg) "AlOsta_Dashboard.apk" else "AlOsta_App.apk"
            val baseDir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: context.cacheDir
            val exportDir = java.io.File(baseDir, "exported_apks")
            if (!exportDir.exists()) exportDir.mkdirs()
            val outApk = java.io.File(exportDir, exportFileName)
            sourceApk.copyTo(outApk, overwrite = true)

            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val resolver = context.contentResolver
                    val contentValues = android.content.ContentValues().apply {
                        put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, exportFileName)
                        put(android.provider.MediaStore.MediaColumns.MIME_TYPE, "application/vnd.android.package-archive")
                        put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                    }
                    val uri = resolver.insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues)
                    if (uri != null) {
                        resolver.openOutputStream(uri)?.use { outStream ->
                            java.io.FileInputStream(sourceApk).use { inStream ->
                                inStream.copyTo(outStream)
                            }
                        }
                    }
                }
            } catch (_: Exception) {
            }

            mainHandler.post {
                try {
                    val apkUri = androidx.core.content.FileProvider.getUriForFile(
                        context,
                        "${context.packageName}.fileprovider",
                        outApk
                    )
                    val shareIntent = Intent(Intent.ACTION_SEND).apply {
                        type = "application/vnd.android.package-archive"
                        putExtra(Intent.EXTRA_STREAM, apkUri)
                        putExtra(Intent.EXTRA_TITLE, exportFileName)
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    val chooser = Intent.createChooser(shareIntent, "حفظ أو رفع ملف ($exportFileName)").apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(chooser)
                    Toast.makeText(
                        context,
                        "تم حفظ $exportFileName في التنزيلات وفتح نافذة الرفع ✓",
                        Toast.LENGTH_LONG
                    ).show()
                } catch (_: Exception) {
                }
            }
            outApk.absolutePath
        } catch (e: Exception) {
            ""
        }
    }

    fun openInExternalBrowser(context: Context, rawUrl: String) {
        val directUrl = toDirectDownloadUrl(rawUrl)
        mainHandler.post {
            try {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(directUrl)).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
            } catch (_: Exception) {
                try {
                    val fallback = Intent(Intent.ACTION_VIEW, Uri.parse(rawUrl.trim())).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(fallback)
                } catch (_: Exception) {
                }
            }
        }
    }
}
