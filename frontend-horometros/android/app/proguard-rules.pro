# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# --- Capacitor (pedido del usuario, 2026-10-13: activar R8/minifyEnabled para bajar el peso del .apk) ---
# El puente JS<->nativo de Capacitor encuentra los plugins por REFLEXION en tiempo de ejecucion (no por
# referencias directas que R8 pueda rastrear estaticamente) - sin estas reglas, R8 renombra/elimina esas
# clases creyendolas "sin uso", y la app compila perfecto pero los plugins (Preferences, Network, Filesystem,
# Share, Clipboard, App) fallan en silencio recien al tocarlos en el celular. Reglas oficiales recomendadas
# por Capacitor (https://capacitorjs.com/docs/android/configuration#configuring-proguard).
-keep class com.getcapacitor.** { *; }
-keep public class * extends com.getcapacitor.Plugin
-keep @com.getcapacitor.annotation.CapacitorPlugin public class *
-keepclassmembers public class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.PluginMethod public *;
}
-keep class org.apache.cordova.** { *; }
-dontwarn com.getcapacitor.**
