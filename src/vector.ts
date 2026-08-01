import type { FigDocument, FigNode, FigPaint } from "./types.js";

const CMD_CLOSE = 0;
const CMD_MOVE_TO = 1;
const CMD_LINE_TO = 2;
const CMD_CUBIC_TO = 4;

type GeometryRef = {
  commandsBlob?: number;
  windingRule?: string;
  styleID?: number;
};

type StyleOverride = {
  styleID?: number;
  fillPaints?: FigPaint[];
};

export interface ResolvedGeometryPath {
  blobIndex: number;
  commandsBlob: Uint8Array;
  svgPath: string;
  windingRule?: string;
  styleID: number;
  paints?: FigPaint[];
}

export interface ResolvedVectorNodePaths {
  fill: ResolvedGeometryPath[];
  stroke: ResolvedGeometryPath[];
}

export type VectorPathCommand =
  | { type: "M"; x: number; y: number }
  | { type: "L"; x: number; y: number }
  | { type: "C"; c1x: number; c1y: number; c2x: number; c2y: number; x: number; y: number }
  | { type: "Z" };

function quadraticToCubic(
  x0: number,
  y0: number,
  qx: number,
  qy: number,
  x: number,
  y: number,
): Extract<VectorPathCommand, { type: "C" }> {
  return {
    type: "C",
    c1x: x0 + (2 / 3) * (qx - x0),
    c1y: y0 + (2 / 3) * (qy - y0),
    c2x: x + (2 / 3) * (qx - x),
    c2y: y + (2 / 3) * (qy - y),
    x,
    y,
  };
}

export interface VectorGeometryInput {
  svgPath?: string;
  commands?: readonly VectorPathCommand[];
  windingRule?: string;
  styleID?: number;
}

export interface VectorStyleOverride {
  styleID: number;
  fillPaints?: FigPaint[];
  [key: string]: any;
}

export interface AppendVectorPayloadInput {
  width: number;
  height: number;
  normalizedWidth?: number;
  normalizedHeight?: number;
  fillPaths?: readonly VectorGeometryInput[];
  /**
   * Stroke geometry is expected to already be expanded into outline paths.
   * This helper does not expand SVG strokes into strokeGeometry.
   */
  strokePaths?: readonly VectorGeometryInput[];
  styleOverrideTable?: readonly VectorStyleOverride[];
}

export interface AuthoredVectorPayload {
  fillGeometry: GeometryRef[];
  strokeGeometry: GeometryRef[];
  vectorData: {
    vectorNetworkBlob: number;
    normalizedSize: { x: number; y: number };
    styleOverrideTable?: VectorStyleOverride[];
  };
}

