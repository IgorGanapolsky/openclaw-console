# Add project specific ProGuard rules here.

# Keep Kotlinx Serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.openclaw.console.**$$serializer { *; }
-keepclassmembers class com.openclaw.console.** {
    *** Companion;
}
-keepclasseswithmembers class com.openclaw.console.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Keep OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }

# Keep data model classes
-keep class com.openclaw.console.data.model.** { *; }

# Keep Biometric
-keep class androidx.biometric.** { *; }
