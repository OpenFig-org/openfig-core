import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseFig, parseFigBinary, nodeId } from "./index.js";
import { encodeFigParts, assembleCanvasFig, createFigZip } from "./encoder.js";
import { deflateSync, unzipSync } from "fflate";

const fixturesDir = join(__dirname, "..", "test-fixtures");

function loadFixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(fixturesDir, name)));
}

describe("encodeFigParts", () => {
  it("encodes circle.fig document parts", () => {
    const doc = parseFig(loadFixture("circle.fig"));
    const parts = encodeFigParts(doc);

    expect(parts.schemaCompressed).toBeInstanceOf(Uint8Array);
    expect(parts.schemaCompressed.length).toBeGreaterThan(0);
    expect(parts.messageRaw).toBeInstanceOf(Uint8Array);
    expect(parts.messageRaw.length).toBeGreaterThan(0);
    expect(parts.prelude).toMatch(/^fig-/);
    expect(parts.version).toBeTypeOf("number");
    expect(parts.passThrough).toBeInstanceOf(Array);
  });

  it("encodes OpenFigs.fig document parts", () => {
    const doc = parseFig(loadFixture("OpenFigs.fig"));
    const parts = encodeFigParts(doc);

    expect(parts.messageRaw.length).toBeGreaterThan(0);
    expect(parts.schemaCompressed.length).toBeGreaterThan(0);
  });

  it("throws if schema is missing", () => {
    const doc = parseFig(loadFixture("circle.fig"));
    doc.schema = null as any;
    expect(() => encodeFigParts(doc)).toThrow("missing schema");
  });

  it("throws if compiledSchema is missing", () => {
    const doc = parseFig(loadFixture("circle.fig"));
    doc.compiledSchema = null as any;
    expect(() => encodeFigParts(doc)).toThrow("missing compiledSchema");
  });

  it("throws if message is missing", () => {
    const doc = parseFig(loadFixture("circle.fig"));
    doc.message = null as any;
    expect(() => encodeFigParts(doc)).toThrow("missing compiledSchema or message");
  });
});

describe("assembleCanvasFig", () => {
  it("produces valid binary header", () => {
    const doc = parseFig(loadFixture("circle.fig"));
    const parts = encodeFigParts(doc);

    // Use deflateSync as mock zstd (structurally valid, won't pass Figma)
    const mockCompressedMsg = deflateSync(parts.messageRaw);

    const binary = assembleCanvasFig({
      prelude: parts.prelude,
      version: parts.version,
      schemaCompressed: parts.schemaCompressed,
      messageCompressed: mockCompressedMsg,
      passThrough: parts.passThrough,
    });

    expect(binary).toBeInstanceOf(Uint8Array);

    // Check prelude
    const prelude = String.fromCharCode(...binary.subarray(0, 8));
    expect(prelude.trim()).toBe(parts.prelude);

    // Check version
    const view = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
    expect(view.getUint32(8, true)).toBe(parts.version);

    // Check first chunk length matches schema
    const chunk0Len = view.getUint32(12, true);
    expect(chunk0Len).toBe(parts.schemaCompressed.length);
  });

  it("includes passthrough chunks", () => {
    const doc = parseFig(loadFixture("circle.fig"));
    const parts = encodeFigParts(doc);
    const mockCompressedMsg = deflateSync(parts.messageRaw);

    const binary = assembleCanvasFig({
      prelude: parts.prelude,
      version: parts.version,
      schemaCompressed: parts.schemaCompressed,
      messageCompressed: mockCompressedMsg,
      passThrough: parts.passThrough,
    });

    // Total size should account for all chunks
    const expectedSize = 8 + 4 +
      (4 + parts.schemaCompressed.length) +
      (4 + mockCompressedMsg.length) +
      parts.passThrough.reduce((s, c) => s + 4 + c.byteLength, 0);
    expect(binary.length).toBe(expectedSize);
  });
});

