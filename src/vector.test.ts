import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import {
  appendVectorPayloadToDocument,
  encodeCommandsBlob,
  geometryBlobToSVGPath,
  getBlobBytes,
  parseFig,
  parseSVGPathData,
  parseVectorNetworkBlob,
  resolveVectorNodePaths,
} from "./index.js";

const fixturesDir = join(__dirname, "..", "test-fixtures");

function collectReferenceFigs(): string[] {
  const topLevel = readdirSync(fixturesDir)
    .filter((entry: string) => entry.endsWith(".fig"))
    .map((entry: string) => join(fixturesDir, entry));
  const vectorNetworkDir = join(fixturesDir, "vector-network");
  const vectorNetwork = readdirSync(vectorNetworkDir)
    .filter((entry: string) => entry.endsWith(".fig"))
    .map((entry: string) => join(vectorNetworkDir, entry));
  return [...topLevel, ...vectorNetwork];
}

/** Build a little-endian blob from a flat list of 32-bit words (f32 0.0 === u32 0). */
function buildBlob(words: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(words.length * 4);
  const view = new DataView(bytes.buffer);
  words.forEach((word, i) => view.setUint32(i * 4, word, true));
  return bytes;
}

describe("vector helpers", () => {
  it("resolves commandsBlob bytes from OpenFigs.fig", () => {
    const data = new Uint8Array(readFileSync(join(fixturesDir, "OpenFigs.fig")));
    const doc = parseFig(data);
    const vector = doc.nodes.find((node) => node.type === "VECTOR" && node.phase !== "REMOVED");

    expect(vector).toBeDefined();
    const blobIndex = vector!.fillGeometry?.[0]?.commandsBlob;
    const bytes = getBlobBytes(doc, blobIndex);

    expect(blobIndex).toBeTypeOf("number");
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes!.length).toBeGreaterThan(0);
  });

  it("decodes a geometry blob into an SVG path string", () => {
    const data = new Uint8Array(readFileSync(join(fixturesDir, "OpenFigs.fig")));
    const doc = parseFig(data);
    const vector = doc.nodes.find((node) => node.type === "VECTOR" && node.phase !== "REMOVED");
    const bytes = getBlobBytes(doc, vector!.fillGeometry?.[0]?.commandsBlob);
    const path = geometryBlobToSVGPath(bytes!);

    expect(path.startsWith("M")).toBe(true);
    expect(path.includes("C")).toBe(true);
    expect(path.endsWith("Z")).toBe(true);
  });

  it("resolves vector node fill paths", () => {
    const data = new Uint8Array(readFileSync(join(fixturesDir, "OpenFigs.fig")));
    const doc = parseFig(data);
    const vector = doc.nodes.find((node) => node.type === "VECTOR" && node.phase !== "REMOVED");
    const resolved = resolveVectorNodePaths(doc, vector!);

    expect(resolved.fill.length).toBeGreaterThan(0);
    expect(resolved.fill.every((entry) => entry.svgPath.startsWith("M"))).toBe(true);
    expect(resolved.fill.every((entry) => entry.commandsBlob instanceof Uint8Array)).toBe(true);
    expect(resolved.stroke).toHaveLength(0);
  });

  it("applies per-path fill overrides when present", () => {
    const doc = {
      message: {
        blobs: [{ bytes: Uint8Array.from([1, 0, 0, 0, 0, 0, 0, 0, 0]) }],
      },
    } as any;

    const node = {
      fillPaints: [{ type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 } }],
      vectorData: {
        styleOverrideTable: [
          {
            styleID: 2,
            fillPaints: [{ type: "SOLID", color: { r: 1, g: 0, b: 0, a: 1 } }],
          },
        ],
      },
      fillGeometry: [{ commandsBlob: 0, windingRule: "NONZERO", styleID: 2 }],
      strokeGeometry: [],
    } as any;

    const resolved = resolveVectorNodePaths(doc, node);

    expect(resolved.fill).toHaveLength(1);
    expect(resolved.fill[0].paints).toEqual(node.vectorData.styleOverrideTable[0].fillPaints);
  });

  it("parses a restricted SVG path subset into vector commands", () => {
    const commands = parseSVGPathData("M0 0 H10 V20 C10 25 20 30 30 40 S50 60 70 80 Z");

    expect(commands[0]).toEqual({ type: "M", x: 0, y: 0 });
    expect(commands[1]).toEqual({ type: "L", x: 10, y: 0 });
    expect(commands[2]).toEqual({ type: "L", x: 10, y: 20 });
    expect(commands[3].type).toBe("C");
    expect(commands[4].type).toBe("C");
    expect(commands[5]).toEqual({ type: "Z" });
  });

  it("converts quadratic SVG path commands into exact cubic vector commands", () => {
    const commands = parseSVGPathData("M0 0 Q15 30 30 0 T60 0 Z");

    expect(commands[0]).toEqual({ type: "M", x: 0, y: 0 });
    expect(commands[1]).toEqual({
      type: "C",
      c1x: 10,
      c1y: 20,
      c2x: 20,
      c2y: 20,
      x: 30,
      y: 0,
    });
    expect(commands[2]).toEqual({
      type: "C",
      c1x: 40,
      c1y: -20,
      c2x: 50,
      c2y: -20,
      x: 60,
      y: 0,
    });
    expect(commands[3]).toEqual({ type: "Z" });
  });

  it("encodes path commands into a commandsBlob that decodes back to SVG path data", () => {
    const commands = parseSVGPathData("M0 0 L10 0 C10 10 20 20 30 30 Z");
    const blob = encodeCommandsBlob(commands, 2, 3);
    const decoded = geometryBlobToSVGPath(blob);

    expect(decoded).toBe("M0 0L20 0C20 30 40 60 60 90Z");
  });

  it("appends vector payload blobs and metadata to a document", () => {
    const doc = { message: { blobs: [] } } as any;
    const payload = appendVectorPayloadToDocument(doc, {
      width: 200,
      height: 100,
      normalizedWidth: 100,
      normalizedHeight: 50,
      fillPaths: [
        { svgPath: "M0 0 L100 0 L100 50 L0 50 Z", styleID: 0 },
        { svgPath: "M10 10 L90 10 L90 40 L10 40 Z", styleID: 2 },
      ],
      styleOverrideTable: [
        {
          styleID: 2,
          fillPaints: [{ type: "SOLID", color: { r: 1, g: 0, b: 0, a: 1 } }],
        },
      ],
    });

    expect(doc.message.blobs).toHaveLength(3);
    expect(payload.fillGeometry).toHaveLength(2);
    expect(payload.strokeGeometry).toHaveLength(0);
    expect(payload.fillGeometry[0].commandsBlob).toBe(0);
    expect(payload.fillGeometry[1].commandsBlob).toBe(1);
    expect(payload.vectorData.vectorNetworkBlob).toBe(2);
    expect(payload.vectorData.normalizedSize).toEqual({ x: 100, y: 50 });
    expect(payload.vectorData.styleOverrideTable).toEqual([
      {
        styleID: 2,
        fillPaints: [{ type: "SOLID", color: { r: 1, g: 0, b: 0, a: 1 } }],
      },
    ]);
  });
});

