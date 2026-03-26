# Slides Mode vs Design Mode

Figma Slides has two UI modes. The `.deck` file is **identical** regardless of
which mode is active when saving — the mode is purely a UI concern.

## Slides Mode

- Simplified UI for non-designers / presentation authors
- Exposes named text styles (Title, Header 1–3, Body 1–3, Note)
- Preset color palette (23 named colors)
- Template overrides (swap text, images)
- Cannot change fonts directly — must detach style first

## Design Mode

- Full Figma design panel for template designers
- Raw font controls, custom colors, positioning, auto-layout
- Everything from Slides mode plus direct property access
- "Detach style" unlocks font customization

## Conceptual Model

Slides mode is a constrained view built on top of Design mode. A designer builds
the template in Design mode, then a non-designer uses Slides mode to fill in content
using the curated presets. This prevents breaking the design system.

The `.deck` format captures the full Design mode state. Slides mode restrictions
are enforced only in the Figma UI, not in the file format. Programmatic tools
have full Design mode access.

## Implications for Programmatic Creation

For AI-driven presentation generation, defaulting to Slides-mode-level abstractions
(named text styles, named colors, template overrides) produces more consistent
output and is less error-prone than raw property manipulation. Raw Design mode
fields remain available for cases that need them.
