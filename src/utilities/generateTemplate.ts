/**
 * Generates the empty .fig template blob for src/schema.ts.
 *
 * No seed file required — all node values are our own definitions.
 * Schema encoding uses figKiwiSchema.ts (our own TypeScript).
 *
 * Run with:
 *   npx tsx src/utilities/generateTemplate.ts
 */

import { assembleCanvasFig, createFigZip } from "../index.js";
import { compileSchema, encodeBinarySchema } from "kiwi-schema";
import { deflateSync } from "fflate";
import { execSync } from "child_process";
import { writeFileSync, readFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { figKiwiSchema } from "./figKiwiSchema.js";

function zstdCompress(data: Uint8Array): Uint8Array {
  const tmp = join(tmpdir(), `fig-msg-${Date.now()}.bin`);
  writeFileSync(tmp, data);
  execSync(`zstd -f -q -3 ${tmp} -o ${tmp}.zst`);
  const result = new Uint8Array(readFileSync(`${tmp}.zst`));
  unlinkSync(tmp);
  unlinkSync(`${tmp}.zst`);
  return result;
}

// ── Compile our schema ───────────────────────────────────────────────────────

const schema = figKiwiSchema as any;
const compiled = compileSchema(schema);
const schemaCompressed = deflateSync(new Uint8Array(encodeBinarySchema(schema)));

// ── Build node structure from scratch ────────────────────────────────────────

const IDENTITY = { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 };
const BASE = { phase: "CREATED", visible: true, opacity: 1,
               strokeWeight: 0, strokeAlign: "CENTER", strokeJoin: "BEVEL",
               transform: IDENTITY };

const message = {
  type: "NODE_CHANGES",
  nodeChanges: [
    {
      ...BASE,
      guid: { sessionID: 0, localID: 0 },
      type: "DOCUMENT",
      name: "Document",
    },
    {
      ...BASE,
      guid: { sessionID: 0, localID: 1 },
      type: "CANVAS",
      name: "Page 1",
      backgroundColor: { r: 0.1176, g: 0.1176, b: 0.1176, a: 1 },
      backgroundEnabled: true,
      backgroundOpacity: 1,
      parentIndex: { guid: { sessionID: 0, localID: 0 }, position: "a" },
    },
    {
      ...BASE,
      guid: { sessionID: 0, localID: 2 },
      type: "CANVAS",
      name: "Internal Only Canvas",
      visible: false,
      internalOnly: true,
      parentIndex: { guid: { sessionID: 0, localID: 0 }, position: "b" },
    },
  ],
};

// ── Encode ───────────────────────────────────────────────────────────────────

const messageRaw = new Uint8Array(compiled.encodeMessage(message));
const messageCompressed = zstdCompress(messageRaw);

const canvasFig = assembleCanvasFig({
  prelude: "fig-kiwi",
  version: 101,
  schemaCompressed,
  messageCompressed,
  passThrough: [],
});

// Minimal 1×1 transparent PNG — Figma requires a thumbnail.png in the ZIP.
const BLANK_THUMBNAIL = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
  "0000000a49444154789c6260000000020001e221bc330000000049454e44ae426082",
  "hex"
);

const figZip = createFigZip({
  canvasFig,
  meta: { file_name: "Untitled", version: 0 },
  thumbnail: BLANK_THUMBNAIL,
});

// ── Output base64 ───────────────────────────────────────────────────────────

const b64 = Buffer.from(figZip).toString("base64");
console.log("// Paste this as the value of emptyFigTemplate in src/schema.ts:");
console.log(`export const emptyFigTemplate = "${b64}";`);
