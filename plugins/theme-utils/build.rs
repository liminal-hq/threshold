const COMMANDS: &[&str] = &["get_material_you_colours"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
