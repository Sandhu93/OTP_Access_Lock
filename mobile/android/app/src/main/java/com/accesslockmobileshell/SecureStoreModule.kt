package com.accesslockmobileshell

import android.content.Context
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Arguments
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties

class SecureStoreModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val preferences = context.getSharedPreferences("access_lock_secure_store", Context.MODE_PRIVATE)
  private val alias = "access_lock_demo_key"

  override fun getName(): String = "AccessLockSecureStore"

  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    if (!store.containsAlias(alias)) {
      val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
      generator.init(
        KeyGenParameterSpec.Builder(
          alias,
          KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
        )
          .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
          .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
          .setRandomizedEncryptionRequired(true)
          .build(),
      )
      generator.generateKey()
    }
    return (store.getEntry(alias, null) as KeyStore.SecretKeyEntry).secretKey
  }

  private fun encrypt(value: String): String {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key())
    return Base64.encodeToString(cipher.iv + cipher.doFinal(value.toByteArray(StandardCharsets.UTF_8)), Base64.NO_WRAP)
  }

  private fun decrypt(encoded: String): String {
    val payload = Base64.decode(encoded, Base64.NO_WRAP)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, payload.copyOfRange(0, 12)))
    return String(cipher.doFinal(payload.copyOfRange(12, payload.size)), StandardCharsets.UTF_8)
  }

  @ReactMethod
  fun setItem(name: String, value: String, promise: Promise) {
    try {
      preferences.edit().putString(name, encrypt(value)).apply()
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("SECURE_STORE_WRITE_FAILED", error)
    }
  }

  @ReactMethod
  fun getItem(name: String, promise: Promise) {
    try {
      val encoded = preferences.getString(name, null)
      if (encoded == null) {
        promise.resolve(null)
        return
      }
      promise.resolve(decrypt(encoded))
    } catch (error: Exception) {
      promise.reject("SECURE_STORE_READ_FAILED", error)
    }
  }

  @ReactMethod
  fun removeItem(name: String, promise: Promise) {
    preferences.edit().remove(name).apply()
    promise.resolve(null)
  }

  @ReactMethod
  fun createPkce(promise: Promise) {
    try {
      val random = ByteArray(32)
      SecureRandom().nextBytes(random)
      val verifier = Base64.encodeToString(random, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
      val digest = MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(StandardCharsets.US_ASCII))
      val challenge = Base64.encodeToString(digest, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
      val stateBytes = ByteArray(24)
      SecureRandom().nextBytes(stateBytes)
      val state = Base64.encodeToString(stateBytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
      val result: WritableMap = Arguments.createMap()
      result.putString("verifier", verifier)
      result.putString("challenge", challenge)
      result.putString("state", state)
      promise.resolve(result)
    } catch (error: Exception) {
      promise.reject("PKCE_GENERATION_FAILED", error)
    }
  }

  @ReactMethod
  fun getOrCreateDeviceFingerprint(promise: Promise) {
    try {
      val existing = preferences.getString("device_fingerprint", null)?.let { decrypt(it) }
      if (!existing.isNullOrBlank()) { promise.resolve(existing); return }
      val bytes = ByteArray(32)
      SecureRandom().nextBytes(bytes)
      val fingerprint = bytes.joinToString("") { byte -> "%02x".format(byte) }
      preferences.edit().putString("device_fingerprint", encrypt(fingerprint)).apply()
      promise.resolve(fingerprint)
    } catch (error: Exception) {
      promise.reject("DEVICE_IDENTITY_FAILED", error)
    }
  }
}
