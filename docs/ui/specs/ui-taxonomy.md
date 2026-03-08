# UI Taxonomy

This taxonomy defines common UI layers and naming used across Threshold screen specs.

## 1. Route Layer

- route path (for example `/home`, `/edit/$id`, `/settings`)
- navigation entry and exit points
- route-level transition rules

## 2. Window Shell Layer

- desktop custom title bar and drag region
- mobile top app bar / safe-area handling
- screen container height and scroll strategy

## 3. Screen Scaffold Layer

- primary page container
- top header zone
- content zone
- fixed action zone (if present)

## 4. Section Layer

- grouped content blocks within a screen
- section title/subheader
- section-level spacing rhythm

## 5. Row / Item Layer

- repeatable units inside sections and lists
- row anatomy (leading content, supporting text, trailing actions)
- states (enabled/disabled/selected/pressed)

## 6. Control Layer

- direct controls (switches, buttons, toggles, pickers)
- control placement rules
- touch target and keyboard focus requirements

## 7. Feedback Layer

- inline validation messages
- error alerts/dialogues
- transient feedback (toasts, loading, disabled states)

## 8. Theme Layer

- colour and typography usage through theme tokens
- dynamic theme behaviour by platform
- explicit non-support areas (for example Material You on desktop)

## 9. State Layer

- loading
- empty
- populated
- validation error
- action-in-progress
- unavailable/offline (where applicable)

## 10. Motion Layer

- route transitions
- gesture-driven interactions
- reduced motion behaviour

## 11. Spec Policy

- each screen spec should map to this taxonomy
- deviations should be documented in a "Local Exceptions" section
- baseline specs should reflect current code first, then planned updates
