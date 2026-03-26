import type { FigGradientStop, FigPaint, FigTransform } from "./types.js";

export type GradientKind = "linear" | "radial";

export interface GradientFillLike {
  type: GradientKind;
  transform: FigTransform;
}

export interface RenderableGradientFill extends GradientFillLike {
  opacity: number;
  stops: FigGradientStop[];
}

export interface GradientPoint {
  x: number;
  y: number;
}

export interface ResolvedLinearGradientGeometry {
  type: "linear";
  start: GradientPoint;
  end: GradientPoint;
}

export interface ResolvedRadialGradientGeometry {
  type: "radial";
  center: GradientPoint;
  radiusX: number;
  radiusY: number;
  angle: number;
}

export type ResolvedGradientGeometry =
  | ResolvedLinearGradientGeometry
  | ResolvedRadialGradientGeometry;

const IDENTITY_TRANSFORM: FigTransform = {
  m00: 1,
  m01: 0,
  m02: 0,
  m10: 0,
  m11: 1,
  m12: 0,
};

function cloneTransform(transform?: FigTransform): FigTransform {
  if (!transform) return { ...IDENTITY_TRANSFORM };
  return {
    m00: transform.m00,
    m01: transform.m01,
    m02: transform.m02,
    m10: transform.m10,
    m11: transform.m11,
    m12: transform.m12,
  };
}

function isRenderableGradientPaint(
  paint: FigPaint | null | undefined,
): paint is FigPaint & { type: "GRADIENT_LINEAR" | "GRADIENT_RADIAL"; stops: FigGradientStop[] } {
  return !!paint &&
    paint.visible !== false &&
    (paint.type === "GRADIENT_LINEAR" || paint.type === "GRADIENT_RADIAL") &&
    Array.isArray(paint.stops) &&
    paint.stops.length > 0;
}

export function extractRenderableGradientFill(
  paints: FigPaint[] | null | undefined,
): RenderableGradientFill | null {
  const paint = paints?.find((entry) => isRenderableGradientPaint(entry));
  if (!paint) return null;

  return {
    type: paint.type === "GRADIENT_LINEAR" ? "linear" : "radial",
    opacity: paint.opacity ?? 1,
    transform: cloneTransform(paint.transform),
    stops: [...paint.stops]
      .sort((a, b) => a.position - b.position)
      .map((stop) => ({
        position: stop.position,
        color: { ...stop.color },
        colorVar: stop.colorVar,
      })),
  };
}

export function resolveGradientGeometry(
  fill: GradientFillLike,
  width: number,
  height: number,
): ResolvedGradientGeometry | null {
  if (width <= 0 || height <= 0) return null;

  const transform = fill.transform ?? IDENTITY_TRANSFORM;
  const { m00, m01, m02, m10, m11, m12 } = transform;
  const det = m00 * m11 - m10 * m01;
  if (Math.abs(det) < 1e-12) return null;

  // Figma stores paint.transform as node-space -> gradient-space.
  // Consumers usually need the inverse: gradient-space -> node-space.
  const ia = m11 / det;
  const ic = -m01 / det;
  const ie = (m01 * m12 - m11 * m02) / det;
  const ib = -m10 / det;
  const iid = m00 / det;
  const iif = (m10 * m02 - m00 * m12) / det;

  const point = (gx: number, gy: number): GradientPoint => ({
    x: (ia * gx + ic * gy + ie) * width,
    y: (ib * gx + iid * gy + iif) * height,
  });

  if (fill.type === "linear") {
    return {
      type: "linear",
      start: point(0, 0.5),
      end: point(1, 0.5),
    };
  }

  const center = point(0.5, 0.5);
  const xAxisPoint = point(1, 0.5);
  const yAxisPoint = point(0.5, 1);

  return {
    type: "radial",
    center,
    radiusX: Math.hypot(xAxisPoint.x - center.x, xAxisPoint.y - center.y),
    radiusY: Math.hypot(yAxisPoint.x - center.x, yAxisPoint.y - center.y),
    angle: Math.atan2(xAxisPoint.y - center.y, xAxisPoint.x - center.x),
  };
}
