use tauri::{AppHandle, command, Runtime};
use crate::models::*;
use crate::AlarmManagerExt;
use crate::Result;

#[command]
pub async fn schedule<R: Runtime>(
  app: AppHandle<R>,
  payload: ScheduleRequest,
) -> Result<()> {
  app.alarm_manager().schedule(payload)
}

#[command]
pub async fn cancel<R: Runtime>(
  app: AppHandle<R>,
  payload: CancelRequest,
) -> Result<()> {
  app.alarm_manager().cancel(payload)
}
