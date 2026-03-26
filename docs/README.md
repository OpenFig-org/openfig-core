# .deck / .fig File Format Documentation

Technical specification for the Figma binary format. `.deck` files (Slides) are
ZIP archives containing a `canvas.fig` + metadata. The inner binary format is
shared with standalone `.fig` files (Design).

> **New here?** Start with [`docs/agents.md`](../agents.md) for a project overview.

## Documents

| Document | Description |
|----------|-------------|
| [archive.md](archive.md) | ZIP structure, canvas.fig binary layout, kiwi schema, encoding pipeline |
| [encoder.md](encoder.md) | Encoding pipeline — encodeFigParts, assembleCanvasFig, createFigZip |
| [template.md](template.md) | Empty .fig template — how it's generated, how to regenerate, compatibility notes |
| [nodes.md](nodes.md) | Node structure, types, GUIDs, parentIndex, hierarchy, cached fields |
| [containers.md](containers.md) | FRAME vs GROUP vs SECTION semantics, including frame-like group encoding patterns |
| [shapes.md](shapes.md) | ROUNDED_RECTANGLE, SHAPE_WITH_TEXT, FRAME — geometry, fill, stroke |
| [gradients.md](gradients.md) | Gradient paint types, stop lists, paint transforms, and consumer guidance |
| [vector.md](vector.md) | VECTOR nodes, blob resolution, commandsBlob format, helper API |
| [text.md](text.md) | TEXT nodes, text styles, fonts, custom fonts (detached style) |
| [images.md](images.md) | Image storage, SHA-1 hashing, thumbnails, image overrides |
| [colors.md](colors.md) | Light Slides color variables, color variable GUIDs, raw RGB |
| [overrides.md](overrides.md) | Symbol overrides — text, image, nested; overrideKey vs guid |
| [slides.md](slides.md) | Slide management — cloning, reordering, slide dimensions |
| [modes.md](modes.md) | Slides mode vs Design mode, design philosophy for AI consumers |
| [invariants.md](invariants.md) | Hard rules — things that crash or silently fail |

## Validation Status

Features marked with these icons:

- ✅ Validated — roundtripped through Figma successfully
- 🔬 Format learned — inspected from reference deck, needs generation + validation
- ❓ Unknown — not yet investigated
