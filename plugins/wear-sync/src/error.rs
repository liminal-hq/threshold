// Error types for sync protocol failures, conflicts, and platform bridge issues
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum Error {
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error("Mobile plugin error: {0}")]
    MobilePlugin(String),
    #[error("Sync protocol error: {0}")]
    SyncProtocol(String),
    #[error(transparent)]
    Conflict(#[from] ConflictError),
    #[error("Serialisation error: {0}")]
    Serialisation(String),
}

#[derive(Debug, Error)]
pub enum ConflictError {
    #[error("Watch data is stale (watch revision: {watch_revision}, phone revision: {current_revision}). Sync required.")]
    StaleUpdate {
        watch_revision: i64,
        current_revision: i64,
    },
    #[error("Alarm {alarm_id} was modified after watch last synced (alarm revision: {alarm_revision}, watch revision: {watch_revision}). Sync required.")]
    AlarmModified {
        alarm_id: i32,
        alarm_revision: i64,
        watch_revision: i64,
    },
}

impl Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

#[cfg(mobile)]
impl From<tauri::plugin::mobile::PluginInvokeError> for Error {
    fn from(error: tauri::plugin::mobile::PluginInvokeError) -> Self {
        Error::MobilePlugin(error.to_string())
    }
}

impl From<serde_json::Error> for Error {
    fn from(error: serde_json::Error) -> Self {
        Error::Serialisation(error.to_string())
    }
}

pub type Result<T> = std::result::Result<T, Error>;
