# Shape Nodes

## ROUNDED_RECTANGLE ✅

The simplest freestanding shape — produced by the rectangle tool. Fill and stroke
live **directly on the node**, not in any sub-structure.

```javascript
{
  guid: { sessionID: 1, localID: 85 },
  type: 'ROUNDED_RECTANGLE',
  phase: 'CREATED',
  name: 'Rectangle 1',
  parentIndex: { guid: slideGuid, position: '#' },
  visible: true,
  opacity: 1,
  size: { x: 300, y: 300 },
  transform: { m00: 1, m01: 0, m02: 740, m10: 0, m11: 1, m12: 100 },  // m02=x, m12=y
  strokeWeight: 1,
  strokeAlign: 'INSIDE',   // 'INSIDE' | 'OUTSIDE' | 'CENTER'
  strokeJoin: 'MITER',
  fillPaints: [{
    type: 'SOLID',
    color: { r: 0.878, g: 0.243, b: 0.102, a: 1 },  // normalized 0-1 floats
    opacity: 1,
    visible: true,
    blendMode: 'NORMAL',
    // colorVar is optional — omit when using raw RGB
  }],
  fillGeometry: [{ windingRule: 'NONZERO', commandsBlob: 17, styleID: 0 }],  // cached, may be omittable
  // editInfo: omit when creating new nodes
}
```

**Validated facts:**
- Position: `transform.m02` = x, `transform.m12` = y ✅
- Size: `size.x` = width, `size.y` = height ✅
- `fillGeometry` is NOT required — Figma recomputes it on import ✅
- Fill opacity: set `opacity` on the `fillPaints` entry (0–1) ✅
- Corner radius: set `cornerRadius` + all four `rectangle*CornerRadius` fields ✅
- Z-order: nodes later in `nodeChanges` render on top ✅
- `strokeWeight: 0` removes stroke entirely ✅
- Setting `cornerRadius` = half of width/height produces a **circle** ✅
- Shapes can extend beyond slide bounds — Figma clips at the slide edge ✅
- Also used for image placeholder overrides (see [overrides.md](overrides.md))

For gradient fills and the shared geometry helper API, see
[gradients.md](gradients.md).

**Slide dimensions:** 1920×1080 (stored on SLIDE node `size` field). SLIDE_GRID is 2400×1560.

---

## FRAME (auto-layout container) ✅

Used to group and auto-lay-out child nodes (e.g., title + body text).

```javascript
{
  guid: { sessionID: 0, localID: 45 },
  type: 'FRAME',
  phase: 'CREATED',
  name: 'Frame 2',
  parentIndex: { guid: slideGuid, position: '!' },
  visible: true,
  opacity: 1,
  size: { x: 1200, y: 189 },
  transform: { m00: 1, m01: 0, m02: 128, m10: 0, m11: 1, m12: 446 },
  stackMode: 'VERTICAL',              // 'VERTICAL' | 'HORIZONTAL'
  stackSpacing: 24,                    // gap between children (px)
  verticalConstraint: 'CENTER',        // positioning constraint on slide
  frameMaskDisabled: true,
}
```

Validated: vertical auto-layout with spacing, TEXT children positioned correctly ✅

### Transforms

FRAME nodes can be rotated and scaled, not just translated. The `transform` is a
full 2×3 affine matrix:

```javascript
// Identity (no rotation): translate only
transform: { m00: 1, m01: 0, m02: 50, m10: 0, m11: 1, m12: 989 }

// Rotated ~10°:
transform: { m00: 0.986, m01: -0.166, m02: 71, m10: 0.166, m11: 0.986, m12: -271 }
```

SVG: `matrix(m00,m10,m01,m11,m02,m12)` — note the Figma→SVG column swap.

### Clipping (frameMaskDisabled)

- `frameMaskDisabled: false` (default) → children are clipped to frame bounds
- `frameMaskDisabled: true` → children can overflow the frame visually

The rasterizer implements this as a `<clipPath>` matching the frame's size and
corner radius.

### Opacity

`opacity` (0–1) applies to the entire subtree as group opacity. A FRAME at 0.15
makes all its children 15% transparent as a group.

---

## SHAPE_WITH_TEXT ✅

Produced by the "shape" tool in Figma Slides. Fill lives inside
`nodeGenerationData.overrides`, not directly on the node. Uses internal sub-nodes
with `sessionID: 40000000`.

### shapeWithTextType values

