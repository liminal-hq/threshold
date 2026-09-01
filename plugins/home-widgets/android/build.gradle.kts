plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "ca.liminalhq.threshold.homewidgets"
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
}

dependencies {
    compileOnly(project(":tauri-android"))
    implementation("org.jetbrains.kotlin:kotlin-stdlib:1.9.25")
    implementation("androidx.core:core-ktx:1.12.0")
    testImplementation("junit:junit:4.13.2")
    // org.json is provided by the Android runtime but not by plain JUnit -- pulled in explicitly so the
    // widget theme parsing tests can exercise the same JSONObject parsing path production code uses.
    testImplementation("org.json:json:20240303")
}