describe("createFigZip", () => {
  it("creates ZIP with canvas.fig", () => {
    const canvasFig = new Uint8Array([1, 2, 3, 4]);
    const zip = createFigZip({ canvasFig });

    // Should be valid ZIP (PK header)
    expect(zip[0]).toBe(0x50);
    expect(zip[1]).toBe(0x4b);

    // Unzip and verify
    const unzipped = unzipSync(zip);
    expect(unzipped["canvas.fig"]).toBeDefined();
    expect(Array.from(unzipped["canvas.fig"])).toEqual([1, 2, 3, 4]);
  });

  it("includes meta.json when provided", () => {
    const canvasFig = new Uint8Array([1]);
    const meta = { file_name: "test", version: 1 };
    const zip = createFigZip({ canvasFig, meta });

    const unzipped = unzipSync(zip);
    expect(unzipped["meta.json"]).toBeDefined();
    const parsed = JSON.parse(new TextDecoder().decode(unzipped["meta.json"]));
    expect(parsed.file_name).toBe("test");
  });

  it("includes thumbnail when provided", () => {
    const canvasFig = new Uint8Array([1]);
    const thumbnail = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG magic
    const zip = createFigZip({ canvasFig, thumbnail });

    const unzipped = unzipSync(zip);
    expect(unzipped["thumbnail.png"]).toBeDefined();
    expect(unzipped["thumbnail.png"][0]).toBe(0x89);
  });

  it("includes images when provided", () => {
    const canvasFig = new Uint8Array([1]);
    const images = new Map<string, Uint8Array>();
    images.set("abc123", new Uint8Array([10, 20, 30]));
    images.set("def456", new Uint8Array([40, 50, 60]));
    const zip = createFigZip({ canvasFig, images });

    const unzipped = unzipSync(zip);
    expect(unzipped["images/abc123"]).toBeDefined();
    expect(unzipped["images/def456"]).toBeDefined();
    expect(Array.from(unzipped["images/abc123"])).toEqual([10, 20, 30]);
  });
});

describe("roundtrip", () => {
  it("circle.fig: parse → encode → re-parse preserves structure", () => {
    const original = parseFig(loadFixture("circle.fig"));
    const parts = encodeFigParts(original);

    // Mock zstd with deflate for testing (structurally valid roundtrip)
    const mockCompressedMsg = deflateSync(parts.messageRaw);

    const canvasFig = assembleCanvasFig({
      prelude: parts.prelude,
      version: parts.version,
      schemaCompressed: parts.schemaCompressed,
      messageCompressed: mockCompressedMsg,
      passThrough: parts.passThrough,
    });

    // Re-parse the encoded binary
    const reparsed = parseFigBinary(canvasFig);

    // Structural equality
    expect(reparsed.header.prelude).toBe(original.header.prelude);
    expect(reparsed.header.version).toBe(original.header.version);
    expect(reparsed.nodes.length).toBe(original.nodes.length);

    // Every node preserved
    for (let i = 0; i < original.nodes.length; i++) {
      const orig = original.nodes[i];
      const repr = reparsed.nodes[i];
      expect(nodeId(repr)).toBe(nodeId(orig));
      expect(repr.type).toBe(orig.type);
      expect(repr.name).toBe(orig.name);
    }
  });

  it("OpenFigs.fig: parse → encode → re-parse preserves structure", () => {
    const original = parseFig(loadFixture("OpenFigs.fig"));
    const parts = encodeFigParts(original);
    const mockCompressedMsg = deflateSync(parts.messageRaw);

    const canvasFig = assembleCanvasFig({
      prelude: parts.prelude,
      version: parts.version,
      schemaCompressed: parts.schemaCompressed,
      messageCompressed: mockCompressedMsg,
      passThrough: parts.passThrough,
    });

    const reparsed = parseFigBinary(canvasFig);

    expect(reparsed.nodes.length).toBe(original.nodes.length);
    for (let i = 0; i < original.nodes.length; i++) {
      expect(nodeId(reparsed.nodes[i])).toBe(nodeId(original.nodes[i]));
      expect(reparsed.nodes[i].type).toBe(original.nodes[i].type);
    }
  });

  it("full ZIP roundtrip: parse → encode → ZIP → re-parse", () => {
    const inputBytes = loadFixture("circle.fig");
    const original = parseFig(inputBytes);
    const parts = encodeFigParts(original);
    const mockCompressedMsg = deflateSync(parts.messageRaw);

    const canvasFig = assembleCanvasFig({
      prelude: parts.prelude,
      version: parts.version,
      schemaCompressed: parts.schemaCompressed,
      messageCompressed: mockCompressedMsg,
      passThrough: parts.passThrough,
    });

    const zip = createFigZip({
      canvasFig,
      meta: original.meta,
      thumbnail: original.thumbnail,
      images: original.images,
    });

    // Re-parse the full ZIP
    const reparsed = parseFig(zip);

    expect(reparsed.nodes.length).toBe(original.nodes.length);
    expect(reparsed.header.prelude).toBe(original.header.prelude);
    expect(reparsed.header.version).toBe(original.header.version);

    // Meta preserved
    if (original.meta) {
      expect(reparsed.meta).toBeDefined();
      expect(reparsed.meta!.file_name).toBe(original.meta.file_name);
    }
  });
});

