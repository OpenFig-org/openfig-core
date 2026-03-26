# Archive Structure & Binary Layout

## ZIP Archive

A `.fig`, `.deck`, or `.jam` file is a standard **ZIP archive** (uncompressed / store mode) containing:

| File | Required | Description |
|------|----------|-------------|
| `canvas.fig` | Yes | Binary Figma document (kiwi-schema encoded) |
| `thumbnail.png` | Yes | Thumbnail shown in Figma's file browser (Figma rejects files without it) |
| `meta.json` | Yes | Metadata — file name, background color, render coordinates (Figma rejects files without it) |
| `images/` | No | Image assets, each named by SHA-1 hash (no extension) |

### meta.json

```json
{
  "file_name": "My Presentation",
  "version": "1"
}
```

---

## canvas.fig Binary Layout

The `canvas.fig` file is a length-prefixed binary format. There is no checksum or integrity field.

### Header

```
Offset  Size     Description
──────  ───────  ──────────────────────────────
0       8 bytes  Prelude — ASCII string identifying the format
8       4 bytes  Version — uint32 little-endian
12      ...      Chunks begin
```

**Known preludes:**

| Prelude | Format |
|---------|--------|
| `fig-kiwi` | Figma Design files (`.fig`) |
| `fig-deck` | Figma Slides files (`.deck`) |
| `fig-jam.` | FigJam files (`.jam`) |

All preludes are exactly 8 bytes (padded if needed).

### Version field

The 4-byte uint32 at offset 8. This is a format version stamped when the document is first created, based on the Figma build that created it. The version is preserved across edits and re-exports — Figma does not upgrade it.

**Known values:** `101` and `106` appear in existing `.fig` files. Import compatibility testing shows that `105` is accepted while `109` is rejected. The kiwi schema is identical across all tested values.

**Recommendations:**
- Parsers should accept any version value.
- Encoders should preserve the version from the source file during roundtrip.
- New files should use `101` (most common baseline, used by all `.deck` files).

### Chunks

After the header, the file contains a sequence of length-prefixed chunks:

```
Offset  Size     Description
──────  ───────  ──────────────────────────────
0       4 bytes  Chunk length N — uint32 little-endian
4       N bytes  Chunk data (compressed)
```

Chunks repeat until end of file. Typically there are 2 chunks, occasionally 3+.

### Chunk 0 — Kiwi Binary Schema

| Property | Value |
|----------|-------|
| Compression | **deflateRaw** (RFC 1951, no zlib/gzip wrapper) |
| Content | Kiwi binary schema definition |
| Purpose | Defines the structure of all message types |

Decode with `decodeBinarySchema()` from the `kiwi-schema` package, then compile with `compileSchema()` to get encode/decode functions.

When roundtripping an existing file, preserve and re-use the schema from that file. When writing from scratch, use `figKiwiSchema.ts` — our own 550-def TypeScript schema.

### Chunk 1 — Message Data

| Property | Value |
|----------|-------|
| Compression | **zstd** (required for writing; Figma rejects deflateRaw) |
| Magic bytes | `0x28 0xB5 0x2F 0xFD` at offset 0 (zstd frame magic) |
| Content | Kiwi-encoded message |
| Purpose | Contains all document nodes, blobs, and metadata |

When **reading**, auto-detect the compression by checking for zstd magic bytes. Fall back to deflateRaw for older files.

When **writing**, always use zstd compression (level 3). Figma silently rejects files where chunk 1 is deflateRaw-compressed.

### Chunk 2+ — Additional Data

Optional. Pass through as-is during roundtrip — content and compression are opaque.

---

## Message Structure

The decoded message object contains:

```javascript
{
  nodeChanges: [ ... ],  // Array of ALL nodes in the document
  blobs: [ ... ],        // Binary data (paths, masks, geometry)
  // ... other fields defined by the kiwi schema
}
```

### nodeChanges

This is the heart of the document. Every node — from the root DOCUMENT down to individual text runs — lives in this flat array. The tree structure is encoded via `parentIndex` references.

**The array must never be filtered.** To remove a node, set its `phase` to `'REMOVED'`. Nodes removed from the array cause import failures.

### blobs

Array of `{ bytes: Uint8Array }` objects. Referenced by **index** from node fields
like `fillGeometry[].commandsBlob` and `vectorData.vectorNetworkBlob`.

Known blob types:
- **fillGeometry commandsBlob** — encoded path commands for rendering shapes/vectors.
  See [shapes.md](shapes.md) for the binary format (moveTo/lineTo/cubicTo/close).
- **vectorNetworkBlob** — editable vector network for VECTOR nodes.
  See [shapes.md](shapes.md) for the binary format (vertices/segments/regions).

Blobs are encoded inline in the kiwi message — the `kiwi-schema` package handles
serialization automatically via `ByteBuffer.readByteArray()`/`writeByteArray()`.
When cloning blobs, use `deepClone()` to preserve `Uint8Array` instances
(`JSON.stringify` corrupts them into plain objects).

---

## Encoding Pipeline

To produce a valid `canvas.fig`:

```
1. Encode message     →  compiledSchema.encodeMessage(message)
2. Compress schema    →  deflateRaw(encodeBinarySchema(schema))
3. Compress message   →  zstd.compress(encodedMessage, level=3)
4. Assemble binary:
   [8B prelude][4B version][4B schema_len][schema][4B msg_len][msg][optional chunks...]
5. Pack into ZIP with thumbnail.png, meta.json, images/
```

### openfig-core API

```js
import { encodeFigParts, assembleCanvasFig, createFigZip } from 'openfig-core';

const parts = encodeFigParts(doc);              // step 1-2
const messageCompressed = zstd(parts.messageRaw, 3);  // step 3 (caller provides zstd)
const canvasFig = assembleCanvasFig({ ...parts, messageCompressed }); // step 4
const figZip = createFigZip({ canvasFig, meta, thumbnail, images }); // step 5
```

Zstd compression is NOT included in openfig-core (keeps it isomorphic). Use `zstd-codec` in the browser or `zstd` in Node.js.

---

## Creating Files From Scratch

`createEmptyFigDoc()` returns a valid `FigDocument` with a bundled kiwi schema, a DOCUMENT node, and a Page 1 CANVAS node. Add your own nodes to `doc.message.nodeChanges`, then encode.

```js
import { createEmptyFigDoc, encodeFigParts, assembleCanvasFig, createFigZip } from 'openfig-core';

const doc = createEmptyFigDoc();
// doc.nodes = [DOCUMENT, Page 1, Internal Only Canvas] — ready for content

// Add a rectangle:
doc.message.nodeChanges.push({
  guid: { sessionID: 1, localID: 1 },
  phase: "CREATED",
  type: "RECTANGLE",
  name: "My Rectangle",
  parentIndex: { guid: { sessionID: 0, localID: 1 }, position: "a" },
  size: { x: 200, y: 100 },
  transform: { m00: 1, m01: 0, m02: 50, m10: 0, m11: 1, m12: 50 },
  visible: true,
  opacity: 1,
  fillPaints: [{ type: "SOLID", color: { r: 1, g: 0, b: 0, a: 1 }, visible: true }],
});

// Encode and save...
```

The bundled schema is ~26KB (deflate-compressed kiwi binary) generated from `figKiwiSchema.ts` — our own TypeScript expression of all 550 type definitions needed for full .fig compatibility. See [template.md](template.md) for details.