export function roundPathNumber(n: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

export function getBlobBytes(doc: FigDocument, blobIndex: number | null | undefined): Uint8Array | null {
  if (blobIndex == null || blobIndex < 0) return null;

  const blob = doc.message?.blobs?.[blobIndex];
  if (!blob) return null;

  if (blob instanceof Uint8Array) return blob;
  if (blob.bytes instanceof Uint8Array) return blob.bytes;
  if (Array.isArray(blob.bytes)) return Uint8Array.from(blob.bytes);

  if (blob.bytes && typeof blob.bytes === "object") {
    const values = Object.values(blob.bytes);
    if (values.every((value) => typeof value === "number")) {
      return Uint8Array.from(values as number[]);
    }
  }

  return null;
}

export function geometryBlobToSVGPath(blob: Uint8Array): string {
  if (!blob.length) return "";

  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  let offset = 0;
  const parts: string[] = [];

  const canRead = (byteLength: number) => offset + byteLength <= blob.length;

  while (offset < blob.length) {
    const cmd = blob[offset++];

    switch (cmd) {
      case CMD_CLOSE:
        parts.push("Z");
        break;

      case CMD_MOVE_TO: {
        if (!canRead(8)) return parts.join("");
        const x = roundPathNumber(view.getFloat32(offset, true));
        const y = roundPathNumber(view.getFloat32(offset + 4, true));
        offset += 8;
        parts.push(`M${x} ${y}`);
        break;
      }

      case CMD_LINE_TO: {
        if (!canRead(8)) return parts.join("");
        const x = roundPathNumber(view.getFloat32(offset, true));
        const y = roundPathNumber(view.getFloat32(offset + 4, true));
        offset += 8;
        parts.push(`L${x} ${y}`);
        break;
      }

      case CMD_CUBIC_TO: {
        if (!canRead(24)) return parts.join("");
        const x1 = roundPathNumber(view.getFloat32(offset, true));
        const y1 = roundPathNumber(view.getFloat32(offset + 4, true));
        const x2 = roundPathNumber(view.getFloat32(offset + 8, true));
        const y2 = roundPathNumber(view.getFloat32(offset + 12, true));
        const x = roundPathNumber(view.getFloat32(offset + 16, true));
        const y = roundPathNumber(view.getFloat32(offset + 20, true));
        offset += 24;
        parts.push(`C${x1} ${y1} ${x2} ${y2} ${x} ${y}`);
        break;
      }

      default:
        return parts.join("");
    }
  }

  return parts.join("");
}

export function parseSVGPathData(svgPath: string): VectorPathCommand[] {
  const tokens: Array<string | number> = [];
  const re = /([MmLlCcSsQqTtHhVvZz])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(svgPath)) !== null) {
    if (match[1]) tokens.push(match[1]);
    else tokens.push(Number.parseFloat(match[2]));
  }

  const commands: VectorPathCommand[] = [];
  let i = 0;
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  let prevC2x = 0;
  let prevC2y = 0;
  let prevQuadraticX = 0;
  let prevQuadraticY = 0;
  let cmd = "";
  const num = () => {
    const value = tokens[i++];
    if (typeof value !== "number" || Number.isNaN(value)) {
      throw new Error(`Invalid SVG path data near token index ${i - 1}`);
    }
    return value;
  };

  while (i < tokens.length) {
    if (typeof tokens[i] === "string") cmd = tokens[i++] as string;
    switch (cmd) {
      case "M":
        cx = num(); cy = num(); startX = cx; startY = cy;
        commands.push({ type: "M", x: cx, y: cy });
        prevC2x = cx;
        prevC2y = cy;
        prevQuadraticX = cx;
        prevQuadraticY = cy;
        cmd = "L";
        break;
      case "m":
        cx += num(); cy += num(); startX = cx; startY = cy;
        commands.push({ type: "M", x: cx, y: cy });
        prevC2x = cx;
        prevC2y = cy;
        prevQuadraticX = cx;
        prevQuadraticY = cy;
        cmd = "l";
        break;
      case "L":
        cx = num(); cy = num();
        commands.push({ type: "L", x: cx, y: cy });
        prevC2x = cx;
        prevC2y = cy;
        prevQuadraticX = cx;
        prevQuadraticY = cy;
        break;
      case "l":
        cx += num(); cy += num();
        commands.push({ type: "L", x: cx, y: cy });
        prevC2x = cx;
        prevC2y = cy;
        prevQuadraticX = cx;
        prevQuadraticY = cy;
        break;
      case "H":
        cx = num();
        commands.push({ type: "L", x: cx, y: cy });
        prevC2x = cx;
        prevC2y = cy;
        prevQuadraticX = cx;
        prevQuadraticY = cy;
        break;
      case "h":
        cx += num();
        commands.push({ type: "L", x: cx, y: cy });
        prevC2x = cx;
        prevC2y = cy;
        prevQuadraticX = cx;
        prevQuadraticY = cy;
        break;
      case "V":
        cy = num();
        commands.push({ type: "L", x: cx, y: cy });
        prevC2x = cx;
        prevC2y = cy;
        prevQuadraticX = cx;
        prevQuadraticY = cy;
        break;
      case "v":
        cy += num();
        commands.push({ type: "L", x: cx, y: cy });
        prevC2x = cx;
        prevC2y = cy;
        prevQuadraticX = cx;
        prevQuadraticY = cy;
        break;
      case "C": {
        const c1x = num();
        const c1y = num();
        const c2x = num();
        const c2y = num();
        cx = num();
        cy = num();
        prevC2x = c2x;
        prevC2y = c2y;
        prevQuadraticX = cx;
        prevQuadraticY = cy;
        commands.push({ type: "C", c1x, c1y, c2x, c2y, x: cx, y: cy });
        break;
      }
      case "c": {
        const c1x = cx + num();
        const c1y = cy + num();
        const c2x = cx + num();
        const c2y = cy + num();
        cx += num();
        cy += num();
        prevC2x = c2x;
        prevC2y = c2y;
        prevQuadraticX = cx;
        prevQuadraticY = cy;
        commands.push({ type: "C", c1x, c1y, c2x, c2y, x: cx, y: cy });
        break;
      }
      case "S": {
        const c1x = 2 * cx - prevC2x;
        const c1y = 2 * cy - prevC2y;
        const c2x = num();
        const c2y = num();
        cx = num();
        cy = num();
        prevC2x = c2x;
        prevC2y = c2y;
        prevQuadraticX = cx;
        prevQuadraticY = cy;
        commands.push({ type: "C", c1x, c1y, c2x, c2y, x: cx, y: cy });
        break;
      }
      case "s": {
        const c1x = 2 * cx - prevC2x;
        const c1y = 2 * cy - prevC2y;
        const c2x = cx + num();
        const c2y = cy + num();
        cx += num();
        cy += num();
        prevC2x = c2x;
        prevC2y = c2y;
        prevQuadraticX = cx;
        prevQuadraticY = cy;
        commands.push({ type: "C", c1x, c1y, c2x, c2y, x: cx, y: cy });
        break;
      }
      case "Q": {
        const qx = num();
        const qy = num();
        const x = num();
        const y = num();
        const cubic = quadraticToCubic(cx, cy, qx, qy, x, y);
        commands.push(cubic);
        prevQuadraticX = qx;
        prevQuadraticY = qy;
        prevC2x = cubic.c2x;
        prevC2y = cubic.c2y;
        cx = x;
        cy = y;
        break;
      }
      case "q": {
        const qx = cx + num();
        const qy = cy + num();
        const x = cx + num();
        const y = cy + num();
        const cubic = quadraticToCubic(cx, cy, qx, qy, x, y);
        commands.push(cubic);
        prevQuadraticX = qx;
        prevQuadraticY = qy;
        prevC2x = cubic.c2x;
        prevC2y = cubic.c2y;
        cx = x;
        cy = y;
        break;
      }
      case "T": {
        const qx = 2 * cx - prevQuadraticX;
        const qy = 2 * cy - prevQuadraticY;
        const x = num();
        const y = num();
        const cubic = quadraticToCubic(cx, cy, qx, qy, x, y);
        commands.push(cubic);
        prevQuadraticX = qx;
        prevQuadraticY = qy;
        prevC2x = cubic.c2x;
        prevC2y = cubic.c2y;
        cx = x;
        cy = y;
        break;
      }
      case "t": {
        const qx = 2 * cx - prevQuadraticX;
        const qy = 2 * cy - prevQuadraticY;
        const x = cx + num();
        const y = cy + num();
        const cubic = quadraticToCubic(cx, cy, qx, qy, x, y);
        commands.push(cubic);
        prevQuadraticX = qx;
        prevQuadraticY = qy;
        prevC2x = cubic.c2x;
        prevC2y = cubic.c2y;
        cx = x;
        cy = y;
        break;
      }
      case "Z":
      case "z":
        commands.push({ type: "Z" });
        cx = startX;
        cy = startY;
        prevC2x = cx;
        prevC2y = cy;
        prevQuadraticX = cx;
        prevQuadraticY = cy;
        break;
      case "":
        i++;
        break;
      default:
        throw new Error(`Unsupported SVG path command: ${cmd}`);
    }
  }

  return commands;
}

