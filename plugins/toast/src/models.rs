use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ToastDuration {
    #[default]
    Short,
    Long,
}

#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ToastPosition {
    Top,
    Centre,
    #[default]
    Bottom,
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
