# Home screen widget mockups

Design mockups for the Android home screen widget family. Widget UI cannot use the
webview (React/MUI) — launchers render widgets via RemoteViews, a fixed whitelist of
native views — so each mockup carries a numbered "RemoteViews build sheet" mapping
every visual element to the native view and drawable that implements it.

| Mockup                         | Issue                                                      | Contents                                       |
| ------------------------------ | ---------------------------------------------------------- | ---------------------------------------------- |
| `widget-next-alarm-mockup.svg` | [#156](https://github.com/liminal-hq/threshold/issues/156) | 4×2 hero, 2×1 narrow, light theme, empty state |
| `widget-history-mockup.svg`    | [#279](https://github.com/liminal-hq/threshold/issues/279) | 2×2 streak, 4×1 week strip, empty state        |

Visual language follows the screen-refresh-2026 v4 mockups
(`docs/ui/redesigns/screen-refresh-2026/mockups/v4/`): dark navy cards, the
alarm-card accent rail as the family signature, brand orange eyebrows, and the
`#4c8dff` accent. Mechanism decisions (SharedPreferences snapshot, `threshold://`
tap deep links, no Rust at render time) are documented in #156's comments.
