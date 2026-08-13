plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "ca.liminalhq.threshold.wearsync"
    compileSdk = 36

    defaultConfig {
        minSdk = 26

        // Spike-only (issue #255 Phase 0): lets a human tester simulate a slow/blocking
        // ContentProvider#onCreate() during cold start, to confirm it doesn't measurably
        // delay AlarmRingingService's audio start or trip StrictMode. Defaults to 0 (no
        // stall) so ordinary builds are unaffected; override with e.g.
        // `./gradlew assembleDebug -PbusSpikeStallMs=1500` (clamped to 2000ms in
        // BusInitProvider.kt regardless of what's passed here). Only ever read in debug
        // builds (see BusInitProvider.kt, which is itself debug-only via src/debug). Delete
        // this whole mechanism once Phase 0 wraps up.
        val busSpikeStallMs = (project.findProperty("busSpikeStallMs") as? String)
            ?.takeIf { it.isNotBlank() }
            ?: "0"
        buildConfigField("int", "BUS_SPIKE_STALL_MS", busSpikeStallMs)
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        buildConfig = true
    }
}

dependencies {
    compileOnly(project(":tauri-android"))
    implementation("org.jetbrains.kotlin:kotlin-stdlib:1.9.25")
    implementation("com.google.android.gms:play-services-wearable:18.1.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.7.3")
    implementation("androidx.core:core-ktx:1.12.0")
}
