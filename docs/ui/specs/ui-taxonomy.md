# UI Taxonomy

This taxonomy defines common UI layers and naming used across Threshold screen specs.

## 1. Route Layer

- route path (for example `/home`, `/edit/$id`, `/settings`)
- navigation entry and exit points
- route-level transition rules

## 2. Platform Concept Layer

- shared concepts: behaviours and structures that should feel consistent across mobile and desktop
- mobile concepts: platform-first patterns for touch, compact headers, and gesture interactions
- desktop concepts: platform-first patterns for wider layouts, keyboard use, and window-shell affordances
- concept IDs should be stable across redesign passes (for example `HOME-C1`, `SETTINGS-C3`)

## 3. Window Shell Layer

- desktop custom title bar and drag region
- mobile top app bar and safe-area handling
- screen container height and scroll strategy

## 4. Screen Scaffold Layer

- primary page container
- top header zone
- content zone
- fixed action zone (if present)

## 5. Section Layer

- grouped content blocks within a screen
- section title or subheader
- section-level spacing rhythm

## 6. Row / Item Layer

- repeatable units inside sections and lists
- row anatomy (leading content, supporting text, trailing actions)
- states (enabled, disabled, selected, pressed)

## 7. Control Layer

- direct controls (switches, buttons, toggles, pickers)
- control placement rules
- touch target and keyboard focus requirements

## 8. Feedback Layer

- inline validation messages
- error alerts or dialogues
- transient feedback (toasts, loading, disabled states)

## 9. Theme Layer

- colour and typography usage through theme tokens
- dynamic theme behaviour by platform
- explicit non-support areas (for example Material You on desktop)

## 10. State Layer

- loading
- empty
- populated
- validation error
- action-in-progress
- unavailable or offline (where applicable)

## 11. Motion Layer

- route transitions
- gesture-driven interactions
- reduced motion behaviour

## 12. Spec Policy

- each screen spec should include a platform concept model with shared, mobile, and desktop concepts
- each screen spec should include a platform mapping matrix
- deviations should be documented in a `Local Exceptions` section
- baseline specs should reflect current code first, then planned updates
