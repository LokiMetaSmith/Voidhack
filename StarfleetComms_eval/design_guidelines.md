# Star Trek Enterprise Computer Communicator - Design Guidelines

## Design Approach: Reference-Based (Star Trek LCARS Interface)

**Primary Inspiration**: Star Trek's LCARS (Library Computer Access/Retrieval System) - the iconic interface used throughout Star Trek: The Next Generation and subsequent series.

**Design Philosophy**: Create an immersive, authentic Star Trek experience with the signature LCARS aesthetic - bold geometric shapes, vibrant accent colors on dark backgrounds, and futuristic yet functional interface elements that make users feel like they're aboard the Enterprise.

## Core Design Elements

### A. Color Palette

**Dark Mode Primary** (LCARS-inspired):
- Background: 15 8% 8% (Deep space black)
- Surface: 15 10% 12% (Panel dark)
- Primary (LCARS Orange): 25 100% 70%
- Secondary (LCARS Blue): 235 60% 75%
- Accent (LCARS Purple): 290 40% 70%
- Text Primary: 0 0% 95%
- Text Secondary: 0 0% 70%
- Success (Active): 145 85% 60%
- Warning (Processing): 45 100% 65%

### B. Typography

**Font Stack**:
- Primary: "Inter", "Helvetica Neue", system-ui, sans-serif
- Monospace: "JetBrains Mono", "Courier New", monospace (for computer responses)

**Type Scale**:
- Hero/Display: text-4xl to text-6xl, font-bold, tracking-tight
- Section Headers: text-2xl to text-3xl, font-semibold
- Body: text-base to text-lg, font-normal
- Labels/Metadata: text-sm, font-medium, uppercase, tracking-wide (LCARS style)
- Code/Computer Text: text-sm to text-base, font-mono

### C. Layout System

**Spacing Primitives**: Use Tailwind units of 2, 4, 8, and 16 for consistent rhythm (p-4, m-8, gap-4, etc.)

**Container Strategy**:
- Mobile: Full width with px-4 padding
- Desktop: max-w-4xl centered for main content
- Voice interface: Fixed or sticky positioning for always-accessible controls

**Grid System**: Single-column mobile, may expand to asymmetric LCARS-style panels on desktop (70/30 splits with angled dividers)

### D. Component Library

**1. Voice Control Panel** (Primary interaction zone):
- Large circular push-to-talk button (LCARS orange when inactive, pulsing green when active)
- Audio waveform visualization during voice input (animated bars in LCARS blue)
- Status indicator labels: "READY", "LISTENING", "PROCESSING", "SPEAKING"
- Geometric panel frame with rounded corners and angled edges

**2. Conversation Display**:
- Scrollable message list with clear user/computer distinction
- User messages: Right-aligned, LCARS blue accent, sans-serif font
- Computer responses: Left-aligned, LCARS orange accent, monospace font
- Timestamp metadata in small uppercase labels
- Segmented background panels (LCARS style) for each message group

**3. Status Indicators**:
- Connection status badge (top-right corner)
- Processing spinner using LCARS geometric elements (not circular)
- Audio level meter (horizontal bars during listening)
- Visual feedback: Subtle glow effects on active elements

**4. Navigation Header**:
- "USS ENTERPRISE - COMPUTER INTERFACE" title in uppercase
- LCARS-style horizontal bars framing the header
- Minimal icons (settings, info) in top corners
- Angled decorative elements

**5. Control Buttons**:
- Rounded rectangular shapes with slight angle
- LCARS color coding (orange for primary actions, blue for secondary)
- No borders, solid fills
- Uppercase labels
- Clear/End Conversation button in contrasting color

### E. Animations

**Minimal, Purposeful Animations**:
- Microphone button: Gentle pulse during listening state (1.5s ease-in-out)
- Waveform: Real-time audio visualization (reactive to input)
- Message appearance: Subtle slide-in from appropriate side (200ms)
- Processing indicator: Horizontal scanning bar (LCARS computer style)
- NO hover animations - let native button states handle interaction

## Mobile-First Responsive Strategy

**Mobile (base)**: 
- Single-column stacked layout
- Full-width voice control panel at bottom (sticky)
- Conversation scrolls in middle
- Header condensed with hamburger menu

**Desktop (lg:)**:
- LCARS asymmetric panel layout
- Voice controls in left panel (30% width, fixed)
- Conversation history in right panel (70% width)
- Decorative LCARS elements in corners and edges

## Images

**No hero image needed**. This is a utility-focused voice interface app.

**Optional Icon/Logo**: A small Starfleet delta insignia or Enterprise silhouette as a header badge (30-40px, subtle, monochrome white/orange)

## Accessibility & Interaction

- High contrast maintained (LCARS colors on dark backgrounds meet WCAA AA)
- Large touch targets (minimum 48px) for voice controls
- Clear visual state changes for all interaction modes
- Screen reader labels for all functional elements
- Keyboard navigation support (spacebar for push-to-talk)

## Key Design Principles

1. **Authenticity**: Faithful to LCARS aesthetic while remaining functional
2. **Clarity**: User always knows system state (listening/processing/speaking)
3. **Immersion**: Every element reinforces the Star Trek experience
4. **Simplicity**: Despite visual richness, interaction remains straightforward
5. **Responsiveness**: Seamless experience from phone to desktop