| Value | Shape |
|-------|-------|
| `SQUARE` | Square (equal width/height) |
| `RECTANGLE` | Rectangle |
| `ELLIPSE` | Ellipse / circle |
| `DIAMOND` | Diamond (rotated square) |
| `TRIANGLE_UP` | Triangle pointing up |
| `STAR` | 5-pointed star |

### nodeGenerationData structure

The shape's visual properties are stored in `nodeGenerationData.overrides`, NOT
on the top-level node fields. This is the key difference from ROUNDED_RECTANGLE.

- **overrides[0]** — shape fill at `guidPath: { guids: [{ sessionID: 40000000, localID: 0 }] }`
- **overrides[1]** — text style at `guidPath: { guids: [{ sessionID: 40000000, localID: 1 }] }`

```javascript
{
  type: 'SHAPE_WITH_TEXT',
  shapeWithTextType: 'ELLIPSE',
  size: { x: 400, y: 400 },
  transform: { m00: 1, m01: 0, m02: 200, m10: 0, m11: 1, m12: 200 },
  nodeGenerationData: {
    overrides: [
      {
        // Shape fill override
        guidPath: { guids: [{ sessionID: 40000000, localID: 0 }] },
        styleIdForFill: { guid: { sessionID: 0xFFFFFFFF, localID: 0xFFFFFFFF } },
        fillPaints: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 1, visible: true, blendMode: 'NORMAL' }],
        // ... stroke, effects, etc.
      },
      {
        // Text style override
        guidPath: { guids: [{ sessionID: 40000000, localID: 1 }] },
        styleIdForFill: { guid: { sessionID: 0xFFFFFFFF, localID: 0xFFFFFFFF } },
        fillPaints: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 }, ... }],
        // ... font settings
      }
    ],
    useFineGrainedSyncing: false,
    diffOnlyRemovals: [],
  },
}
```

**Important:** When setting fill/stroke on a SHAPE_WITH_TEXT, modify
`nodeGenerationData.overrides[0].fillPaints`, NOT top-level `fillPaints`.
Image fills also go into `overrides[0].fillPaints`.

---

## LINE ✅

A 1-dimensional node (size.y = 0). Position and angle are encoded in the
2D affine transform matrix.

```javascript
{
  type: 'LINE',
  size: { x: length, y: 0 },
  transform: {
    m00: cos(angle), m01: -sin(angle), m02: x1,
    m10: sin(angle), m11:  cos(angle), m12: y1,
  },
  strokeWeight: 4,
  strokeAlign: 'CENTER',
  strokeCap: 'NONE',     // 'NONE' | 'ROUND' | 'SQUARE'
  strokePaints: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 }, ... }],
}
```

The transform encodes both position (m02=x1, m12=y1) and rotation. The line
extends from (x1,y1) along the angle for `size.x` pixels.

---

## TABLE ✅

A single node with no children. All cell data is stored in `nodeGenerationData.overrides`
using guidPath addressing with row/column IDs.

### Structure

```javascript
{
  type: 'TABLE',
  size: { x: totalWidth, y: totalHeight },
  transform: { m00: 1, m01: 0, m02: x, m10: 0, m11: 1, m12: y },
  cornerRadius: 12,
  fillPaints: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 }, ... }],
  tableRowPositions: { entries: [{ id: rowGuid, position: '!' }, ...] },
  tableColumnPositions: { entries: [{ id: colGuid, position: '!' }, ...] },
  tableRowHeights: { entries: [] },  // empty = auto height
  tableColumnWidths: { entries: [{ id: colGuid, size: 192 }, ...] },
  nodeGenerationData: {
    overrides: [...cellOverrides, ...styleOverrides],
  },
}
```

### nodeGenerationData guidPath addressing

| guidPath | Purpose |
|----------|---------|
| `40000000:0 > rowID > colID` | Per-cell **background fill** (optional) |
| `40000000:1 > rowID > colID` | Per-cell **text content** |
| `40000000:2` | Default **cell style** (fill, stroke, font base) |
| `40000000:3` | Default **text style** (fill, font settings) |

Cell text override example:
```javascript
{
  guidPath: { guids: [{ sessionID: 40000000, localID: 1 }, rowId, colId] },
  textData: { characters: 'Cell value', lines: [{ lineType: 'PLAIN', ... }] },
}
```

The `40000000:2` override's `fillPaints` controls the default cell background color.
Set to white for light-themed tables, black for dark-themed.

---

## VECTOR ✅

Used for imported SVG graphics. Contains path data in binary blobs.

For the consumer-facing helper API (`getBlobBytes`, `geometryBlobToSVGPath`,
`resolveVectorNodePaths`), see [vector.md](vector.md).

