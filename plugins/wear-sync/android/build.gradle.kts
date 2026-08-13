plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "ca.liminalhq.threshold.wearsync"
    compileSdk = 36

    defaultConfig {
        minSdk = 26
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
    testOptions {
        unitTests {
            // WearSyncEventQueue calls android.util.Log on paths this module's own JUnit
            // tests exercise (corrupt legacy queue JSON, malformed entries). Without this,
            // those calls hit Android's unmocked stub jar and throw instead of being no-ops
            // under plain JUnit (no Robolectric in this codebase's test-kotlin-plugins CI job)
            // -- same fix native-bus's own build.gradle.kts already applies for the same reason.
            isReturnDefaultValues = true
        }
    }
}

dependencies {
    compileOnly(project(":tauri-android"))
    implementation(project(":tauri-plugin-native-bus"))
    implementation("org.jetbrains.kotlin:kotlin-stdlib:1.9.25")
    implementation("com.google.android.gms:play-services-wearable:18.1.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.7.3")
    implementation("androidx.core:core-ktx:1.12.0")

    testImplementation("junit:junit:4.13.2")
    // Real org.json, not Android's throw-on-call stub -- same fix already used by
    // apps/threshold-wear's own JVM-only JSON parsing tests and native-bus's own tests.
    testImplementation("org.json:json:20231013")
}
