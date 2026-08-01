# VECTOR File Format

Technical notes for Figma `VECTOR` nodes in `.fig` files, plus the helper APIs
that `openfig-core` exposes for both read-side rendering and minimal write-side
VECTOR authoring.

## Where vector data lives

A parsed `VECTOR` node contains **references** to blob entries, not the raw
bytes inline on the node itself.

```javascript
{
  type: 'VECTOR',
  size: { x: 1239.14, y: 469.78 },
  fillPaints: [{ type: 'SOLID', color: { r, g, b, a: 1 }, ... }],
  fillGeometry: [
    { windingRule: 'NONZERO', commandsBlob: 3, styleID: 0 },
    { windingRule: 'NONZERO', commandsBlob: 4, styleID: 0 },
  ],
  strokeGeometry: [],
  vectorData: {
    vectorNetworkBlob: 2,
    normalizedSize: { x: 1024, y: 512 },
    styleOverrideTable: [],
  },
}
```

The actual bytes live in `doc.message.blobs`:

```javascript
doc.message.blobs[3]  // -> { bytes: Uint8Array(...) }
```

See also [archive.md](archive.md) for the top-level blob array layout.

## Geometry layers

There are two distinct vector payloads:

- `fillGeometry[]`
  Read-only path geometry used for rendering filled regions.
- `strokeGeometry[]`
  Pre-expanded stroke outlines, also encoded as filled paths.
- `vectorData.vectorNetworkBlob`
  Editable vector network. Needed for faithful editing and some round-trip cases,
  but not required for first-pass read-only rendering.

For rendering imported vectors, `fillGeometry` and `strokeGeometry` are the
lowest-risk starting point.

## `commandsBlob` binary format

Each `fillGeometry[].commandsBlob` or `strokeGeometry[].commandsBlob` entry is a
blob index into `doc.message.blobs`.

The resolved blob is a command stream:

| Byte | Command | Params |
|------|---------|--------|
| `0x01` | `moveTo` | `x(f32 LE), y(f32 LE)` |
| `0x02` | `lineTo` | `x(f32 LE), y(f32 LE)` |
| `0x04` | `cubicTo` | `c1x, c1y, c2x, c2y, x, y` (6×`f32 LE`) |
| `0x00` | `closePath` | none |

Coordinates are already in **node size space**. Consumers do not need to rescale
from `vectorNetworkBlob.normalizedSize` just to render the decoded path.

## `vectorNetworkBlob` binary format

`vectorData.vectorNetworkBlob` is a blob index into `doc.message.blobs`. The
resolved blob is a little-endian binary vector network: vertices, segments
carrying bezier tangent deltas, and regions grouping segment indices into closed
loops.

The layout below is verified byte-exact on the Figma-authored reference corpus
(17 blobs across 6 files, format versions 101 and 106):

```
header   12B : vertexCount(u32)  segmentCount(u32)  regionCount(u32)
vertex   12B : handleMirroring(u32)  x(f32)  y(f32)
segment  28B : word0(u32)  startVertex(u32)  tangentStartX(f32)  tangentStartY(f32)
              endVertex(u32)  tangentEndX(f32)  tangentEndY(f32)
region       : packed(u32)  numLoops(u32)
               per loop: segCount(u32)  segIndex(u32) × segCount
```

- `packed` decodes as `windingRule = (packed & 1) ? "NONZERO" : "ODD"` and
  `styleID = packed >> 1`. In every reference region `packed === 1`.
- The vertex's leading word is Figma's **handle-mirroring** mode. Observed values
  are `0` and `1`. It does not affect rendered geometry, but it is preserved
  verbatim so a decoded blob re-encodes byte-for-byte.
- The segment's leading `word0` is `0` throughout the reference corpus; its
  meaning is unknown and it is never used for geometry.

### Curve classification

There is **no segment-type field**. A segment is a straight line if and only if
all four tangent components are zero:

```
isStraight = tangentStartX === 0 && tangentStartY === 0 &&
             tangentEndX   === 0 && tangentEndY   === 0
```

For a cubic segment from vertex `A` to vertex `B`, the SVG control points are
`(A.x + tangentStartX, A.y + tangentStartY)` and
`(B.x + tangentEndX, B.y + tangentEndY)`.

### Fidelity guarantee

