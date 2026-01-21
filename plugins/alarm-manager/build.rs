const COMMANDS: &[&str] = &[
    "schedule",
    "cancel",
    "get_launch_args",
    "pick_alarm_sound",
    "check_active_alarm",
    "stop_ringing",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();

    inject_android_permissions();
}

fn inject_android_permissions() {
    let permissions = vec![
        // Core alarm scheduling
        r#"<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />"#,
        r#"<uses-permission android:name="android.permission.USE_EXACT_ALARM" />"#,
        // Power management
        r#"<uses-permission android:name="android.permission.WAKE_LOCK" />"#,
        // Boot persistence
        r#"<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />"#,
        // Lockscreen experience
        r#"<uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />"#,
        // Foreground service for reliable alarm audio
        r#"<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />"#,
        r#"<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />"#,
        // User feedback
        r#"<uses-permission android:name="android.permission.VIBRATE" />"#,
        r#"<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />"#,
        // Legacy alarm permission (often required by older Android versions/vendors)
        r#"<uses-permission android:name="com.android.alarm.permission.SET_ALARM" />"#,
    ];

    tauri_plugin::mobile::update_android_manifest(
        "tauri-plugin-alarm-manager.permissions",
        "manifest",
        permissions.join("\n"),
    )
    .expect("failed to update android manifest");
}
