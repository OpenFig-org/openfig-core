# Node Structure

Every node in `nodeChanges` has this shape:

```javascript
{
  guid: { sessionID: number, localID: number },
  type: "SLIDE",           // Node type string
  name: "Slide Name",      // Human-readable label
  phase: "CREATED",        // Lifecycle state (optional)
  parentIndex: {
    guid: { sessionID, localID },  // Parent node's GUID
    position: "!"                   // Sibling sort order
  },
  // ... type-specific fields
}
```

## guid

Every node has a globally unique identifier: `{ sessionID, localID }`. Typically formatted as `"sessionID:localID"` (e.g., `"1:1559"`).

When creating new nodes, use `sessionID: 1` and increment `localID` beyond the current maximum in the document.

## nodeId() utility

`nodeId(node)` returns the string form of a node's GUID — `"sessionID:localID"` (e.g., `"1:1559"`). Returns `null` if the node has no `guid`.

```javascript
import { nodeId } from "openfig-core";

const id = nodeId(node); // "1:1559"
```

Use `nodeId()` whenever you need a stable string key for a node — map lookups, comparisons, logging, or passing IDs to CLI commands like `--slide`. Avoid hand-formatting `guid.sessionID + ":" + guid.localID`; the utility handles missing GUIDs gracefully.

## type

Known node types:

| Type | Description |
|------|-------------|
| `DOCUMENT` | Root node (always `0:0`) |
| `CANVAS` | Page / canvas |
| `SLIDE_GRID` | Container for all slides |
| `SLIDE_ROW` | Row container within the grid |
| `MODULE` | Published template wrapper for a slide |
| `SLIDE` | Individual slide |
| `INSTANCE` | Component instance referencing a SYMBOL |
| `SYMBOL` | Component definition (reusable template) |
| `COMPONENT_SET` | Set of component variants |
| `TEXT` | Text node — see [text.md](text.md) |
| `RECTANGLE` | Rectangle shape |
| `ROUNDED_RECTANGLE` | Basic rectangle — see [shapes.md](shapes.md) |
| `SHAPE_WITH_TEXT` | Shape from "shape" tool — see [shapes.md](shapes.md) |
| `ELLIPSE` | Ellipse shape |
| `TABLE` | Table node — see [shapes.md](shapes.md) |
| `VECTOR` | Vector path — see [shapes.md](shapes.md) |
| `LINE` | Line — see [shapes.md](shapes.md) |
| `GROUP` | Group container |
| `FRAME` | Frame / auto-layout container — see [shapes.md](shapes.md) |
| `BOOLEAN_GROUP` | Boolean operation group |
| `POLYGON` | Polygon shape |
| `STAR` | Star shape |
| `VARIABLE_SET` | Design token set — see [colors.md](colors.md) |
| `VARIABLE` | Design token — see [colors.md](colors.md) |

Note: some real Figma-exported `.fig` files serialize visible product-level
groups as frame-like `FRAME` nodes rather than raw `GROUP`. See
[containers.md](containers.md).

## Common cross-cutting fields

These fields can appear on any visual node type:

| Field | Type | Description |
|-------|------|-------------|
| `fillPaints` | `FigPaint[]` | Fill paints — see [gradients.md](gradients.md), [images.md](images.md) |
| `strokePaints` | `FigPaint[]` | Stroke paints |
| `strokeWeight` | `number` | Stroke width in pixels |
| `strokeAlign` | `CENTER \| INSIDE \| OUTSIDE` | Stroke alignment relative to path |
| `effects` | `FigEffect[]` | Shadows, blurs, etc. — see [effects.md](effects.md) |
| `opacity` | `number` | Node opacity (0–1) |
| `cornerRadius` | `number` | Corner radius for rectangles/frames |

## phase

| Value | Meaning |
|-------|---------|
| `undefined` | Existing unmodified node |
| `'CREATED'` | Newly created node |
| `'REMOVED'` | Deleted node (must remain in array) |

## parentIndex

Encodes the tree structure:

- **guid** — Points to the parent node's GUID
- **position** — Single ASCII character for sibling ordering. Children of the same parent are sorted by this character. Use sequential ASCII starting from `!` (0x21).

## Node Hierarchy (Design — .fig)

