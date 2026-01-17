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

#[command]
pub async fn get_launch_args<R: Runtime>(
  app: AppHandle<R>,
) -> Result<Vec<ImportedAlarm>> {
  app.alarm_manager().get_launch_args()
}

#[command]
pub async fn pick_alarm_sound<R: Runtime>(
  app: AppHandle<R>,
  options: PickAlarmSoundOptions,
) -> Result<PickedAlarmSound> {
  app.alarm_manager().pick_alarm_sound(options)
}
