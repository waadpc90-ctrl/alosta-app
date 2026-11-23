package com.example

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ExampleUnitTest {

    @Test
    fun pbkdf2Hash_isDeterministicAndSalted() {
        val hash1 = AlOstaSecurityVault.pbkdf2Hash("waad2026", "admin_user_1")
        val hash2 = AlOstaSecurityVault.pbkdf2Hash("waad2026", "admin_user_1")
        val differentSaltHash = AlOstaSecurityVault.pbkdf2Hash("waad2026", "admin_user_2")
        val differentSecretHash = AlOstaSecurityVault.pbkdf2Hash("wrong_pass", "admin_user_1")

        assertEquals(64, hash1.length)
        assertEquals(hash1, hash2)
        assertNotEquals(hash1, differentSaltHash)
        assertNotEquals(hash1, differentSecretHash)
    }

    @Test
    fun isTrustedWebViewOrigin_enforcesAssetIsolation() {
        assertTrue(AlOstaSecurityVault.isTrustedWebViewOrigin("file:///android_asset/index.html"))
        assertTrue(AlOstaSecurityVault.isTrustedWebViewOrigin("file:///android_asset/dashboard.html?storePortal=ST-123456"))
        assertTrue(AlOstaSecurityVault.isTrustedWebViewOrigin("about:blank"))

        // Untrusted origins must be blocked from accessing privileged bridge
        assertFalse(AlOstaSecurityVault.isTrustedWebViewOrigin("https://evil.example.com/phish.html"))
        assertFalse(AlOstaSecurityVault.isTrustedWebViewOrigin("http://malicious.site/"))
        assertFalse(AlOstaSecurityVault.isTrustedWebViewOrigin("file:///data/data/com.aistudio.alosta.wpc90x/shared_prefs/al_osta_local_db.xml"))
        assertFalse(AlOstaSecurityVault.isTrustedWebViewOrigin("javascript:alert(1)"))
    }

    @Test
    fun isSafeExternalHttpUrl_blocksLoopbackMetadataAndFileProtocols() {
        assertTrue(AlOstaSecurityVault.isSafeExternalHttpUrl("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view"))
        assertTrue(AlOstaSecurityVault.isSafeExternalHttpUrl("https://maps.app.goo.gl/xyz123"))

        // SSRF & local/loopback targets must be blocked
        assertFalse(AlOstaSecurityVault.isSafeExternalHttpUrl("http://127.0.0.1:8080/admin"))
        assertFalse(AlOstaSecurityVault.isSafeExternalHttpUrl("http://localhost/secret"))
        assertFalse(AlOstaSecurityVault.isSafeExternalHttpUrl("http://169.254.169.254/latest/meta-data/"))
        assertFalse(AlOstaSecurityVault.isSafeExternalHttpUrl("http://10.0.2.2:3000/"))
        assertFalse(AlOstaSecurityVault.isSafeExternalHttpUrl("http://0.0.0.0/"))
        assertFalse(AlOstaSecurityVault.isSafeExternalHttpUrl("file:///etc/hosts"))
        assertFalse(AlOstaSecurityVault.isSafeExternalHttpUrl("javascript:alert(1)"))
    }

    @Test
    fun isSafeIntentUrl_blocksXssAndLocalFileSchemes() {
        assertTrue(AlOstaSecurityVault.isSafeIntentUrl("https://wa.me/9647701234567"))
        assertTrue(AlOstaSecurityVault.isSafeIntentUrl("whatsapp://send?phone=9647701234567"))
        assertTrue(AlOstaSecurityVault.isSafeIntentUrl("tel:07701234567"))
        assertTrue(AlOstaSecurityVault.isSafeIntentUrl("geo:33.3152,44.3661"))
        assertTrue(AlOstaSecurityVault.isSafeIntentUrl("alosta://store?storePortal=store_1&code=ST-ABCDEF"))

        assertFalse(AlOstaSecurityVault.isSafeIntentUrl("javascript:window.AndroidApp.loadLocalDb()"))
        assertFalse(AlOstaSecurityVault.isSafeIntentUrl("vbscript:msgbox(1)"))
        assertFalse(AlOstaSecurityVault.isSafeIntentUrl("file:///data/data/com.aistudio.alosta.wpc90x/"))
        assertFalse(AlOstaSecurityVault.isSafeIntentUrl("content://com.android.contacts/contacts"))
        assertFalse(AlOstaSecurityVault.isSafeIntentUrl("data:text/html,<script>alert(1)</script>"))
    }

    @Test
    fun googleDriveFileIdExtraction_andDirectDownloadConversion() {
        val sampleDriveUrl = "https://drive.google.com/file/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ12345/view?usp=sharing"
        val extractedId = AlOstaApkUpdater.extractGoogleDriveFileId(sampleDriveUrl)
        assertEquals("1aBcDeFgHiJkLmNoPqRsTuVwXyZ12345", extractedId)

        val directUrl = AlOstaApkUpdater.toDirectDownloadUrl(sampleDriveUrl)
        assertTrue(directUrl.contains("drive.usercontent.google.com/download"))
        assertTrue(directUrl.contains("id=1aBcDeFgHiJkLmNoPqRsTuVwXyZ12345"))
        assertFalse(directUrl.contains("authuser=0"))

        val browserUrl = AlOstaApkUpdater.toBrowserFriendlyUrl(sampleDriveUrl)
        assertEquals("https://drive.google.com/uc?export=download&id=1aBcDeFgHiJkLmNoPqRsTuVwXyZ12345", browserUrl)
    }

    @Test
    fun apkUpdater_supportsGithubBlobRawLfsDropboxMediafireAndSpaces() {
        assertEquals(
            "https://raw.githubusercontent.com/waadpc90-ctrl/alosta-app/main/AlOsta_App.apk",
            AlOstaApkUpdater.toDirectDownloadUrl("https://github.com/waadpc90-ctrl/alosta-app/blob/main/AlOsta_App.apk")
        )
        assertEquals(
            "https://raw.githubusercontent.com/waadpc90-ctrl/alosta-app/main/AlOsta_App.apk",
            AlOstaApkUpdater.toDirectDownloadUrl("https://github.com/waadpc90-ctrl/alosta-app/raw/main/AlOsta_App.apk")
        )
        assertEquals(
            "https://media.githubusercontent.com/media/waadpc90-ctrl/alosta-app/main/AlOsta_App.apk",
            AlOstaApkUpdater.toGitHubLfsMediaUrl("https://raw.githubusercontent.com/waadpc90-ctrl/alosta-app/main/AlOsta_App.apk")
        )
        assertEquals(
            "https://www.dropbox.com/scl/fi/abc/AlOsta_App.apk?rlkey=xyz&dl=1",
            AlOstaApkUpdater.toDirectDownloadUrl("https://www.dropbox.com/scl/fi/abc/AlOsta_App.apk?rlkey=xyz")
        )
        assertEquals(
            "https://download1234.mediafire.com/abc/AlOsta_App.apk",
            AlOstaApkUpdater.parseMediaFireDownloadUrl("""<a id="downloadButton" href="https://download1234.mediafire.com/abc/AlOsta_App.apk">Download</a>""")
        )
        assertEquals(
            "https://waadpc90-ctrl.github.io/alosta-app/AlOsta_App.apk",
            AlOstaApkUpdater.parseHtmlDirectApkLink(
                """<a href="./AlOsta_App.apk">Download</a>""",
                "https://waadpc90-ctrl.github.io/alosta-app/download.html"
            )
        )
        assertTrue(AlOstaSecurityVault.isSafeExternalHttpUrl("https://example.com/AlOsta App v1.0.19.apk"))
    }

    @Test
    fun backgroundNotifier_versionComparisonAndAudienceMatching() {
        assertTrue(AlOstaBackgroundNotifier.isVersionNewer("1.0.20", "1.0.19"))
        assertTrue(AlOstaBackgroundNotifier.isVersionNewer("1.1.0", "1.0.19"))
        assertTrue(AlOstaBackgroundNotifier.isVersionNewer("v2.0.0", "1.9.9"))
        assertFalse(AlOstaBackgroundNotifier.isVersionNewer("1.0.19", "1.0.19"))
        assertFalse(AlOstaBackgroundNotifier.isVersionNewer("1.0.18", "1.0.19"))

        assertTrue(AlOstaBackgroundNotifier.audienceMatchesRole("all", "contractor"))
        assertTrue(AlOstaBackgroundNotifier.audienceMatchesRole("all", "worker"))
        assertTrue(AlOstaBackgroundNotifier.audienceMatchesRole("contractors", "contractor"))
        assertFalse(AlOstaBackgroundNotifier.audienceMatchesRole("contractors", "worker"))
        assertTrue(AlOstaBackgroundNotifier.audienceMatchesRole("workers", "worker"))
        assertFalse(AlOstaBackgroundNotifier.audienceMatchesRole("workers", "contractor"))

        val (leftTitle, leftBody) = AlOstaBackgroundNotifier.formatPersonalAlert("left_site", "أحمد", "بناية المنصور", "", distText = "240")
        assertTrue(leftTitle.contains("مغادرة"))
        assertTrue(leftBody.contains("أحمد") && leftBody.contains("بناية المنصور") && leftBody.contains("240"))

        val (matTitle, matBody) = AlOstaBackgroundNotifier.formatPersonalAlert("worker_material", "علي", "فيلا الكرادة", "", itemName = "صبغ جوتن", costText = "85,000")
        assertTrue(matTitle.contains("مواد"))
        assertTrue(matBody.contains("علي") && matBody.contains("صبغ جوتن") && matBody.contains("85,000"))

        val (outTitle, outBody) = AlOstaBackgroundNotifier.formatPersonalAlert("clock_out", "حسين", "برج الزوراء", "")
        assertTrue(outTitle.contains("انصراف"))
        assertTrue(outBody.contains("حسين") && outBody.contains("برج الزوراء"))

        val (invTitle, invBody) = AlOstaBackgroundNotifier.formatPersonalAlert("invite_accepted", "كريم", "", "")
        assertTrue(invTitle.contains("انضمام"))
        assertTrue(invBody.contains("كريم"))

        val (jobTitle, jobBody) = AlOstaBackgroundNotifier.formatPersonalAlert("job_apply", "سجاد", "", "")
        assertTrue(jobTitle.contains("متقدم"))
        assertTrue(jobBody.contains("سجاد"))
    }

    @Test
    fun workerStepTracker_energyAndPlausibilityGuard_arePhysiologicallyAccurate() {
        assertEquals(0, WorkerStepTracker.computeNativeEnergyKcal(0, 0))
        val painterKcal = WorkerStepTracker.computeNativeEnergyKcal(1600, 180)
        assertTrue("Expected realistic painter kcal (450..530), got $painterKcal", painterKcal in 450..530)

        // Realistic walking: 120 steps in 60 seconds (~2 steps/sec) -> valid
        assertTrue(WorkerStepTracker.isPlausibleStepDelta(120, 60_000L))
        // Impossible vibration/vehicle jump: 1500 steps in 30 seconds (50 steps/sec) -> rejected
        assertFalse(WorkerStepTracker.isPlausibleStepDelta(1500, 30_000L))
        // Huge off-shift spike > 2500 -> rejected
        assertFalse(WorkerStepTracker.isPlausibleStepDelta(3000, 3_600_000L))
    }
}

