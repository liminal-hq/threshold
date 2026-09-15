plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "ca.liminalhq.threshold.nativelog"
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
            // NativeEventLog calls android.util.Log on every entry (not just error
            // paths) -- same fix as native-bus's build.gradle.kts, for the same reason:
            // no Robolectric in this codebase's test-kotlin-plugins CI job.
            isReturnDefaultValues = true
        }
    }
}

dependencies {
    compileOnly(project(":tauri-android"))
    implementation("org.jetbrains.kotlin:kotlin-stdlib:1.9.25")

    testImplementation("junit:junit:4.13.2")
}