`parseVectorNetworkBlob` followed by `encodeVectorNetwork` reproduces every
Figma-authored reference blob **byte-for-byte (17/17)**. That round-trip is the
acceptance criterion the format is held to: it requires no theory of what each
field means, only that we put back what we found. Newly authored geometry
(`encodeVectorNetworkBlob`) confines every emitted value to Figma's observed
domain — in particular the segment `word0` is `0`, never the `4` openfig once
wrote, which appears nowhere in Figma output and was a one-scan fingerprint.

## Per-path fills

`fillGeometry` paths can carry `styleID`s. These resolve against
`vectorData.styleOverrideTable`.

- `styleID: 0` or missing: use node-level `fillPaints`
- matching style override with `fillPaints`: use that override fill
- matching style override with `fillPaints: []`: that path is intentionally unfilled

This is how mixed-fill vectors are represented.

## SVG encoding variability in `.fig` files

Different `.fig` producers encode the same SVG source in structurally different
ways. A fixture comparison of two `.fig` files created from the same OpenFig
wordmark SVG showed:

- **Multi-node encoding:** The artwork is decomposed into many nodes —
  separate fill vectors (roughly one per glyph), separate stroke-only vectors,
  `FRAME` containers named `Group` / `Mask group`, and masking vectors for
  composition.
- **Single-node encoding:** The artwork is stored as **one** `VECTOR` node
  with multiple `fillGeometry` and `strokeGeometry` entries plus node-level
  `fillPaints` and `strokePaints`.

Consumers should not assume that an imported SVG with visible outline, shadow,
or mask effects will always be encoded as a single `VECTOR`. The `.fig` format
supports both representations, and interoperability requires handling both.

## `openfig-core` helper API

### Read-side helpers

`openfig-core` exposes read-side helpers for vector consumers:

### `getBlobBytes(doc, blobIndex)`

Returns the resolved `Uint8Array` for a blob index from `doc.message.blobs`.

### `geometryBlobToSVGPath(blob)`

Converts one resolved `commandsBlob` into an SVG `d` string.

### `resolveVectorNodePaths(doc, node)`

Resolves a `VECTOR` node into renderable geometry:

```javascript
import { parseFig, resolveVectorNodePaths } from 'openfig-core';

const doc = parseFig(figBytes);
const node = doc.nodes.find((n) => n.type === 'VECTOR');
const vector = resolveVectorNodePaths(doc, node);

console.log(vector.fill[0]);
// {
//   blobIndex: 3,
//   commandsBlob: Uint8Array(...),
//   svgPath: 'M...',
//   windingRule: 'NONZERO',
//   styleID: 0,
//   paints: [...]
// }
```

The helper resolves:

- blob indices -> `Uint8Array` bytes
- geometry bytes -> SVG path strings
- per-path fill overrides -> effective `paints`

This is intended for **read-only rendering** in consumers such as:

- canvas renderers
- SVG exporters
- PNG rasterizers
- headless analyzers

### `parseVectorNetworkBlob(bytes)`

