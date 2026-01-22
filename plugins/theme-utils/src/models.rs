use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialYouResponse {
    pub supported: bool,
    pub api_level: i32,
    pub palettes: Palettes,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Palettes {
    pub system_accent1: Option<HashMap<String, String>>,
    pub system_accent2: Option<HashMap<String, String>>,
    pub system_accent3: Option<HashMap<String, String>>,
    pub system_neutral1: Option<HashMap<String, String>>,
    pub system_neutral2: Option<HashMap<String, String>>,
}
