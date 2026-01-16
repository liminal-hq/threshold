use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum Error {
  #[error(transparent)]
  Io(#[from] std::io::Error),
  #[error("Mobile plugin error: {0}")]
  MobilePlugin(String),
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

pub type Result<T> = std::result::Result<T, Error>;