Decodes a resolved `vectorNetworkBlob` into structured geometry — `vertices`,
`segments` (each carrying its tangent deltas and an `isStraight` flag), and
`regions` (winding rule, style id, and ordered loops of segment indices). See
[`vectorNetworkBlob` binary format](#vectornetworkblob-binary-format) for the
layout and curve-classification rule.

The decoder throws rather than returning partial results on a short buffer, a
declared count running past the end, an out-of-range vertex or segment index, or
trailing bytes. `bytesConsumed` equals the input length on success.

### Write-side helpers

`openfig-core` also exposes minimal write-side helpers for native VECTOR
authoring:

### `parseSVGPathData(svgPath)`

Parses a restricted SVG path subset into command objects:

- `M` / `m`
- `L` / `l`
- `H` / `h`
- `V` / `v`
- `C` / `c`
- `S` / `s`
- `Q` / `q` (converted exactly to cubic commands)
- `T` / `t` (converted exactly to cubic commands)
- `Z` / `z`

Unsupported path commands intentionally throw.

### `encodeCommandsBlob(commands, scaleX, scaleY)`

Encodes parsed path commands into a `commandsBlob` byte stream suitable for
`fillGeometry[].commandsBlob` or `strokeGeometry[].commandsBlob`.

### `encodeVectorNetworkBlob(pathCommandsList)`

Builds a minimal `vectorNetworkBlob` from path commands in normalized-space
coordinates. Emits Figma's verified layout (see above); authored vertices use
handle-mirroring `0` and segment `word0` `0`, both within Figma's observed
domain.

### `encodeVectorNetwork(network)`

Encodes a structured `VectorNetwork` (or any `{ vertices, segments, regions }`)
into a `vectorNetworkBlob` in Figma's verified layout. This is the structured
inverse of `parseVectorNetworkBlob`: a Figma-authored blob decoded and re-encoded
here comes back byte-for-byte identical. `encodeVectorNetworkBlob` builds the
structure from path commands and delegates to this function.

### `appendVectorPayloadToDocument(doc, input)`

Appends VECTOR blobs to `doc.message.blobs` and returns native payload
structures:

- `fillGeometry`
- `strokeGeometry`
- `vectorData.vectorNetworkBlob`
- `vectorData.normalizedSize`
- optional `vectorData.styleOverrideTable`

This is the shared core seam intended for consumers such as:

- editor `.fig` export
- CLI native vector creation
- future restricted SVG-to-native-vector import

### SVG path utilities

`openfig-core` also exports SVG path utilities for serialization, transformation,
and stroke enum mapping. These complement the write-side helpers above and are
used by consumers that build or manipulate SVG path data before encoding it into
`.fig` blobs.

### `serializeSvgPathData(commands)`

Converts an array of `VectorPathCommand` objects back into an SVG `d` string.
This is the inverse of `parseSVGPathData`.

```javascript
import { parseSVGPathData, serializeSvgPathData } from 'openfig-core';

const cmds = parseSVGPathData('M0 0 L10 10 Z');
const d = serializeSvgPathData(cmds);
// 'M0 0 L10 10 Z'
```

### `transformSvgPathData(svgPath, opts)`

Parses an SVG path string, applies scale and translate, and returns a new SVG
path string with the transformed coordinates.

```typescript
function transformSvgPathData(
  svgPath: string,
  opts: {
    scaleX?: number;
    scaleY?: number;
    translateX?: number;
    translateY?: number;
  },
): string;
```

```javascript
import { transformSvgPathData } from 'openfig-core';

// Scale a 100×100 path down to 50×50 and shift it right by 20
const scaled = transformSvgPathData('M0 0 L100 100 Z', {
  scaleX: 0.5,
  scaleY: 0.5,
  translateX: 20,
});
// 'M20 0 L70 50 Z'
```

### `mapStrokeJoin(value)`

Maps an SVG `stroke-linejoin` value to its Figma enum equivalent.

```typescript
function mapStrokeJoin(value: string | undefined): string;
```

```javascript
import { mapStrokeJoin } from 'openfig-core';

mapStrokeJoin('round');     // 'ROUND'
mapStrokeJoin('bevel');     // 'BEVEL'
mapStrokeJoin('miter');     // 'MITER'
mapStrokeJoin(undefined);   // 'MITER'
```

### `mapStrokeCap(value)`

Maps an SVG `stroke-linecap` value to its Figma enum equivalent.

```typescript
function mapStrokeCap(value: string | undefined): string;
```

```javascript
import { mapStrokeCap } from 'openfig-core';

mapStrokeCap('round');      // 'ROUND'
mapStrokeCap('square');     // 'SQUARE'
mapStrokeCap('butt');       // 'NONE'
mapStrokeCap(undefined);    // 'NONE'
```

## Current scope

What the current helpers solve:

- read-side decode of `fillGeometry` / `strokeGeometry`
- command-blob encoding for supported path commands
- `vectorNetworkBlob` decode (`parseVectorNetworkBlob`) and byte-identical
  re-encode (`encodeVectorNetwork`), verified 17/17 on the Figma-authored corpus
- `vectorNetworkBlob` authoring in Figma's verified layout
  (`encodeVectorNetworkBlob`)
- append-only blob/reference generation for new VECTOR payloads
- per-path fill style overrides via `styleID` + `styleOverrideTable`
- SVG path serialization, affine transformation, and stroke enum mapping

What they still do **not** solve:

- no boolean ops or vector edit semantics
- no point/handle editing
- no general stroke-outline expansion from SVG stroke style into `strokeGeometry`
- no broad arbitrary-SVG import pipeline
- no authoring of Figma-style decomposed SVG scenegraphs (separate fill/stroke
  vectors plus mask-group composition)

Those belong to later vector-editing and SVG-import layers.
