# Empty .fig Template

openfig-core ships an `emptyFigTemplate` — a base64-encoded `.fig` file used as
the starting point when saving a design created from scratch. The blob is
produced entirely by our own generator script and node definitions — no
hand-sourced binary.

## How it works

```
src/utilities/figKiwiSchema.ts    ← our own 550-def TypeScript schema
src/utilities/generateTemplate.ts ← our own node definitions + encoder
        ↓
src/schema.ts  (emptyFigTemplate base64 blob)
        ↓
createEmptyFigDoc()  →  parseFig(blob)  →  FigDocument
```

No seed file is required. `generateTemplate.ts` constructs the DOCUMENT and
CANVAS nodes from scratch and encodes using `figKiwiSchema.ts`.

## Regenerating the template

```
npx tsx src/utilities/generateTemplate.ts
```

Paste the output line into `src/schema.ts` as the new `emptyFigTemplate` value,
then rebuild.

## Schema definition

`figKiwiSchema.ts` contains all 550 kiwi type definitions for the `.fig` wire
format, expressed as our own TypeScript. It was produced by
`src/utilities/readSchema.ts`, which reads the self-describing schema from any
`.fig` file and outputs it as a typed constant.

The kiwi schema is embedded by Figma's software in every `.fig` file they
produce — that is by design, since kiwi is a self-describing format intended
for exactly this kind of interoperability. Field IDs are wire-protocol numbers
(analogous to protobuf field numbers) — functional identifiers, not creative
expression.

## What we learned about the format

Three non-obvious requirements discovered during implementation:

| Requirement | Detail |
|---|---|
| `thumbnail.png` required | Figma fails to import a `.fig` ZIP with no thumbnail |
| REMOVED nodes must stay | Visual nodes must remain in `nodeChanges` with `phase: "REMOVED"` — silently omitting them causes import failure |
| Chunk 1 must be zstd | deflateRaw works in our parser but Figma's importer requires zstd (`28 b5 2f fd` magic) |
