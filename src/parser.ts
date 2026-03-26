/**
 * Isomorphic .fig binary parser.
 *
 * .fig files are ZIP archives containing:
 *   - canvas.fig (binary: prelude + version + kiwi-encoded chunks)
 *   - meta.json (optional)
 *   - thumbnail.png (optional)
 *   - images/ (optional)
 *
 * Parsing flow:
 *   1. Unzip → extract canvas.fig
 *   2. Read 8-byte prelude + 4-byte version
 *   3. Chunk 0: deflateRaw → kiwi binary schema
 *   4. Chunk 1: zstd or deflateRaw → kiwi message (nodeChanges[])
 *   5. Build node maps
 */

import { unzipSync, inflateSync } from "fflate";
import { decodeBinarySchema, compileSchema } from "kiwi-schema";
import { decompress as zstdDecompress } from "fzstd";
import type { FigDocument, FigNode } from "./types.js";
import { nodeId } from "./utils.js";

/**
 * Parse raw canvas.fig binary data (the blob inside the ZIP).
 * Use this if you extract the ZIP yourself.
 */
export function parseFigBinary(data: Uint8Array): FigDocument {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  // Read 8-byte prelude + 4-byte version
  const prelude = String.fromCharCode(...data.subarray(0, 8));
  if (!prelude.startsWith("fig-")) {
    throw new Error(`Unknown prelude: ${prelude}`);
  }
  const version = view.getUint32(8, true);

  // Read length-prefixed chunks
  const chunks: Uint8Array[] = [];
  let off = 12;
  while (off < data.byteLength) {
    const len = view.getUint32(off, true);
    off += 4;
    chunks.push(data.subarray(off, off + len));
    off += len;
  }

  if (chunks.length < 2) {
    throw new Error("Expected at least 2 chunks in .fig binary");
  }

  // Chunk 0: kiwi schema (deflateRaw compressed)
  const schemaData = inflateSync(chunks[0]);
  const schema = decodeBinarySchema(schemaData);
  const compiled = compileSchema(schema);

  // Chunk 1: message (zstd or deflateRaw — auto-detect by magic bytes)
  let msgData: Uint8Array;
  const c1 = chunks[1];
  if (c1[0] === 0x28 && c1[1] === 0xb5 && c1[2] === 0x2f && c1[3] === 0xfd) {
    msgData = zstdDecompress(c1);
  } else {
    msgData = inflateSync(c1);
  }
  const message = compiled.decodeMessage(msgData);

  // Build maps
  const nodes: FigNode[] = message.nodeChanges;
  const nodeMap = new Map<string, FigNode>();
  const childrenMap = new Map<string, FigNode[]>();

  for (const node of nodes) {
    const id = nodeId(node);
    if (id) nodeMap.set(id, node);
  }

  for (const node of nodes) {
    if (!node.parentIndex?.guid) continue;
    const pid = `${node.parentIndex.guid.sessionID}:${node.parentIndex.guid.localID}`;
    if (!childrenMap.has(pid)) childrenMap.set(pid, []);
    childrenMap.get(pid)!.push(node);
  }

  return {
    header: { prelude: prelude.trim(), version },
    nodes,
    nodeMap,
    childrenMap,
    schema,
    compiledSchema: compiled,
    rawChunks: chunks,
    message,
    images: new Map(),
  };
}

/**
 * Parse a complete .fig file (ZIP archive).
 * Extracts canvas.fig, meta.json, thumbnail.png, and images/*.
 */
export function parseFig(data: Uint8Array): FigDocument {
  // Check ZIP header
  if (data[0] !== 0x50 || data[1] !== 0x4b) {
    throw new Error("Not a valid .fig file (missing ZIP header)");
  }

  const unzipped = unzipSync(data);

  // Find and parse canvas.fig
  const canvasKey = Object.keys(unzipped).find((k) => k.endsWith("canvas.fig"));
  if (!canvasKey) {
    throw new Error("No canvas.fig found in .fig archive");
  }
  const doc = parseFigBinary(unzipped[canvasKey]);

  // Extract meta.json
  const metaKey = Object.keys(unzipped).find((k) => k.endsWith("meta.json"));
  if (metaKey) {
    try {
      doc.meta = JSON.parse(new TextDecoder().decode(unzipped[metaKey]));
    } catch { /* ignore malformed meta */ }
  }

  // Extract thumbnail
  const thumbKey = Object.keys(unzipped).find((k) => k.endsWith("thumbnail.png"));
  if (thumbKey) {
    doc.thumbnail = unzipped[thumbKey];
  }

  // Extract images
  for (const key of Object.keys(unzipped)) {
    if (key.includes("images/") && key !== "images/") {
      const filename = key.split("/").pop()!;
      doc.images.set(filename, unzipped[key]);
    }
  }

  return doc;
}
