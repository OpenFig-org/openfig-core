# Vector network conformance fixtures

Reference `.fig` files for `vectorNetworkBlob` decoding and encoding. Each one isolates a
structural case that the others do not exercise. All are `fig-kiwi` v101.

| File | Blobs | Shape | Pins down |
|---|---|---|---|
| `straight-2-point-line.fig` | 1 | 2 vertices, 1 segment, 0 regions, **64 bytes** | Header size — with no region block, total size is exactly `header + nv*12 + ns*28`, so 12 vs 16 bytes is decidable by arithmetic. Also the only fixture with a segment that is genuinely straight. |
| `curvy-squiggle.fig` | 2 | 16v / 15s / 0 regions | Curved segments with **no** region block. Confirms header size independently, and that curve-ness is carried by tangents. |
| `circle-and-rounded-rectangle-outline-stroke.fig` | 4 | filled + outline-stroked | First fixtures with `regionCount > 0`. The outline-stroked pair yield **2-loop** regions (outer + inner ring). |
| `word-outline-stroke.fig` | 9 | outlined letterforms | Regions with **1, 2 and 3 loops** — letter counters. |
| `coloradjusted.fig` | 25 | `BRUSH` nodes | Scale: 25,993 vertices, 26,092 segments, a region with **740 loops**. The only fixture with non-empty `styleOverrideTable`s, and the only one where `commandsBlob` and the vector network differ in command count. |

## Why these cases matter

Two properties of this format make it easy to validate a decoder incorrectly:

1. **Candidate layouts differ by a one-word rotation.** `[word0, x, y]` and `[x, y, word2]`
   have the same 12-byte stride, so x/y land at identical absolute offsets under either.
   Decoded coordinates, loop connectivity and vertex-index validity all look correct under a
   wrong layout. **Geometry comparison cannot discriminate field order.**
2. **Byte accounting only discriminates when `regionCount == 0`.** With a region block present,
   several candidate grammars consume a blob exactly.

So header size is only observable on region-free blobs, and region grammar is only observable
on filled shapes. A corpus lacking either kind will validate a wrong decoder. That is why
`straight-2-point-line.fig` is here despite holding a single segment.

## Verified layout

```
[vertexCount u32][segmentCount u32][regionCount u32]      12-byte header
vertex  x nv   12B: [word0 u32][x f32][y f32]
segment x ns   28B: [word0 u32][startVertex u32][tsx f32][tsy f32]
                    [endVertex u32][tex f32][tey f32]
region  x nr      : [styleID<<1|windingRule u32][numLoops u32]
                    per loop: [segCount u32][segIndex u32 x segCount]
```

Byte-exact on all 42 blobs across these five files plus `../OpenFigs.fig` and `../circle.fig` — 26,391 vertices and 26,491 segments in total.

- A segment is a **straight line iff all four tangent components are zero**. No field encodes
  segment type: `word0` is `0` on curved and straight segments alike.
- The vertex leading word is a **`styleID`** — an index into the node's
  `vectorData.styleOverrideTable`, where `0` means "no override". It is **not** always
  `0`: across these fixtures it is `0` on 385 vertices and `1` on 13, all in
  `curvy-squiggle.fig`, whose node carries exactly one override entry
  `{styleID: 1, handleMirroring: "ANGLE"}`. It must be preserved verbatim through a
  decode/encode round-trip — clobbering it to `0` breaks byte identity.

  This was first read as a handle-mirroring enum, because that lone fixture's override
  has `styleID: 1` and `VectorMirror.ANGLE` is also `1` — indistinguishable from one
  file. Other Figma files settle it: override entries there carry six properties
  (`cornerRadius`, `strokeCap`, `strokeJoin`, `handleMirroring`, `cornerSmoothing`),
  which cannot fit in one u32, and appear with `styleID` 1 and 2 in sequence. The Kiwi
  schema agrees — `VectorData` has a `styleOverrideTable` of `NodeChange` keyed by
  `styleID`, and no other array in which per-vertex references could live.
- The segment leading word is structurally the same slot and is presumed to be a
  `styleID` too, but it is `0` on all 26,491 segments here and on every segment of every
  Figma-authored file checked so far, so nothing confirms what a segment-scoped override
  would contain. Figma's public plugin API exposes style properties on `VectorVertex`
  and `VectorRegion` but none on `VectorSegment`, so the slot may be editor-only or
  reserved. Treat it as unidentified; write `0`.
- The region `packed` word is `1` throughout, i.e. `styleID = 0`, `windingRule = NONZERO`.
- `commandsBlob` and the vector network describe the same geometry but do not always use
  the same number of commands: `coloradjusted.fig`'s "Blockbuster" has 997 commands against
  996 segments across 178 loops, `commandsBlob` apparently spelling out one loop's closing
  command that the network leaves implied. The oracle test allows exactly that delta on
  curves and requires the straight-segment count to match exactly — the latter is what a
  classification bug destroys.

## Provenance

These are reference inputs, not generated output. Do not add files produced by openfig itself
to this directory — `openfig-cli/lib/slides/api-core.mjs` builds vector networks independently,
and its output must never be used as a conformance reference or the tests will validate our own
assumptions rather than the format.
