import { describe, expect, it } from "vitest";
import { extractRenderableGradientFill, resolveGradientGeometry } from "./gradient.js";

describe("gradient helpers", () => {
  it("extracts the first visible linear or radial gradient fill", () => {
    const gradient = extractRenderableGradientFill([
      { type: "SOLID", visible: true, color: { r: 0, g: 0, b: 0, a: 1 } },
      {
        type: "GRADIENT_RADIAL",
        visible: true,
        opacity: 0.75,
        transform: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 },
        stops: [
          { position: 1, color: { r: 1, g: 1, b: 1, a: 1 } },
          { position: 0, color: { r: 0, g: 0, b: 0, a: 1 } },
        ],
      },
    ] as any);

    expect(gradient).toEqual({
      type: "radial",
      opacity: 0.75,
      transform: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 },
      stops: [
        { position: 0, color: { r: 0, g: 0, b: 0, a: 1 }, colorVar: undefined },
        { position: 1, color: { r: 1, g: 1, b: 1, a: 1 }, colorVar: undefined },
      ],
    });
  });

  it("projects identity linear gradients across the object width", () => {
    const geometry = resolveGradientGeometry(
      {
        type: "linear",
        transform: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 },
      },
      200,
      100,
    );

    expect(geometry).toEqual({
      type: "linear",
      start: { x: 0, y: 50 },
      end: { x: 200, y: 50 },
    });
  });

  it("projects Figma radial gradients by inverting the paint transform", () => {
    const geometry = resolveGradientGeometry(
      {
        type: "radial",
        transform: {
          m00: 1.0966411898215888e-7,
          m01: 0.47619009017944336,
          m02: 0.2618864178657532,
          m10: -0.5331276059150696,
          m11: 3.383730206951965e-8,
          m12: 0.7665637731552124,
        },
      },
      1200,
      630,
    );

    expect(geometry?.type).toBe("radial");
    if (!geometry || geometry.type !== "radial") return;

    expect(geometry.center.x).toBeCloseTo(600, 3);
    expect(geometry.center.y).toBeCloseTo(315.024, 3);
    expect(geometry.radiusX).toBeCloseTo(661.501, 3);
    expect(geometry.radiusY).toBeCloseTo(1125.434, 3);
    expect(geometry.angle).toBeCloseTo(Math.PI / 2, 4);
  });
});
