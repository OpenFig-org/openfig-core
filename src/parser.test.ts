import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseFig, parseFigBinary, nodeId } from "./index.js";

const fixturesDir = join(__dirname, "..", "test-fixtures");

describe("parseFig", () => {
  it("parses circle.fig ZIP archive", () => {
    const data = new Uint8Array(readFileSync(join(fixturesDir, "circle.fig")));
    const doc = parseFig(data);

    expect(doc.header.prelude).toMatch(/^fig-/);
    expect(doc.nodes.length).toBeGreaterThan(0);
    expect(doc.nodeMap.size).toBeGreaterThan(0);
    expect(doc.childrenMap.size).toBeGreaterThan(0);
  });

  it("finds frame and ellipse nodes in circle.fig", () => {
    const data = new Uint8Array(readFileSync(join(fixturesDir, "circle.fig")));
    const doc = parseFig(data);

    const frames = doc.nodes.filter((n) => n.type === "FRAME");
    expect(frames.length).toBeGreaterThanOrEqual(1);
    expect(frames[0].name).toBe("Frame 1");

    const ellipses = doc.nodes.filter((n) => n.type === "ELLIPSE");
    expect(ellipses.length).toBeGreaterThanOrEqual(1);
  });

  it("builds parent-child relationships", () => {
    const data = new Uint8Array(readFileSync(join(fixturesDir, "circle.fig")));
    const doc = parseFig(data);

    const frames = doc.nodes.filter((n) => n.type === "FRAME");
    const frameId = nodeId(frames[0]);
    expect(frameId).toBeTruthy();

    const children = doc.childrenMap.get(frameId!);
    expect(children).toBeDefined();
    expect(children!.length).toBeGreaterThan(0);
  });

  it("extracts meta.json if present", () => {
    const data = new Uint8Array(readFileSync(join(fixturesDir, "circle.fig")));
    const doc = parseFig(data);
    // meta may or may not exist in test fixture
    if (doc.meta) {
      expect(typeof doc.meta).toBe("object");
    }
  });

  it("returns images map", () => {
    const data = new Uint8Array(readFileSync(join(fixturesDir, "circle.fig")));
    const doc = parseFig(data);
    expect(doc.images).toBeInstanceOf(Map);
  });

  it("exposes schema, compiledSchema, and rawChunks", () => {
    const data = new Uint8Array(readFileSync(join(fixturesDir, "circle.fig")));
    const doc = parseFig(data);

    expect(doc.schema).toBeDefined();
    expect(doc.compiledSchema).toBeDefined();
    expect(typeof doc.compiledSchema.encodeMessage).toBe("function");
    expect(typeof doc.compiledSchema.decodeMessage).toBe("function");
    expect(doc.rawChunks).toBeInstanceOf(Array);
    expect(doc.rawChunks.length).toBeGreaterThanOrEqual(2);
    expect(doc.rawChunks[0]).toBeInstanceOf(Uint8Array);
    expect(doc.message).toBeDefined();
    expect(doc.message.nodeChanges).toBe(doc.nodes);
  });
});

describe("parseFigBinary", () => {
  it("parses extracted canvas.fig binary", () => {
    // Extract canvas.fig from ZIP manually using fflate
    const { unzipSync } = require("fflate");
    const data = new Uint8Array(readFileSync(join(fixturesDir, "circle.fig")));
    const unzipped = unzipSync(data);
    const canvasKey = Object.keys(unzipped).find((k: string) => k.endsWith("canvas.fig"));
    expect(canvasKey).toBeTruthy();

    const doc = parseFigBinary(unzipped[canvasKey!]);
    expect(doc.nodes.length).toBeGreaterThan(0);
    expect(doc.header.prelude).toMatch(/^fig-/);
  });
});

describe("nodeId", () => {
  it("returns sessionID:localID string", () => {
    const node = { guid: { sessionID: 0, localID: 1 } } as any;
    expect(nodeId(node)).toBe("0:1");
  });

  it("returns null for missing guid", () => {
    expect(nodeId({} as any)).toBeNull();
  });
});