export function encodeCommandsBlob(
  commands: readonly VectorPathCommand[],
  scaleX = 1,
  scaleY = 1,
): Uint8Array {
  let byteLength = 0;
  for (const command of commands) {
    byteLength += 1;
    if (command.type === "M" || command.type === "L") byteLength += 8;
    else if (command.type === "C") byteLength += 24;
  }

  const buffer = new ArrayBuffer(byteLength);
  const view = new DataView(buffer);
  let offset = 0;

  for (const command of commands) {
    switch (command.type) {
      case "M":
        view.setUint8(offset++, CMD_MOVE_TO);
        view.setFloat32(offset, command.x * scaleX, true); offset += 4;
        view.setFloat32(offset, command.y * scaleY, true); offset += 4;
        break;
      case "L":
        view.setUint8(offset++, CMD_LINE_TO);
        view.setFloat32(offset, command.x * scaleX, true); offset += 4;
        view.setFloat32(offset, command.y * scaleY, true); offset += 4;
        break;
      case "C":
        view.setUint8(offset++, CMD_CUBIC_TO);
        view.setFloat32(offset, command.c1x * scaleX, true); offset += 4;
        view.setFloat32(offset, command.c1y * scaleY, true); offset += 4;
        view.setFloat32(offset, command.c2x * scaleX, true); offset += 4;
        view.setFloat32(offset, command.c2y * scaleY, true); offset += 4;
        view.setFloat32(offset, command.x * scaleX, true); offset += 4;
        view.setFloat32(offset, command.y * scaleY, true); offset += 4;
        break;
      case "Z":
        view.setUint8(offset++, CMD_CLOSE);
        break;
    }
  }

  return new Uint8Array(buffer, 0, offset);
}

