package com.signage.player.config

import com.signage.player.BuildConfig

/**
 * App-wide defaults resolved at build time from local.properties.
 *
 * To override for your environment, edit local.properties (never committed):
 *
 *   BACKEND_BASE_URL=http://192.168.1.100:4100   # LAN IP for real device
 *   BOOTSTRAP_KEY=local-bootstrap-key
 *   TENANT_ID=tenant-demo
 *
 * See app/build.gradle.kts for how these are injected into BuildConfig.
 */
object AppDefaults {
    val BACKEND_BASE_URL: String = BuildConfig.BACKEND_BASE_URL
    val BOOTSTRAP_KEY: String = BuildConfig.BOOTSTRAP_KEY
    val TENANT_ID: String = BuildConfig.TENANT_ID
}
