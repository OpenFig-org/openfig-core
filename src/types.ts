// ─── Primitives ──────────────────────────────────────────────────────────────

export interface FigGuid {
  sessionID: number;
  localID: number;
}

export interface FigColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface FigVector {
  x: number;
  y: number;
}

export interface FigTransform {
  m00: number;
  m01: number;
  m02: number;
  m10: number;
  m11: number;
  m12: number;
}

// ─── Paints ──────────────────────────────────────────────────────────────────

export interface FigGradientStop {
  color: FigColor;
  position: number;
  colorVar?: any;
}

export interface FigPaint {
  type: string;
  color?: FigColor;
  opacity?: number;
  visible?: boolean;
  blendMode?: string;
  stops?: FigGradientStop[];
  stopsVar?: FigGradientStop[];
  transform?: FigTransform;
  image?: {
    hash?: Uint8Array | string;
    [key: string]: any;
  };
  imageThumbnail?: {
    hash?: Uint8Array | string;
    [key: string]: any;
  };
}

// ─── Effects ─────────────────────────────────────────────────────────────────

/**
 * EffectType enum values from the Kiwi schema.
 *
 * | Value | Name              |
 * |-------|-------------------|
 * | 0     | INNER_SHADOW      |
 * | 1     | DROP_SHADOW       |
 * | 2     | FOREGROUND_BLUR   |
 * | 3     | BACKGROUND_BLUR   |
 * | 4     | REPEAT            |
 * | 5     | SYMMETRY          |
 * | 6     | GRAIN             |
 * | 7     | NOISE             |
 * | 8     | GLASS             |
 */
export type FigEffectType =
  | "INNER_SHADOW"
  | "DROP_SHADOW"
  | "FOREGROUND_BLUR"
  | "BACKGROUND_BLUR"
  | "REPEAT"
  | "SYMMETRY"
  | "GRAIN"
  | "NOISE"
  | "GLASS";

/**
 * An effect applied to a node (shadow, blur, etc.).
 * Maps to the Effect message in the Kiwi schema (42 fields).
 * Only the most commonly used fields are typed here; the rest
 * pass through via the catch-all index signature.
 */
export interface FigEffect {
  type: FigEffectType;
  color?: FigColor;
  offset?: FigVector;
  /** Blur radius. */
  radius?: number;
  /** Spread distance (shadows only). */
  spread?: number;
  visible?: boolean;
  blendMode?: string;
  /** When true the shadow renders behind the node (not clipped by it). */
  showShadowBehindNode?: boolean;
  /** Effect-level opacity (separate from color.a). */
  opacity?: number;
  /** Allow additional/future fields from the kiwi schema. */
  [key: string]: any;
}

// ─── Stroke alignment ────────────────────────────────────────────────────────

/** StrokeAlign enum: CENTER (0), INSIDE (1), OUTSIDE (2). */
export type FigStrokeAlign = "CENTER" | "INSIDE" | "OUTSIDE";

// ─── Layout ──────────────────────────────────────────────────────────────────

/** StackMode enum: NONE (0), HORIZONTAL (1), VERTICAL (2), GRID (3). */
export type FigStackMode = "NONE" | "HORIZONTAL" | "VERTICAL" | "GRID";

// ─── Text ────────────────────────────────────────────────────────────────────

export interface FigFontName {
  family?: string;
  style?: string;
  postScriptName?: string;
}

/** TextAlignHorizontal: LEFT (0), CENTER (1), RIGHT (2), JUSTIFIED (3). */
export type FigTextAlign = "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED";

// ─── Node ────────────────────────────────────────────────────────────────────

export interface FigNode {
  guid: FigGuid;
  type: string;
  name: string;
  phase?: string;
  parentIndex?: { guid: FigGuid; position: string };
  size?: FigVector;
  transform?: FigTransform;

  // ── Paints ──
  fillPaints?: FigPaint[];
  strokePaints?: FigPaint[];

  // ── Stroke ──
  strokeWeight?: number;
  strokeAlign?: FigStrokeAlign;

  // ── Shape ──
  cornerRadius?: number;
  opacity?: number;

  // ── Effects ──
  effects?: FigEffect[];

  // ── Text ──
  textData?: { characters: string; lines?: any[] };
  fontSize?: number;
  fontName?: FigFontName;
  textAlignHorizontal?: FigTextAlign;
  paragraphSpacing?: number;
  derivedTextData?: any;
  shapeWithTextType?: string;

  // ── Frame / Group ──
  /** True for group-like frames (Figma encodes groups as FRAME + resizeToFit). */
  resizeToFit?: boolean;
  /** Frame clips children when frameMaskDisabled is false (default). */
  frameMaskDisabled?: boolean;
  /** Auto-layout mode: HORIZONTAL, VERTICAL, GRID, or absent. */
  stackMode?: FigStackMode;
  stackPrimarySizing?: string;
  stackCounterSizing?: string;

  /** Allow additional fields from the kiwi schema. */
  [key: string]: any;
}

// ─── Document ────────────────────────────────────────────────────────────────

export interface FigDocument {
  header: { prelude: string; version: number };
  nodes: FigNode[];
  nodeMap: Map<string, FigNode>;
  childrenMap: Map<string, FigNode[]>;
  /** Decoded kiwi binary schema (needed for re-encoding). */
  schema: any;
  /** Compiled kiwi schema with encodeMessage/decodeMessage (needed for re-encoding). */
  compiledSchema: any;
  /** Raw length-prefixed chunks from the binary (chunks[2+] are passed through on re-encode). */
  rawChunks: Uint8Array[];
  /** Full decoded kiwi message (contains nodeChanges, blobs, etc. — needed for re-encoding). */
  message: any;
  meta?: Record<string, any>;
  thumbnail?: Uint8Array;
  images: Map<string, Uint8Array>;
}
