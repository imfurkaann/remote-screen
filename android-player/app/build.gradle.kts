import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    id("org.jetbrains.kotlin.kapt")
}

// ---------------------------------------------------------------------------
// Read local.properties so developers can override config without touching
// committed files. Values are injected as BuildConfig constants at compile
// time, keeping secrets and environment-specific URLs out of source control.
// ---------------------------------------------------------------------------
val localProps = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}

fun configuredValue(key: String, default: String): String =
    (providers.gradleProperty(key).orNull
        ?: System.getenv(key)
        ?: localProps.getProperty(key)
        ?: default).trim()

val releaseBackendUrl = configuredValue("BACKEND_BASE_URL", "")
val releaseBootstrapKey = configuredValue("BOOTSTRAP_KEY", "")
val releaseBuildRequested = gradle.startParameter.taskNames.any { it.contains("release", ignoreCase = true) }
if (releaseBuildRequested) {
    require(releaseBackendUrl.startsWith("https://")) {
        "Release builds require an HTTPS BACKEND_BASE_URL (Gradle property, environment, or local.properties)"
    }
    require(releaseBootstrapKey.length >= 32) {
        "Release builds require a BOOTSTRAP_KEY of at least 32 characters (Gradle property, environment, or local.properties)"
    }
}
android {
    namespace = "com.signage.player"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.signage.player"
        minSdk = 26
        targetSdk = 35
        versionCode = 3
        versionName = "1.0.2"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        debug {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            buildConfigField(
                "String", "BACKEND_BASE_URL",
                "\"${configuredValue("BACKEND_BASE_URL", "http://10.0.2.2:4100")}\""
            )
            buildConfigField(
                "String", "BOOTSTRAP_KEY",
                "\"${configuredValue("BOOTSTRAP_KEY", "local-bootstrap-key")}\""
            )
        }
        release {
            manifestPlaceholders["usesCleartextTraffic"] = "false"
            buildConfigField("String", "BACKEND_BASE_URL", "\"$releaseBackendUrl\"")
            buildConfigField("String", "BOOTSTRAP_KEY", "\"$releaseBootstrapKey\"")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    kotlinOptions {
        jvmTarget = "11"
    }
    buildFeatures {
        compose = true
        buildConfig = true  // Required to generate the BuildConfig class
    }
}

dependencies {

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation("androidx.media3:media3-exoplayer:1.4.1")
    implementation("androidx.media3:media3-common:1.4.1")
    implementation("androidx.media3:media3-ui:1.4.1")
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-moshi:2.11.0")
    implementation("com.squareup.moshi:moshi-kotlin:1.15.1")
    implementation("io.socket:socket.io-client:2.1.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    kapt("androidx.room:room-compiler:2.6.1")
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.ui.test.junit4)
    debugImplementation(libs.androidx.ui.tooling)
    debugImplementation(libs.androidx.ui.test.manifest)
}
