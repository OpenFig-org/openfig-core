# Vector network conformance fixtures

Reference `.fig` files for `vectorNetworkBlob` decoding and encoding. Each one isolates a
structural case that the others do not exercise. All are `fig-kiwi` v101.

| File | Blobs | Shape | Pins down |
|---|---|---|---|
| `straight-2-point-line.fig` | 1 | 2 vertices, 1 segment, 0 regions, **64 bytes** | Header size — with no region block, total size is exactly `header + nv*12 + ns*28`, so 12 vs 16 bytes is decidable by arithmetic. Also the only fixture with a segment that is genuinely straight. |
| `curvy-squiggle.fig` | 2 | 16v / 15s / 0 regions | Curved segments with **no** region block. Confirms header size independently, and that curve-ness is carried by tangents. |
| `circle-and-rounded-rectangle-outline-stroke.fig` | 4 | filled + outline-stroked | First fixtures with `regionCount > 0`. The outline-stroked pair yield **2-loop** regions (outer + inner ring). |
| `word-outline-stroke.fig` | 9 | outlined letterforms | Regions with **1, 2 and 3 loops** — letter counters. Widest region coverage available. |

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

Byte-exact on all 17 blobs across these four files plus `../OpenFigs.fig` and `../circle.fig`.

- A segment is a **straight line iff all four tangent components are zero**. No field encodes
  segment type: `word0` is `0` on curved and straight segments alike.
- `word0` is `0` throughout, on both vertices and segments. Its meaning is unidentified; it is
  not required to reconstruct geometry.
- The region `packed` word is `1` throughout, i.e. `styleID = 0`, `windingRule = NONZERO`.

## Provenance

These are reference inputs, not generated output. Do not add files produced by openfig itself
to this directory — `openfig-cli/lib/slides/api-core.mjs` builds vector networks independently,
and its output must never be used as a conformance reference or the tests will validate our own
assumptions rather than the format.
