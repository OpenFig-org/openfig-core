# Color Variables (Light Slides theme)

Figma Slides ships a built-in `VARIABLE_SET "Light slides"` in every deck.
These variables are referenced by `colorVar.value.alias.guid` in `fillPaints`.

When using raw RGB, `colorVar` can be **omitted entirely**.
When binding to a theme color, reference the variable by GUID.

Variable GUIDs are consistent within a deck (always `sessionID: 1`).

## Color Palette

| Name | GUID | Hex | r | g | b |
|------|------|-----|---|---|---|
| Pale Purple | 1:11 | #7F699B | 0.498 | 0.412 | 0.608 |
| Violet | 1:12 | #3D38F5 | 0.239 | 0.220 | 0.961 |
| Pale Blue | 1:13 | #667799 | 0.400 | 0.467 | 0.600 |
| Blue | 1:14 | #0C8CE9 | 0.047 | 0.549 | 0.914 |
| Pale Teal | 1:15 | #518394 | 0.318 | 0.514 | 0.580 |
| Teal | 1:16 | #0887A0 | 0.031 | 0.529 | 0.627 |
| Pale Green | 1:17 | #678E79 | 0.404 | 0.557 | 0.475 |
| Green | 1:18 | #198F51 | 0.098 | 0.561 | 0.318 |
| Pale Yellow | 1:19 | #AD7F00 | 0.678 | 0.498 | 0.000 |
| Pale Persimmon | 1:20 | #D4693B | 0.831 | 0.412 | 0.231 |
| Persimmon | 1:21 | #F65009 | 0.965 | 0.314 | 0.035 |
| Red | 1:22 | #E03E1A | 0.878 | 0.243 | 0.102 |
| Pale Pink | 1:23 | #AB5998 | 0.671 | 0.349 | 0.596 |
| Pale Red | 1:24 | #D4583B | 0.831 | 0.345 | 0.231 |
| Pink | 1:25 | #F316B0 | 0.953 | 0.086 | 0.690 |
| Grey | 1:26 | #CFCFCF | 0.813 | 0.813 | 0.813 |
| White | 1:27 | #FFFFFF | 1.000 | 1.000 | 1.000 |
| Color 3 | 1:28 | #000000 | 0.000 | 0.000 | 0.000 |
| Orange | 1:29 | #DE7D02 | 0.871 | 0.490 | 0.008 |
| Pale Violet | 1:30 | #6A699B | 0.416 | 0.412 | 0.608 |
| Yellow | 1:31 | #F3C11B | 0.953 | 0.757 | 0.106 |
| Purple | 1:32 | #8A38F5 | 0.541 | 0.220 | 0.961 |
| Black | 1:33 | #000000 | 0.000 | 0.000 | 0.000 |

> Note: `Color 3` and `Black` both resolve to `#000000`.
> GUIDs above are from the "Light slides" variable set and are consistent across decks
> that use this theme. A second duplicate set exists at higher localIDs (1:48–1:81) —
> these appear to be a copy; the first set (1:11–1:33) is the canonical one.

## Usage in fillPaints

```javascript
fillPaints: [{
  type: 'SOLID',
  color: { r: 0.047, g: 0.549, b: 0.914, a: 1 },  // actual RGB values
  opacity: 1,
  visible: true,
  blendMode: 'NORMAL',
  colorVar: {
    value: { alias: { guid: { sessionID: 1, localID: 14 } } },  // "Blue"
    dataType: 'ALIAS',
    resolvedDataType: 'COLOR'
  }
}]
```

When `colorVar` is present, the `color` field still holds the resolved RGB values.
Omitting `colorVar` and providing only `color` works for raw RGB fills.

## Color Conversion API

Exported from `openfig-core/src/color.ts`. All functions are isomorphic (no DOM required).

### `hexToFigColor(hex: string): FigColor`

Converts a hex color string to a Figma normalized RGBA color.
Supports `#RRGGBB` and `#RRGGBBAA` formats. Returns fully transparent black for
`"transparent"` or falsy input.

```typescript
import { hexToFigColor } from "openfig-core";

hexToFigColor("#0C8CE9");
// → { r: 0.047, g: 0.549, b: 0.914, a: 1 }

hexToFigColor("#0C8CE980");
// → { r: 0.047, g: 0.549, b: 0.914, a: 0.502 }
```

### `parseCssRgbColor(value: string): FigColor | null`

Parses an `rgb()` or `rgba()` CSS function string into a Figma color.
Returns `null` if the string is not a valid `rgb()`/`rgba()` expression.

```typescript
import { parseCssRgbColor } from "openfig-core";

parseCssRgbColor("rgb(12, 140, 233)");
// → { r: 0.047, g: 0.549, b: 0.914, a: 1 }

parseCssRgbColor("rgba(12, 140, 233, 0.5)");
// → { r: 0.047, g: 0.549, b: 0.914, a: 0.5 }

parseCssRgbColor("not-a-color");
// → null
```

### `cssColorToFigColor(value: string, resolveNamed?: (name: string) => FigColor | null): FigColor`

Converts any supported CSS color string to a Figma color. Handles `"transparent"`,
`"none"`, hex strings, and `rgb()`/`rgba()`. For named CSS colors (e.g. `"coral"`),
pass an optional `resolveNamed` callback. Throws if the color cannot be resolved.

```typescript
import { cssColorToFigColor } from "openfig-core";

cssColorToFigColor("#0C8CE9");
// → { r: 0.047, g: 0.549, b: 0.914, a: 1 }

cssColorToFigColor("rgb(12, 140, 233)");
// → { r: 0.047, g: 0.549, b: 0.914, a: 1 }

cssColorToFigColor("transparent");
// → { r: 0, g: 0, b: 0, a: 0 }
```

### `makeSolidPaint(fill: string, resolveNamed?: (name: string) => FigColor | null): FigPaint`

Creates a complete Figma `SOLID` paint object from a CSS color string. Uses
`cssColorToFigColor` internally. The alpha channel from the parsed color is mapped
to the paint's `opacity` field (the color itself is always `a: 1`).

```typescript
import { makeSolidPaint } from "openfig-core";

makeSolidPaint("#0C8CE9");
// → {
//     type: "SOLID",
//     color: { r: 0.047, g: 0.549, b: 0.914, a: 1 },
//     opacity: 1,
//     visible: true,
//     blendMode: "NORMAL"
//   }

makeSolidPaint("rgba(12, 140, 233, 0.5)");
// → { type: "SOLID", color: { r: 0.047, g: 0.549, b: 0.914, a: 1 },
//     opacity: 0.5, visible: true, blendMode: "NORMAL" }
```
