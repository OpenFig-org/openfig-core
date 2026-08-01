export { parseFig, parseFigBinary } from "./parser.js";
export { encodeFigParts, assembleCanvasFig, createFigZip } from "./encoder.js";
export { convertDeckToFig } from "./convert.js";
export { createEmptyFigDoc } from "./template.js";
export { nodeId } from "./utils.js";
export { extractRenderableGradientFill, resolveGradientGeometry } from "./gradient.js";
export {
  appendVectorPayloadToDocument,
  encodeCommandsBlob,
  encodeVectorNetwork,
  encodeVectorNetworkBlob,
  geometryBlobToSVGPath,
  getBlobBytes,
  parseSVGPathData,
  parseVectorNetworkBlob,
  resolveVectorNodePaths,
} from "./vector.js";
export { hexToFigColor, parseCssRgbColor, cssColorToFigColor, makeSolidPaint } from "./color.js";
export { serializeSvgPathData, transformSvgPathData, mapStrokeJoin, mapStrokeCap } from "./svgPath.js";
export type { FigDocument, FigNode, FigPaint, FigGuid, FigColor, FigTransform, FigGradientStop } from "./types.js";
export type { EncodedFigParts, AssembleCanvasFigInput, CreateFigZipInput } from "./encoder.js";
export type { ConvertOptions } from "./convert.js";
export type {
  GradientFillLike,
  GradientKind,
  GradientPoint,
  RenderableGradientFill,
  ResolvedGradientGeometry,
  ResolvedLinearGradientGeometry,
  ResolvedRadialGradientGeometry,
} from "./gradient.js";
export type {
  AppendVectorPayloadInput,
  AuthoredVectorPayload,
  ResolvedGeometryPath,
  ResolvedVectorNodePaths,
  VectorGeometryInput,
  VectorNetwork,
  VectorNetworkInput,
  VectorNetworkRegion,
  VectorNetworkSegment,
  VectorNetworkVertex,
  VectorPathCommand,
  VectorStyleOverride,
} from "./vector.js";
