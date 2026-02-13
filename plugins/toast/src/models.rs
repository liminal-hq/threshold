use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ToastDuration {
    Short,
    Long,
}

impl Default for ToastDuration {
    fn default() -> Self {
        Self::Short
    }
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ToastPosition {
    Top,
    Centre,
    Bottom,
}

impl Default for ToastPosition {
    fn default() -> Self {
        Self::Bottom
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShowToastRequest {
    pub message: String,
    #[serde(default)]
    pub duration: ToastDuration,
    #[serde(default)]
    pub position: ToastPosition,
}
