/**
 * Creates an empty FigDocument by parsing a pre-built template.
 * The template was created from a valid .fig file with user content
 * marked as REMOVED — proven to open in Figma.
 */

import { parseFig } from "./parser.js";
import { emptyFigTemplate } from "./schema.js";
import type { FigDocument } from "./types.js";

function b64decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function createEmptyFigDoc(): FigDocument {
  const bytes = b64decode(emptyFigTemplate);
  return parseFig(bytes);
}
