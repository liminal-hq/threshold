# Desktop Deep Links

The application registers the custom protocol `threshold://`.

## Usage

You can trigger the app from external scripts or browsers using:

```
threshold://set?time=07:30&label=WakeUp
```

## Configuration

The protocol is defined in `tauri.conf.json` under `plugins.deep-link`.

**Note:** On Linux, deep link support might require additional system configuration (e.g., `.desktop` file registration), which Tauri handles during packaging (`deb`/`AppImage`).