```javascript
{
  type: 'VECTOR',
  size: { x: nodeWidth, y: nodeHeight },
  fillPaints: [{ type: 'SOLID', color: { r, g, b, a: 1 }, ... }],
  fillGeometry: [
    { windingRule: 'NONZERO', commandsBlob: 17, styleID: 0 },
    // one entry per SVG <path>
  ],
  vectorData: {
    vectorNetworkBlob: 16,  // index into message.blobs
    normalizedSize: { x: svgViewBoxW, y: svgViewBoxH },
    styleOverrideTable: [],
  },
}
```

### fillGeometry commandsBlob binary format

Each blob encodes path drawing commands. Coordinates are in **node size** space
(SVG coords scaled by `nodeSize / viewBox`).

| Byte | Command | Params |
|------|---------|--------|
| `0x01` | moveTo | x(f32 LE), y(f32 LE) |
| `0x02` | lineTo | x(f32 LE), y(f32 LE) |
| `0x04` | cubicTo | c1x, c1y, c2x, c2y, x, y (6×f32 LE) |
| `0x00` | closePath | none |

### vectorNetworkBlob binary format

The editable vector network. Required for proper slide duplication.
Coordinates are in **SVG/normalizedSize** space (unscaled).

```
Header (16 bytes):
  numVertices:    u32 LE
  numSegments:    u32 LE
  numRegions:     u32 LE
  numStyles:      u32 LE

Vertices (12 bytes each):
  x:              f32 LE
  y:              f32 LE
  handleMirroring: u32 LE  (4 = default)

Segments (28 bytes each):
  startVertex:    u32 LE
  tangentStartX:  f32 LE  (relative to start vertex)
  tangentStartY:  f32 LE
  endVertex:      u32 LE
  tangentEndX:    f32 LE  (relative to end vertex)
  tangentEndY:    f32 LE
  segType:        u32 LE  (4 = cubic bezier, 0 = line)

Regions (variable, one per fill path):
  numLoops:       u32 LE
  per loop:
    segCount:     u32 LE
    segIndices:   u32 LE × segCount
  windingRule:    u32 LE  (1 = NONZERO, 0 = EVENODD)
```

**Important:** A malformed vectorNetworkBlob causes silent corruption — the graphic
disappears when duplicating slides.

### Per-path fill overrides (styleOverrideTable)

A single VECTOR can have different fill colors on different sub-paths (e.g. a
coat-of-arms with red and white regions). Figma shows this as "Click + to replace
mixed content" in the Fill inspector.

```javascript
fillGeometry: [
  { commandsBlob: 522, windingRule: 'NONZERO', styleID: 2 },  // white
  { commandsBlob: 523, windingRule: 'NONZERO', styleID: 0 },  // node-level fill
]

vectorData: {
  styleOverrideTable: [
    { styleID: 1, fillPaints: [] },                       // no fill (transparent)
    { styleID: 2, fillPaints: [{ type: 'SOLID',
        color: { r: 1, g: 1, b: 1 }, opacity: 1 }] },    // white override
    { styleID: 3, cornerRadius: 0, strokeCap: 'NONE' },   // stroke-only props
  ],
}
```

- `styleID: 0` or absent → use node-level `fillPaints`
- `styleID` matching table entry with `fillPaints` → use that fill
- Empty `fillPaints: []` → no fill for that path

### strokeGeometry (pre-expanded outlines)

Figma pre-computes stroke outlines as filled shapes. `strokeGeometry[]` uses the
same commandsBlob format as fillGeometry. The renderer fills these paths with
the stroke color — they are NOT rendered as SVG strokes.

```javascript
{
  strokePaints: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, ... }],
  strokeWeight: 2,
  strokeGeometry: [
    { windingRule: 'NONZERO', commandsBlob: 600, styleID: 0 },
  ],
}
```

For stroke-only vectors (no fillPaints, only strokePaints+strokeGeometry), the
stroke geometry provides the only visible output.

#### Fixture-backed implication for SVG import/export

A fixture comparison of two `.fig` files created from the same SVG source
showed that the artwork can be encoded either as a single compact vector or as
decomposed separate fill/stroke vectors with mask-group composition.

The important file-format lesson is:

- `strokeGeometry` should still be treated as **outline geometry**, not as
  centerline stroke instructions.
- Consumers should not rely on stroke centerlines being reconstructed into
  visible outlines at import time — the fixtures do not support that
  assumption.
- For stroked SVG fidelity, the honest write path is still:
  - expand stroke outlines into geometry, or
  - match Figma's broader multi-node decomposition strategy.
