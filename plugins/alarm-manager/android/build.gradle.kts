plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.plugin.alarmmanager"
    compileSdk = 36

    defaultConfig {
        minSdk = 26
        consumerProguardFiles("proguard-rules.pro")
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
            // The migration/drain JUnit tests exercise Log.w() warning paths (corrupt legacy
            // JSON, an unregistered channel) that hit Android's unmocked stub jar and throw
            // instead of being no-ops under plain JUnit (no Robolectric in this codebase's
            // test-kotlin-plugins CI job) -- same fix as plugins/native-bus's build.gradle.kts.
            isReturnDefaultValues = true
        }
    }
}

dependencies {
    compileOnly(project(":tauri-android"))
    implementation(project(":tauri-plugin-native-bus"))
    implementation("org.jetbrains.kotlin:kotlin-stdlib:1.9.25")
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.activity:activity:1.8.0")
    testImplementation("junit:junit:4.13.2")
    // Real org.json, not Android's throw-on-call stub -- same fix already used by
    // plugins/native-bus and apps/threshold-wear's own JVM-only JSON parsing tests.
    testImplementation("org.json:json:20231013")
}
