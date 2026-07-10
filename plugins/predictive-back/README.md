# Tauri Plugin Predictive Back

Android predictive-back ("peek") gesture support for Threshold.

This plugin bridges Android's `OnBackAnimationCallback` (API 33+) to the webview, letting the
React frontend render a real-time, scrubbable back-gesture animation instead of a discrete
back-button press.

## Android Permissions

None required -- the plugin only uses `Activity.getOnBackInvokedDispatcher()`, a standard
platform API with no manifest permission of its own. The Threshold manifest injection pattern
is still implemented (with an empty permission block) so the mechanism is ready if that ever
changes.

One manifest attribute is required for predictive back to activate at all --
`android:enableOnBackInvokedCallback="true"` on the `<application>` tag -- but it isn't
injected by this plugin. See `apps/threshold/src-tauri/build.rs` for why (it's an
attribute on an already-open tag, which the plugin manifest-injection helper can't reach) and
how it's kept self-regenerating there instead.

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
import { setCanGoBack, PREDICTIVE_BACK_EVENT, type PredictiveBackEvent } from 'tauri-plugin-predictive-back-api';
import { listen } from '@tauri-apps/api/event';

await setCanGoBack(true);

const unlisten = await listen<PredictiveBackEvent>(PREDICTIVE_BACK_EVENT, (event) => {
  console.log(event.payload.type, event.payload.progress);
});
```
