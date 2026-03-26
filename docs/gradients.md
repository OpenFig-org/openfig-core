# Gradient Paints

Figma gradient fills and strokes are stored as `Paint` entries in `fillPaints`
or `strokePaints`.

Common gradient paint types:

- `GRADIENT_LINEAR`
- `GRADIENT_RADIAL`
- `GRADIENT_ANGULAR`
- `GRADIENT_DIAMOND`

## Shape

At the `openfig-core` type level, gradient-capable paints are represented on
`FigPaint`:

```ts
interface FigPaint {
  type: string;
  color?: FigColor;
  opacity?: number;
  visible?: boolean;
  blendMode?: string;
  stops?: FigGradientStop[];
  stopsVar?: FigGradientStop[];
  transform?: FigTransform;
}
```

Supporting types:

```ts
interface FigGradientStop {
  color: FigColor;
  position: number;
  colorVar?: any;
}

interface FigTransform {
  m00: number;
  m01: number;
  m02: number;
  m10: number;
  m11: number;
  m12: number;
}
```

## Example

From test fixture `OpenFig_logos_OPENFIX_EXPORT_07.fig`, `OG_image` frame:

```js
{
  type: 'GRADIENT_RADIAL',
  opacity: 1,
  visible: true,
  blendMode: 'NORMAL',
  stops: [
    {
      color: { r: 1, g: 0.8941, b: 0.7921, a: 1 },
      position: 0.3846,
    },
    {
      color: { r: 0.8594, g: 0.4707, b: 0.3562, a: 1 },
      position: 1,
    },
  ],
  transform: {
    m00: 1.0966e-7,
    m01: 0.4762,
    m02: 0.2619,
    m10: -0.5331,
    m11: 3.3837e-8,
    m12: 0.7666,
  },
}
```

## Semantics

### `stops`

`stops` is the ordered gradient stop list.

- `position` is normalized, usually `0..1`
- `color` is the resolved RGBA stop color

### `stopsVar`

`stopsVar` mirrors `stops`, but retains variable-backed color information when
present.

Use this when variable provenance matters. Use `stops` when you only need the
resolved rendered colors.

### `transform`

`transform` is the paint-space affine transform used to position the gradient.

This is a paint-local matrix, not the node’s main transform.

For consumers:

- node `transform` places the object in world space
- paint `transform` places the gradient inside the object’s local space

## Consumer guidance

- Do not assume non-solid fills are absent just because `color` is missing.
- For fidelity-sensitive rendering, check visible `fillPaints` in order and
  handle gradient paint types explicitly.
- Keep the raw gradient `transform` and stop list if you need roundtrip-safe
  rendering or save behavior.

## Helper API

`openfig-core` exposes two helpers for consumers that need to render Figma
gradients consistently:

```ts
import {
  extractRenderableGradientFill,
  resolveGradientGeometry,
} from "openfig-core";
```

### `extractRenderableGradientFill(paints)`

Finds the first visible linear or radial gradient paint in a paint stack and
returns a normalized object:

```ts
interface RenderableGradientFill {
  type: "linear" | "radial";
  opacity: number;
  transform: FigTransform;
  stops: FigGradientStop[];
}
```

Notes:

- this currently normalizes `GRADIENT_LINEAR` and `GRADIENT_RADIAL`
- stop order is normalized ascending by `position`
- colors remain raw `FigColor` values so different consumers can decide how to
  map them into CSS/SVG/canvas APIs

### `resolveGradientGeometry(fill, width, height)`

Projects a normalized gradient into the object’s local pixel space:

```ts
type ResolvedGradientGeometry =
  | {
      type: "linear";
      start: { x: number; y: number };
      end: { x: number; y: number };
    }
  | {
      type: "radial";
      center: { x: number; y: number };
      radiusX: number;
      radiusY: number;
      angle: number; // radians
    };
```

This helper performs the important transform inversion step:

- Figma `paint.transform` maps node space -> gradient space
- most renderers need the opposite mapping, gradient space -> node space
- `resolveGradientGeometry(...)` is the shared canonical interpretation for that
  conversion

Consumers can then adapt that geometry into renderer-specific APIs:

- SVG: `<linearGradient>` / `<radialGradient>` with `gradientUnits="userSpaceOnUse"`
- Canvas/Konva: fill handles/radii derived from the resolved pixel-space points
- exporters: consistent raster/vector output without re-deriving the math

## Current scope

- ✅ Shared geometry helpers for linear and radial gradients
- ✅ Raw gradient types and official docs
- ❓ Higher-level helpers for angular/diamond gradients
- ❓ Renderer-specific adapters (SVG/Konva/canvas) live in consumer packages

## Related docs

- [shapes.md](shapes.md)
- [text.md](text.md)
- [colors.md](colors.md)
