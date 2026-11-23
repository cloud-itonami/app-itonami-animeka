// Animeka Tauri shell (adapted from the classification-series template):
// all domain state lives in the WebView (localStorage + XRPC) and the host
// exposes one read-only command. There is no filesystem, shell or installer
// permission; network happens only from the WebView (fetch to the Worker
// XRPC base + AT PDS). The app id comes from tauri.conf.json at build time
// (see build.rs), so this source carries no id literal.
#[tauri::command]
fn awai_host_info() -> serde_json::Value {
    serde_json::json!({"schema": "awai.shell.host.v1", "app": env!("ITONAMI_APP_ID")})
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .runtime(tauri_runtime_wry::Wry::default())
        .invoke_handler(tauri::generate_handler![awai_host_info])
        .run(tauri::generate_context!())
        .expect("animeka app failed to start");
}
