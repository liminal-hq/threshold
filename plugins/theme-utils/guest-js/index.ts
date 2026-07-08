import { invoke } from '@tauri-apps/api/core';

// Note: Palettes' keys stay snake_case -- Rust's Palettes struct has no
// #[serde(rename_all = "camelCase")], unlike the outer MaterialYouResponse.
export interface Palettes {
	system_accent1?: Record<string, string>;
	system_accent2?: Record<string, string>;
	system_accent3?: Record<string, string>;
	system_neutral1?: Record<string, string>;
	system_neutral2?: Record<string, string>;
}

export interface MaterialYouResponse {
	supported: boolean;
	apiLevel: number;
	palettes: Palettes;
}

export async function getMaterialYouColours(): Promise<MaterialYouResponse> {
	return await invoke<MaterialYouResponse>('plugin:theme-utils|get_material_you_colours');
}
