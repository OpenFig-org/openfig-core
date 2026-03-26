# Slide Management

## Slide Dimensions

Standard slide size: **1920×1080** (stored on SLIDE node `size` field).
SLIDE_GRID is 2400×1560.

## Cloning Slides

To duplicate a slide from a template:

1. **Deep-clone** the SLIDE node and its INSTANCE child (use `Uint8Array`-safe cloning, not `JSON.parse/stringify`)
2. Assign **new unique GUIDs** (increment beyond `maxLocalID()`)
3. Set `phase: 'CREATED'` on both
4. Set **parentIndex** — SLIDE parent is the SLIDE_ROW, INSTANCE parent is the new SLIDE
5. Set **symbolData** on the instance with the target SYMBOL's ID and fresh `symbolOverrides`
6. **Delete cached fields:**
   - `derivedSymbolData`
   - `derivedSymbolDataLayoutVersion`
   - `slideThumbnailHash`
   - `editInfo`
   - `prototypeInteractions`
7. Set slide **transform** (x position = slide_index × 2160 for standard spacing)
8. Push both nodes to `nodeChanges`

## Slide Ordering

Slides are ordered by their `parentIndex.position` character within the SLIDE_ROW.
Use sequential ASCII starting from `!` (0x21).

## Removing Slides

Set `phase: 'REMOVED'` on the SLIDE node. Never filter it from `nodeChanges`.
