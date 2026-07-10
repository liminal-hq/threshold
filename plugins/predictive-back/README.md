# Tauri Plugin Predictive Back

Android predictive-back ("peek") gesture support for Threshold.

This plugin bridges Android's `OnBackAnimationCallback` (API 33+) to the webview, letting the React frontend render a real-time, scrubbable back-gesture animation instead of a discrete back-button press.

## Android Permissions

None required -- the plugin only uses `Activity.getOnBackInvokedDispatcher()`, a standard platform API with no manifest permission of its own. The Threshold manifest injection pattern is still implemented (with an empty permission block) so the mechanism is ready if that ever changes.

The other manifest requirement, `android:enableOnBackInvokedCallback="true"` on the `<application>` tag, ships in the plugin's own `android/src/main/AndroidManifest.xml` and merges into the consuming app's final manifest automatically via Android's standard Gradle library-manifest merge -- the same mechanism `alarm-manager` and `wear-sync` already rely on to register their own receivers and services. No consumer-side wiring is needed.

## Setup

1. Add the plugin to your `Cargo.toml`:

```toml
[dependencies]
tauri-plugin-predictive-back = { path = "../../../plugins/predictive-back" }
```

2. Enable the capability in `default.json` (or your app's capability file):

```json
"permissions": [
  "predictive-back:default"
]
```

## Usage

```ts
import {
	setCanGoBack,
	PREDICTIVE_BACK_EVENT,
	type PredictiveBackEvent,
} from 'tauri-plugin-predictive-back-api';
import { listen } from '@tauri-apps/api/event';

await setCanGoBack(true);

const unlisten = await listen<PredictiveBackEvent>(PREDICTIVE_BACK_EVENT, (event) => {
	console.log(event.payload.type, event.payload.progress);
});
```