describe("parseVectorNetworkBlob", () => {
  it("decodes every reference vectorNetworkBlob byte-exact", () => {
    const files = collectReferenceFigs();
    let blobCount = 0;

    for (const file of files) {
      const doc = parseFig(new Uint8Array(readFileSync(file)));
      for (const node of doc.nodes) {
        const blobIndex = node.vectorData?.vectorNetworkBlob;
        if (blobIndex == null) continue;

        const bytes = getBlobBytes(doc, blobIndex);
        expect(bytes, `${file} node ${node.name} blob ${blobIndex}`).toBeInstanceOf(Uint8Array);

        const network = parseVectorNetworkBlob(bytes!);
        expect(network.bytesConsumed, `${file} node ${node.name}`).toBe(bytes!.length);
        blobCount++;
      }
    }

    expect(blobCount, `expected 17 reference vectorNetworkBlobs, found ${blobCount}`).toBe(17);
  });

  // Geometry oracle. Byte-exact consumption only proves the blob *parses*; it says nothing
  // about whether the fields were interpreted correctly. Candidate layouts for this format are
  // one-word rotations of each other with identical strides, so a wrong field order still
  // yields plausible coordinates and a clean byte count.
  //
  // Where a node carries both a vectorNetworkBlob and pre-computed fillGeometry commandsBlob
  // data, the two describe the same shape. geometryBlobToSVGPath decodes the latter through a
  // completely separate code path, which makes it an independent oracle. Curve-vs-line
  // classification is the discriminating property: reading a segment type out of the wrong
  // word collapses curves into straight lines while leaving endpoints intact.
  it("agrees with commandsBlob geometry on curve-vs-line classification", () => {
    const files = collectReferenceFigs();
    let nodesChecked = 0;

    for (const file of files) {
      const doc = parseFig(new Uint8Array(readFileSync(file)));
      for (const node of doc.nodes) {
        const blobIndex = node.vectorData?.vectorNetworkBlob;
        if (blobIndex == null) continue;
        // FigNode leaves fillGeometry untyped, so name the shape this test relies on.
        const fillGeometry: { commandsBlob?: number | null }[] | undefined = node.fillGeometry;
        if (!fillGeometry?.length) continue;
        if (fillGeometry.some((geometry) => geometry.commandsBlob == null)) continue;

        // Oracle: every fillGeometry subpath, decoded independently.
        let oracleCurves = 0;
        let oracleLines = 0;
        for (const geometry of fillGeometry) {
          const path = geometryBlobToSVGPath(getBlobBytes(doc, geometry.commandsBlob)!);
          oracleCurves += (path.match(/C/g) ?? []).length;
          oracleLines += (path.match(/L/g) ?? []).length;
        }

        // Under test: segments actually referenced by a region loop, classified by tangents.
        const network = parseVectorNetworkBlob(getBlobBytes(doc, blobIndex)!);
        const referenced = new Set(network.regions.flatMap((region) => region.loops.flat()));
        let curves = 0;
        let lines = 0;
        for (const index of referenced) {
          if (network.segments[index].isStraight) lines++;
          else curves++;
        }

        const where = `${file} node ${node.name}`;
        expect(curves, `${where}: curve count`).toBe(oracleCurves);
        expect(lines, `${where}: line count`).toBe(oracleLines);
        nodesChecked++;
      }
    }

    // Guards against the oracle silently covering nothing if fixtures move.
    expect(nodesChecked, `expected 14 nodes with both blob kinds, found ${nodesChecked}`).toBe(14);
  });

  it("parses a minimal valid blob and consumes every byte", () => {
    // header: 1 vertex, 0 segments, 0 regions; vertex: word0=0, x=0, y=0
    const network = parseVectorNetworkBlob(buildBlob([1, 0, 0, 0, 0, 0]));

    expect(network.vertices).toHaveLength(1);
    expect(network.segments).toHaveLength(0);
    expect(network.regions).toHaveLength(0);
    expect(network.bytesConsumed).toBe(24);
  });

  it("classifies a segment by tangents, not by a type word", () => {
    // 2 vertices, 1 curved segment (word0=0 but non-zero tangents), 0 regions
    const words = [
      2, 1, 0, // header
      0, 0, 0, // vertex 0
      0, 0, 0, // vertex 1
      0, 0, 1, 2, 1, 3, 4, // segment: word0=0, sv=0, tsx=1, tsy=2, ev=1, tex=3, tey=4
    ];
    const network = parseVectorNetworkBlob(buildBlob(words));

    expect(network.segments).toHaveLength(1);
    expect(network.segments[0].isStraight).toBe(false);
  });

  it("throws on a buffer shorter than the 12-byte header", () => {
    expect(() => parseVectorNetworkBlob(buildBlob([0]))).toThrow(/at least 12/);
  });

  it("throws when a declared count runs past the buffer", () => {
    // header declares 5 vertices but no vertex data follows
    expect(() => parseVectorNetworkBlob(buildBlob([5, 0, 0]))).toThrow(/vertexCount 5 runs past buffer/);
  });

  it("throws when a segment references an out-of-range vertex", () => {
    const words = [
      1, 1, 0, // header: 1 vertex, 1 segment, 0 regions
      0, 0, 0, // vertex 0
      0, 99, 0, 0, 0, 0, 0, // segment: startVertex=99 (out of range)
    ];
    expect(() => parseVectorNetworkBlob(buildBlob(words))).toThrow(/startVertex 99 out of range/);
  });

  it("throws on trailing bytes after a valid blob", () => {
    // minimal valid blob (24 bytes) plus one extra word
    expect(() => parseVectorNetworkBlob(buildBlob([1, 0, 0, 0, 0, 0, 0]))).toThrow(/trailing bytes/);
  });
});
