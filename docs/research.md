# Figma Binary File Format & Component Model — Format Notes

**Date:** 2026-03-16

---

## 1. Figma File Format — Binary Structure

### File Structure

Figma `.fig` (and `.deck`) files are ZIP archives containing a `canvas.fig` binary payload plus metadata. The binary payload uses the **Kiwi** serialization format, created by former Figma CTO Evan Wallace. Kiwi is similar to Google's Protocol Buffers but simpler, with more compact encoding and better support for optional fields.

**Binary layout of `canvas.fig`:**
```
[header:8 "fig-kiwi"][version:4][schema_chunk_length:4][schema_chunk][data_chunk_length:4][data_chunk]
```

- **Chunk 1 (Schema):** Deflate (zlib) compressed. Contains the Kiwi schema definition (~24KB compressed → ~59KB decompressed). This schema defines all type definitions used in the file.
- **Chunk 2 (Data):** Zstandard (zstd) compressed. Contains the actual document data (~2.3MB compressed → ~29MB decompressed for a typical file).

The schema is embedded in the file itself, which is critical — it means the schema can (and does) change between Figma versions.

**File type signatures:**
- `fig-kiwi` — Standard Figma design files
- `fig-makee` — Figma Make files
- `.deck` files — Figma Slides (ZIP archive with the same binary format)

### Key Libraries/Tools for Decoding

- **pako** — Deflate decompression for schema chunk
- **fzstd** — Zstandard decompression for data chunk
- **kiwi-schema** — Kiwi binary format decoder
- **fig-kiwi** (npm) — Community package that reads/writes .fig files with TypeScript definitions derived from the kiwi schema

**CLI decoding example:**
```bash
node cli --schema figma.kiwi --root-type NodeChanges --to-json simple.fig
```

### Root Data Structure

The root type in Figma's kiwi schema is **`NodeChanges`**, which contains:
- `nodeChanges` — An array of node change records (NOT a tree — must be converted to a tree structure by matching parent/child relationships)
- `blobs` — Binary data for commands, vector networks, images, etc.

Key fields in NODE_CHANGES include: `type`, `sessionID`, `ackID`, `pasteID`, `pasteFileKey`, `pasteIsPartiallyOutsideEnclosingFrame`, `pastePageId`.

The schema reportedly contains **534+ type definitions** covering nodes, colors, vectors, transforms, fonts, and more.

