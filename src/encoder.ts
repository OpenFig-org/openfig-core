/**
 * .fig file encoder — the write side of the roundtrip.
 *
 * Encodes a FigDocument back to .fig binary format.
 * Zstd compression of chunk 1 (message) is NOT included — the caller
 * provides pre-compressed bytes. This keeps openfig-core isomorphic
 * (no WASM dependency).
 *
 * Encoding flow:
 *   1. compiledSchema.encodeMessage(message) → kiwi binary
 *   2. encodeBinarySchema(schema) + deflateSync → compressed chunk 0
 *   3. Caller zstd-compresses the message → compressed chunk 1
 *   4. assembleCanvasFig() builds the binary
 *   5. createFigZip() packages into ZIP
 */

import { deflateSync, zipSync } from "fflate";
import { encodeBinarySchema } from "kiwi-schema";
import type { FigDocument } from "./types.js";

export interface EncodedFigParts {
  /** deflateRaw-compressed kiwi schema (ready for chunk 0) */
  schemaCompressed: Uint8Array;
  /** Raw kiwi-encoded message — caller MUST zstd-compress this for chunk 1 */
  messageRaw: Uint8Array;
  /** Original prelude string (e.g., "fig-kiwi") */
  prelude: string;
  /** Original version number */
  version: number;
  /** Passthrough chunks (rawChunks[2+]) — included as-is */
  passThrough: Uint8Array[];
}

export interface AssembleCanvasFigInput {
  prelude: string;
  version: number;
  schemaCompressed: Uint8Array;
  messageCompressed: Uint8Array;
  passThrough?: Uint8Array[];
}

export interface CreateFigZipInput {
  canvasFig: Uint8Array;
  meta?: Record<string, any>;
  thumbnail?: Uint8Array;
  images?: Map<string, Uint8Array>;
}

/**
 * Encode a FigDocument into parts ready for assembly.
 * The message is returned as raw kiwi bytes — caller must zstd-compress it.
 */
export function encodeFigParts(doc: FigDocument): EncodedFigParts {
  if (!doc.compiledSchema || !doc.message) {
    throw new Error("FigDocument missing compiledSchema or message — cannot encode");
  }
  if (!doc.schema) {
    throw new Error("FigDocument missing schema — cannot encode");
  }

  // Encode kiwi message
  const messageRaw = new Uint8Array(doc.compiledSchema.encodeMessage(doc.message));

  // Encode + deflateRaw-compress kiwi schema
  const schemaRaw = encodeBinarySchema(doc.schema);
  const schemaCompressed = deflateSync(new Uint8Array(schemaRaw));

  // Passthrough chunks 2+
  const passThrough = doc.rawChunks.slice(2);

  return {
    schemaCompressed,
    messageRaw,
    prelude: doc.header.prelude,
    version: doc.header.version,
    passThrough,
  };
}

/**
 * Assemble a canvas.fig binary from pre-compressed chunks.
 *
 * Format: [prelude 8B][version uint32 LE][len uint32 LE][chunk0][len][chunk1][len][chunk2+]...
 */
export function assembleCanvasFig(input: AssembleCanvasFigInput): Uint8Array {
  const { prelude, version, schemaCompressed, messageCompressed, passThrough = [] } = input;

  const chunks = [schemaCompressed, messageCompressed, ...passThrough];

  // Calculate total size: 8 (prelude) + 4 (version) + sum(4 + chunk.length)
  const headerSize = 8 + 4;
  const totalSize = chunks.reduce((sz, c) => sz + 4 + c.byteLength, headerSize);

  const buf = new Uint8Array(totalSize);
  const view = new DataView(buf.buffer);

  // Write prelude (8 bytes, padded with spaces if shorter)
  let off = 0;
  const enc = new TextEncoder();
  const preludeBytes = enc.encode(prelude);
  buf.set(preludeBytes, 0);
  // Pad to 8 bytes if needed
  for (let i = preludeBytes.length; i < 8; i++) {
    buf[i] = 0x20; // space
  }
  off = 8;

  // Write version (uint32 LE)
  view.setUint32(off, version, true);
  off += 4;

  // Write length-prefixed chunks
  for (const chunk of chunks) {
    view.setUint32(off, chunk.byteLength, true);
    off += 4;
    buf.set(chunk, off);
    off += chunk.byteLength;
  }

  return buf;
}

/**
 * Create a .fig/.deck ZIP archive from canvas.fig + optional metadata.
 * Uses store mode (no compression) via fflate.
 */
export function createFigZip(input: CreateFigZipInput): Uint8Array {
  const opts: Record<string, [Uint8Array, { level: 0 }]> = {};

  opts["canvas.fig"] = [input.canvasFig, { level: 0 }];

  if (input.meta) {
    opts["meta.json"] = [new TextEncoder().encode(JSON.stringify(input.meta)), { level: 0 }];
  }

  if (input.thumbnail) {
    opts["thumbnail.png"] = [input.thumbnail, { level: 0 }];
  }

  if (input.images) {
    for (const [name, data] of input.images) {
      opts[`images/${name}`] = [data, { level: 0 }];
    }
  }

  return zipSync(opts);
}
