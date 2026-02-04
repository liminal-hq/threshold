# SwipeToDeleteRow

A physics-based, bidirectional swipe-to-delete component designed for the mobile "bubble" UI. Built with `motion/react` (Framer Motion).

## Overview

`SwipeToDeleteRow` provides a native-feeling swipe interaction for list items. It supports:
-   **Bidirectional Swipe**: Swipe Left or Right to delete.
-   **Physics**: Elastic resistance ("rubber banding") and spring animations.
-   **Thresholds**: Deletes when dragged past 35% of the width or flung rapidly.
-   **Tap vs. Drag**: Distinguishes between tapping (to navigate) and dragging (to delete).
-   **Visual Feedback**: Reveals a red background with a Trash icon on the appropriate side.

## Usage

```tsx
import { SwipeToDeleteRow } from './components/SwipeToDeleteRow';

// ... inside your map loop
<SwipeToDeleteRow 
    onDelete={() => handleDelete(item.id)}
    onClick={() => handleEdit(item.id)}
    deleteThreshold={0.35} // optional, default is 0.35
>
    <YourCardComponent />
</SwipeToDeleteRow>
```

## Props

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `children` | `React.ReactNode` | N/A | The content to be swiped (usually a Card). |
| `onDelete` | `() => void \| Promise<void>` | N/A | Callback fired when the swipe is committed (swiped far enough or flung). |
| `onClick` | `() => void` | `undefined` | Optional callback fired when the row is tapped but not dragged. Use this for navigation. |
| `deleteThreshold` | `number` | `0.35` | The percentage of the row width (0.0 - 1.0) required to trigger a delete. |

## Behaviour Details

### 1. Dragging
The component uses `motion`'s `drag="x"` with `dragConstraints={{ left: 0, right: 0 }}` and `dragElastic={0.5}`. This creates a resistance effect that implies springiness, rather than a free-floating drag.

### 2. Thresholds
The `onDelete` action is triggered if **either**:
-   The drag offset exceeds `width * deleteThreshold` (absolute value).
-   The drag velocity exceeds `500px/s` (a "fling").

### 3. Styling
-   **Border Radius**: The component enforces a `16px` border radius on both the wrapper and the background layer to match the app's "bubble" aesthetic.
-   **Background**: A fixed `error.main` red background sits behind the swipeable content. It contains two `<DeleteIcon />` elements (one left, one right).
-   **Icon Reveal**: The opacity of the icons is controlled by `useTransform` based on the drag `x` value.
    -   Dragging **Right** (x > 0) reveals the **Left** icon.
    -   Dragging **Left** (x < 0) reveals the **Right** icon.

### 4. Tap Detection
To prevent accidental navigation while swiping, the component tracks the drag distance.
-   If `dx > 5px` or `dy > 5px`: It is ignored as a tap.
-   If drag ends with minimal movement: `onClick` is called.
