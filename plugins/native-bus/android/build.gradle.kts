plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "ca.liminalhq.threshold.nativebus"
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
            // NativeEventBus/DurableEventQueue call android.util.Log on error paths this
            // module's own JUnit tests deliberately exercise (a throwing listener, a
            // corrupt persisted entry). Without this, those calls hit Android's unmocked
            // stub jar and throw instead of being no-ops under plain JUnit (no
            // Robolectric in this codebase's test-kotlin-plugins CI job).
            isReturnDefaultValues = true
        }
    }
}

dependencies {
    compileOnly(project(":tauri-android"))
    implementation("org.jetbrains.kotlin:kotlin-stdlib:1.9.25")

    testImplementation("junit:junit:4.13.2")
    // Real org.json, not Android's throw-on-call stub -- same fix already used by
    // apps/threshold-wear's own JVM-only JSON parsing tests.
    testImplementation("org.json:json:20231013")
}
