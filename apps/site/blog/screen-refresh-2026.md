# The 2026 screen refresh

_Product & Engineering — July 2026_

Home, Edit, Settings, and the desktop window all got rebuilt this cycle. The visible part was the easy part. The interesting part was making a pull-to-refresh gesture and a swipe-to-delete gesture agree on who owns your thumb.

Threshold's Home, Edit, and Settings screens hadn't changed shape in a long time. This pass rebuilt all three, plus the desktop window itself, from a set of mockups and a phase-by-phase implementation plan through to shipped code — then kept going through several rounds of on-device testing once the mockups met a real Android WebView and a real thumb.

## What actually changed

**Home** gained a next-alarm banner with a gradient fill and a live countdown, coloured accent rails on each alarm card so enabled/disabled state reads at a glance, and pull-to-refresh on mobile. The Add Alarm button is centred in its own action zone, with the Settings gear positioned independently to its right rather than crowding the same row.

**Edit** puts the Window mode's start/end time pickers side by side on desktop instead of stacking them, tightens up vertical spacing throughout, and constrains the form to a sane width so it doesn't sprawl across a wide window. New alarms now fade and slide into the list instead of just appearing, and deleting one lets the rows below it slide smoothly into the gap — both scaled by whatever animation speed you've set in Android's Developer Options, and both skipped entirely if you've asked the system for reduced motion.

**Settings** gets a proper desktop treatment: a navigation rail down the left with four sections (Appearance, Alarm Settings, General, Developer) and a content panel on the right, instead of a phone-shaped list stretched across a wide window. Mobile keeps its flat list unchanged — this was purely a "use the width you actually have" problem, not a redesign of the settings themselves.

And the **desktop window** is now locked to a fixed 760×680 shape with a custom title bar whose buttons are driven live from Tauri's own window capabilities, rather than assumed. Only its position is remembered between launches, which turned out to matter more than expected — more on that below.

## The part that took the longest: two gestures, one thumb

Home's alarm list has two competing touch gestures live on the same surface at the same time: pull down anywhere to refresh, or swipe an individual row left or right to reveal its delete action. Both start from an identical touch on the identical row — pull-to-refresh can only ever arm from the very top of the list, which is exactly where the topmost alarm's swipe target also lives.

The first version of this shipped with each gesture deciding independently whether it owned a given touch, using different signals: the row's swipe watched the ratio of horizontal to vertical movement over a few pixels, while the pull watched vertical movement in isolation. Independent heuristics on a shared touch surface don't stay independent for long. A diagonal-enough drag could cross the pull's arm threshold while the row had already, correctly, decided the same gesture was a horizontal swipe — so both would engage at once, and you'd see a row's delete background revealed while the whole screen also tried to slide into a refresh. Conversely, a short or abandoned pull attempt over a row, one that never moved enough to convince either gesture it should fully commit, could still get read by the row's own tap recognizer as a plain tap and navigate into Edit — the worst kind of accidental action for a settings-heavy list.

The fix in both directions was to make each gesture aware of the other's decision criteria rather than just its own: the pull now also tracks horizontal movement and backs off the instant horizontal movement dominates vertical, deferring to the row's swipe; and the row now explicitly marks a decided-but-declined vertical gesture as "this was real movement, not a tap," so an abandoned pull can't accidentally fire a click on the way past. Neither gesture needed to know about the other's internals — just enough of its decision boundary to stay out of its way.

A second, quieter problem lived one layer down: Android's WebView handles touch input and pointer input differently enough that it mattered. Pointer Events looked like the cleaner API — one code path for touch, mouse, and pen — until it turned out that a touch-origin pointer gets _implicit_ capture on press, and combined with cancelling the browser's default handling mid-gesture, this particular WebView could simply never deliver the matching release event. The gesture would wedge itself permanently in a "committed" state, and the entire list would stop responding to touch until the app restarted. The fix was to stop asking one API to do two jobs: raw Touch Events for actual fingers (the empirically reliable path here), and Pointer Events filtered down to mouse and pen only — both still fully supported, since plenty of modern tablets and 2-in-1s expect a pointer to work like a pointer.

## Small things that were bigger than they looked

The desktop window used to force itself back to the centre of the screen on every launch whenever it read its own position as `(0, 0)`, on the assumption that meant "never positioned before." It's not a safe assumption: some Linux compositors report `(0, 0)` for a window's position regardless of where it actually is, and a window genuinely parked in the screen's corner reads exactly the same way. Once we added real position persistence, that heuristic started actively fighting it — overriding a correctly restored position on every single launch. The fix was simply to trust the thing already doing the restoring and delete the guess.

And in a redesign built around motion — entrance animations, reflow animations, colour transitions on toggle — it mattered that all of it tracks the same system setting rather than each animation picking its own fixed duration. Everything new here reads from one shared, OS-scaled duration, the same one the existing predictive-back gesture already used, so changing your device's animation speed (or asking for none at all) changes the whole app consistently instead of leaving one corner of the UI out of step with the rest.

_All of this shipped after several rounds of testing on an actual phone, not just a simulator — which is exactly how the gesture-arbitration bugs above got found in the first place._

[← Back to threshold.liminalhq.ca](../index.html)
