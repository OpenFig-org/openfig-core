import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  appendVectorPayloadToDocument,
  encodeCommandsBlob,
  geometryBlobToSVGPath,
  getBlobBytes,
  parseFig,
  parseSVGPathData,
  resolveVectorNodePaths,
} from "./index.js";

const fixturesDir = join(__dirname, "..", "test-fixtures");

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
