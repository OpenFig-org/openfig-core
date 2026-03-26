import type { FigDocument, FigNode, FigPaint } from "./types.js";

const CMD_CLOSE = 0;
const CMD_MOVE_TO = 1;
const CMD_LINE_TO = 2;
const CMD_CUBIC_TO = 4;
const SEGMENT_LINE = 0;
const SEGMENT_CUBIC = 4;
const DEFAULT_HANDLE_MIRRORING = 4;

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

export function encodeVectorNetworkBlob(pathCommandsList: readonly (readonly VectorPathCommand[])[]): Uint8Array {
  const vertices: Array<{ x: number; y: number }> = [];
  const segments: Array<{ s: number; tsx: number; tsy: number; e: number; tex: number; tey: number; t: number }> = [];
  const regions: number[][] = [];

  for (const pathCommands of pathCommandsList) {
    let regionSegments: number[] = [];
    let firstVertex = -1;
    let prevVertex = -1;
    let prevX = 0;
    let prevY = 0;

    for (const command of pathCommands) {
      if (command.type === "M") {
        // Each sub-path (M...Z sequence) becomes its own region so Figma
        // strokes compound paths correctly (e.g. counter holes in letters).
        if (regionSegments.length > 0) {
          regions.push(regionSegments);
          regionSegments = [];
        }
        const vertexIndex = vertices.length;
        vertices.push({ x: command.x, y: command.y });
        firstVertex = vertexIndex;
        prevVertex = vertexIndex;
        prevX = command.x;
        prevY = command.y;
      } else if (command.type === "L") {
        const vertexIndex = vertices.length;
        vertices.push({ x: command.x, y: command.y });
        if (prevVertex >= 0) {
          regionSegments.push(segments.length);
          segments.push({ s: prevVertex, tsx: 0, tsy: 0, e: vertexIndex, tex: 0, tey: 0, t: SEGMENT_LINE });
        }
        prevVertex = vertexIndex;
        prevX = command.x;
        prevY = command.y;
      } else if (command.type === "C") {
        const vertexIndex = vertices.length;
        vertices.push({ x: command.x, y: command.y });
        if (prevVertex >= 0) {
          regionSegments.push(segments.length);
          segments.push({
            s: prevVertex,
            tsx: command.c1x - prevX,
            tsy: command.c1y - prevY,
            e: vertexIndex,
            tex: command.c2x - command.x,
            tey: command.c2y - command.y,
            t: SEGMENT_CUBIC,
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
            if (lastSeg && lastSeg.e === prevVertex) {
              lastSeg.e = firstVertex;
              vertices.pop();
            }
          } else {
            regionSegments.push(segments.length);
            segments.push({ s: prevVertex, tsx: 0, tsy: 0, e: firstVertex, tex: 0, tey: 0, t: SEGMENT_LINE });
          }
        }
        if (firstVertex >= 0) {
          prevVertex = firstVertex;
          prevX = vertices[firstVertex].x;
          prevY = vertices[firstVertex].y;
        }
      }
    }

    regions.push(regionSegments);
  }

  let regionsByteLength = 0;
  for (const region of regions) regionsByteLength += 4 + 4 + (region.length * 4) + 4;
  const totalByteLength = 16 + (vertices.length * 12) + (segments.length * 28) + regionsByteLength;

  const buffer = new ArrayBuffer(totalByteLength);
  const view = new DataView(buffer);
  let offset = 0;

  view.setUint32(offset, vertices.length, true); offset += 4;
  view.setUint32(offset, segments.length, true); offset += 4;
  view.setUint32(offset, regions.length, true); offset += 4;
  view.setUint32(offset, 1, true); offset += 4;

  for (const vertex of vertices) {
    view.setFloat32(offset, vertex.x, true); offset += 4;
    view.setFloat32(offset, vertex.y, true); offset += 4;
    view.setUint32(offset, DEFAULT_HANDLE_MIRRORING, true); offset += 4;
  }

  for (const segment of segments) {
    view.setUint32(offset, segment.s, true); offset += 4;
    view.setFloat32(offset, segment.tsx, true); offset += 4;
    view.setFloat32(offset, segment.tsy, true); offset += 4;
    view.setUint32(offset, segment.e, true); offset += 4;
    view.setFloat32(offset, segment.tex, true); offset += 4;
    view.setFloat32(offset, segment.tey, true); offset += 4;
    view.setUint32(offset, segment.t, true); offset += 4;
  }

  for (const region of regions) {
    view.setUint32(offset, 1, true); offset += 4;
    view.setUint32(offset, region.length, true); offset += 4;
    for (const segmentIndex of region) {
      view.setUint32(offset, segmentIndex, true); offset += 4;
    }
    view.setUint32(offset, 1, true); offset += 4;
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
