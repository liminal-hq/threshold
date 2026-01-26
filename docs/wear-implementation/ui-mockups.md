# Wear OS UI Mockups

**Target Device:** Google Pixel Watch 2  
**Screen:** 384x384px round AMOLED (1.2" diameter)  
**Design Philosophy:** Calm, glanceable, liminal

## Design Principles

### 1. Minimal Cognitive Load
- **One primary action per screen**
- Large touch targets (minimum 48dp)
- High contrast for outdoor readability

### 2. Liminal Aesthetics
- **Soft transitions** between states
- Subtle depth cues (no harsh shadows)
- **Threshold-inspired** colour palette

### 3. Wear OS Best Practices
- Respect circular UI constraints
- Time text always visible (top)
- Vignette for content fade
- Rotary input support (scrolling)

---

## Colour Palette

```
Primary Background:   #0A0A0A (Deep space black)
Card Background:      #1A1A1A (Elevated card)
Primary Text:         #FFFFFF (Pure white)
Secondary Text:       #999999 (Muted grey)
Accent (Enabled):     #4A9EFF (Calm blue)
Accent (Disabled):    #333333 (Subtle grey)
Warning/Delete:       #FF4444 (Soft red)
Success:              #44FF88 (Soft green)
```

---

## 1. Tile (Watch Face Complication)

**Purpose:** Glanceable next alarm time

### Design

```svg
<svg viewBox="0 0 384 384" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="384" height="384" fill="#0A0A0A" rx="192"/>
  
  <!-- Vignette Effect (Top & Bottom) -->
  <defs>
    <radialGradient id="vignette">
      <stop offset="60%" stop-color="#0A0A0A" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.8"/>
    </radialGradient>
  </defs>
  <rect width="384" height="384" fill="url(#vignette)" rx="192"/>
  
  <!-- Content Container (Centered) -->
  <g transform="translate(192, 192)">
    
    <!-- "Next" Label -->
    <text 
      x="0" 
      y="-30" 
      text-anchor="middle" 
      font-family="Roboto, sans-serif" 
      font-size="24" 
      fill="#999999"
      font-weight="400">
      Next
    </text>
    
    <!-- Time Display -->
    <text 
      x="0" 
      y="10" 
      text-anchor="middle" 
      font-family="Roboto, sans-serif" 
      font-size="48" 
      fill="#FFFFFF"
      font-weight="700">
      7:30 AM
    </text>
    
    <!-- Label (Optional) -->
    <text 
      x="0" 
      y="40" 
      text-anchor="middle" 
      font-family="Roboto, sans-serif" 
      font-size="18" 
      fill="#999999"
      font-weight="300">
      Morning Routine
    </text>
    
    <!-- Subtle Indicator (Alarm Icon) -->
    <circle cx="0" cy="70" r="3" fill="#4A9EFF" opacity="0.6"/>
    
  </g>
</svg>
```

**Empty State:**

```svg
<svg viewBox="0 0 384 384" xmlns="http://www.w3.org/2000/svg">
  <rect width="384" height="384" fill="#0A0A0A" rx="192"/>
  
  <g transform="translate(192, 192)">
    <text 
      x="0" 
      y="0" 
      text-anchor="middle" 
      font-family="Roboto, sans-serif" 
      font-size="28" 
      fill="#666666"
      font-weight="400">
      No alarms
    </text>
    
    <!-- Subtle Icon -->
    <path d="M -12 20 L 0 8 L 12 20" stroke="#666666" stroke-width="2" fill="none" opacity="0.5"/>
  </g>
</svg>
```

---

## 2. Alarm List Screen

**Purpose:** Browse all alarms, quick toggle

### Design (Scrollable List)

```svg
<svg viewBox="0 0 384 384" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="384" height="384" fill="#0A0A0A" rx="192"/>
  
  <!-- Time Text (Always Visible) -->
  <text 
    x="192" 
    y="30" 
    text-anchor="middle" 
    font-family="Roboto, sans-serif" 
    font-size="16" 
    fill="#FFFFFF"
    font-weight="400">
    2:45
  </text>
  
  <!-- Vignette -->
  <rect width="384" height="384" fill="url(#vignette)" rx="192"/>
  
  <!-- Scrollable Content Area (Conceptual) -->
  <g transform="translate(0, 60)">
    
    <!-- Alarm Card 1 (Enabled) -->
    <g>
      <rect x="40" y="20" width="304" height="80" rx="16" fill="#1A1A1A"/>
      
      <!-- Time -->
      <text 
        x="60" 
        y="55" 
        font-family="Roboto, sans-serif" 
        font-size="32" 
        fill="#FFFFFF"
        font-weight="700">
        7:30 AM
      </text>
      
      <!-- Label -->
      <text 
        x="60" 
        y="80" 
        font-family="Roboto, sans-serif" 
        font-size="16" 
        fill="#999999"
        font-weight="400">
        Meditation
      </text>
      
      <!-- Status Indicator (Enabled) -->
      <circle cx="320" cy="60" r="8" fill="#4A9EFF"/>
    </g>
    
    <!-- Alarm Card 2 (Disabled) -->
    <g>
      <rect x="40" y="120" width="304" height="80" rx="16" fill="#1A1A1A" opacity="0.5"/>
      
      <text 
        x="60" 
        y="155" 
        font-family="Roboto, sans-serif" 
        font-size="32" 
        fill="#666666"
        font-weight="700">
        9:00 AM
      </text>
      
      <text 
        x="60" 
        y="180" 
        font-family="Roboto, sans-serif" 
        font-size="16" 
        fill="#666666"
        font-weight="400">
        Workout
      </text>
      
      <circle cx="320" cy="160" r="8" fill="#333333"/>
    </g>
    
    <!-- Alarm Card 3 (Window Mode) -->
    <g>
      <rect x="40" y="220" width="304" height="80" rx="16" fill="#1A1A1A"/>
      
      <text 
        x="60" 
        y="255" 
        font-family="Roboto, sans-serif" 
        font-size="28" 
        fill="#FFFFFF"
        font-weight="700">
        7:00-7:30
      </text>
      
      <text 
        x="60" 
        y="280" 
        font-family="Roboto, sans-serif" 
        font-size="16" 
        fill="#999999"
        font-weight="400">
        Wake Window
      </text>
      
      <!-- Window Indicator -->
      <rect x="300" y="250" width="24" height="24" rx="4" fill="none" stroke="#4A9EFF" stroke-width="2"/>
      <rect x="303" y="253" width="6" height="6" rx="1" fill="#4A9EFF" opacity="0.6"/>
      <rect x="311" y="253" width="6" height="6" rx="1" fill="#4A9EFF" opacity="0.6"/>
      <rect x="319" y="253" width="6" height="6" rx="1" fill="#4A9EFF" opacity="0.6"/>
    </g>
    
  </g>
</svg>
```

**Interaction States:**

```svg
<!-- Card: Pressed State -->
<svg viewBox="0 0 304 80" xmlns="http://www.w3.org/2000/svg">
  <rect width="304" height="80" rx="16" fill="#1A1A1A"/>
  <!-- Overlay -->
  <rect width="304" height="80" rx="16" fill="#FFFFFF" opacity="0.1"/>
  
  <text 
    x="20" 
    y="35" 
    font-family="Roboto, sans-serif" 
    font-size="32" 
    fill="#FFFFFF"
    font-weight="700">
    7:30 AM
  </text>
</svg>

<!-- Card: Toggle Animation (Disabled → Enabled) -->
<svg viewBox="0 0 304 80" xmlns="http://www.w3.org/2000/svg">
  <rect width="304" height="80" rx="16" fill="#1A1A1A">
    <animate 
      attributeName="opacity" 
      from="0.5" 
      to="1.0" 
      dur="0.3s" 
      fill="freeze"/>
  </rect>
  
  <circle cx="280" cy="40" r="8" fill="#4A9EFF">
    <animate 
      attributeName="r" 
      from="12" 
      to="8" 
      dur="0.3s" 
      fill="freeze"/>
    <animate 
      attributeName="opacity" 
      from="0" 
      to="1" 
      dur="0.2s" 
      fill="freeze"/>
  </circle>
</svg>
```

---

## 3. Create Alarm Screen (Fixed Mode)

**Purpose:** Set a specific wake time

```svg
<svg viewBox="0 0 384 384" xmlns="http://www.w3.org/2000/svg">
  <rect width="384" height="384" fill="#0A0A0A" rx="192"/>
  
  <!-- Title -->
  <text 
    x="192" 
    y="60" 
    text-anchor="middle" 
    font-family="Roboto, sans-serif" 
    font-size="20" 
    fill="#FFFFFF"
    font-weight="500">
    New Alarm
  </text>
  
  <!-- Time Picker (Simplified Representation) -->
  <g transform="translate(192, 180)">
    
    <!-- Selected Time (Large) -->
    <text 
      x="0" 
      y="0" 
      text-anchor="middle" 
      font-family="Roboto, sans-serif" 
      font-size="56" 
      fill="#FFFFFF"
      font-weight="700">
      7:30
    </text>
    
    <!-- AM/PM Toggle -->
    <g transform="translate(0, 40)">
      <rect x="-50" y="0" width="45" height="32" rx="8" fill="#1A1A1A"/>
      <text 
        x="-27" 
        y="22" 
        text-anchor="middle" 
        font-family="Roboto, sans-serif" 
        font-size="18" 
        fill="#999999"
        font-weight="500">
        AM
      </text>
      
      <rect x="5" y="0" width="45" height="32" rx="8" fill="#4A9EFF"/>
      <text 
        x="27" 
        y="22" 
        text-anchor="middle" 
        font-family="Roboto, sans-serif" 
        font-size="18" 
        fill="#FFFFFF"
        font-weight="700">
        PM
      </text>
    </g>
    
    <!-- Rotary Hint -->
    <text 
      x="0" 
      y="90" 
      text-anchor="middle" 
      font-family="Roboto, sans-serif" 
      font-size="14" 
      fill="#666666"
      font-weight="400">
      Rotate to adjust
    </text>
    
  </g>
  
  <!-- Action Buttons (Bottom) -->
  <g transform="translate(192, 340)">
    <!-- Save Button (Primary) -->
    <rect x="-40" y="-20" width="80" height="40" rx="20" fill="#4A9EFF"/>
    <text 
      x="0" 
      y="5" 
      text-anchor="middle" 
      font-family="Roboto, sans-serif" 
      font-size="18" 
      fill="#FFFFFF"
      font-weight="700">
      Save
    </text>
  </g>
</svg>
```

---

## 4. Create Alarm Screen (Window Mode)

**Purpose:** Set a time range

```svg
<svg viewBox="0 0 384 384" xmlns="http://www.w3.org/2000/svg">
  <rect width="384" height="384" fill="#0A0A0A" rx="192"/>
  
  <!-- Title -->
  <text 
    x="192" 
    y="60" 
    text-anchor="middle" 
    font-family="Roboto, sans-serif" 
    font-size="20" 
    fill="#FFFFFF"
    font-weight="500">
    Window Alarm
  </text>
  
  <!-- Window Range Visualisation -->
  <g transform="translate(192, 160)">
    
    <!-- Start Time -->
    <g transform="translate(-80, 0)">
      <text 
        x="0" 
        y="0" 
        text-anchor="middle" 
        font-family="Roboto, sans-serif" 
        font-size="28" 
        fill="#FFFFFF"
        font-weight="700">
        7:00
      </text>
      <text 
        x="0" 
        y="25" 
        text-anchor="middle" 
        font-family="Roboto, sans-serif" 
        font-size="14" 
        fill="#999999"
        font-weight="400">
        Start
      </text>
    </g>
    
    <!-- Range Indicator -->
    <line x1="-50" y1="-5" x2="50" y2="-5" stroke="#4A9EFF" stroke-width="4" stroke-linecap="round"/>
    
    <!-- Random Dots (Threshold Concept) -->
    <circle cx="-20" cy="-5" r="3" fill="#4A9EFF" opacity="0.4"/>
    <circle cx="5" cy="-5" r="3" fill="#4A9EFF" opacity="0.6"/>
    <circle cx="30" cy="-5" r="3" fill="#4A9EFF" opacity="0.8"/>
    
    <!-- End Time -->
    <g transform="translate(80, 0)">
      <text 
        x="0" 
        y="0" 
        text-anchor="middle" 
        font-family="Roboto, sans-serif" 
        font-size="28" 
        fill="#FFFFFF"
        font-weight="700">
        7:30
      </text>
      <text 
        x="0" 
        y="25" 
        text-anchor="middle" 
        font-family="Roboto, sans-serif" 
        font-size="14" 
        fill="#999999"
        font-weight="400">
        End
      </text>
    </g>
    
    <!-- Description -->
    <text 
      x="0" 
      y="70" 
      text-anchor="middle" 
      font-family="Roboto, sans-serif" 
      font-size="16" 
      fill="#999999"
      font-weight="400">
      Alarm at random time
    </text>
    <text 
      x="0" 
      y="90" 
      text-anchor="middle" 
      font-family="Roboto, sans-serif" 
      font-size="16" 
      fill="#999999"
      font-weight="400">
      within 30 minutes
    </text>
    
  </g>
  
  <!-- Action Buttons -->
  <g transform="translate(192, 340)">
    <rect x="-40" y="-20" width="80" height="40" rx="20" fill="#4A9EFF"/>
    <text 
      x="0" 
      y="5" 
      text-anchor="middle" 
      font-family="Roboto, sans-serif" 
      font-size="18" 
      fill="#FFFFFF"
      font-weight="700">
      Save
    </text>
  </g>
</svg>
```

---

## 5. Confirmation States

### Delete Confirmation

```svg
<svg viewBox="0 0 384 384" xmlns="http://www.w3.org/2000/svg">
  <rect width="384" height="384" fill="#0A0A0A" rx="192"/>
  
  <!-- Overlay -->
  <rect width="384" height="384" fill="#000000" opacity="0.6" rx="192"/>
  
  <!-- Modal Card -->
  <g transform="translate(192, 192)">
    <rect x="-140" y="-80" width="280" height="160" rx="16" fill="#1A1A1A"/>
    
    <!-- Icon (Warning) -->
    <circle cx="0" cy="-40" r="20" fill="none" stroke="#FF4444" stroke-width="3"/>
    <text 
      x="0" 
      y="-30" 
      text-anchor="middle" 
      font-family="Roboto, sans-serif" 
      font-size="32" 
      fill="#FF4444"
      font-weight="700">
      !
    </text>
    
    <!-- Message -->
    <text 
      x="0" 
      y="5" 
      text-anchor="middle" 
      font-family="Roboto, sans-serif" 
      font-size="18" 
      fill="#FFFFFF"
      font-weight="500">
      Delete alarm?
    </text>
    
    <!-- Actions -->
    <g transform="translate(0, 45)">
      <!-- Cancel -->
      <rect x="-110" y="-18" width="80" height="36" rx="18" fill="#333333"/>
      <text 
        x="-70" 
        y="5" 
        text-anchor="middle" 
        font-family="Roboto, sans-serif" 
        font-size="16" 
        fill="#FFFFFF"
        font-weight="500">
        Cancel
      </text>
      
      <!-- Confirm -->
      <rect x="30" y="-18" width="80" height="36" rx="18" fill="#FF4444"/>
      <text 
        x="70" 
        y="5" 
        text-anchor="middle" 
        font-family="Roboto, sans-serif" 
        font-size="16" 
        fill="#FFFFFF"
        font-weight="700">
        Delete
      </text>
    </g>
    
  </g>
</svg>
```

### Syncing State

```svg
<svg viewBox="0 0 384 384" xmlns="http://www.w3.org/2000/svg">
  <rect width="384" height="384" fill="#0A0A0A" rx="192"/>
  
  <g transform="translate(192, 192)">
    
    <!-- Spinner -->
    <circle cx="0" cy="0" r="24" fill="none" stroke="#4A9EFF" stroke-width="4" stroke-linecap="round">
      <animate 
        attributeName="stroke-dasharray" 
        values="0 150; 120 150; 0 150" 
        dur="1.5s" 
        repeatCount="indefinite"/>
      <animateTransform 
        attributeName="transform" 
        type="rotate" 
        from="0 0 0" 
        to="360 0 0" 
        dur="1s" 
        repeatCount="indefinite"/>
    </circle>
    
    <!-- Message -->
    <text 
      x="0" 
      y="60" 
      text-anchor="middle" 
      font-family="Roboto, sans-serif" 
      font-size="18" 
      fill="#999999"
      font-weight="400">
      Syncing...
    </text>
    
  </g>
</svg>
```

### Success Toast

```svg
<svg viewBox="0 0 384 384" xmlns="http://www.w3.org/2000/svg">
  <rect width="384" height="384" fill="#0A0A0A" rx="192"/>
  
  <!-- Toast (Bottom) -->
  <g transform="translate(192, 320)">
    <rect x="-100" y="-20" width="200" height="40" rx="20" fill="#44FF88" opacity="0.9">
      <animate attributeName="opacity" values="0; 0.9; 0.9; 0" dur="2s"/>
    </rect>
    
    <!-- Checkmark Icon -->
    <g transform="translate(-70, 0)">
      <circle cx="0" cy="0" r="12" fill="#FFFFFF"/>
      <path d="M -4 0 L -1 4 L 6 -4" stroke="#44FF88" stroke-width="3" fill="none" stroke-linecap="round"/>
    </g>
    
    <!-- Message -->
    <text 
      x="10" 
      y="5" 
      text-anchor="middle" 
      font-family="Roboto, sans-serif" 
      font-size="16" 
      fill="#FFFFFF"
      font-weight="600">
      Alarm saved
    </text>
  </g>
</svg>
```

---

## 6. Empty States

### No Alarms (First Run)

```svg
<svg viewBox="0 0 384 384" xmlns="http://www.w3.org/2000/svg">
  <rect width="384" height="384" fill="#0A0A0A" rx="192"/>
  
  <g transform="translate(192, 192)">
    
    <!-- Icon (Alarm Clock Outline) -->
    <circle cx="0" cy="-20" r="40" fill="none" stroke="#333333" stroke-width="4"/>
    <path d="M 0 -50 L 0 -10" stroke="#333333" stroke-width="4" stroke-linecap="round"/>
    <path d="M 0 -20 L 20 -5" stroke="#333333" stroke-width="4" stroke-linecap="round"/>
    
    <!-- Message -->
    <text 
      x="0" 
      y="60" 
      text-anchor="middle" 
      font-family="Roboto, sans-serif" 
      font-size="20" 
      fill="#666666"
      font-weight="500">
      No alarms yet
    </text>
    
    <text 
      x="0" 
      y="85" 
      text-anchor="middle" 
      font-family="Roboto, sans-serif" 
      font-size="16" 
      fill="#666666"
      font-weight="400">
      Create one on your
    </text>
    
    <text 
      x="0" 
      y="105" 
      text-anchor="middle" 
      font-family="Roboto, sans-serif" 
      font-size="16" 
      fill="#666666"
      font-weight="400">
      phone to get started
    </text>
    
  </g>
</svg>
```

### Phone Disconnected

```svg
<svg viewBox="0 0 384 384" xmlns="http://www.w3.org/2000/svg">
  <rect width="384" height="384" fill="#0A0A0A" rx="192"/>
  
  <g transform="translate(192, 192)">
    
    <!-- Icon (Phone with X) -->
    <rect x="-20" y="-40" width="40" height="60" rx="8" fill="none" stroke="#666666" stroke-width="3"/>
    <line x1="-30" y1="-50" x2="30" y2="30" stroke="#FF4444" stroke-width="4" stroke-linecap="round"/>
    <line x1="30" y1="-50" x2="-30" y2="30" stroke="#FF4444" stroke-width="4" stroke-linecap="round"/>
    
    <!-- Message -->
    <text 
      x="0" 
      y="70" 
      text-anchor="middle" 
      font-family="Roboto, sans-serif" 
      font-size="18" 
      fill="#999999"
      font-weight="500">
      Phone unreachable
    </text>
    
    <text 
      x="0" 
      y="95" 
      text-anchor="middle" 
      font-family="Roboto, sans-serif" 
      font-size="14" 
      fill="#666666"
      font-weight="400">
      Showing last known state
    </text>
    
  </g>
</svg>
```

---

## Design System Tokens

### Typography

```kotlin
// Wear Compose Typography
object ThresholdTypography {
    val display1 = TextStyle(
        fontSize = 48.sp,
        fontWeight = FontWeight.Bold,
        color = Color.White
    )
    
    val display2 = TextStyle(
        fontSize = 32.sp,
        fontWeight = FontWeight.Bold,
        color = Color.White
    )
    
    val title = TextStyle(
        fontSize = 20.sp,
        fontWeight = FontWeight.Medium,
        color = Color.White
    )
    
    val body = TextStyle(
        fontSize = 16.sp,
        fontWeight = FontWeight.Normal,
        color = Color(0xFF999999)
    )
    
    val caption = TextStyle(
        fontSize = 14.sp,
        fontWeight = FontWeight.Normal,
        color = Color(0xFF666666)
    )
}
```

### Spacing

```kotlin
object ThresholdSpacing {
    val xs = 4.dp
    val sm = 8.dp
    val md = 16.dp
    val lg = 24.dp
    val xl = 32.dp
}
```

### Animations

```kotlin
// Smooth transitions
object ThresholdAnimations {
    val fadeInOut = tween<Float>(
        durationMillis = 300,
        easing = FastOutSlowInEasing
    )
    
    val cardExpand = spring<Float>(
        dampingRatio = Spring.DampingRatioMediumBouncy,
        stiffness = Spring.StiffnessLow
    )
    
    val toggleState = tween<Float>(
        durationMillis = 250,
        easing = LinearOutSlowInEasing
    )
}
```

---

## Accessibility

### High Contrast Mode

- Increase border weights to 4dp
- Boost text contrast to AAA (7:1 ratio)
- Add stroke to primary buttons

### Reduced Motion

- Disable card animations
- Use instant transitions
- Keep critical feedback (toggle state)

### Touch Targets

- Minimum 48dp diameter for all interactive elements
- Increased padding for edge elements (avoid false touches)

---

## Conclusion

These designs prioritize **calm glanceability** over flashy animations. The watch should feel like an extension of Threshold's philosophy: **helpful buffer between now and next**, not an attention-grabbing overlay.

**Next:** Use the GitHub issues for implementation tracking and see `06_AI_CODING_PROMPTS.md` for ready-to-use prompts. SVG mockups live in `docs/wear-implementation/ui-mockups/`.