describe("smoke tests", () => {
  it("encoded message can be decoded back identically", () => {
    const doc = parseFig(loadFixture("circle.fig"));
    const parts = encodeFigParts(doc);

    // Decode the raw message we just encoded
    const reDecoded = doc.compiledSchema.decodeMessage(parts.messageRaw);

    expect(reDecoded.nodeChanges.length).toBe(doc.message.nodeChanges.length);
    for (let i = 0; i < doc.message.nodeChanges.length; i++) {
      const origNode = doc.message.nodeChanges[i];
      const reNode = reDecoded.nodeChanges[i];
      if (origNode.guid && reNode.guid) {
        expect(reNode.guid.sessionID).toBe(origNode.guid.sessionID);
        expect(reNode.guid.localID).toBe(origNode.guid.localID);
      }
    }
  });

  it("schema round-trips through encode/decode", () => {
    const doc = parseFig(loadFixture("circle.fig"));

    // The schema compressed in encodeFigParts should inflate back to a valid schema
    const parts = encodeFigParts(doc);
    const { inflateSync } = require("fflate");
    const schemaInflated = inflateSync(parts.schemaCompressed);
    expect(schemaInflated.length).toBeGreaterThan(0);

    // Decode it back
    const { decodeBinarySchema, compileSchema } = require("kiwi-schema");
    const schema2 = decodeBinarySchema(schemaInflated);
    const compiled2 = compileSchema(schema2);
    expect(typeof compiled2.encodeMessage).toBe("function");
    expect(typeof compiled2.decodeMessage).toBe("function");
  });

  it("empty passThrough produces valid binary", () => {
    const doc = parseFig(loadFixture("circle.fig"));
    // Force no passthrough chunks
    doc.rawChunks = doc.rawChunks.slice(0, 2);
    const parts = encodeFigParts(doc);
    expect(parts.passThrough.length).toBe(0);

    const mockCompressedMsg = deflateSync(parts.messageRaw);
    const binary = assembleCanvasFig({
      prelude: parts.prelude,
      version: parts.version,
      schemaCompressed: parts.schemaCompressed,
      messageCompressed: mockCompressedMsg,
    });

    // Should still parse
    const reparsed = parseFigBinary(binary);
    expect(reparsed.nodes.length).toBe(doc.nodes.length);
  });

  it("modified node survives roundtrip", () => {
    const doc = parseFig(loadFixture("circle.fig"));

    // Find a node and modify its name
    const frame = doc.nodes.find(n => n.type === "FRAME");
    expect(frame).toBeDefined();
    const originalName = frame!.name;
    frame!.name = "Modified Frame";

    // Encode
    const parts = encodeFigParts(doc);
    const mockCompressedMsg = deflateSync(parts.messageRaw);
    const binary = assembleCanvasFig({
      prelude: parts.prelude,
      version: parts.version,
      schemaCompressed: parts.schemaCompressed,
      messageCompressed: mockCompressedMsg,
      passThrough: parts.passThrough,
    });

    // Re-parse and verify the modification stuck
    const reparsed = parseFigBinary(binary);
    const reFrame = reparsed.nodes.find(n => n.type === "FRAME");
    expect(reFrame).toBeDefined();
    expect(reFrame!.name).toBe("Modified Frame");
    expect(reFrame!.name).not.toBe(originalName);
  });
});