### Sources
- [Evan Wallace's .fig file parser](https://madebyevan.com/figma/fig-file-parser/)
- [Kiwi GitHub repository](https://github.com/evanw/kiwi)
- [Browsertech Digest: Figma is a File Editor](https://digest.browsertech.com/archive/browsertech-digest-figma-is-a-file-editor/)
- Albert Sikkema: "Analyzing Figma Make Files" (blog post, January 2026)
- [Easylogic: Figma Inside — .fig file analysis](https://easylogic.medium.com/figma-inside-fig-%ED%8C%8C%EC%9D%BC-%EB%B6%84%EC%84%9D-7252bef141da)
- [fig-kiwi npm package](https://www.npmjs.com/package/fig-kiwi)
- [Kiwi format description issue #17](https://github.com/evanw/kiwi/issues/17) (Photopea author asking about format)

---

## 2. Figma Component Model — Public API Structure

### Component/Instance System

Figma's component system uses the following node types:
- **COMPONENT** (historically called `SYMBOL_MASTER`) — The main component definition
- **COMPONENT_SET** — A container for variants of a component
- **INSTANCE** — A copy of a component that stays linked to the main component

### Instance-Component Linkage

Instances maintain a reference to their main component via:
- **`componentId`** — For local components (same file), stores the node ID of the main component
- **`componentKey`** — For library components (external files), stores a unique key

These identifiers persist even after the component is deleted, enabling the "Restore Component" functionality.

### Override System

Overrides are stored as **deviations from the main component's properties** on the instance node. Key aspects:

- **`overriddenFields`** — An array listing which fields have been directly overridden on an instance (inherited overrides are NOT included)
- **Override matching** uses **layer names** as the primary key — when swapping variants or instances, Figma preserves overrides only if layer names match between the source and target
- **Override hierarchy:** Figma also checks if the layer hierarchy path is similar when matching overrides

**Supported override properties:**
- Text content, font, weight, size, line height, letter spacing
- Fill/stroke (type, value, opacity)
- Shadow and blur effects
- Layout guides
- Nested instance swaps
- Export settings
- Layer names

**NOT overridable** (structural changes that force detachment):
- Layer order (z-index)
- Layer positioning within the component
- Constraints
- Text layer bounds

### Component Properties

Component properties use a naming convention with `#` suffixes for disambiguation:
- `propertyName#uniqueID` for TEXT, BOOLEAN, and INSTANCE_SWAP properties
- VARIANT type properties are prioritized in case of name collision

### The `nodeChanges` Array (Binary Format)

In the binary format, the document is stored as a flat array of `nodeChanges`, NOT as a tree. Each node change contains the node's properties and a reference to its parent. The tree must be reconstructed by matching parent-child relationships. This is important for component manipulation — you must maintain correct parent references.

### Sources
- [Figma InstanceNode API docs](https://developers.figma.com/docs/plugins/api/InstanceNode/)
- [Figma DetachedInfo API docs](https://developers.figma.com/docs/plugins/api/DetachedInfo/)
- [Figma: Apply changes to instances](https://help.figma.com/hc/en-us/articles/360039150733-Apply-changes-to-instances)
- [Figma: Component architecture best practices](https://www.figma.com/best-practices/component-architecture/)
- [Figma Node Types](https://developers.figma.com/docs/plugins/api/nodes/)

---

## 3. Known Issues with External Figma File Manipulation

### Override Corruption Patterns

Community reports consistently describe these failure modes:

1. **Override loss on variant swap** — When layer names differ between variants, all overrides are silently dropped. This is by design but catches tool authors off-guard.

2. **Nested component override loss** — Overrides are lost at second-level nesting. Nested components using slots lose overrides when variables are involved.

3. **Component links breaking after import** — When .fig files are imported to a new account or duplicated, component connections and variable references can break entirely.

4. **"Component Broken - Click to Fix"** — A persistent bug where instances appear visually broken but clicking into them temporarily fixes the issue. The corruption returns after file reload.

5. **Branch merge corruption** — Branch merges have been reported to break ALL component instances across working files, with conflict errors on every instance that cannot be resolved by restore & republish.

6. **Library publish breaking overrides** — Publishing library updates can cause downstream files to lose border radius, alignment, and layer name overrides.

### Specific Risks for External Tool Authors

- **Schema version drift** — The kiwi schema changes between Figma versions without notice. A tool that works today may silently corrupt files tomorrow.
- **Flat array reconstruction** — The nodeChanges array must be correctly reconstructed; any error in parent-child relationships will corrupt the document tree.
- **Blob index integrity** — Properties like `commandsBlob` and `vectorNetworkBlob` reference blob indices. Modifying the blob array without updating these indices corrupts vector data.
- **ID uniqueness** — Node IDs (e.g., "75:127") must remain unique. Duplicating nodes without generating new IDs causes undefined behavior.

### Sources
- [Figma Forum: Component overrides broken after library publish](https://forum.figma.com/ask-the-community-7/component-overrides-get-broken-after-library-publish-27231)
- [Figma Forum: Variant Override Preservation is Broken](https://forum.figma.com/t/variant-override-preservation-implementation-is-broken-bad/779)
- [Figma Forum: Component Broken - Click to Fix](https://forum.figma.com/report-a-problem-6/component-broken-click-to-fix-38149)
- [Figma Forum: Branch merge broke all component instances](https://forum.figma.com/report-a-problem-6/branch-merge-broke-all-component-instances-across-all-working-files-conflict-error-on-every-instance-restore-republish-did-not-help-51641)
- [Figma Forum: Component connections broken after import](https://forum.figma.com/report-a-problem-6/component-connections-and-variable-references-broken-after-import-to-new-account-41515)

---

## 4. Figma's Official Documentation on Component Integrity

### Detachment
- Detaching an instance **permanently breaks** the link to the main component
- Once detached, it cannot be re-linked automatically — you must replace it with a fresh instance
- `DetachedInfo` persists even after deletion, containing either `{type: 'local', componentId}` or `{type: 'library', componentKey}`

### Restore Component
- If a main component is deleted but instances remain, selecting an instance shows a "Restore Component" option in the right sidebar
- This recreates the main component from the instance's stored data
- Plugins cannot access this "restore" functionality — they can only recreate components and swap instances manually

### Override Preservation Rules (Official)
Figma uses two criteria to determine override preservation:
1. **Layer name matching** — Layer names must match between current and target instance/variant
2. **Property equality check** — When selecting variants, Figma checks if the changed properties originally matched between variants. If they did, overrides are preserved.

### Sources
- [Figma: Detach an instance from the component](https://help.figma.com/hc/en-us/articles/360038665754-Detach-an-instance-from-the-component)
- [Figma: Apply changes to instances](https://help.figma.com/hc/en-us/articles/360039150733-Apply-changes-to-instances)
- [Figma: Guide to components](https://help.figma.com/hc/en-us/articles/360038662654-Guide-to-components-in-Figma)

---

## 5. Tools That Read/Write .fig Files

### fig2sketch (Sketch HQ)
- **Python tool** that converts `.fig` → `.sketch` format
- Reads the Figma kiwi binary format directly
- **Key limitation:** Nested Frames are converted to Groups (Sketch has no nested artboard concept)
- **Component handling:** Does its best but acknowledges data type mismatches between formats
- Actively maintained, 476+ commits, open source (MIT)
- Repository: https://github.com/sketch-hq/fig2sketch

### figma-to-json (yagudaev)
- **TypeScript/web tool** for round-trip `.fig` ↔ JSON conversion
- Functions: `figToJson(fileBuffer)` and `jsonToFig(json)`
- Relies on a schema file for both encoding and decoding
- Uses UZIP for compression
- Key for understanding the format — allows visual inspection of decoded JSON
- Repository: https://github.com/yagudaev/figma-to-json
- Live demo: https://www.figma2json.com

### OpenPencil
- **Open-source design editor** that natively reads/writes `.fig` files
- Supports components with override handling
- Uses Kiwi binary format for native compatibility
- MIT licensed, actively developed
- Repository: https://github.com/open-pencil/open-pencil

### Photopea
- **Commercial web editor** that can open `.fig` files
- One of the first third-party tools to support the format
- Creator (Ivan Kuckir, also known as photopea on GitHub) was among the earliest to implement support for the kiwi format (see [kiwi issue #17](https://github.com/evanw/kiwi/issues/17))
- Blog: https://blog.photopea.com/photopea-4-6-open-figma-files.html

### fig-kiwi (npm)
- **npm package** for reading/writing the Figma file format
- Handles both `.fig` files and text/html pasteboard data (copy/paste between Figma instances)
- Includes TypeScript definitions derived from the kiwi schema
- Package: https://www.npmjs.com/package/fig-kiwi

### Evan Wallace's Online Parser
- **Web-based parser** for exploring `.fig` file structure
- Created by the original kiwi/Figma CTO himself
- Intended for exploration, NOT automation
- Warning: may break as the `.fig` format evolves
- URL: https://madebyevan.com/figma/fig-file-parser/

---

## 6. Best Practices for Maintaining Component Integrity

Based on the collective findings from all sources above, here are the critical rules for programmatically modifying Figma files:

### MUST preserve:
1. **Node IDs** — Every node has a unique ID (e.g., "75:127"). These MUST remain unique and consistent. Component-instance links depend on them.
2. **Component references** — `componentId` (local) and `componentKey` (library) fields on INSTANCE nodes must point to valid COMPONENT nodes.
3. **Layer names** — Override matching depends entirely on layer name consistency. Changing a layer name in a component will cause all instances to lose overrides for that layer.
4. **Parent-child relationships** — The flat `nodeChanges` array must reconstruct to a valid tree. Orphaned nodes or circular references will corrupt the file.
5. **Blob indices** — `commandsBlob`, `vectorNetworkBlob`, and similar fields reference indices into the blobs array. Any modification to the blob array must update all references.
6. **Schema consistency** — The schema chunk must match the data chunk. Modifying data fields without understanding the schema definition will produce invalid files.

### SHOULD preserve:
7. **Node type consistency** — Don't change a node's type (e.g., COMPONENT → FRAME). This will break instance links.
8. **Override sticker data** — Instance overrides are stored as stickers/deltas. Modifying the component structure without updating stickers can cause visual corruption.
9. **Session/version metadata** — The `sessionID`, `ackID` fields in NodeChanges relate to Figma's multiplayer sync. While not strictly required for local files, corrupting these may cause issues when reopened in Figma.

### AVOID:
10. **Empty strings** — Never use empty string `""` for text content. Use a single space `" "` instead. Empty strings crash Figma.
11. **Overwriting source files** — Always write to a new output path. If the write fails mid-stream, you lose both source and output.
12. **Assuming schema stability** — The kiwi schema embedded in `.fig` files can change between versions. Any field could change, be removed, or be reinterpreted.
13. **Creating new SYMBOL/COMPONENT nodes** — Use existing template components. Creating components from scratch requires getting many interdependent fields exactly right.

### Key Insight: Override Matching Path

The most critical (and least documented) aspect is how Figma resolves override paths within instances. Overrides are matched by:
1. **Layer name** (primary key)
2. **Hierarchy position** (secondary key — the path through the node tree)
3. **Property type** (which specific property is overridden)

When cloning slides or manipulating component instances externally, the override matching path must be preserved exactly. This means:
- Don't rename layers within components
- Don't reorder layers within components
- Don't add/remove intermediate container layers
- Don't change the nesting depth of overridden layers

---

## Format Documentation Status

1. **The kiwi schema is self-describing.** Every `.fig` file embeds its own schema (534+ type definitions), which is the intended mechanism for third-party readers — consistent with Kiwi's design as a self-describing format.

2. **Override storage fields** (symbolData, guidPaths, override stickers) appear in decoded `.fig` files. Their behavior is understood through the Figma Plugin API documentation and community interoperability work.

3. **No official `.fig` specification exists.** There are no published validation tools or conformance tests. The community ecosystem (fig2sketch, figma-to-json, OpenPencil, Photopea) relies on the self-describing schema and public API documentation.

4. **The format evolves between versions** — Evan Wallace's online parser carries this warning prominently. Interoperability tools must handle schema changes gracefully.

5. **`.deck` file specifics** — `.deck` files share the same binary format as `.fig`. Slides-specific node types follow the same self-describing schema pattern.
