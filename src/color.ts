/**
 * CSS / hex color ↔ Figma normalized RGBA color helpers.
 *
 * All functions are isomorphic (no DOM required).
 * For named CSS colors (e.g. "coral"), pass an optional `resolveNamed`
 * callback that uses the browser's computed-style machinery.
 */

import type { FigColor, FigPaint } from "./types.js";

export function hexToFigColor(hex: string): FigColor {
  if (!hex || hex === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  const a = h.length >= 8 ? parseInt(h.substring(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

export function parseCssRgbColor(value: string): FigColor | null {
  const match = value.trim().match(/^rgba?\((.+)\)$/i);
  if (!match) return null;
  const parts = match[1].split(",").map((part) => part.trim());
  if (parts.length < 3) return null;
  const r = Number.parseFloat(parts[0]);
  const g = Number.parseFloat(parts[1]);
  const b = Number.parseFloat(parts[2]);
  const a = parts.length >= 4 ? Number.parseFloat(parts[3]) : 1;
  if ([r, g, b, a].some((n) => Number.isNaN(n))) return null;
  return { r: r / 255, g: g / 255, b: b / 255, a };
}

export function cssColorToFigColor(
  value: string,
  resolveNamed?: (name: string) => FigColor | null,
): FigColor {
  const trimmed = value.trim();
  if (trimmed === "transparent" || trimmed === "none") return { r: 0, g: 0, b: 0, a: 0 };
  if (trimmed.startsWith("#")) return hexToFigColor(trimmed);
  const rgba = parseCssRgbColor(trimmed);
  if (rgba) return rgba;

  if (resolveNamed) {
    const resolved = resolveNamed(trimmed);
    if (resolved) return resolved;
  }

  throw new Error(`Unsupported CSS color: ${value}`);
}

export function makeSolidPaint(
  fill: string,
  resolveNamed?: (name: string) => FigColor | null,
): FigPaint {
  const color = cssColorToFigColor(fill, resolveNamed);
  return {
    type: "SOLID",
    color: { r: color.r, g: color.g, b: color.b, a: 1 },
    opacity: color.a,
    visible: true,
    blendMode: "NORMAL",
  };
}
