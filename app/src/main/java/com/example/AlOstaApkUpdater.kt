package com.example

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import android.widget.Toast
import java.io.BufferedInputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.Locale
import java.util.zip.ZipFile

object AlOstaApkUpdater {
    private val mainHandler by lazy { Handler(Looper.getMainLooper()) }
    private const val MIN_VALID_APK_BYTES = 50_000L
    private const val MAX_ALLOWED_APK_BYTES = 150L * 1024L * 1024L

    @Volatile
    private var isDownloading = false
    @Volatile
    private var lastDownloadedApk: File? = null
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

    fun sanitizeInputUrl(rawUrl: String): String {
        val clean = rawUrl.trim()
        if (clean.isEmpty()) return ""
        val withProtocol = if (clean.startsWith("http://", ignoreCase = true) ||
            clean.startsWith("https://", ignoreCase = true)
        ) {
            clean
        } else if (clean.contains(".") && !clean.contains("://")) {
            "https://$clean"
        } else {
            clean
        }
        return withProtocol.replace(" ", "%20")
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

    /**
     * Converts GitHub /blob/ or /raw/ URLs into direct raw.githubusercontent.com URLs
     * to avoid HTML preview pages and extra redirect hops.
     */
    fun toGitHubRawUrl(rawUrl: String): String? {
        val clean = rawUrl.trim()
        val match = Regex(
            """^https?://(?:www\.)?github\.com/([^/\s]+)/([^/\s]+)/(?:blob|raw)/([^/\s]+)/(.+)$""",
            RegexOption.IGNORE_CASE
        ).find(clean) ?: return null
        val owner = match.groupValues[1]
        val repo = match.groupValues[2]
        val ref = match.groupValues[3]
        val path = match.groupValues[4].substringBefore("?").substringBefore("#")
        return "https://raw.githubusercontent.com/$owner/$repo/$ref/$path"
    }

    /**
     * Converts raw.githubusercontent.com URL to GitHub LFS media download URL when a file
     * is stored in Git LFS (pointer text response).
     */
    fun toGitHubLfsMediaUrl(rawUrl: String): String? {
        val clean = rawUrl.trim()
        val rawMatch = Regex(
            """^https?://raw\.githubusercontent\.com/([^/\s]+)/([^/\s]+)/([^/\s]+)/(.+)$""",
            RegexOption.IGNORE_CASE
        ).find(clean)
        if (rawMatch != null) {
            val owner = rawMatch.groupValues[1]
            val repo = rawMatch.groupValues[2]
            val ref = rawMatch.groupValues[3]
            val path = rawMatch.groupValues[4].substringBefore("?").substringBefore("#")
            return "https://media.githubusercontent.com/media/$owner/$repo/$ref/$path"
        }
        val ghMatch = Regex(
            """^https?://(?:www\.)?github\.com/([^/\s]+)/([^/\s]+)/(?:blob|raw)/([^/\s]+)/(.+)$""",
            RegexOption.IGNORE_CASE
        ).find(clean)
        if (ghMatch != null) {
            val owner = ghMatch.groupValues[1]
            val repo = ghMatch.groupValues[2]
            val ref = ghMatch.groupValues[3]
            val path = ghMatch.groupValues[4].substringBefore("?").substringBefore("#")
            return "https://media.githubusercontent.com/media/$owner/$repo/$ref/$path"
        }
        return null
    }

    fun toDirectDownloadUrl(rawUrl: String): String {
        val clean = sanitizeInputUrl(rawUrl)
        if (clean.isEmpty()) return ""

        val gdriveId = extractGoogleDriveFileId(clean)
        if (!gdriveId.isNullOrBlank()) {
            // Avoid authuser=0 which causes 404 / "File missing" on multi-account phones
            return "https://drive.usercontent.google.com/download?id=$gdriveId&export=download&confirm=t"
        }

        val ghRaw = toGitHubRawUrl(clean)
        if (!ghRaw.isNullOrBlank()) {
            return ghRaw
        }

        if (clean.contains("dropbox.com", ignoreCase = true)) {
            return when {
                clean.contains("dl=0", ignoreCase = true) ->
                    clean.replace(Regex("""([?&])dl=0\b""", RegexOption.IGNORE_CASE), "$1dl=1")
                clean.contains("dl=1", ignoreCase = true) -> clean
                clean.contains("?") -> "$clean&dl=1"
                else -> "$clean?dl=1"
            }
        }
        return clean
    }

    fun toBrowserFriendlyUrl(rawUrl: String): String {
        val clean = sanitizeInputUrl(rawUrl)
        if (clean.isEmpty()) return ""
        val gdriveId = extractGoogleDriveFileId(clean)
        if (!gdriveId.isNullOrBlank()) {
            return "https://drive.google.com/uc?export=download&id=$gdriveId"
        }
        val ghRaw = toGitHubRawUrl(clean)
        if (!ghRaw.isNullOrBlank()) {
            return ghRaw
        }
        return toDirectDownloadUrl(clean)
    }

    fun parseMediaFireDownloadUrl(html: String): String? {
        val idFirst = Regex(
            """<a[^>]*id=["']downloadButton["'][^>]*href=["'](https?://[^"']+)["']""",
            RegexOption.IGNORE_CASE
        ).find(html)
        if (idFirst != null) {
            return idFirst.groupValues[1].replace("&amp;", "&")
        }
        val hrefFirst = Regex(
            """<a[^>]*href=["'](https?://[^"']+)["'][^>]*id=["']downloadButton["']""",
            RegexOption.IGNORE_CASE
        ).find(html)
        if (hrefFirst != null) {
            return hrefFirst.groupValues[1].replace("&amp;", "&")
        }
        val directMf = Regex(
            """https?://download\d*\.mediafire\.com/[^"'\s<>]+""",
            RegexOption.IGNORE_CASE
        ).find(html)
        return directMf?.value?.replace("&amp;", "&")
    }

    fun parseHtmlDirectApkLink(html: String, baseUrl: String): String? {
        val mf = parseMediaFireDownloadUrl(html)
        if (!mf.isNullOrBlank()) return mf

        // Detect direct .apk href inside landing pages (e.g., download.html)
        val apkHrefRegex = Regex(
            """href=["']([^"']*AlOsta_App\.apk[^"']*|[^"']+\.apk(?:\?[^"']*)?)["']""",
            RegexOption.IGNORE_CASE
        )
        val match = apkHrefRegex.find(html) ?: return null
        val candidate = match.groupValues[1].replace("&amp;", "&").trim()
        if (candidate.isEmpty()) return null
        return try {
            URL(URL(baseUrl), candidate).toString()
        } catch (_: Exception) {
            null
        }
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
                cleanupUpdateDir(context, keepFile = null)
                lastDownloadedApk = null
                notifyWebView(lastWebViewRef, "installed", 100, "تم تثبيت التحديث بنجاح! ✓")
                return
            }
        }
        if (pendingInstallOnResume) {
            val apk = lastDownloadedApk ?: findLatestValidCachedApk(context)
            if (apk != null && apk.exists() && apk.length() >= MIN_VALID_APK_BYTES) {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context.packageManager.canRequestPackageInstalls()) {
                    pendingInstallOnResume = false
                    launchPackageInstaller(context, apk, lastWebViewRef)
                }
            }
        }
    }

    fun isValidApkArchive(file: File): Boolean {
        if (!file.exists() || !file.isFile || file.length() < MIN_VALID_APK_BYTES) return false
        return try {
            ZipFile(file).use { zip ->
                zip.getEntry("AndroidManifest.xml") != null
            }
        } catch (_: Exception) {
            false
        }
    }

    fun launchPackageInstaller(
        context: Context,
        apkFile: File? = lastDownloadedApk,
        webViewProvider: (() -> WebView?)? = lastWebViewRef
    ): Boolean {
        val target = apkFile?.takeIf { it.exists() && it.length() >= MIN_VALID_APK_BYTES }
            ?: findLatestValidCachedApk(context)
            ?: return false

        if (!target.exists() || target.length() < MIN_VALID_APK_BYTES || !isValidApkArchive(target)) {
            lastDownloadedApk = null
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
                if (!target.exists() || target.length() < MIN_VALID_APK_BYTES) {
                    notifyWebView(
                        webViewProvider,
                        "error",
                        0,
                        "تعذر العثور على ملف التحديث المحمّل — اضغط إعادة التحميل للمحاولة مرة أخرى."
                    )
                    return@post
                }

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
                grantReadPermissionToInstallers(context, installIntent, apkUri)

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
                    grantReadPermissionToInstallers(context, fallbackIntent, apkUri)
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

    private fun grantReadPermissionToInstallers(context: Context, intent: Intent, uri: Uri) {
        try {
            val resolved = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.packageManager.queryIntentActivities(
                    intent,
                    PackageManager.ResolveInfoFlags.of(PackageManager.MATCH_DEFAULT_ONLY.toLong())
                )
            } else {
                @Suppress("DEPRECATION")
                context.packageManager.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)
            }
            for (info in resolved) {
                val pkg = info.activityInfo?.packageName ?: continue
                try {
                    context.grantUriPermission(pkg, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
                } catch (_: Exception) {
                }
            }
        } catch (_: Exception) {
        }
    }

    /**
     * Uses internal cacheDir (ext4/f2fs) instead of external FUSE storage so OEM package
     * installers (Xiaomi MIUI/HyperOS, Samsung OneUI, Huawei) never hit "File missing".
     */
    private fun getUpdateDir(context: Context): File {
        val dir = File(context.cacheDir, "apk_updates")
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    private fun cleanupUpdateDir(context: Context, keepFile: File?) {
        try {
            val dir = getUpdateDir(context)
            dir.listFiles()?.forEach { f ->
                if (keepFile == null || f.absolutePath != keepFile.absolutePath) {
                    f.delete()
                }
            }
            // Also clean legacy external dir if present
            val legacyBase = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
            if (legacyBase != null) {
                File(legacyBase, "apk_updates").listFiles()?.forEach { it.delete() }
            }
        } catch (_: Exception) {
        }
    }

    private fun findLatestValidCachedApk(context: Context): File? {
        return try {
            getUpdateDir(context).listFiles()
                ?.filter { it.isFile && it.name.endsWith(".apk", ignoreCase = true) && it.length() >= MIN_VALID_APK_BYTES }
                ?.maxByOrNull { it.lastModified() }
        } catch (_: Exception) {
            null
        }
    }

    private fun moveFileSafely(src: File, dst: File): Boolean {
        if (!src.exists() || src.length() < MIN_VALID_APK_BYTES) return false
        if (src.absolutePath == dst.absolutePath) return true
        if (dst.exists()) dst.delete()
        if (src.renameTo(dst) && dst.exists() && dst.length() >= MIN_VALID_APK_BYTES) {
            return true
        }
        return try {
            src.copyTo(dst, overwrite = true)
            if (dst.exists() && dst.length() >= MIN_VALID_APK_BYTES) {
                src.delete()
                true
            } else {
                false
            }
        } catch (_: Exception) {
            false
        }
    }

    private fun readExactBytes(input: BufferedInputStream, count: Int): ByteArray {
        val buf = ByteArray(count)
        var offset = 0
        while (offset < count) {
            val r = input.read(buf, offset, count - offset)
            if (r <= 0) break
            offset += r
        }
        return if (offset == count) buf else buf.copyOf(offset)
    }

    private fun hasZipMagic(header: ByteArray): Boolean {
        return header.size >= 4 &&
            header[0] == 0x50.toByte() &&
            header[1] == 0x4B.toByte() &&
            header[2] == 0x03.toByte() &&
            header[3] == 0x04.toByte()
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
                "${URLEncoder.encode(k, "UTF-8")}=${URLEncoder.encode(v, "UTF-8")}"
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

    private fun cookieScopeForHost(host: String): String {
        val lower = host.lowercase(Locale.ROOT)
        return when {
            lower.endsWith("google.com") || lower.endsWith("googleusercontent.com") -> "google"
            lower.endsWith("mediafire.com") -> "mediafire"
            lower.endsWith("dropbox.com") || lower.endsWith("dropboxusercontent.com") -> "dropbox"
            else -> lower
        }
    }

    private data class ConnectionResult(
        val connection: HttpURLConnection,
        val finalUrl: String,
        val statusCode: Int
    )

    private fun openConnectionFollowingRedirects(
        startUrl: String,
        scopedCookies: MutableMap<String, MutableMap<String, String>>
    ): ConnectionResult {
        var currentUrl = sanitizeInputUrl(startUrl)
        var hops = 0
        while (hops < 12) {
            if (!AlOstaSecurityVault.isSafeExternalHttpUrl(currentUrl)) {
                throw SecurityException("Blocked unsafe redirect URL: $currentUrl")
            }
            val parsedUrl = URL(currentUrl)
            val scope = cookieScopeForHost(parsedUrl.host ?: "")
            val jar = scopedCookies.getOrPut(scope) { mutableMapOf() }

            val conn = (parsedUrl.openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = false
                connectTimeout = 15000
                readTimeout = 30000
                setRequestProperty(
                    "User-Agent",
                    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
                )
                setRequestProperty("Accept", "*/*")
                if (jar.isNotEmpty()) {
                    setRequestProperty(
                        "Cookie",
                        jar.entries.joinToString("; ") { "${it.key}=${it.value}" }
                    )
                }
            }
            val code = conn.responseCode
            val setCookies = conn.headerFields["Set-Cookie"] ?: conn.headerFields["set-cookie"]
            setCookies?.forEach { header ->
                val pair = header.substringBefore(";").split("=", limit = 2)
                if (pair.size == 2) {
                    jar[pair[0].trim()] = pair[1].trim()
                }
            }
            if (code in 300..399) {
                val loc = conn.getHeaderField("Location") ?: return ConnectionResult(conn, currentUrl, code)
                val nextUrl = try {
                    URL(parsedUrl, loc).toString()
                } catch (_: Exception) {
                    loc
                }
                conn.disconnect()
                currentUrl = nextUrl
                hops++
            } else {
                return ConnectionResult(conn, currentUrl, code)
            }
        }
        val finalConn = (URL(currentUrl).openConnection() as HttpURLConnection).apply {
            instanceFollowRedirects = true
            connectTimeout = 15000
            readTimeout = 30000
        }
        return ConnectionResult(finalConn, currentUrl, finalConn.responseCode)
    }

    fun startSmartUpdate(
        context: Context,
        rawUrl: String,
        webViewProvider: () -> WebView?
    ) {
        lastWebViewRef = webViewProvider
        val cleanUrl = sanitizeInputUrl(rawUrl)
        if (cleanUrl.isEmpty() || !AlOstaSecurityVault.isSafeExternalHttpUrl(cleanUrl)) {
            notifyWebView(
                webViewProvider,
                "error",
                0,
                "⚠️ رابط التحديث غير صالح — يرجى التأكد من الرابط في لوحة التحكم."
            )
            return
        }

        if (isDownloading) {
            notifyWebView(webViewProvider, "downloading", 50, "جاري تحميل التحديث بالفعل...")
            return
        }

        val gdriveFileId = extractGoogleDriveFileId(cleanUrl)
        val initialUrl = toDirectDownloadUrl(cleanUrl)

        isDownloading = true
        notifyWebView(webViewProvider, "downloading", 5, "جاري الاتصال وتجهيز ملف التحديث...")

        Thread {
            val scopedCookies = mutableMapOf<String, MutableMap<String, String>>()
            val updateDir = getUpdateDir(context)
            val stamp = System.currentTimeMillis()
            val targetApk = File(updateDir, "AlOsta_Update_$stamp.apk")
            val tempApk = File(updateDir, "AlOsta_Update_$stamp.apk.tmp")

            var activeConn: HttpURLConnection? = null
            var activeInput: BufferedInputStream? = null

            try {
                cleanupUpdateDir(context, keepFile = null)

                var result = openConnectionFollowingRedirects(initialUrl, scopedCookies)
                activeConn = result.connection

                // If raw.githubusercontent.com returned 404, try original URL once as fallback
                if (result.statusCode == 404 && initialUrl != cleanUrl) {
                    activeConn.disconnect()
                    result = openConnectionFollowingRedirects(cleanUrl, scopedCookies)
                    activeConn = result.connection
                }

                if (result.statusCode == 404 || result.statusCode == 410) {
                    activeConn.disconnect()
                    isDownloading = false
                    notifyWebView(
                        webViewProvider,
                        "error",
                        0,
                        "⚠️ ملف التحديث غير موجود على هذا الرابط (خطأ ${result.statusCode}). تأكد من رفع AlOsta_App.apk وتحديث الرابط في لوحة التحكم."
                    )
                    return@Thread
                }
                if (result.statusCode == 401 || result.statusCode == 403) {
                    activeConn.disconnect()
                    isDownloading = false
                    notifyWebView(
                        webViewProvider,
                        "error",
                        0,
                        "⚠️ الرابط محمي ولا يسمح بالتحميل المباشر (خطأ ${result.statusCode}). تأكد أن الملف عام (Public / Anyone with the link)."
                    )
                    return@Thread
                }
                if (result.statusCode >= 400) {
                    activeConn.disconnect()
                    isDownloading = false
                    notifyWebView(
                        webViewProvider,
                        "error",
                        0,
                        "⚠️ تعذر تنزيل التحديث من الخادم (رمز الخطأ ${result.statusCode}). جرب فتح الرابط في المتصفح."
                    )
                    return@Thread
                }

                activeInput = BufferedInputStream(activeConn.inputStream)
                activeInput.mark(16384)
                val firstHeader = readExactBytes(activeInput, 4)

                if (!hasZipMagic(firstHeader)) {
                    activeInput.reset()
                    val snippetBytes = ByteArray(262144)
                    var totalSnippet = 0
                    while (totalSnippet < snippetBytes.size) {
                        val r = activeInput.read(snippetBytes, totalSnippet, snippetBytes.size - totalSnippet)
                        if (r <= 0) break
                        totalSnippet += r
                    }
                    activeInput.close()
                    activeConn.disconnect()
                    activeInput = null
                    activeConn = null

                    val textResponse = String(snippetBytes, 0, totalSnippet, Charsets.UTF_8)

                    // 1) Detect Git LFS pointer file -> automatically switch to media.githubusercontent.com
                    val followUpUrl = if (textResponse.startsWith("version https://git-lfs.github.com/spec/v1")) {
                        toGitHubLfsMediaUrl(result.finalUrl) ?: toGitHubLfsMediaUrl(cleanUrl)
                    } else if (!gdriveFileId.isNullOrBlank()) {
                        // 2) Google Drive virus-scan / confirmation HTML
                        parseGoogleDriveConfirmationUrl(textResponse, gdriveFileId)
                            ?: "https://drive.google.com/uc?export=download&id=$gdriveFileId&confirm=t"
                    } else {
                        // 3) MediaFire or HTML landing page (e.g. download.html) with direct .apk link
                        parseHtmlDirectApkLink(textResponse, result.finalUrl)
                    }

                    if (followUpUrl != null && AlOstaSecurityVault.isSafeExternalHttpUrl(followUpUrl)) {
                        notifyWebView(webViewProvider, "downloading", 12, "جاري متابعة الرابط المباشر وتنزيل الحزمة...")
                        val secondRes = openConnectionFollowingRedirects(followUpUrl, scopedCookies)
                        activeConn = secondRes.connection

                        if (secondRes.statusCode >= 400) {
                            activeConn.disconnect()
                            isDownloading = false
                            notifyWebView(
                                webViewProvider,
                                "error",
                                0,
                                "⚠️ تعذر العثور على ملف التحديث (خطأ ${secondRes.statusCode}). تأكد من صلاحية الرابط في لوحة التحكم."
                            )
                            return@Thread
                        }

                        activeInput = BufferedInputStream(activeConn.inputStream)
                        activeInput.mark(16384)
                        val secondHeader = readExactBytes(activeInput, 4)

                        if (!hasZipMagic(secondHeader)) {
                            activeInput.close()
                            activeConn.disconnect()
                            isDownloading = false
                            notifyWebView(
                                webViewProvider,
                                "error",
                                0,
                                "⚠️ الرابط لا يؤدي مباشرة إلى ملف APK (قد يتطلب تسجيل دخول أو صلاحية عامة). اضغط زر فتح الرابط في المتصفح."
                            )
                            return@Thread
                        }
                        activeInput.reset()
                    } else {
                        isDownloading = false
                        notifyWebView(
                            webViewProvider,
                            "error",
                            0,
                            "⚠️ الرابط يفتح صفحة ويب وليس ملف APK مباشر. تأكد من الرابط أو اضغط فتح الرابط في المتصفح."
                        )
                        return@Thread
                    }
                } else {
                    activeInput.reset()
                }

                val conn = activeConn ?: throw IllegalStateException("Missing HTTP connection")
                val input = activeInput ?: throw IllegalStateException("Missing input stream")

                val contentLength = conn.contentLengthLong
                var downloadedBytes = 0L
                val buffer = ByteArray(32768)
                var lastReportedPct = 10

                FileOutputStream(tempApk).use { out ->
                    while (true) {
                        val read = input.read(buffer)
                        if (read <= 0) break
                        downloadedBytes += read
                        if (downloadedBytes > MAX_ALLOWED_APK_BYTES) {
                            throw SecurityException("Update file exceeds safe maximum size")
                        }
                        out.write(buffer, 0, read)

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
                activeInput = null
                activeConn = null

                if (tempApk.exists() && tempApk.length() >= MIN_VALID_APK_BYTES && moveFileSafely(tempApk, targetApk)) {
                    val readyApk = unwrapIfNestedZip(targetApk)

                    if (!isValidApkArchive(readyApk)) {
                        readyApk.delete()
                        isDownloading = false
                        notifyWebView(
                            webViewProvider,
                            "error",
                            0,
                            "⚠️ الملف الذي تم تنزيله غير صالح أو تالف (ليس ملف APK). يرجى التحقق من ملف التحديث المرفوع."
                        )
                        return@Thread
                    }

                    val archiveInfo = try {
                        context.packageManager.getPackageArchiveInfo(readyApk.absolutePath, 0)
                    } catch (_: Exception) {
                        null
                    }
                    if (archiveInfo != null) {
                        val downloadedPkg = archiveInfo.packageName ?: ""
                        if (downloadedPkg.isNotEmpty() && downloadedPkg != context.packageName) {
                            readyApk.delete()
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
                            readyApk.delete()
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
                    targetApk.delete()
                    isDownloading = false
                    notifyWebView(
                        webViewProvider,
                        "error",
                        0,
                        "⚠️ لم يكتمل تنزيل ملف التحديث أو أن حجمه غير صحيح. جرب مرة أخرى أو افتح الرابط في المتصفح."
                    )
                }
            } catch (e: Exception) {
                try {
                    activeInput?.close()
                } catch (_: Exception) {
                }
                try {
                    activeConn?.disconnect()
                } catch (_: Exception) {
                }
                try {
                    tempApk.delete()
                } catch (_: Exception) {
                }
                isDownloading = false
                val errMsg = when (e) {
                    is java.io.FileNotFoundException ->
                        "⚠️ ملف التحديث غير موجود على الرابط (404). يرجى التأكد من الرابط في لوحة التحكم."
                    is java.net.UnknownHostException ->
                        "⚠️ تعذر الوصول للخادم — تحقق من اتصال الإنترنت أو من صحة رابط التحديث."
                    is java.net.SocketTimeoutException ->
                        "⚠️ انتهت مهلة الاتصال أثناء تنزيل التحديث — تحقق من سرعة الإنترنت وحاول مجدداً."
                    else ->
                        "تعذر التحميل المباشر داخل التطبيق، يمكنك الضغط على (فتح الرابط المباشر في المتصفح)."
                }
                notifyWebView(webViewProvider, "error", 0, errMsg)
            }
        }.start()
    }

    private fun unwrapIfNestedZip(downloadedFile: File): File {
        return try {
            ZipFile(downloadedFile).use { zip ->
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
                    val extractedFile = File(downloadedFile.parentFile, "AlOsta_Extracted_${System.currentTimeMillis()}.apk")
                    if (extractedFile.exists()) extractedFile.delete()
                    zip.getInputStream(apkEntry).use { input ->
                        FileOutputStream(extractedFile).use { out ->
                            val buf = ByteArray(16384)
                            var totalCopied = 0L
                            while (true) {
                                val r = input.read(buf)
                                if (r <= 0) break
                                totalCopied += r
                                if (totalCopied > MAX_ALLOWED_APK_BYTES) {
                                    throw SecurityException("APK entry exceeds maximum safe size")
                                }
                                out.write(buf, 0, r)
                            }
                            out.flush()
                        }
                    }
                    if (extractedFile.exists() && extractedFile.length() >= MIN_VALID_APK_BYTES) {
                        if (moveFileSafely(extractedFile, downloadedFile)) {
                            return downloadedFile
                        }
                        return extractedFile
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
            val sourceApk = File(context.applicationInfo.sourceDir)
            if (!sourceApk.exists()) return ""

            val isDashPkg = context.packageName.contains("dashboard", ignoreCase = true)
            val exportFileName = if (isDashPkg) "AlOsta_Dashboard.apk" else "AlOsta_App.apk"
            val baseDir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: context.cacheDir
            val exportDir = File(baseDir, "exported_apks")
            if (!exportDir.exists()) exportDir.mkdirs()
            val outApk = File(exportDir, exportFileName)
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
                            FileInputStream(sourceApk).use { inStream ->
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

    /**
     * Verifies whether an OTA update URL is reachable, returns HTTP 200, and actually serves
     * a real APK/ZIP binary (PK\x03\x04) rather than a 404/403 error or HTML web page.
     * Reads only the first 4 bytes (or small HTML snippet for Drive/MediaFire/LFS) without downloading the full APK.
     */
    fun verifyApkUrl(rawUrl: String): String {
        val json = org.json.JSONObject()
        val cleanUrl = sanitizeInputUrl(rawUrl)
        if (cleanUrl.isEmpty() || !AlOstaSecurityVault.isSafeExternalHttpUrl(cleanUrl)) {
            json.put("ok", false)
            json.put("statusCode", 0)
            json.put("resolvedUrl", cleanUrl)
            json.put("message", "⛔ رابط التحديث غير صالح — يجب أن يبدأ بـ https:// ويكون رابطاً خارجياً صحيحاً.")
            return json.toString()
        }

        val gdriveFileId = extractGoogleDriveFileId(cleanUrl)
        val initialUrl = toDirectDownloadUrl(cleanUrl)
        val scopedCookies = mutableMapOf<String, MutableMap<String, String>>()
        var conn: HttpURLConnection? = null
        var input: BufferedInputStream? = null

        try {
            var res = openConnectionFollowingRedirects(initialUrl, scopedCookies)
            conn = res.connection

            if (res.statusCode == 404 && initialUrl != cleanUrl) {
                conn.disconnect()
                res = openConnectionFollowingRedirects(cleanUrl, scopedCookies)
                conn = res.connection
            }

            json.put("statusCode", res.statusCode)
            json.put("resolvedUrl", res.finalUrl)

            if (res.statusCode == 404 || res.statusCode == 410) {
                json.put("ok", false)
                json.put("message", "⛔ الملف غير موجود على هذا الرابط (خطأ ${res.statusCode})! تأكد من رفع AlOsta_App.apk ومن صحة الرابط.")
                return json.toString()
            }
            if (res.statusCode == 401 || res.statusCode == 403) {
                json.put("ok", false)
                json.put("message", "⛔ الرابط محمي أو خاص (خطأ ${res.statusCode})! اجعل الملف عاماً للجميع (Public / Anyone with the link).")
                return json.toString()
            }
            if (res.statusCode >= 400) {
                json.put("ok", false)
                json.put("message", "⛔ الخادم رفض الرابط (رمز الخطأ ${res.statusCode}).")
                return json.toString()
            }

            input = BufferedInputStream(conn.inputStream)
            input.mark(16384)
            val firstHeader = readExactBytes(input, 4)

            if (hasZipMagic(firstHeader)) {
                val sizeBytes = conn.contentLengthLong
                json.put("ok", true)
                json.put("isApkOrZip", true)
                json.put("sizeBytes", sizeBytes)
                val sizeLabel = if (sizeBytes > 0L) {
                    String.format(Locale.US, " (%.1f MB)", sizeBytes / (1024.0 * 1024.0))
                } else ""
                json.put("message", "✓ الرابط شغّال ومؤكد! يؤدي مباشرة إلى ملف APK/ZIP صالح$sizeLabel")
                return json.toString()
            }

            // Inspect HTML/text snippet (Git LFS, Google Drive confirm page, MediaFire, download.html)
            input.reset()
            val snippet = ByteArray(131072)
            var total = 0
            while (total < snippet.size) {
                val r = input.read(snippet, total, snippet.size - total)
                if (r <= 0) break
                total += r
            }
            input.close()
            conn.disconnect()
            input = null
            conn = null

            val textBody = String(snippet, 0, total, Charsets.UTF_8)
            val followUpUrl = if (textBody.startsWith("version https://git-lfs.github.com/spec/v1")) {
                toGitHubLfsMediaUrl(res.finalUrl) ?: toGitHubLfsMediaUrl(cleanUrl)
            } else if (!gdriveFileId.isNullOrBlank()) {
                parseGoogleDriveConfirmationUrl(textBody, gdriveFileId)
                    ?: "https://drive.google.com/uc?export=download&id=$gdriveFileId&confirm=t"
            } else {
                parseHtmlDirectApkLink(textBody, res.finalUrl)
            }

            if (followUpUrl != null && AlOstaSecurityVault.isSafeExternalHttpUrl(followUpUrl)) {
                val secondRes = openConnectionFollowingRedirects(followUpUrl, scopedCookies)
                conn = secondRes.connection
                json.put("statusCode", secondRes.statusCode)
                json.put("resolvedUrl", secondRes.finalUrl)

                if (secondRes.statusCode >= 400) {
                    json.put("ok", false)
                    json.put("message", "⛔ تعذر الوصول لملف التحميل المباشر (خطأ ${secondRes.statusCode}).")
                    return json.toString()
                }
                input = BufferedInputStream(conn.inputStream)
                val secondHeader = readExactBytes(input, 4)
                if (hasZipMagic(secondHeader)) {
                    val sizeBytes = conn.contentLengthLong
                    json.put("ok", true)
                    json.put("isApkOrZip", true)
                    json.put("sizeBytes", sizeBytes)
                    val sizeLabel = if (sizeBytes > 0L) {
                        String.format(Locale.US, " (%.1f MB)", sizeBytes / (1024.0 * 1024.0))
                    } else ""
                    json.put("message", "✓ الرابط شغّال ومؤكد! تم التحقق من ملف التحديث المباشر$sizeLabel")
                    return json.toString()
                }
            }

            json.put("ok", false)
            json.put("isApkOrZip", false)
            json.put("message", "⛔ الرابط يفتح صفحة ويب (HTML) وليس ملف APK مباشر! تأكد من صلاحية المشاركة العامة أو استخدم رابط تحميل مباشر.")
            return json.toString()
        } catch (e: Exception) {
            json.put("ok", false)
            json.put("statusCode", 0)
            json.put("resolvedUrl", initialUrl)
            val errMsg = when (e) {
                is java.io.FileNotFoundException -> "⛔ الملف غير موجود على هذا الرابط (خطأ 404)!"
                is java.net.UnknownHostException -> "⛔ تعذر الاتصال بالنطاق — تحقق من كتابة الرابط واتصال الإنترنت."
                is java.net.SocketTimeoutException -> "⚠️ انتهت مهلة الاتصال بالخادم — حاول الفحص مجدداً."
                else -> "⛔ فشل فحص الرابط: ${e.message ?: "خطأ غير معروف"}"
            }
            json.put("message", errMsg)
            return json.toString()
        } finally {
            try { input?.close() } catch (_: Exception) {}
            try { conn?.disconnect() } catch (_: Exception) {}
        }
    }

    fun openInExternalBrowser(context: Context, rawUrl: String) {
        val browserUrl = toBrowserFriendlyUrl(rawUrl)
        if (browserUrl.isEmpty() || !AlOstaSecurityVault.isSafeExternalHttpUrl(browserUrl)) return
        mainHandler.post {
            try {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(browserUrl)).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    addCategory(Intent.CATEGORY_BROWSABLE)
                }
                context.startActivity(intent)
            } catch (_: Exception) {
                try {
                    val fallbackUrl = sanitizeInputUrl(rawUrl)
                    val fallback = Intent(Intent.ACTION_VIEW, Uri.parse(fallbackUrl)).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(fallback)
                } catch (_: Exception) {
                }
            }
        }
    }
}