/**
 * Build a vector network from SVG-style path commands and encode it.
 *
 * Each entry in `pathCommandsList` becomes **one region**, and each `M…Z`
 * sub-path within it becomes a **loop** of that region. That grouping is what
 * Figma writes: reference blobs carry regions of 1, 2 and 3 loops — a letter's
 * counter, or the inner and outer ring of an outline-stroked shape, are loops of
 * a single region rather than separate regions. Emitting one region per sub-path
 * makes Figma treat each as its own filled area, so counters fill in instead of
 * punching through.
 *
 * @param pathCommandsList one entry per path; each becomes a region
 * @param emitRegions      set false for open, stroked paths. A region asks Figma
 *                         to fill the area bounded by the loop, which on an open
 *                         path closes it visually — a "lens" between the
 *                         endpoints — even with no fill paint set.
 */
export function encodeVectorNetworkBlob(
  pathCommandsList: readonly (readonly VectorPathCommand[])[],
  { emitRegions = true }: { emitRegions?: boolean } = {},
): Uint8Array {
  const vertices: VectorNetworkVertex[] = [];
  const segments: VectorNetworkSegment[] = [];
  const regions: VectorNetworkRegion[] = [];

  for (const pathCommands of pathCommandsList) {
    const loops: number[][] = [];
    let regionSegments: number[] = [];
    let firstVertex = -1;
    let prevVertex = -1;
    let prevX = 0;
    let prevY = 0;

    for (const command of pathCommands) {
      if (command.type === "M") {
        // A new sub-path starts a new loop within the same region.
        if (regionSegments.length > 0) {
          loops.push(regionSegments);
          regionSegments = [];
        }
        const vertexIndex = vertices.length;
        vertices.push({ x: command.x, y: command.y, styleID: 0 });
        firstVertex = vertexIndex;
        prevVertex = vertexIndex;
        prevX = command.x;
        prevY = command.y;
      } else if (command.type === "L") {
        const vertexIndex = vertices.length;
        vertices.push({ x: command.x, y: command.y, styleID: 0 });
        if (prevVertex >= 0) {
          regionSegments.push(segments.length);
          segments.push({
            start: { vertex: prevVertex, dx: 0, dy: 0 },
            end: { vertex: vertexIndex, dx: 0, dy: 0 },
            isStraight: true,
          });
        }
        prevVertex = vertexIndex;
        prevX = command.x;
        prevY = command.y;
      } else if (command.type === "C") {
        const vertexIndex = vertices.length;
        vertices.push({ x: command.x, y: command.y, styleID: 0 });
        if (prevVertex >= 0) {
          const startDx = command.c1x - prevX;
          const startDy = command.c1y - prevY;
          const endDx = command.c2x - command.x;
          const endDy = command.c2y - command.y;
          regionSegments.push(segments.length);
          segments.push({
            start: { vertex: prevVertex, dx: startDx, dy: startDy },
            end: { vertex: vertexIndex, dx: endDx, dy: endDy },
            isStraight: startDx === 0 && startDy === 0 && endDx === 0 && endDy === 0,
          });
        }
        prevVertex = vertexIndex;
        prevX = command.x;
        prevY = command.y;
      } else if (command.type === "Z") {
        if (prevVertex >= 0 && prevVertex !== firstVertex) {
          const lastPos = vertices[prevVertex];
          const firstPos = vertices[firstVertex];
          const dx = lastPos.x - firstPos.x;
          const dy = lastPos.y - firstPos.y;
          if (dx * dx + dy * dy < 1e-4) {
            // Path already returned to start — merge the duplicate end vertex
            // into firstVertex so Figma sees one vertex with correct incoming
            // and outgoing bezier tangent handles for miter join computation.
            // Without this, a zero-length closing LINE segment would give Figma
            // a degenerate tangent, producing wrong miter angles (visible as
            // notches at sharp corners like the "g" terminal).
            const lastSeg = segments[segments.length - 1];
            if (lastSeg && lastSeg.end.vertex === prevVertex) {
              lastSeg.end.vertex = firstVertex;
              vertices.pop();
            }
          } else {
            regionSegments.push(segments.length);
            segments.push({
              start: { vertex: prevVertex, dx: 0, dy: 0 },
              end: { vertex: firstVertex, dx: 0, dy: 0 },
              isStraight: true,
            });
          }
        }
        if (firstVertex >= 0) {
          prevVertex = firstVertex;
          prevX = vertices[firstVertex].x;
          prevY = vertices[firstVertex].y;
        }
      }
    }

    if (regionSegments.length > 0) loops.push(regionSegments);
    if (emitRegions && loops.length > 0) {
      regions.push({ windingRule: "NONZERO", styleID: 0, loops });
    }
  }

  return encodeVectorNetwork({ vertices, segments, regions });
}

