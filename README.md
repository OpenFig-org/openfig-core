# openfig-core

Isomorphic `.fig` file parser — reads Figma binary format in Node.js and browsers.

Parses `.fig` (Figma Design), `.deck` (Figma Slides), and `.jam` (FigJam) files into a traversable node tree. Zero Node.js dependencies — works in browsers via bundlers.

## Install

```bash
npm install openfig-core
```

## Quick start

```js
import { parseFig, nodeId } from 'openfig-core';
import { readFileSync } from 'fs';

const data = new Uint8Array(readFileSync('design.fig'));
const doc = parseFig(data);

console.log(doc.header);          // { prelude: 'fig-kiwi', version: 52 }
console.log(doc.nodes.length);    // number of nodes in the file

// Traverse the node tree
for (const node of doc.nodes) {
  const id = nodeId(node);
  const children = doc.childrenMap.get(id) ?? [];
  console.log(`${id} ${node.type} "${node.name}" (${children.length} children)`);
}
```

### Browser

```js
const resp = await fetch('/design.fig');
const data = new Uint8Array(await resp.arrayBuffer());
const doc = parseFig(data);
```

## API

### `parseFig(data: Uint8Array): FigDocument`

Parse a complete `.fig` ZIP archive. Extracts `canvas.fig`, `meta.json`, `thumbnail.png`, and `images/*`.

### `parseFigBinary(data: Uint8Array): FigDocument`

Parse raw `canvas.fig` binary data (the blob inside the ZIP). Use this if you extract the ZIP yourself.

### `nodeId(node: FigNode): string | null`

Format a node's GUID as `"sessionID:localID"` (e.g. `"1:127"`). Returns `null` if the node has no GUID.

### `FigDocument`

```ts
interface FigDocument {
  header: { prelude: string; version: number };
  nodes: FigNode[];                      // all nodes (flat array)
  nodeMap: Map<string, FigNode>;         // id → node
  childrenMap: Map<string, FigNode[]>;   // parent id → children
  schema: any;                           // decoded kiwi binary schema
  compiledSchema: any;                   // compiled schema (encodeMessage/decodeMessage)
  rawChunks: Uint8Array[];               // raw length-prefixed binary chunks
  message: any;                          // full decoded kiwi message
  meta?: Record<string, any>;            // meta.json contents
  thumbnail?: Uint8Array;                // thumbnail.png bytes
  images: Map<string, Uint8Array>;       // filename → image bytes
}
```

### `FigNode`

```ts
interface FigNode {
  guid: FigGuid;
  type: string;                          // FRAME, TEXT, ELLIPSE, SYMBOL, INSTANCE, ...
  name: string;
  phase?: string;                        // CREATED, REMOVED, etc.
  parentIndex?: { guid: FigGuid; position: string };
  size?: { x: number; y: number };
  transform?: { m00, m01, m02, m10, m11, m12: number };
  fillPaints?: FigPaint[];
  textData?: { characters: string };
  [key: string]: any;                    // open for all kiwi-decoded fields
}
```

## Encoding (write .fig files)

### Round-trip: open, edit, save

```js
import { parseFig, encodeFigParts, assembleCanvasFig, createFigZip } from 'openfig-core';

const doc = parseFig(data);

// Edit nodes...
doc.message.nodeChanges[2].name = "Renamed";

const parts = encodeFigParts(doc);

// Caller must zstd-compress the message (openfig-core stays isomorphic)
const messageCompressed = yourZstdCompress(parts.messageRaw, 3);

const canvasFig = assembleCanvasFig({
  prelude: parts.prelude,
  version: parts.version,
  schemaCompressed: parts.schemaCompressed,
  messageCompressed,
  passThrough: parts.passThrough,
});

const figZip = createFigZip({
  canvasFig,
  meta: doc.meta,
  thumbnail: doc.thumbnail,
  images: doc.images,
});
// figZip is a Uint8Array — write to disk or trigger download
```

### From scratch: create a new .fig file

```js
import { createEmptyFigDoc, encodeFigParts, assembleCanvasFig, createFigZip } from 'openfig-core';

const doc = createEmptyFigDoc();

// Add nodes to doc.message.nodeChanges...

const parts = encodeFigParts(doc);
const messageCompressed = yourZstdCompress(parts.messageRaw, 3);
const canvasFig = assembleCanvasFig({ ...parts, messageCompressed });
const figZip = createFigZip({ canvasFig, meta: doc.meta, thumbnail: doc.thumbnail });
```

### `encodeFigParts(doc: FigDocument): EncodedFigParts`

Encodes a FigDocument into kiwi binary parts. Returns the raw message (caller must zstd-compress for chunk 1) and the deflate-compressed schema (chunk 0).

### `assembleCanvasFig(input: AssembleCanvasFigInput): Uint8Array`

Assembles the `canvas.fig` binary from pre-compressed chunks. Format: `[prelude 8B][version uint32 LE][len+chunk0][len+chunk1][len+chunk2+]...`

### `createFigZip(input: CreateFigZipInput): Uint8Array`

Packages `canvas.fig` + optional `meta.json`, `thumbnail.png`, and `images/*` into a `.fig` ZIP archive (store mode).

### `createEmptyFigDoc(): FigDocument`

Creates an empty FigDocument with a bundled kiwi schema, a Document node, and a Page node. Ready for adding content and encoding.

## File format documentation

Detailed documentation of the Figma binary format is in [`docs/`](docs/):

| Doc | Covers |
|-----|--------|
| [Archive structure](docs/archive.md) | ZIP layout, canvas.fig binary, kiwi schema, encoding pipeline |
| [Nodes](docs/nodes.md) | Node types, GUIDs, parentIndex, hierarchy |
| [Shapes](docs/shapes.md) | ROUNDED_RECTANGLE, FRAME, transforms, geometry |
| [Vector](docs/vector.md) | VECTOR nodes, commandsBlob format, blob resolution, helper API |
| [Text](docs/text.md) | TEXT nodes, styles, fonts |
| [Images](docs/images.md) | Image storage, SHA-1 hashing, thumbnails |
| [Colors](docs/colors.md) | Color variables, palette |
| [Overrides](docs/overrides.md) | Symbol overrides (text, image, nested) |
| [Slides](docs/slides.md) | Slide dimensions, cloning, ordering |
| [Modes](docs/modes.md) | Slides mode vs Design mode |
| [Invariants](docs/invariants.md) | Hard rules and sentinel values |
| [Research](docs/research.md) | Binary format analysis and references |

## Dependencies

- [`fflate`](https://github.com/101arrowz/fflate) — ZIP extraction + deflate decompression
- [`kiwi-schema`](https://github.com/nicbarker/kiwi-schema) — Kiwi binary format decoding
- [`fzstd`](https://github.com/nicbarker/fzstd) — Zstandard decompression

## License

MIT

## Disclaimer

Figma is a trademark of Figma, Inc. This project is not affiliated with, endorsed by, or sponsored by Figma, Inc.
