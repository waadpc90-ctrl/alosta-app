package com.example

import java.util.Locale

object AlOstaSecurityVault {
    private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
    private const val KEY_ALIAS = "al_osta_master_aes256_gcm_key_v2"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val GCM_TAG_BITS = 128
    private const val ENCRYPTED_PREFIX = "ENC_GCM_V2:"

    @Synchronized
    private fun getOrCreateAesKey(): javax.crypto.SecretKey? {
        return try {
            val keyStore = java.security.KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
            val existing = keyStore.getEntry(KEY_ALIAS, null) as? java.security.KeyStore.SecretKeyEntry
            if (existing != null) {
                existing.secretKey
            } else {
                val keyGen = javax.crypto.KeyGenerator.getInstance(
                    android.security.keystore.KeyProperties.KEY_ALGORITHM_AES,
                    KEYSTORE_PROVIDER
                )
                val spec = android.security.keystore.KeyGenParameterSpec.Builder(
                    KEY_ALIAS,
                    android.security.keystore.KeyProperties.PURPOSE_ENCRYPT or
                        android.security.keystore.KeyProperties.PURPOSE_DECRYPT
                )
                    .setBlockModes(android.security.keystore.KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(android.security.keystore.KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .build()
                keyGen.init(spec)
                keyGen.generateKey()
            }
        } catch (_: Exception) {
            null
        }
    }

    fun encryptAtRest(plainText: String): String {
        if (plainText.isEmpty() || plainText.startsWith(ENCRYPTED_PREFIX)) return plainText
        return try {
            val secretKey = getOrCreateAesKey() ?: return plainText
            val cipher = javax.crypto.Cipher.getInstance(TRANSFORMATION)
            cipher.init(javax.crypto.Cipher.ENCRYPT_MODE, secretKey)
            val iv = cipher.iv
            val cipherBytes = cipher.doFinal(plainText.toByteArray(Charsets.UTF_8))
            val ivB64 = android.util.Base64.encodeToString(iv, android.util.Base64.NO_WRAP)
            val dataB64 = android.util.Base64.encodeToString(cipherBytes, android.util.Base64.NO_WRAP)
            "$ENCRYPTED_PREFIX$ivB64:$dataB64"
        } catch (_: Exception) {
            plainText
        }
    }

    fun decryptAtRest(storedValue: String): String {
        if (!storedValue.startsWith(ENCRYPTED_PREFIX)) return storedValue
        return try {
            val payload = storedValue.removePrefix(ENCRYPTED_PREFIX)
            val parts = payload.split(":", limit = 2)
            if (parts.size != 2) return storedValue
            val iv = android.util.Base64.decode(parts[0], android.util.Base64.NO_WRAP)
            val cipherBytes = android.util.Base64.decode(parts[1], android.util.Base64.NO_WRAP)
            val secretKey = getOrCreateAesKey() ?: return storedValue
            val cipher = javax.crypto.Cipher.getInstance(TRANSFORMATION)
            val spec = javax.crypto.spec.GCMParameterSpec(GCM_TAG_BITS, iv)
            cipher.init(javax.crypto.Cipher.DECRYPT_MODE, secretKey, spec)
            String(cipher.doFinal(cipherBytes), Charsets.UTF_8)
        } catch (_: Exception) {
            "{}"
        }
    }

    fun pbkdf2Hash(secret: String, salt: String): String {
        return try {
            val normalizedSalt = "alosta_v2_salt::${salt.trim().lowercase(Locale.ROOT)}"
            val spec = javax.crypto.spec.PBEKeySpec(
                secret.toCharArray(),
                normalizedSalt.toByteArray(Charsets.UTF_8),
                32768,
                256
            )
            val skf = javax.crypto.SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
            val hashBytes = skf.generateSecret(spec).encoded
            hashBytes.joinToString("") { "%02x".format(it) }
        } catch (_: Exception) {
            ""
        }
    }

    fun isTrustedWebViewOrigin(url: String?): Boolean {
        if (url.isNullOrBlank()) return true
        val clean = url.trim().lowercase(Locale.ROOT)
        return clean.startsWith("file:///android_asset/") || clean == "about:blank"
    }

    fun isSafeExternalHttpUrl(rawUrl: String?): Boolean {
        if (rawUrl.isNullOrBlank()) return false
        return try {
            val trimmed = rawUrl.trim()
            val encoded = trimmed.replace(" ", "%20")
            val (schemeRaw, hostRaw) = try {
                val parsed = java.net.URI(encoded)
                Pair(parsed.scheme ?: "", parsed.host ?: "")
            } catch (_: Exception) {
                val urlObj = java.net.URL(encoded)
                Pair(urlObj.protocol ?: "", urlObj.host ?: "")
            }
            val scheme = schemeRaw.lowercase(Locale.ROOT)
            if (scheme != "https" && scheme != "http") return false
            val host = hostRaw.lowercase(Locale.ROOT).trim('[', ']')
            if (host.isEmpty()) return false
            if (host == "localhost" ||
                host == "127.0.0.1" ||
                host == "0.0.0.0" ||
                host == "::1" ||
                host == "10.0.2.2" ||
                host.startsWith("10.") ||
                host.startsWith("127.") ||
                host.startsWith("169.254.") ||
                host.startsWith("192.168.") ||
                host.startsWith("fc") ||
                host.startsWith("fd") ||
                Regex("""^172\.(1[6-9]|2\d|3[01])\.""").containsMatchIn(host)
            ) {
                return false
            }
            true
        } catch (_: Exception) {
            false
        }
    }

    fun isSafeIntentUrl(rawUrl: String?): Boolean {
        if (rawUrl.isNullOrBlank()) return false
        val clean = rawUrl.trim()
        val lower = clean.lowercase(Locale.ROOT)
        if (lower.startsWith("javascript:") ||
            lower.startsWith("vbscript:") ||
            lower.startsWith("file:") ||
            lower.startsWith("content:") ||
            lower.startsWith("data:")
        ) {
            return false
        }
        return lower.startsWith("https://") ||
            lower.startsWith("http://") ||
            lower.startsWith("whatsapp://") ||
            lower.startsWith("tel:") ||
            lower.startsWith("mailto:") ||
            lower.startsWith("geo:") ||
            lower.startsWith("alosta://") ||
            lower.startsWith("intent://")
    }
}