Design files use CANVAS nodes as pages. Each page contains top-level FRAMEs
(the exportable objects visible in Figma's layers panel).

```
DOCUMENT (0:0)
  ├─ CANVAS "Great Seal Page" (position: " ~")
  │    └─ FRAME "GreatSeal" (731×609)
  ├─ CANVAS "Page 2" (position: "!")
  │    ├─ FRAME "how-to" (1247×1024)
  │    └─ FRAME "Lady" (413×626)
  ├─ CANVAS "Page 3" (position: "~!")
  │    ├─ FRAME "User Bio" (675×384)
  │    ├─ FRAME "bike lady" (1102×952)
  │    └─ TEXT "RANDOM" (loose on canvas)
  └─ CANVAS "Internal Only Canvas" (position: "~")
       └─ ... SYMBOL definitions (component library)
```

**Page ordering**: Pages are sorted by `parentIndex.position`, not by creation
order or array index. `getPages()` returns them in Figma's display order.

**Internal Only Canvas**: Figma's hidden page for component/symbol storage.
Filtered out by `getPages()` — always present in raw data.

**Top-level children** fall into two categories:

- **Frames** — FRAME nodes are the exportable objects (what you'd export as PNG
  in Figma). These are the primary units of work on a page.
- **Loose nodes** — TEXT, VECTOR, INSTANCE, etc. sitting directly on the canvas.
  Visible in Figma but not individually exportable. Should still be listed
  (e.g. annotations, labels, sticky notes) but are not "objects" in the
  export sense.

When listing page contents, distinguish frames from loose nodes:
```javascript
const children = fd.getChildren(nid(page))
  .filter(c => c.phase !== 'REMOVED')
  .sort((a, b) => (a.parentIndex?.position ?? '').localeCompare(b.parentIndex?.position ?? ''));
const frames = children.filter(c => c.type === 'FRAME');
const loose  = children.filter(c => c.type !== 'FRAME');
```

---

## Node Hierarchy (Slides)

### Pattern 1: Direct Content

Slides contain their visual content directly:

```
DOCUMENT (0:0)
  └─ CANVAS "Page 1" (0:1)
       └─ SLIDE_GRID "Presentation" (0:3)
            └─ SLIDE_ROW "Row" (1:1563)
                 └─ SLIDE "1" (1:1559)
                      ├─ TEXT "Title"
                      ├─ FRAME "Content"
                      └─ ROUNDED_RECTANGLE "Shape"
```

Used for: simple decks, one-off presentations, non-templated content.

### Pattern 2: Template-Based (INSTANCE → SYMBOL)

Slides reference a reusable template via INSTANCE nodes:

```
DOCUMENT (0:0)
  └─ CANVAS "Page 1" (0:1)
       └─ SLIDE_GRID "Presentation" (0:3)
            └─ SLIDE_ROW "Row" (1:1563)
                 └─ SLIDE "1" (1:1559)
                      └─ INSTANCE (1:1564) → references SYMBOL
```

SYMBOL definitions live elsewhere (often in the Internal Only Canvas):

```
CANVAS "Internal Only Canvas"
  └─ FRAME "Template Library"
       └─ SYMBOL "Cover Slide"
            ├─ TEXT "Title"
            └─ FRAME "Content"
```

The INSTANCE carries `symbolOverrides` to customize text, fills, and images for that specific slide.

### Pattern 3: Published Templates (MODULE wrapper)

Published templates wrap slides in MODULE nodes:

```
SLIDE_ROW "Row"
  └─ MODULE "1" (200:644)
       └─ SLIDE "1" (200:645)
            └─ ... slide content
```

MODULE nodes indicate a slide derived from a published template. The MODULE's GUID encodes the template origin.

---

## Cached Fields

Figma pre-computes certain layout data and stores it on nodes. These caches must be invalidated when modifying nodes:

| Field | When to delete |
|-------|---------------|
| `derivedTextData` | When modifying `textData.characters` directly on a TEXT node |
| `derivedSymbolData` | When cloning an INSTANCE to create a new slide |
| `derivedSymbolDataLayoutVersion` | When cloning an INSTANCE |
| `slideThumbnailHash` | When cloning a SLIDE |
| `editInfo` | When cloning any node |

Note: `derivedTextData` does **not** need to be deleted when using `symbolOverrides` on an INSTANCE — it only matters for direct text node edits.
