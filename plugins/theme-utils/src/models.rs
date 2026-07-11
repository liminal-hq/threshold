// Response model for Material You colour palettes
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialYouResponse {
    pub supported: bool,
    pub api_level: i32,
    pub palettes: Palettes,
}

impl MaterialYouResponse {
    /// The response for any platform with no Material You equivalent (desktop, iOS).
    pub fn unsupported() -> Self {
        Self {
            supported: false,
            api_level: 0,
            palettes: Palettes {
                system_accent1: None,
                system_accent2: None,
                system_accent3: None,
                system_neutral1: None,
                system_neutral2: None,
            },
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Palettes {
    pub system_accent1: Option<HashMap<String, String>>,
    pub system_accent2: Option<HashMap<String, String>>,
    pub system_accent3: Option<HashMap<String, String>>,
    pub system_neutral1: Option<HashMap<String, String>>,
    pub system_neutral2: Option<HashMap<String, String>>,
}