export interface VectorNetworkVertex {
  x: number;
  y: number;
  /**
   * The vertex's leading u32 — an index into the node's
   * `vectorData.styleOverrideTable`, where 0 means "no override". Observed
   * values are 0 and 1 across the reference corpus (openfig once wrote 4 here,
   * which Figma never emits).
   *
   * This was previously named `handleMirroring`, because the one fixture with a
   * non-zero value has a single override entry `{styleID: 1, handleMirroring:
   * "ANGLE"}` — and `VectorMirror.ANGLE` is also 1, so the two readings were
   * indistinguishable from that file alone. Other Figma files carry override
   * entries with six properties (cornerRadius, strokeCap, strokeJoin,
   * handleMirroring, cornerSmoothing), which cannot be encoded in one u32 — only
   * an index can reference them — and carry styleIDs 1 and 2 in sequence.
   *
   * It does not affect rendered geometry, but it is preserved verbatim so a
   * decoded blob re-encodes byte-identically. Authoring a non-zero value without
   * a matching `styleOverrideTable` entry produces a dangling reference.
   */
  styleID: number;
}

export interface VectorNetworkSegment {
  start: { vertex: number; dx: number; dy: number };
  end: { vertex: number; dx: number; dy: number };
  isStraight: boolean;
}

export interface VectorNetworkRegion {
  windingRule: "NONZERO" | "ODD";
  styleID: number;
  /** Each loop is an ordered list of segment indices. */
  loops: number[][];
}

export interface VectorNetwork {
  vertices: VectorNetworkVertex[];
  segments: VectorNetworkSegment[];
  regions: VectorNetworkRegion[];
  /** Must equal the input length on success. */
  bytesConsumed: number;
}

/**
 * Decode a Figma `vectorNetworkBlob` into structured geometry.
 *
 * Verified byte-exact layout (little-endian):
 *   header   12B : [vertexCount u32][segmentCount u32][regionCount u32]
 *   vertex   12B : [styleID u32][x f32][y f32]
 *   segment  28B : [word0 u32][startVertex u32][tsx f32][tsy f32]
 *                   [endVertex u32][tex f32][tey f32]
 *   region        : [packed u32][numLoops u32]
 *                   per loop: [segCount u32][segIndex u32 × segCount]
 *
 * `packed` decodes as windingRule = (packed & 1) ? "NONZERO" : "ODD",
 * styleID = packed >> 1.
 *
 * The vertex's leading word is Figma's handle-mirroring mode (observed 0 and 1);
 * it is preserved verbatim for byte-identical re-encoding. The segment's leading
 * word is 0 throughout the reference corpus and its meaning is unknown — it is
 * never used. A segment is straight iff all four tangent components are zero;
 * there is no segment-type field.
 */
