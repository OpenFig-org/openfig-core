import type { FigDocument, FigNode, FigGuid, FigPaint } from "./types.js";

export interface ConvertOptions {
  title?: string;
  layout?: "row" | "grid";
  gap?: number;
  wrap?: number;
}

function guidToString(guid: FigGuid): string {
  return `${guid.sessionID}:${guid.localID}`;
}

function safeDeepClone<T>(val: T): T {
  if (val === null || val === undefined) return val;
  if (val instanceof Uint8Array) {
    return new Uint8Array(val) as any;
  }
  if (Array.isArray(val)) {
    return val.map(safeDeepClone) as any;
  }
  if (typeof val === "object") {
    const copy: any = {};
    for (const k of Object.keys(val)) {
      copy[k] = safeDeepClone((val as any)[k]);
    }
    return copy;
  }
  return val;
}

export function convertDeckToFig(
  deckDoc: FigDocument,
  options: ConvertOptions = {}
): FigDocument {
  const {
    title,
    layout = "row",
    gap = 200,
    wrap = 5,
  } = options;

  // 1. Find all active slide nodes
  const activeSlides = deckDoc.nodes
    .filter((n) => n.type === "SLIDE" && n.phase !== "REMOVED")
    // Sort by lexical order of their parentIndex.position or parent MODULE's position if nested
    .sort((a, b) => {
      const posA = a.parentIndex?.position ?? "";
      const posB = b.parentIndex?.position ?? "";
      return posA.localeCompare(posB);
    });

  // Calculate maximum local ID in the source document
  let maxLocalId = 0;
  for (const node of deckDoc.nodes) {
    if (node.guid?.localID > maxLocalId) {
      maxLocalId = node.guid.localID;
    }
  }
  let nextLocalId = maxLocalId + 1;
  const sessionId = 1;

  function generateGuid(): FigGuid {
    return { sessionID: sessionId, localID: nextLocalId++ };
  }

  // 2. Create the output FigDocument skeleton
  const documentNode = deckDoc.nodes.find((n) => n.type === "DOCUMENT");
  const docGuid = documentNode?.guid ?? { sessionID: 0, localID: 0 };

  const canvasGuid = generateGuid();
  const canvasName = title || deckDoc.meta?.file_name || "Page 1";

  const newCanvasNode: FigNode = {
    guid: canvasGuid,
    type: "CANVAS",
    name: canvasName,
    phase: "CREATED",
    parentIndex: {
      guid: docGuid,
      position: "!",
    },
    visible: true,
  };

  const outputNodes: FigNode[] = [];
  // Keep the DOCUMENT node
  if (documentNode) {
    outputNodes.push(safeDeepClone(documentNode));
  }
  outputNodes.push(newCanvasNode);

  const outputBlobs: any[] = [];
  const blobRemap = new Map<number, number>();

  function copyBlob(sourceIdx: number | undefined | null): number | undefined {
    if (sourceIdx === undefined || sourceIdx === null || sourceIdx < 0) return undefined;
    if (!deckDoc.message?.blobs || sourceIdx >= deckDoc.message.blobs.length) return sourceIdx;

    if (blobRemap.has(sourceIdx)) {
      return blobRemap.get(sourceIdx)!;
    }

    const newIdx = outputBlobs.length;
    outputBlobs.push(safeDeepClone(deckDoc.message.blobs[sourceIdx]));
    blobRemap.set(sourceIdx, newIdx);
    return newIdx;
  }

  // 3. Process each slide
  const totalSlides = activeSlides.length;
  const paddingWidth = Math.max(2, String(totalSlides).length);

  activeSlides.forEach((slide, index) => {
    const slideId = guidToString(slide.guid);
    
    // Determine frame size - standard is 1920x1080
    const slideSize = slide.size ?? { x: 1920, y: 1080 };
    const width = slideSize.x;
    const height = slideSize.y;

    // Calculate layout position
    let x = 0;
    let y = 0;
    if (layout === "grid") {
      const col = index % wrap;
      const row = Math.floor(index / wrap);
      x = col * (width + gap);
      y = row * (height + gap);
    } else {
      x = index * (width + gap);
      y = 0;
    }

    // Try to resolve frame name: first text node or fallback
    let slideTitle = "";
    const children = deckDoc.childrenMap.get(slideId) || [];
    const instanceNode = children.find((c) => c.type === "INSTANCE");

    if (instanceNode?.symbolData?.symbolID) {
      const symGuidStr = guidToString(instanceNode.symbolData.symbolID);
      const symNode = deckDoc.nodeMap.get(symGuidStr);
      if (symNode) {
        // Look in the symbol subtree for the first text node
        const firstText = findFirstTextNode(deckDoc, symGuidStr);
        if (firstText) {
          // Check if there is an override in the instance for this text node
          const originalTextGuid = firstText.guid;
          const overrides = instanceNode.symbolData?.symbolOverrides || [];
          const ov = overrides.find(
            (o: any) =>
              o.guidPath?.guids?.length === 1 &&
              o.guidPath.guids[0].sessionID === originalTextGuid.sessionID &&
              o.guidPath.guids[0].localID === originalTextGuid.localID &&
              o.textData?.characters
          );
          slideTitle = ov?.textData?.characters || firstText.textData?.characters || "";
        }
      }
    }

    // Clean up title
    slideTitle = slideTitle.trim();
    const frameIndexStr = String(index + 1).padStart(paddingWidth, "0");
    const frameName = slideTitle ? `${frameIndexStr} · ${slideTitle}` : `${frameIndexStr} · Slide ${frameIndexStr}`;

    // Create the slide FRAME
    const frameGuid = generateGuid();
    const frameNode: FigNode = {
      guid: frameGuid,
      type: "FRAME",
      name: frameName,
      phase: "CREATED",
      parentIndex: {
        guid: canvasGuid,
        position: String.fromCharCode(0x21 + index),
      },
      size: { x: width, y: height },
      transform: { m00: 1, m01: 0, m02: x, m10: 0, m11: 1, m12: y },
      visible: true,
      opacity: 1,
      frameMaskDisabled: false,
      // Inherit fill paints and geometry from the SLIDE node
      fillPaints: slide.fillPaints ? safeDeepClone(slide.fillPaints) : [],
      fillGeometry: slide.fillGeometry ? safeDeepClone(slide.fillGeometry) : [],
      strokePaints: slide.strokePaints ? safeDeepClone(slide.strokePaints) : [],
      strokeWeight: slide.strokeWeight ?? 0,
      strokeAlign: slide.strokeAlign ?? "INSIDE",
    };

    outputNodes.push(frameNode);

    // 4. Bake the INSTANCE contents into the frame
    if (instanceNode && instanceNode.symbolData?.symbolID) {
      const symGuidStr = guidToString(instanceNode.symbolData.symbolID);
      const symbolNode = deckDoc.nodeMap.get(symGuidStr);

      if (symbolNode) {
        // Collect all nodes in the symbol subtree
        const subtree: FigNode[] = [];
        const visited = new Set<string>();

        function collectSubtree(id: string) {
          if (visited.has(id)) return;
          visited.add(id);

          const node = deckDoc.nodeMap.get(id);
          if (!node || node.phase === "REMOVED") return;
          subtree.push(node);

          const kids = deckDoc.childrenMap.get(id) || [];
          for (const kid of kids) {
            collectSubtree(guidToString(kid.guid));
          }
        }

        // Collect children of the SYMBOL node, but not the SYMBOL node itself
        const symbolChildren = deckDoc.childrenMap.get(symGuidStr) || [];
        for (const child of symbolChildren) {
          collectSubtree(guidToString(child.guid));
        }

        // Create ID remap map for cloned symbol subtree
        const idRemap = new Map<string, FigGuid>();
        for (const node of subtree) {
          idRemap.set(guidToString(node.guid), generateGuid());
        }

        // Clone and apply overrides
        const clonedSubtree = subtree.map((node) => {
          const clone = safeDeepClone(node);
          const origIdStr = guidToString(node.guid);
          const newGuid = idRemap.get(origIdStr)!;
          clone.guid = newGuid;
          clone.phase = "CREATED";

          // Remove slide-scaffolding parameters
          delete clone.slideThumbnailHash;
          delete clone.editInfo;
          delete clone.prototypeInteractions;

          // Re-parent
          if (clone.parentIndex?.guid) {
            const parentIdStr = guidToString(clone.parentIndex.guid);
            if (parentIdStr === symGuidStr) {
              // Root of subtree is parented directly to the slide's new FRAME
              clone.parentIndex.guid = frameGuid;
            } else if (idRemap.has(parentIdStr)) {
              // Internal parent reference
              clone.parentIndex.guid = idRemap.get(parentIdStr)!;
            }
          }

          // Apply overrides from the instance
          const overrides = instanceNode.symbolData?.symbolOverrides || [];
          const matchingOverrides = overrides.filter((o: any) => {
            if (!o.guidPath?.guids?.length) return false;
            const lastGuid = o.guidPath.guids[o.guidPath.guids.length - 1];
            return (
              lastGuid.sessionID === node.guid.sessionID &&
              lastGuid.localID === node.guid.localID
            );
          });

          for (const ov of matchingOverrides) {
            if (ov.textData && clone.textData) {
              let chars = ov.textData.characters || "";
              if (chars === "") chars = " "; // Prevent Figma silent crashes
              clone.textData.characters = chars;
            }
            if (ov.fillPaints) {
              clone.fillPaints = safeDeepClone(ov.fillPaints);
            }
            if (ov.strokePaints) {
              clone.strokePaints = safeDeepClone(ov.strokePaints);
            }
          }

          return clone;
        });

        // Push baked nodes to output list
        outputNodes.push(...clonedSubtree);
      }
    }

    // 5. Clone and re-parent slide sibling nodes (non-INSTANCE children of the SLIDE node)
    for (const sibling of children) {
      if (sibling.type === "INSTANCE" || sibling.phase === "REMOVED") continue;

      const subtree: FigNode[] = [];
      const visited = new Set<string>();

      function collectSiblingSubtree(id: string) {
        if (visited.has(id)) return;
        visited.add(id);

        const node = deckDoc.nodeMap.get(id);
        if (!node || node.phase === "REMOVED") return;
        subtree.push(node);

        const kids = deckDoc.childrenMap.get(id) || [];
        for (const kid of kids) {
          collectSiblingSubtree(guidToString(kid.guid));
        }
      }

      collectSiblingSubtree(guidToString(sibling.guid));

      // Remap GUIDs to ensure uniqueness and clean reparenting
      const sibIdRemap = new Map<string, FigGuid>();
      for (const node of subtree) {
        sibIdRemap.set(guidToString(node.guid), generateGuid());
      }

      const clonedSibNodes = subtree.map((node) => {
        const clone = safeDeepClone(node);
        const origIdStr = guidToString(node.guid);
        const newGuid = sibIdRemap.get(origIdStr)!;
        clone.guid = newGuid;
        clone.phase = "CREATED";

        if (clone.parentIndex?.guid) {
          const parentIdStr = guidToString(clone.parentIndex.guid);
          if (parentIdStr === slideId) {
            clone.parentIndex.guid = frameGuid;
          } else if (sibIdRemap.has(parentIdStr)) {
            clone.parentIndex.guid = sibIdRemap.get(parentIdStr)!;
          }
        }

        return clone;
      });

      outputNodes.push(...clonedSibNodes);
    }
  });

  // 6. Keep global variables or theme metadata if present
  const globalSupportTypes = new Set([
    "VARIABLE",
    "VARIABLE_SET",
    "VARIABLE_COLLECTION",
    "PUBLISHED_VARIABLE_COLLECTION",
  ]);
  const supportNodes = deckDoc.nodes.filter((n) =>
    globalSupportTypes.has(n.type) && n.phase !== "REMOVED"
  );
  for (const sNode of supportNodes) {
    outputNodes.push(safeDeepClone(sNode));
  }

  // Build target childrenMap and nodeMap
  const nodeMap = new Map<string, FigNode>();
  const childrenMap = new Map<string, FigNode[]>();

  for (const node of outputNodes) {
    const id = guidToString(node.guid);
    nodeMap.set(id, node);
  }

  for (const node of outputNodes) {
    if (!node.parentIndex?.guid) continue;
    const pid = guidToString(node.parentIndex.guid);
    if (!childrenMap.has(pid)) {
      childrenMap.set(pid, []);
    }
    childrenMap.get(pid)!.push(node);
  }

  // Carry over meta and images
  const targetMeta = safeDeepClone(deckDoc.meta) || {};
  targetMeta.file_name = canvasName;

  // Build the new FigDocument
  // Every blob reference, not a hand-picked three.
  //
  // This used to re-index `fillGeometry`, `strokeGeometry` and
  // `vectorNetworkBlob` at the sites that build them, which missed
  // `derivedTextData.glyphs[].commandsBlob` — the cached glyph outlines, and by
  // far the most numerous reference in a text-heavy deck. The output table came
  // out smaller than the source's while nodes still held source indices: one
  // fixture went from 73 blobs to 1 with references up to 72, another from 245
  // to 36 with references up to 244. A reference that still fell in range
  // resolved to the wrong blob; the rest pointed at nothing, which Figma
  // reports as "Internal error during import" while naming nothing about it.
  //
  // Running once over the finished nodes is what makes this exhaustive instead
  // of a longer list that the next schema addition breaks again. It also has to
  // be the *only* pass: remapping a field twice would read an output index as a
  // source index.
  const remapBlobRefs = (value: any): void => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) remapBlobRefs(item);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (/Blob$/.test(key) && typeof child === "number") {
        value[key] = copyBlob(child);
      } else {
        remapBlobRefs(child);
      }
    }
  };
  for (const node of outputNodes) remapBlobRefs(node);

  const newDoc: FigDocument = {
    header: { prelude: "fig-kiwi", version: deckDoc.header.version },
    nodes: outputNodes,
    nodeMap,
    childrenMap,
    schema: safeDeepClone(deckDoc.schema),
    compiledSchema: deckDoc.compiledSchema,
    rawChunks: [
      deckDoc.rawChunks[0], // Schema chunk (will be re-deflated or kept as-is)
      new Uint8Array(0),    // Placeholder for chunk 1 (pre-compressed canvas message)
      ...deckDoc.rawChunks.slice(2), // Remaining passthrough chunks
    ],
    message: {
      ...safeDeepClone(deckDoc.message),
      nodeChanges: outputNodes,
      blobs: outputBlobs,
    },
    meta: targetMeta,
    thumbnail: safeDeepClone(deckDoc.thumbnail),
    images: safeDeepClone(deckDoc.images),
  };

  return newDoc;
}

/** Helper to find the first TEXT node in a component subtree recursively. */
function findFirstTextNode(doc: FigDocument, id: string): FigNode | null {
  const node = doc.nodeMap.get(id);
  if (!node || node.phase === "REMOVED") return null;
  if (node.type === "TEXT" && node.textData?.characters) return node;

  const children = doc.childrenMap.get(id) || [];
  for (const child of children) {
    const found = findFirstTextNode(doc, guidToString(child.guid));
    if (found) return found;
  }
  return null;
}
