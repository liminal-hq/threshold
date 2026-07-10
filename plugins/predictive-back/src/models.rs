// Wire models for the predictive-back plugin's command and event payloads
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetCanGoBackRequest {
    pub can_go_back: bool,
}

/// A single frame of the native `OnBackAnimationCallback` lifecycle, forwarded from Kotlin
/// via a Channel and re-emitted as a Tauri event. `kind` is one of "started", "progress",
/// "cancelled", or "invoked"; `progress` is 0..1 (always 0 for "cancelled", 1 for "invoked").
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PredictiveBackEvent {
    #[serde(rename = "type")]
    pub kind: String,
    pub progress: f32,
}
