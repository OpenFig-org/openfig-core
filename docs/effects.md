# Effects

Effects are visual modifications applied to nodes — shadows, blurs, and
procedural effects. Stored as an array on `node.effects`.

## Data model

```typescript
interface FigEffect {
  type: FigEffectType;
  color?: FigColor;          // {r, g, b, a} — 0–1 floats
  offset?: FigVector;        // {x, y} — pixel offset (shadows only)
  radius?: number;           // blur radius
  spread?: number;           // spread distance (shadows only)
  visible?: boolean;         // toggle effect on/off
  blendMode?: string;        // "NORMAL", "MULTIPLY", etc.
  showShadowBehindNode?: boolean;
  opacity?: number;          // effect-level opacity (separate from color.a)
}
```

Full type definitions: [`src/types.ts`](../src/types.ts) — `FigEffect`,
`FigEffectType`.

## Effect types

| Type | Kiwi value | Description |
|------|-----------|-------------|
| `DROP_SHADOW` | 1 | Outer shadow behind the node |
| `INNER_SHADOW` | 0 | Inset shadow inside the node |
| `FOREGROUND_BLUR` | 2 | Gaussian blur on the node itself |
| `BACKGROUND_BLUR` | 3 | Blur of content behind the node |
| `REPEAT` | 4 | Repeat/tile effect |
| `SYMMETRY` | 5 | Mirror/symmetry |
| `GRAIN` | 6 | Film grain texture |
| `NOISE` | 7 | Noise texture |
| `GLASS` | 8 | Glass refraction |

## Drop shadow example

From a real `.fig` export:

```json
{
  "type": "DROP_SHADOW",
  "offset": { "x": 3, "y": 19 },
  "radius": 29.5,
  "spread": 0,
  "color": { "r": 0, "g": 0, "b": 0, "a": 0.25 },
  "visible": true,
  "blendMode": "NORMAL",
  "showShadowBehindNode": false
}
```

## Multiple effects

A single node can have multiple effects. They are rendered in array order
(first = bottom). Example: a card with both a subtle ambient shadow and a
stronger key shadow:

```json
"effects": [
  { "type": "DROP_SHADOW", "offset": {"x": 0, "y": 1}, "radius": 3, "spread": 0, "color": {"r":0,"g":0,"b":0,"a":0.12}, "visible": true },
  { "type": "DROP_SHADOW", "offset": {"x": 0, "y": 8}, "radius": 24, "spread": 0, "color": {"r":0,"g":0,"b":0,"a":0.15}, "visible": true }
]
```

## Encoding notes

- Effects roundtrip through the kiwi encoder as field 43 on `NodeChange`.
- The `visible` flag controls whether an effect is active. Set to `false`
  to disable without removing — Figma preserves disabled effects.
- The `blendMode` field defaults to `"NORMAL"`. See the BlendMode enum in
  the kiwi schema for all 19 values.
- `showShadowBehindNode` controls whether the shadow renders behind the
  node's fill or is clipped by it. Default `false` means the shadow is
  only visible outside the node bounds.

## Text effects

Text nodes support the same effects array. In Figma's UI, DROP_SHADOW on
text follows the glyph outlines (not the bounding box). Text nodes can
also have stroke paints (`strokePaints`) which render as an outline around
the letterforms — see [`text.md`](text.md) for stroke alignment details.

## Rendering

| Effect | Konva (shapes) | CSS (text overlays) |
|--------|----------------|---------------------|
| `DROP_SHADOW` | `shadowColor`, `shadowBlur`, `shadowOffsetX/Y`, `shadowOpacity` | `filter: drop-shadow(x y blur color)` |
| `INNER_SHADOW` | Not yet supported | Not yet supported |
| `*_BLUR` | Not yet supported | `filter: blur(radius)` possible |
