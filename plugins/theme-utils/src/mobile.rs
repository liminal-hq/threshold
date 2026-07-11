// Android bridge for reading Material You dynamic colours
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use serde::de::DeserializeOwned;
#[cfg(target_os = "android")]
use tauri::plugin::PluginHandle;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::models::MaterialYouResponse;

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "com.plugin.themeutils";

pub fn init<R: Runtime, C: DeserializeOwned>(
    _api: PluginApi<R, C>,
    _app: &AppHandle<R>,
) -> crate::Result<ThemeUtils<R>> {
    #[cfg(target_os = "android")]
    {
        let handle = _api.register_android_plugin(PLUGIN_IDENTIFIER, "ThemeUtilsPlugin")?;
        Ok(ThemeUtils { handle })
    }

    // NOTE: Material You is an Android-only concept and we ship no Swift plugin code
    // for it, so on iOS we intentionally register nothing -- get_material_you_colours()
    // below just returns the same "unsupported" stub as the desktop implementation.
    #[cfg(not(target_os = "android"))]
    {
        Ok(ThemeUtils {
            _marker: std::marker::PhantomData,
        })
    }
}

/// Access to the theme-utils APIs.
pub struct ThemeUtils<R: Runtime> {
    #[cfg(target_os = "android")]
    handle: PluginHandle<R>,
    #[cfg(not(target_os = "android"))]
    _marker: std::marker::PhantomData<R>,
}

impl<R: Runtime> ThemeUtils<R> {
    pub fn get_material_you_colours(&self) -> crate::Result<MaterialYouResponse> {
        #[cfg(target_os = "android")]
        {
            self.handle
                .run_mobile_plugin("getMaterialYouColours", ())
                .map_err(Into::into)
        }

        #[cfg(not(target_os = "android"))]
        {
            // Stub implementation for iOS -- there is no Material You equivalent.
            Ok(MaterialYouResponse::unsupported())
        }
    }
}
