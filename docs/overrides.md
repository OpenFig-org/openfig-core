# Symbol Overrides

Component instances customize their content through `symbolData.symbolOverrides` —
an array of override objects. Each override targets a specific node inside the symbol
by its `overrideKey` (not its `guid`).

## overrideKey vs guid

Every overrideable node inside a SYMBOL has an `overrideKey` field — a
`{ sessionID, localID }` object that is **different from the node's guid**. When
writing overrides on an INSTANCE, the `guidPath.guids` array must reference
`overrideKey` values, not `guid` values.

## Text Override

```javascript
{
  guidPath: {
    guids: [{ sessionID: 57, localID: 48 }]  // overrideKey of target TEXT node
  },
  textData: {
    characters: "New text content"
  }
}
```

Rules:
- Only include `characters` in `textData` — never include a `lines` array (wrong entry count crashes Figma)
- Never use empty string `''` — use `' '` (space) for blank fields. Empty string crashes Figma.

## Nested Text Override

For text inside a nested instance (e.g., a quote component inside a grid component):

```javascript
{
  guidPath: {
    guids: [
      { sessionID: 97, localID: 134 },  // overrideKey of the nested INSTANCE
      { sessionID: 97, localID: 117 }   // overrideKey of the TEXT inside it
    ]
  },
  textData: {
    characters: "Nested text content"
  }
}
```

## Image Override

Overriding an image fill on a ROUNDED_RECTANGLE placeholder:

```javascript
{
  styleIdForFill: {
    guid: {
      sessionID: 4294967295,  // 0xFFFFFFFF — sentinel value, REQUIRED
      localID: 4294967295     // 0xFFFFFFFF — sentinel value, REQUIRED
    }
  },
  guidPath: {
    guids: [{ sessionID: 75, localID: 126 }]  // overrideKey of image placeholder
  },
  fillPaints: [{
    type: 'IMAGE',
    opacity: 1,
    visible: true,
    blendMode: 'NORMAL',
    transform: {
      m00: 1, m01: 0, m02: 0,   // 2D affine transform (identity = no transform)
      m10: 0, m11: 1, m12: 0
    },
    image: {
      hash: Uint8Array(20),       // SHA-1 hash of full image (20 bytes)
      name: "hex-sha1-string"     // 40-char hex representation
    },
    imageThumbnail: {
      hash: Uint8Array(20),       // SHA-1 hash of thumbnail (~320px PNG)
      name: "hex-sha1-string"
    },
    animationFrame: 0,
    imageScaleMode: 'FILL',       // FILL, FIT, CROP, TILE
    imageShouldColorManage: false,
    rotation: 0,
    scale: 0.5,
    originalImageWidth: 1011,     // Pixel dimensions of original image
    originalImageHeight: 621,
    thumbHash: new Uint8Array(0), // MUST be Uint8Array, not {}
    altText: ''
  }]
}
```

**Critical requirements:**

1. **`styleIdForFill`** — The sentinel GUID `0xFFFFFFFF:0xFFFFFFFF` tells Figma to detach the fill from any library style and use the override instead. Without this, Figma silently ignores the entire `fillPaints` override.

2. **`imageThumbnail`** — Must reference a real PNG file (~320px wide) stored in the `images/` directory. Without a valid thumbnail, the image doesn't render.

3. **`thumbHash`** — Must be `new Uint8Array(0)`. Using a plain object `{}` causes a kiwi-schema encoding error.

4. **Image files** — Both the full image and thumbnail must exist in the `images/` directory, named by their SHA-1 hash (no extension).

---

## nodeGenerationData Overrides

Some node types (SHAPE_WITH_TEXT, TABLE) store their visual properties in
`nodeGenerationData.overrides` instead of top-level fields. Each override
is addressed by a `guidPath` using virtual IDs with `sessionID: 40000000`.

### SHAPE_WITH_TEXT

See [shapes.md](shapes.md) for full structure. Key overrides:

| guidPath | Purpose |
|----------|---------|
| `40000000:0` | Shape fill (fillPaints, stroke, effects) |
| `40000000:1` | Text style (fillPaints = text color, font settings) |

**Important:** `setFill()` on a SHAPE_WITH_TEXT must modify
`overrides[0].fillPaints`, NOT top-level `fillPaints`.

### TABLE

See [shapes.md](shapes.md) for full structure. Key overrides:

| guidPath | Purpose |
|----------|---------|
| `40000000:0 > rowID > colID` | Per-cell background fill (optional) |
| `40000000:1 > rowID > colID` | Per-cell text content |
| `40000000:2` | Default cell style (fill = cell background color) |
| `40000000:3` | Default text style (fill = text color) |

Row/column IDs are `{ sessionID: 1, localID: N }` GUIDs assigned when creating
the table. They are referenced in `tableRowPositions` and `tableColumnPositions`.
