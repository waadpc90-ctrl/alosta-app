package com.example

import android.content.Context
import android.webkit.WebView
import androidx.test.core.app.ApplicationProvider
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class ExampleRobolectricTest {

    @Test
    fun appName_andResources_areConfiguredForProduction() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val appName = context.getString(R.string.app_name)
        assertEquals("الأسطة", appName)
        assertTrue(context.getString(R.string.offline_banner).isNotBlank())
        assertTrue(context.getString(R.string.exit_confirm_title).isNotBlank())
    }

    @Test
    fun bundledWebAssets_andCompiledJsBundles_existAndAreNonEmpty() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val requiredAssets = listOf(
            "index.html",
            "dashboard.html",
            "vendor/app-compiled.js",
            "vendor/dashboard-compiled.js",
            "vendor/react.production.min.js",
            "vendor/react-dom.production.min.js",
            "vendor/firebase-app.js",
            "vendor/firebase-firestore.js",
            "vendor/firebase-auth.js",
            "vendor/qrious.min.js"
        )
        for (assetPath in requiredAssets) {
            val bytes = context.assets.open(assetPath).use { it.readBytes() }
            assertTrue("Asset $assetPath must be non-empty", bytes.size > 100)
        }
    }

    @Test
    fun storePortalSecurityPolicy_preventsFinancialAccountModificationFromPortalLink() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val indexHtml = context.assets.open("index.html").bufferedReader().use { it.readText() }
        val dashHtml = context.assets.open("dashboard.html").bufferedReader().use { it.readText() }

        // 1. Verify getStoreAccountNumber never falls back to contact phone (storeObj.phone)
        assertFalse(
            "index.html getStoreAccountNumber must not fall back to storeObj.phone",
            indexHtml.contains("storeObj.paymentAccountNumber || storeObj.accountNumber || storeObj.phone")
        )
        assertFalse(
            "dashboard.html getStoreAccountNumber must not fall back to storeObj.phone",
            dashHtml.contains("storeObj.paymentAccountNumber || storeObj.accountNumber || storeObj.phone")
        )

        // 2. Verify StoreOwnerPortal has no handleSaveStorePaymentInfo function
        assertFalse(
            "dashboard.html StoreOwnerPortal must not allow handleSaveStorePaymentInfo",
            dashHtml.contains("handleSaveStorePaymentInfo")
        )
        assertFalse(
            "index.html StoreOwnerPortal must not allow handleSaveStorePaymentInfo",
            indexHtml.contains("handleSaveStorePaymentInfo")
        )

        // 3. Verify both portals use buildSafeStoreContactPayload and enforce authorizedPortalCode
        assertTrue(indexHtml.contains("buildSafeStoreContactPayload"))
        assertTrue(dashHtml.contains("buildSafeStoreContactPayload"))
        assertTrue(indexHtml.contains("authorizedPortalCode"))
        assertTrue(dashHtml.contains("authorizedPortalCode"))

        // 4. Verify project-scoped wage isolation & liquidity-enforced expense settlement
        assertTrue(indexHtml.contains("resolveAttendanceOwnerProjectId"))
        assertTrue(indexHtml.contains("lockWorkerPriorUnscopedAttendance"))
        assertTrue(indexHtml.contains("openSettleExpenseModal"))

        // 5. Verify anti-fake-account registration validation (Name + Iraqi Carrier Phone + Password + Device Rate Limit)
        assertTrue(indexHtml.contains("validateRealIraqiPhone"))
        assertTrue(indexHtml.contains("validateRealPersonName"))
        assertTrue(indexHtml.contains("validateAccountPassword"))
        assertTrue(indexHtml.contains("checkDeviceRegistrationQuota"))
    }

    @Test
    fun workerStepTracker_isolatesMetricsByWorkerId_andResetsCleanly() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val resetJsonStr = WorkerStepTracker.resetTodaySteps(context, "worker_sec_test_1")
        val json = JSONObject(resetJsonStr)
        assertEquals(0, json.getInt("steps"))
        assertEquals(0, json.getInt("effortScore"))
        assertEquals(0, json.getInt("effortStars"))
    }

    @Test
    fun androidAppBridge_localDbRoundTrip_andBlocksUntrustedWebViewOrigin() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val webView = WebView(context)
        webView.loadUrl("file:///android_asset/index.html")

        val trustedBridge = AndroidAppBridge(
            context = context,
            webViewProvider = { webView },
            onThemeModeChange = {}
        )

        val samplePayload = """{"projects":[{"id":"p1","name":"مشروع آمن"}]}"""
        trustedBridge.saveLocalDb(samplePayload)
        assertEquals(samplePayload, trustedBridge.loadLocalDb())

        // Simulate untrusted external URL loaded into WebView: bridge must block access
        webView.loadUrl("https://evil-attacker.example.com/exploit.html")
        assertEquals("{}", trustedBridge.loadLocalDb())
        assertEquals("", trustedBridge.hashCredential("secret", "salt"))
        trustedBridge.saveLocalDb("""{"hijacked":true}""")

        // Restore trusted asset origin and verify hijacked write was blocked
        webView.loadUrl("file:///android_asset/index.html")
        assertEquals(samplePayload, trustedBridge.loadLocalDb())
    }
}