export function parseVectorNetworkBlob(bytes: Uint8Array): VectorNetwork {
  if (bytes.length < 12) {
    throw new Error(
      `vectorNetworkBlob too short: ${bytes.length} bytes, need at least 12 for header`,
    );
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  const vertexCount = view.getUint32(offset, true); offset += 4;
  const segmentCount = view.getUint32(offset, true); offset += 4;
  const regionCount = view.getUint32(offset, true); offset += 4;

  const verticesEnd = 12 + vertexCount * 12;
  const segmentsEnd = verticesEnd + segmentCount * 28;
  if (verticesEnd > bytes.length) {
    throw new Error(
      `vertexCount ${vertexCount} runs past buffer: needs ${verticesEnd} bytes, have ${bytes.length}`,
    );
  }
  if (segmentsEnd > bytes.length) {
    throw new Error(
      `segmentCount ${segmentCount} runs past buffer: needs ${segmentsEnd} bytes, have ${bytes.length}`,
    );
  }

  const vertices: VectorNetworkVertex[] = [];
  for (let i = 0; i < vertexCount; i++) {
    const styleID = view.getUint32(offset, true); offset += 4;
    const x = view.getFloat32(offset, true); offset += 4;
    const y = view.getFloat32(offset, true); offset += 4;
    vertices.push({ x, y, styleID });
  }

  const segments: VectorNetworkSegment[] = [];
  for (let i = 0; i < segmentCount; i++) {
    const segmentOffset = offset;
    offset += 4; // word0 — meaning unknown, unused
    const startVertex = view.getUint32(offset, true); offset += 4;
    const tsx = view.getFloat32(offset, true); offset += 4;
    const tsy = view.getFloat32(offset, true); offset += 4;
    const endVertex = view.getUint32(offset, true); offset += 4;
    const tex = view.getFloat32(offset, true); offset += 4;
    const tey = view.getFloat32(offset, true); offset += 4;
    if (startVertex >= vertexCount) {
      throw new Error(
        `segment ${i} startVertex ${startVertex} out of range (vertexCount ${vertexCount}) at offset ${segmentOffset}`,
      );
    }
    if (endVertex >= vertexCount) {
      throw new Error(
        `segment ${i} endVertex ${endVertex} out of range (vertexCount ${vertexCount}) at offset ${segmentOffset}`,
      );
    }
    segments.push({
      start: { vertex: startVertex, dx: tsx, dy: tsy },
      end: { vertex: endVertex, dx: tex, dy: tey },
      isStraight: tsx === 0 && tsy === 0 && tex === 0 && tey === 0,
    });
  }

  const regions: VectorNetworkRegion[] = [];
  for (let r = 0; r < regionCount; r++) {
    if (offset + 8 > bytes.length) {
      throw new Error(
        `region ${r} header runs past buffer at offset ${offset} (have ${bytes.length} bytes)`,
      );
    }
    const packed = view.getUint32(offset, true); offset += 4;
    const numLoops = view.getUint32(offset, true); offset += 4;
    const windingRule: "NONZERO" | "ODD" = packed & 1 ? "NONZERO" : "ODD";
    const styleID = packed >> 1;

    const loops: number[][] = [];
    for (let l = 0; l < numLoops; l++) {
      if (offset + 4 > bytes.length) {
        throw new Error(
          `region ${r} loop ${l} segCount runs past buffer at offset ${offset} (have ${bytes.length} bytes)`,
        );
      }
      const segCount = view.getUint32(offset, true); offset += 4;
      if (offset + segCount * 4 > bytes.length) {
        throw new Error(
          `region ${r} loop ${l} declares ${segCount} segment indices, runs past buffer at offset ${offset} (have ${bytes.length} bytes)`,
        );
      }
      const loop: number[] = [];
      for (let s = 0; s < segCount; s++) {
        const segIndex = view.getUint32(offset, true); offset += 4;
        if (segIndex >= segmentCount) {
          throw new Error(
            `region ${r} loop ${l} segment index ${segIndex} out of range (segmentCount ${segmentCount})`,
          );
        }
        loop.push(segIndex);
      }
      loops.push(loop);
    }
    regions.push({ windingRule, styleID, loops });
  }

  if (offset !== bytes.length) {
    throw new Error(
      `trailing bytes: parsed ${offset} bytes but buffer is ${bytes.length} bytes long`,
    );
  }

  return { vertices, segments, regions, bytesConsumed: offset };
}

/** The geometry `encodeVectorNetwork` needs — a parsed network minus `bytesConsumed`. */
export type VectorNetworkInput = Pick<VectorNetwork, "vertices" | "segments" | "regions">;

/**
 * Encode structured vector-network geometry into a Figma `vectorNetworkBlob`.
 *
 * Emits the exact layout `parseVectorNetworkBlob` reads (which see for the field
 * table): 12-byte header; vertex `[styleID, x, y]`; segment `[word0,
 * startVertex, tsx, tsy, endVertex, tex, tey]`; region `[styleID<<1|windingRule,
 * numLoops, (segCount, indices)×numLoops]`. The vertex handle-mirroring word is
 * written back as parsed; the segment word0 is written as 0, the only value
 * observed in Figma-authored output. A Figma-authored blob decoded and re-encoded
 * here comes back byte-for-byte identical — the acceptance criterion verified by
 * the corpus round-trip test.
 */
export function encodeVectorNetwork(network: VectorNetworkInput): Uint8Array {
  let regionsByteLength = 0;
  for (const region of network.regions) {
    regionsByteLength += 8; // packed + numLoops
    for (const loop of region.loops) regionsByteLength += 4 + loop.length * 4;
  }
  const totalByteLength =
    12 + network.vertices.length * 12 + network.segments.length * 28 + regionsByteLength;

  const buffer = new ArrayBuffer(totalByteLength);
  const view = new DataView(buffer);
  let offset = 0;

  view.setUint32(offset, network.vertices.length, true); offset += 4;
  view.setUint32(offset, network.segments.length, true); offset += 4;
  view.setUint32(offset, network.regions.length, true); offset += 4;

  for (const vertex of network.vertices) {
    view.setUint32(offset, vertex.styleID, true); offset += 4;
    view.setFloat32(offset, vertex.x, true); offset += 4;
    view.setFloat32(offset, vertex.y, true); offset += 4;
  }

  for (const segment of network.segments) {
    view.setUint32(offset, 0, true); offset += 4; // word0 — 0 throughout Figma output
    view.setUint32(offset, segment.start.vertex, true); offset += 4;
    view.setFloat32(offset, segment.start.dx, true); offset += 4;
    view.setFloat32(offset, segment.start.dy, true); offset += 4;
    view.setUint32(offset, segment.end.vertex, true); offset += 4;
    view.setFloat32(offset, segment.end.dx, true); offset += 4;
    view.setFloat32(offset, segment.end.dy, true); offset += 4;
  }

  for (const region of network.regions) {
    const packed = (region.styleID << 1) | (region.windingRule === "NONZERO" ? 1 : 0);
    view.setUint32(offset, packed, true); offset += 4;
    view.setUint32(offset, region.loops.length, true); offset += 4;
    for (const loop of region.loops) {
      view.setUint32(offset, loop.length, true); offset += 4;
      for (const segmentIndex of loop) {
        view.setUint32(offset, segmentIndex, true); offset += 4;
      }
    }
  }

  return new Uint8Array(buffer, 0, offset);
}

function cloneStyleOverrides(styleOverrideTable: readonly VectorStyleOverride[] | undefined): VectorStyleOverride[] | undefined {
  if (!styleOverrideTable?.length) return undefined;
  return JSON.parse(JSON.stringify(styleOverrideTable));
}

function toCommands(input: VectorGeometryInput): VectorPathCommand[] {
  if (Array.isArray(input.commands) && input.commands.length > 0) {
    return input.commands.map((command) => ({ ...command }));
  }
  if (input.svgPath) return parseSVGPathData(input.svgPath);
  throw new Error("Vector geometry input requires either svgPath or commands");
}

export function appendVectorPayloadToDocument(
  doc: FigDocument,
  input: AppendVectorPayloadInput,
): AuthoredVectorPayload {
  const blobs: any[] = doc.message?.blobs ?? (doc.message.blobs = []);
  const normalizedWidth = input.normalizedWidth ?? input.width;
  const normalizedHeight = input.normalizedHeight ?? input.height;
  const scaleX = normalizedWidth === 0 ? 1 : input.width / normalizedWidth;
  const scaleY = normalizedHeight === 0 ? 1 : input.height / normalizedHeight;

  const fillPaths = (input.fillPaths ?? []).map(toCommands);
  const strokePaths = (input.strokePaths ?? []).map(toCommands);
  if (fillPaths.length === 0 && strokePaths.length === 0) {
    throw new Error("Vector payload requires at least one fill or stroke path");
  }

  const fillGeometry: GeometryRef[] = [];
  for (let i = 0; i < fillPaths.length; i++) {
    const bytes = encodeCommandsBlob(fillPaths[i], scaleX, scaleY);
    blobs.push({ bytes });
    const path = input.fillPaths?.[i];
    fillGeometry.push({
      windingRule: path?.windingRule ?? "NONZERO",
      commandsBlob: blobs.length - 1,
      styleID: path?.styleID ?? 0,
    });
  }

  const strokeGeometry: GeometryRef[] = [];
  for (let i = 0; i < strokePaths.length; i++) {
    const bytes = encodeCommandsBlob(strokePaths[i], scaleX, scaleY);
    blobs.push({ bytes });
    const path = input.strokePaths?.[i];
    strokeGeometry.push({
      windingRule: path?.windingRule ?? "NONZERO",
      commandsBlob: blobs.length - 1,
      styleID: path?.styleID ?? 0,
    });
  }

  const vectorNetworkBlob = encodeVectorNetworkBlob([...fillPaths, ...strokePaths]);
  blobs.push({ bytes: vectorNetworkBlob });

  return {
    fillGeometry,
    strokeGeometry,
    vectorData: {
      vectorNetworkBlob: blobs.length - 1,
      normalizedSize: { x: normalizedWidth, y: normalizedHeight },
      ...(cloneStyleOverrides(input.styleOverrideTable)?.length
        ? { styleOverrideTable: cloneStyleOverrides(input.styleOverrideTable) }
        : {}),
    },
  };
}

function getStyleOverrideTable(node: FigNode): StyleOverride[] {
  const table = node.vectorData?.styleOverrideTable;
  return Array.isArray(table) ? table : [];
}

function resolveFillPaints(node: FigNode, styleID: number): FigPaint[] | undefined {
  if (!styleID) return node.fillPaints;
  const override = getStyleOverrideTable(node).find((entry) => entry?.styleID === styleID);
  if (!override || !("fillPaints" in override)) return node.fillPaints;
  return override.fillPaints;
}

function resolveGeometry(
  doc: FigDocument,
  node: FigNode,
  geometry: GeometryRef[] | undefined,
  kind: "fill" | "stroke",
): ResolvedGeometryPath[] {
  if (!Array.isArray(geometry) || geometry.length === 0) return [];

  const resolved: Array<ResolvedGeometryPath | null> = geometry.map((entry) => {
      if (typeof entry?.commandsBlob !== "number") return null;
      const bytes = getBlobBytes(doc, entry.commandsBlob);
      if (!bytes) return null;
      const svgPath = geometryBlobToSVGPath(bytes);
      if (!svgPath) return null;

      const path: ResolvedGeometryPath = {
        blobIndex: entry.commandsBlob,
        commandsBlob: bytes,
        svgPath,
        windingRule: entry.windingRule,
        styleID: entry.styleID || 0,
        paints: kind === "fill" ? resolveFillPaints(node, entry.styleID || 0) : node.strokePaints,
      };

      return path;
    });

  return resolved.filter((entry): entry is ResolvedGeometryPath => entry !== null);
}

export function resolveVectorNodePaths(doc: FigDocument, node: FigNode): ResolvedVectorNodePaths {
  return {
    fill: resolveGeometry(doc, node, node.fillGeometry as GeometryRef[] | undefined, "fill"),
    stroke: resolveGeometry(doc, node, node.strokeGeometry as GeometryRef[] | undefined, "stroke"),
  };
}
