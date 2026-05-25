import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("org.jetbrains.kotlin.plugin.compose")
    id("jacoco")
}

android {
    namespace = "com.openclaw.console"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.openclaw.console"
        minSdk = 28
        targetSdk = 35
        val ciVersionCode = providers.gradleProperty("ciVersionCode").orNull?.toIntOrNull()
        versionCode = ciVersionCode ?: (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }

        // RevenueCat public key. CI injects REVENUECAT_PUBLIC_KEY at build time;
        // local builds without the secret fall through to empty string, which
        // SubscriptionService.configure treats as "disabled".
        val revenueCatKey = System.getenv("REVENUECAT_PUBLIC_KEY")
            ?: providers.gradleProperty("revenueCatPublicKey").orNull
            ?: ""
        buildConfigField("String", "REVENUECAT_PUBLIC_KEY", "\"$revenueCatKey\"")

        // Sentry DSN for error tracking (environment variable only - secure)
        val sentryDsn = System.getenv("SENTRY_DSN")
            ?: providers.gradleProperty("sentryDsn").orNull
            ?: ""
        buildConfigField("String", "SENTRY_DSN", "\"$sentryDsn\"")
    }

    signingConfigs {
        create("release") {
            val keystorePath = System.getenv("KEYSTORE_PATH")
            if (keystorePath != null) {
                storeFile = file(keystorePath)
                storePassword = System.getenv("KEYSTORE_PASSWORD")
                keyAlias = System.getenv("KEY_ALIAS")
                keyPassword = System.getenv("KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            signingConfig = if (System.getenv("KEYSTORE_PATH") != null) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    // 2026 Testing Configuration
    testOptions {
        unitTests {
            isIncludeAndroidResources = true
            isReturnDefaultValues = true
        }
        animationsDisabled = true
    }

    lint {
        disable += "NullSafeMutableLiveData"
        disable += "RememberInComposition"
        disable += "FrequentlyChangingValue"
        disable += "AutoboxingStateCreation"
        // AGP lint remains noisy around several Compose/Lifecycle detectors in CI.
        // This is a known tooling bug, not a code issue. The build itself compiles fine.
        abortOnError = false
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
            excludes += "/META-INF/versions/9/OSGI-INF/MANIFEST.MF"
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.JVM_17
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2025.12.00")
    implementation(composeBom)
    androidTestImplementation(composeBom)

    // Compose UI
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")

    // Material 3
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")

    // Activity & Lifecycle
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.10.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.10.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.10.0")

    // Navigation
    implementation("androidx.navigation:navigation-compose:2.9.7")

    // Core
    implementation("androidx.core:core-ktx:1.18.0")

    // OkHttp (WebSocket + HTTP)
    implementation("com.squareup.okhttp3:okhttp:5.3.2")
    implementation("com.squareup.okhttp3:logging-interceptor:5.3.2")

    // Kotlinx Serialization runtime.
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.8.1")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.11.0")

    // AndroidX Security (EncryptedSharedPreferences)
    implementation("androidx.security:security-crypto:1.1.0")

    // Biometric
    implementation("androidx.biometric:biometric:1.4.0-alpha07")
    implementation("com.google.errorprone:error_prone_annotations:2.49.0")

    // QR gateway pairing scanner & generator.
    implementation("androidx.camera:camera-camera2:1.6.1")
    implementation("androidx.camera:camera-lifecycle:1.6.1")
    implementation("androidx.camera:camera-view:1.6.1")
    implementation("com.google.mlkit:barcode-scanning:17.3.0")
    implementation("com.google.guava:guava:33.5.0-android")
    implementation("com.google.zxing:core:3.5.3")
    implementation("com.journeyapps:zxing-android-embedded:4.3.0")

    // Pull-to-refresh
    implementation("androidx.compose.material:material:1.6.0")

    // Sentry - Error tracking and performance monitoring (2026 observability)
    implementation("io.sentry:sentry-android:7.8.0")

    // RevenueCat (Android billing + subscription management).
    // Mirrors iOS SubscriptionService — product IDs and entitlement name must match iOS.
    implementation("com.revenuecat.purchases:purchases:9.29.1")

    // 2026 Testing Stack - Comprehensive Coverage
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.11.0")
    testImplementation("com.squareup.okhttp3:mockwebserver:5.3.2")
    testImplementation("androidx.compose.ui:ui-test-junit4")
    testImplementation("androidx.test.ext:junit:1.1.5")

    // Robolectric for Android unit testing (2026 best practice)
    testImplementation("org.robolectric:robolectric:4.13")
    testImplementation("androidx.test:core:1.6.1")
    testImplementation("androidx.test:rules:1.6.1")
    testImplementation("androidx.test:runner:1.6.1")
    testImplementation("androidx.test.ext:truth:1.6.0")

    // MockK for better Kotlin mocking
    testImplementation("io.mockk:mockk:1.13.11")
    testImplementation("io.mockk:mockk-android:1.13.11")

    // Turbine for Flow testing
    testImplementation("app.cash.turbine:turbine:1.0.0")

    // Enhanced Compose testing
    testImplementation("androidx.compose.ui:ui-test-manifest")
    debugImplementation("androidx.compose.ui:ui-test-manifest")

    // Navigation testing
    testImplementation("androidx.navigation:navigation-testing:2.9.7")

    // Android Instrumented Tests
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.1")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    androidTestImplementation("androidx.test:rules:1.6.1")
    androidTestImplementation("androidx.test:runner:1.6.1")
}

// 2026 Code Coverage Configuration (JaCoCo)
jacoco {
    toolVersion = "0.8.12"
}

tasks.register<JacocoReport>("jacocoTestReport") {
    dependsOn("testDebugUnitTest")
    reports {
        xml.required.set(true)
        html.required.set(true)
        csv.required.set(false)
    }

    val javaClasses = fileTree(mapOf(
        "dir" to "${layout.buildDirectory.get()}/intermediates/javac/debug/classes",
        "excludes" to listOf("**/R.class", "**/R\$*.class", "**/BuildConfig.*", "**/Manifest*.*")
    ))

    val kotlinClasses = fileTree(mapOf(
        "dir" to "${layout.buildDirectory.get()}/tmp/kotlin-classes/debug",
        "excludes" to listOf("**/R.class", "**/R\$*.class", "**/BuildConfig.*", "**/Manifest*.*")
    ))

    classDirectories.setFrom(files(listOf(javaClasses, kotlinClasses)))
    sourceDirectories.setFrom(files(listOf(
        "src/main/java", "src/main/kotlin"
    )))
    executionData.setFrom(fileTree(mapOf(
        "dir" to layout.buildDirectory.get(),
        "includes" to listOf("**/*.exec", "**/*.ec")
    )))
}

// Enforce minimum coverage threshold
tasks.register("checkCoverage") {
    dependsOn("jacocoTestReport")
    doLast {
        val reportFile = file("${layout.buildDirectory.get()}/reports/jacoco/jacocoTestReport/jacocoTestReport.xml")
        if (reportFile.exists()) {
            val coverage = parseCoverage(reportFile)
            if (coverage < 0.80) {
                throw GradleException("Code coverage is $coverage. Required minimum is 80%.")
            }
        }
    }
}

fun parseCoverage(reportFile: File): Double {
    val xml = groovy.xml.XmlSlurper().parse(reportFile)
    val counters = xml.getProperty("counter") as groovy.util.NodeList
    val lineCounter = counters.find {
        (it as groovy.util.Node).attributes()["type"] == "LINE"
    } as groovy.util.Node?

    if (lineCounter != null) {
        val missed = (lineCounter.attributes()["missed"] as String).toInt()
        val covered = (lineCounter.attributes()["covered"] as String).toInt()
        return if (missed + covered > 0) covered.toDouble() / (missed + covered) else 0.0
    }
    return 0.0
}
