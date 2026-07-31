---
name: Civic Unity
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#3d4947'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#6d7a77'
  outline-variant: '#bcc9c6'
  surface-tint: '#006a61'
  primary: '#00685f'
  on-primary: '#ffffff'
  primary-container: '#008378'
  on-primary-container: '#f4fffc'
  inverse-primary: '#6bd8cb'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#dae2fd'
  on-secondary-container: '#5c647a'
  tertiary: '#525e5c'
  on-tertiary: '#ffffff'
  tertiary-container: '#6b7775'
  on-tertiary-container: '#f3fffc'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#89f5e7'
  primary-fixed-dim: '#6bd8cb'
  on-primary-fixed: '#00201d'
  on-primary-fixed-variant: '#005049'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#d8e5e2'
  tertiary-fixed-dim: '#bcc9c6'
  on-tertiary-fixed: '#121e1c'
  on-tertiary-fixed-variant: '#3d4947'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  headline-xl:
    fontFamily: Public Sans
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Public Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Public Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-sm:
    fontFamily: Public Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Public Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Public Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Public Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Public Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Public Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
  headline-lg-mobile:
    fontFamily: Public Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 48px
  container-max: 1280px
  gutter: 24px
  margin-mobile: 16px
---

## Brand & Style

This design system is built on the principles of **Modern Civic Minimalism**. It avoids the sterile coldness of enterprise software and the fleeting trends of consumer apps, opting instead for a "Reliable Utility" aesthetic. The goal is to instill immediate trust for government agencies and non-profits while remaining welcoming to individual volunteers.

The visual direction is characterized by high clarity, intentional whitespace, and a focus on content over decoration. It utilizes a structured, grid-based approach that feels organized and authoritative, yet accessible. The emotional response should be one of "Efficient Altruism"—where users feel that their time is valued and their contributions are part of a larger, well-coordinated effort.

## Colors

The palette is anchored by **Teal 600 (#0D9488)**, chosen for its association with health, growth, and civic action. It serves as the primary action color for buttons, active states, and brand highlights.

- **Primary:** Used for all primary calls-to-action and critical interactive states.
- **Secondary (Deep Slate):** Used for headings and high-priority text to ensure maximum legibility and a sense of "Institutional Authority."
- **Tertiary (Mint Wash):** A very soft tint used for background sections, success alerts, and subtle card fills to soften the UI.
- **Neutrals:** A range of cool greys focused on accessibility. The baseline text color is Slate 700 to reduce eye strain compared to pure black, while maintaining WCAG AA contrast ratios.

## Typography

This design system utilizes **Public Sans**, a typeface designed for government and institutional use. It is chosen for its exceptional legibility, neutral character, and high x-height, which ensures it remains readable even on low-resolution screens or in high-density data environments.

- **Headlines:** Use Bold and Semi-Bold weights to create a clear structural hierarchy. Letter spacing is slightly tightened on larger sizes for a more cohesive "editorial" feel.
- **Body:** Standardized on 16px for optimal readability. 18px is reserved for introductory text or "hero" descriptions.
- **Labels:** Used for metadata, small navigation items, and form captions. The uppercase variant is used sparingly for section headers or status indicators.

## Layout & Spacing

The layout philosophy follows a **Fluid-Fixed Hybrid**. While the overall container has a maximum width of 1280px to prevent excessive line lengths on ultra-wide monitors, the internal grid is fluid.

- **Grid:** A 12-column system is used for desktop, 8-column for tablet, and 4-column for mobile.
- **Vertical Rhythm:** Spacing follows a 4px base unit, with 16px (md) and 24px (lg) being the primary drivers for component padding and section gaps.
- **Coordinators vs. Volunteers:** Coordinator dashboards use condensed vertical spacing (8px-12px) to allow for information-dense tables, whereas volunteer-facing event pages use generous spacing (24px-48px) to feel more inviting and less overwhelming.

## Elevation & Depth

To maintain a clean, civic aesthetic, the design system utilizes **Tonal Layers** and **Low-Contrast Outlines** rather than aggressive shadows.

1.  **Base Layer:** The primary background is white (#FFFFFF) or a very light grey (#F8FAFC).
2.  **Surface Layer:** Cards and interactive containers use a subtle 1px border (#E2E8F0).
3.  **Elevation:** A single, soft "Ambient Shadow" is reserved for floating elements like dropdowns, modals, or active cards. The shadow is highly diffused: `0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)`.
4.  **Interactive Depth:** Hover states on cards are indicated by a slight darkening of the border or a subtle vertical shift (2px upward) rather than a deep shadow, maintaining a "flat but tactile" feel.

## Shapes

The shape language is **Soft (0.25rem)**. This provides a subtle modern touch that softens the "institutional" feel without becoming overly playful or bubbly.

- **Buttons & Inputs:** Use the standard 0.25rem (4px) radius.
- **Cards & Modals:** Use `rounded-lg` (8px) to create a clear distinction between the container and the elements inside it.
- **Avatars & Status Dots:** These are the only elements that use a full circle/pill shape, helping them stand out as distinct "human" or "status" markers within a geometric UI.

## Components

### Buttons
- **Primary:** Solid Teal (#0D9488) with White text. Clear, high-contrast, and authoritative.
- **Secondary:** Outline variant with Teal border and text. Used for secondary actions like "Cancel" or "Save Draft."
- **Tertiary/Ghost:** No border, Teal or Grey text. Used for low-priority actions in tables or navigation.

### Cards
- Volunteer-facing cards (e.g., Event listings) feature a top-aligned image, `headline-md` titles, and prominent "Sign Up" primary buttons.
- Coordinator cards (e.g., Shift summaries) are more compact, using `body-sm` for data points and 12px internal padding.

### Information-Dense Tables
- Designed for coordinators. Feature alternating row highlights (Zebra striping) using the Tertiary color (#F0FDFA) at 50% opacity.
- Header cells use `label-sm` with a light bottom border to anchor the data.

### Input Fields
- Inputs use a 1px Slate 200 border. On focus, the border shifts to Teal with a soft 2px Teal outer glow. Labels are always visible above the field (never just placeholders) to meet accessibility standards.

### Chips & Status Indicators
- Use a pill shape.
- **Active/Confirmed:** Light Teal background with Dark Teal text.
- **Pending:** Light Orange background with Dark Brown text.
- **Full/Closed:** Light Grey background with Dark Grey text.