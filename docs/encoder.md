# Encoding Pipeline

The write side of the `.fig` roundtrip. Takes a `FigDocument` and produces a valid
`.fig` / `.deck` ZIP archive that Figma will accept.

> For the binary layout and chunk format details, see [archive.md](archive.md).

---

## End-to-End Flow

```
FigDocument
    |
    v
encodeFigParts(doc)          -- kiwi-encode message + deflate schema
    |
    v
EncodedFigParts { schemaCompressed, messageRaw, prelude, version, passThrough }
    |
    |  caller zstd-compresses messageRaw (not included in openfig-core)
    v
assembleCanvasFig(input)     -- build the canvas.fig binary
    |
    v
Uint8Array (canvas.fig)
    |
    v
createFigZip(input)          -- pack into ZIP with meta, thumbnail, images
    |
    v
Uint8Array (.fig / .deck)
```

Zstd compression is intentionally **not** included in openfig-core. This keeps the
package isomorphic (no WASM dependency). Use `zstd-codec` in the browser or the
native `zstd` binding in Node.js.

---

## Functions

### `encodeFigParts(doc: FigDocument): EncodedFigParts`

Encodes a `FigDocument` into parts ready for assembly.

```ts
function encodeFigParts(doc: FigDocument): EncodedFigParts;
```

**What it does:**

1. Kiwi-encodes the message: `compiledSchema.encodeMessage(doc.message)` -> raw bytes
2. Encodes the kiwi schema to binary, then deflateRaw-compresses it
3. Collects passthrough chunks (`rawChunks[2+]`) for roundtrip preservation

**Input — `FigDocument` fields used:**

| Field | Required | Purpose |
|-------|----------|---------|
| `compiledSchema` | Yes | Compiled kiwi schema with `encodeMessage()` |
| `message` | Yes | Full decoded kiwi message (nodeChanges, blobs, etc.) |
| `schema` | Yes | Decoded kiwi binary schema (re-encoded into chunk 0) |
| `header.prelude` | Yes | Format identifier (e.g. `"fig-kiwi"`, `"fig-deck"`) |
| `header.version` | Yes | Version number (see [archive.md](archive.md#version-field)) |
| `rawChunks` | Yes | Original chunks array (chunks 2+ are passed through) |

**Output — `EncodedFigParts`:**

| Field | Type | Description |
|-------|------|-------------|
| `schemaCompressed` | `Uint8Array` | deflateRaw-compressed kiwi schema (ready for chunk 0) |
| `messageRaw` | `Uint8Array` | Raw kiwi-encoded message — caller **must** zstd-compress this for chunk 1 |
| `prelude` | `string` | Original prelude string (e.g. `"fig-kiwi"`) |
| `version` | `number` | Original version number |
| `passThrough` | `Uint8Array[]` | Chunks 2+ from the original file, included as-is |

Throws if `compiledSchema`, `message`, or `schema` is missing.

---

### `assembleCanvasFig(input: AssembleCanvasFigInput): Uint8Array`

Builds a `canvas.fig` binary from pre-compressed chunks.

```ts
function assembleCanvasFig(input: AssembleCanvasFigInput): Uint8Array;
```

**Binary layout produced:**

```
[8B prelude][4B version LE][4B len][chunk 0][4B len][chunk 1][4B len][chunk 2]...
```

**Input — `AssembleCanvasFigInput`:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prelude` | `string` | Yes | Format identifier, padded to 8 bytes with spaces |
| `version` | `number` | Yes | Version uint32 LE |
| `schemaCompressed` | `Uint8Array` | Yes | Chunk 0 — deflateRaw-compressed kiwi schema |
| `messageCompressed` | `Uint8Array` | Yes | Chunk 1 — **zstd**-compressed kiwi message |
| `passThrough` | `Uint8Array[]` | No | Chunks 2+ — included as-is |

Returns a `Uint8Array` containing the complete `canvas.fig` binary.

---

### `createFigZip(input: CreateFigZipInput): Uint8Array`

Packages `canvas.fig` and optional assets into a ZIP archive (`.fig` / `.deck`).
Uses store mode (no compression) via fflate.

```ts
function createFigZip(input: CreateFigZipInput): Uint8Array;
```

**Input — `CreateFigZipInput`:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `canvasFig` | `Uint8Array` | Yes | The assembled `canvas.fig` binary |
| `meta` | `Record<string, any>` | No | Serialized as `meta.json` (file name, version, etc.) |
| `thumbnail` | `Uint8Array` | No | PNG thumbnail stored as `thumbnail.png` |
| `images` | `Map<string, Uint8Array>` | No | Image assets stored under `images/<name>` |

Returns a `Uint8Array` containing the final ZIP archive.

> **Note:** Figma rejects files missing `thumbnail.png` or `meta.json`. Always
> include both when producing files intended for import. See [archive.md](archive.md)
> for requirements.

---

## Usage Example

Full roundtrip encode — read a `FigDocument`, modify it, write it back:

```ts
import { encodeFigParts, assembleCanvasFig, createFigZip } from "openfig-core";
import { compressSync } from "zstd-codec"; // or your preferred zstd binding

// 1. Encode document into parts (kiwi message + deflated schema)
const parts = encodeFigParts(doc);

// 2. Zstd-compress the raw message (caller's responsibility)
const messageCompressed = compressSync(parts.messageRaw, 3);

// 3. Assemble the canvas.fig binary
const canvasFig = assembleCanvasFig({
  prelude: parts.prelude,
  version: parts.version,
  schemaCompressed: parts.schemaCompressed,
  messageCompressed,
  passThrough: parts.passThrough,
});

// 4. Pack into a ZIP archive
const zipBytes = createFigZip({
  canvasFig,
  meta: { file_name: "My Design", version: "1" },
  thumbnail: thumbnailPng,
  images: doc.images,
});

// Write to disk or download
fs.writeFileSync("output.fig", zipBytes);
```

---

## Design Decisions

**Zstd is external.** Keeping zstd out of openfig-core means the package has zero
WASM or native dependencies. It works in browsers, Node.js, Deno, and edge runtimes
without platform-specific builds.

**Passthrough chunks.** Chunks at index 2+ are opaque. The encoder preserves them
byte-for-byte during roundtrip to avoid breaking opaque format features.

**No silent modifications.** The encoder writes exactly what it receives. Any
normalization (default fills, missing fields, etc.) must happen in the parser on read,
not in the encoder on write. See [invariants.md](invariants.md).
