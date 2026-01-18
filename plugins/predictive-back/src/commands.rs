use tauri::{AppHandle, Command, Runtime, Window};
use crate::models::SetCanGoBackRequest;
use crate::Result;

#[cfg(target_os = "android")]
use crate::PredictiveBack;
#[cfg(target_os = "android")]
use tauri::State;

#[Command]
pub(crate) fn set_can_go_back<R: Runtime>(
    _app: AppHandle<R>,
    _window: Window<R>,
    #[cfg(target_os = "android")] state: State<'_, PredictiveBack>,
    payload: SetCanGoBackRequest,
) -> Result<()> {
    #[cfg(target_os = "android")]
    state.set_can_go_back(payload.can_go_back)?;

    // On non-Android, we simply do nothing
    #[cfg(not(target_os = "android"))]
    let _ = payload;

    Ok(())
}
