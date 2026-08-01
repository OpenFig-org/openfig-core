# Changelog

All notable changes to `openfig-core` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.1] - 2026-08-01

### Fixed

- **Compound paths were encoded as separate regions instead of loops of one region.** `encodeVectorNetworkBlob` closed a region at every `M`, so a glyph and its counter, or the two rings of an outline-stroked shape, became independent filled areas — the counter fills in rather than punching through. Figma writes them as multiple loops of a single region; reference blobs carry regions of 1, 2 and 3 loops. Each entry in `pathCommandsList` now yields one region whose loops are its sub-paths. The 0.4.0 round-trip test could not catch this: it only re-encodes networks that were *decoded*, so it validates the byte writer completely and the network builder not at all.
- **`encodeVectorNetworkBlob` had no way to omit regions.** Open stroked paths need none — a region asks Figma to fill the bounded area, which on an open path closes it visually as a "lens" between the endpoints even with no fill paint. Added `{ emitRegions }`, defaulting to `true`.

### Changed

- **`VectorNetworkVertex.handleMirroring` is renamed `styleID`.** The vertex's leading word is an index into the node's `vectorData.styleOverrideTable`, not a `VectorMirror` enum. The two were indistinguishable in the only fixture with a non-zero value, whose single override entry is `{styleID: 1, handleMirroring: "ANGLE"}` — and `ANGLE` is also `1`. Other Figma files settle it: override entries carry six properties (`cornerRadius`, `strokeCap`, `strokeJoin`, `handleMirroring`, `cornerSmoothing`), which cannot be encoded in one u32, and appear with `styleID` 1 and 2 in sequence. The Kiwi schema agrees — `VectorData` holds a `styleOverrideTable` of `NodeChange` keyed by `styleID`, with no other array for per-vertex references. Byte output is unchanged; authoring a non-zero value without a matching table entry produces a dangling reference.

## [0.4.0] - 2026-08-01

### Added

- **`parseVectorNetworkBlob` decoder** — Decodes a Figma `vectorNetworkBlob` into structured vertices, segments and regions, exported from the package entry point. Throws (rather than returning partial results) on short buffers, declared counts running past the end, out-of-range vertex or segment indices, and trailing bytes.
- **`encodeVectorNetwork` structured encoder** — Encodes a decoded `VectorNetwork` back to bytes in Figma's verified layout. A Figma-authored blob decoded and re-encoded reproduces byte-for-byte — verified 17/17 across the reference corpus, the acceptance criterion the format is held to.

### Changed

- **`encodeVectorNetworkBlob` now emits Figma's verified layout** — 12-byte header; `[handleMirroring, x, y]` vertices; `[word0, startVertex, tsx, tsy, endVertex, tex, tey]` segments; `[packed, numLoops, (segCount, indices)×numLoops]` regions. It previously wrote a rotated 16-byte-header layout with a per-region trailer and the constant `4`, none of which Figma emits, so every openfig-authored blob was structurally distinguishable (and the region block was one Figma would misparse). The vertex handle-mirroring word is preserved on round-trip; segment `word0` is written as `0`.
- Curve classification is by tangent components — a segment is straight iff all four tangents are zero. There is no segment-type field.

### Removed

- The `SEGMENT_LINE`, `SEGMENT_CUBIC`, and `DEFAULT_HANDLE_MIRRORING` constants. The value `4` appears nowhere in Figma-authored output and was a one-scan fingerprint for openfig-written files.

## [0.3.7] - 2026-05-22

### Added

- **`convertDeckToFig` API** — A tree-transform under `src/convert.ts` that strips visual slides scaffolding (`SLIDE_GRID`, `SLIDE_ROW`, `SLIDE`, `MODULE`) and positions visual frames onto a flat design page.
- **Component & Symbol Override Baking** — Implemented recursive cloning and unique GUID remapping for nested components, baking customized character overrides and fill/stroke paints directly onto the cloned target nodes.
- **Comprehensive API Exports** — Exposed programmatic transform helpers and type definitions (`ConvertOptions`, etc.) in `src/index.ts`.

## [0.3.6] - 2026-03-25

### Added

- **Isomorphic Parser & Encoder** — Initial open-source release of the isomorphic `.fig` and `.deck` file parser and Kiwi binary encoder, allowing reading and writing of Figma's schema-driven format in both Node.js and browser runtimes.
- **Kiwi Schema Interoperability** — Integration of schema-driven Kiwi binary serialization, resolving zip archives (`fzstd`/`fflate` decoders), geometry nodes, vector path conversions, and gradient color structures.

[0.4.1]: https://github.com/OpenFig-org/openfig-core/releases/tag/v0.4.1
[0.4.0]: https://github.com/OpenFig-org/openfig-core/releases/tag/v0.4.0
[0.3.7]: https://github.com/OpenFig-org/openfig-core/releases/tag/v0.3.7
[0.3.6]: https://github.com/OpenFig-org/openfig-core/releases/tag/v0.3.6
