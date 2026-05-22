import { describe, it, expect } from "vitest";
import { convertDeckToFig } from "./convert.js";
import type { FigDocument, FigNode } from "./types.js";

describe("convertDeckToFig", () => {
  it("converts slide scaffolding and bakes components and overrides", () => {
    // 1. Setup a mocked Figma Slides FigDocument
    const documentNode: FigNode = {
      guid: { sessionID: 0, localID: 0 },
      type: "DOCUMENT",
      name: "Document",
    };

    const sourceCanvas: FigNode = {
      guid: { sessionID: 1, localID: 1 },
      type: "CANVAS",
      name: "Page 1",
      parentIndex: { guid: { sessionID: 0, localID: 0 }, position: "!" },
    };

    const slideGrid: FigNode = {
      guid: { sessionID: 1, localID: 2 },
      type: "SLIDE_GRID",
      name: "Presentation",
      parentIndex: { guid: { sessionID: 1, localID: 1 }, position: "!" },
    };

    const slideRow: FigNode = {
      guid: { sessionID: 1, localID: 3 },
      type: "SLIDE_ROW",
      name: "Row",
      parentIndex: { guid: { sessionID: 1, localID: 2 }, position: "!" },
    };

    // Active Slide 1
    const slide1: FigNode = {
      guid: { sessionID: 1, localID: 10 },
      type: "SLIDE",
      name: "Slide 1",
      parentIndex: { guid: { sessionID: 1, localID: 3 }, position: "a" },
    };

    // Instance on Slide 1 referencing Symbol 100
    const instance1: FigNode = {
      guid: { sessionID: 1, localID: 11 },
      type: "INSTANCE",
      name: "SlideInstance",
      parentIndex: { guid: { sessionID: 1, localID: 10 }, position: "!" },
      symbolData: {
        symbolID: { sessionID: 1, localID: 100 },
        symbolOverrides: [
          {
            guidPath: {
              guids: [{ sessionID: 1, localID: 101 }],
            },
            textData: { characters: "Bake My Text Overrides" },
          },
        ],
      },
    };

    // Sibling shape node on Slide 1 (should be preserved and reparented)
    const siblingShape: FigNode = {
      guid: { sessionID: 1, localID: 12 },
      type: "RECTANGLE",
      name: "Custom Logo Box",
      parentIndex: { guid: { sessionID: 1, localID: 10 }, position: "b" },
    };

    // Active Slide 2 (with no overrides, should use defaults)
    const slide2: FigNode = {
      guid: { sessionID: 1, localID: 20 },
      type: "SLIDE",
      name: "Slide 2",
      parentIndex: { guid: { sessionID: 1, localID: 3 }, position: "b" },
    };

    const instance2: FigNode = {
      guid: { sessionID: 1, localID: 21 },
      type: "INSTANCE",
      name: "SlideInstance2",
      parentIndex: { guid: { sessionID: 1, localID: 20 }, position: "!" },
      symbolData: {
        symbolID: { sessionID: 1, localID: 100 },
        symbolOverrides: [],
      },
    };

    // Symbol definition (external components to be baked)
    const symbolNode: FigNode = {
      guid: { sessionID: 1, localID: 100 },
      type: "SYMBOL",
      name: "Slide Template Component",
    };

    const templateText: FigNode = {
      guid: { sessionID: 1, localID: 101 },
      type: "TEXT",
      name: "Title Layer",
      parentIndex: { guid: { sessionID: 1, localID: 100 }, position: "a" },
      textData: { characters: "Default Title characters" },
    };

    const templateVector: FigNode = {
      guid: { sessionID: 1, localID: 102 },
      type: "VECTOR",
      name: "Decoration Line",
      parentIndex: { guid: { sessionID: 1, localID: 100 }, position: "b" },
      fillGeometry: [{ windingRule: "NONZERO", commandsBlob: 0 }],
    };

    const sourceNodes = [
      documentNode,
      sourceCanvas,
      slideGrid,
      slideRow,
      slide1,
      instance1,
      siblingShape,
      slide2,
      instance2,
      symbolNode,
      templateText,
      templateVector,
    ];

    const nodeMap = new Map<string, FigNode>();
    const childrenMap = new Map<string, FigNode[]>();

    for (const node of sourceNodes) {
      const id = `${node.guid.sessionID}:${node.guid.localID}`;
      nodeMap.set(id, node);
    }

    for (const node of sourceNodes) {
      if (!node.parentIndex?.guid) continue;
      const pid = `${node.parentIndex.guid.sessionID}:${node.parentIndex.guid.localID}`;
      if (!childrenMap.has(pid)) childrenMap.set(pid, []);
      childrenMap.get(pid)!.push(node);
    }

    const mockDeck: FigDocument = {
      header: { prelude: "fig-deck", version: 23 },
      nodes: sourceNodes,
      nodeMap,
      childrenMap,
      schema: {},
      compiledSchema: {
        encodeMessage: () => new Uint8Array(),
        decodeMessage: () => ({}),
      },
      rawChunks: [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])],
      message: {
        nodeChanges: sourceNodes,
        blobs: [{ bytes: new Uint8Array([9, 9, 9]) }],
      },
      images: new Map(),
      meta: { file_name: "Original Deck Title" },
    };

    // 2. Perform the conversion
    const designFig = convertDeckToFig(mockDeck, {
      title: "My Custom Design Canvas",
      layout: "grid",
      gap: 100,
      wrap: 2,
    });

    // 3. Assertions
    expect(designFig.header.prelude).toBe("fig-kiwi");
    expect(designFig.header.version).toBe(23);

    // Verify Scaffolding Removal: No SLIDE_GRID, SLIDE_ROW, SLIDE, MODULE, SYMBOL, INSTANCE
    const outputTypes = designFig.nodes.map((n) => n.type);
    expect(outputTypes).not.toContain("SLIDE_GRID");
    expect(outputTypes).not.toContain("SLIDE_ROW");
    expect(outputTypes).not.toContain("SLIDE");
    expect(outputTypes).not.toContain("MODULE");

    // We should have DOCUMENT, CANVAS, and FRAMEs
    const docNodes = designFig.nodes.filter((n) => n.type === "DOCUMENT");
    expect(docNodes.length).toBe(1);

    const canvasNodes = designFig.nodes.filter((n) => n.type === "CANVAS");
    expect(canvasNodes.length).toBe(1);
    expect(canvasNodes[0].name).toBe("My Custom Design Canvas");

    const frameNodes = designFig.nodes.filter((n) => n.type === "FRAME");
    expect(frameNodes.length).toBe(2);

    // Slide 1 Frame assertions
    const frame1 = frameNodes[0];
    expect(frame1.name).toBe("01 · Bake My Text Overrides");
    expect(frame1.transform?.m02).toBe(0); // Col 0
    expect(frame1.transform?.m12).toBe(0); // Row 0

    // Slide 2 Frame assertions
    const frame2 = frameNodes[1];
    expect(frame2.name).toBe("02 · Default Title characters");
    expect(frame2.transform?.m02).toBe(1920 + 100); // Col 1
    expect(frame2.transform?.m12).toBe(0); // Row 0

    // Check sibling custom logo box is preserved and parented to Frame 1
    const logoBoxes = designFig.nodes.filter((n) => n.name === "Custom Logo Box");
    expect(logoBoxes.length).toBe(1);
    expect(logoBoxes[0].parentIndex?.guid).toEqual(frame1.guid);

    // Check baked text layer under Frame 1 has overrides
    const bakedTextLayers = designFig.nodes.filter(
      (n) => n.type === "TEXT" && n.parentIndex?.guid.localID === frame1.guid.localID
    );
    expect(bakedTextLayers.length).toBe(1);
    expect(bakedTextLayers[0].textData?.characters).toBe("Bake My Text Overrides");

    // Check baked text layer under Frame 2 uses defaults
    const bakedText2 = designFig.nodes.filter(
      (n) => n.type === "TEXT" && n.parentIndex?.guid.localID === frame2.guid.localID
    );
    expect(bakedText2.length).toBe(1);
    expect(bakedText2[0].textData?.characters).toBe("Default Title characters");

    // Check vector line blobs are re-indexed correctly
    const lines1 = designFig.nodes.filter(
      (n) => n.name === "Decoration Line" && n.parentIndex?.guid.localID === frame1.guid.localID
    );
    expect(lines1.length).toBe(1);
    expect(lines1[0].fillGeometry?.[0].commandsBlob).toBeDefined();

    // Check all parentIndex mappings are intact
    for (const node of designFig.nodes) {
      if (node.type === "DOCUMENT") continue;
      expect(node.parentIndex).toBeDefined();
      const pidStr = `${node.parentIndex!.guid.sessionID}:${node.parentIndex!.guid.localID}`;
      expect(designFig.nodeMap.has(pidStr)).toBe(true);
    }
  });
});
