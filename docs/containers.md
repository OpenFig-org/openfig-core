# Containers

Container-like nodes in the Kiwi format include:

- `FRAME`
- `GROUP`
- `SECTION`
- slide/layout containers such as `SLIDE_GRID` and `SLIDE_ROW`

This document focuses on Design-mode container semantics for `FRAME`, `GROUP`,
and `SECTION`.

## Raw schema

The schema supports distinct node types for both `GROUP` and `FRAME`.

See:

- [nodes.md](nodes.md)
- [`src/utilities/figKiwiSchema.ts`](../src/utilities/figKiwiSchema.ts)

So at the file-format level, real raw `GROUP` exists.

## `.fig` fixture behavior

In multiple `.fig` test fixtures, visible groups are serialized as `FRAME`
nodes instead of raw `GROUP` nodes.

Test fixtures:

- `OpenFig_logos_OPENFIX_EXPORT_07.fig`
  - `0` raw `GROUP` nodes
- `frame and group.fig`
  - `0` raw `GROUP` nodes
  - Figma UI shows `Group 1`, but raw node data is `type: "FRAME"`
- `section and frame.fig`
  - `SECTION` appears as a dedicated raw type
- `section and frame (1).fig`
  - auto-layout hug-content frame remains `FRAME` and uses stack sizing fields,
    not `resizeToFit`

## Group-like frame pattern

The strongest pattern for a group-like node encoded as `FRAME` is:

- `type === "FRAME"`
- `resizeToFit === true`
- empty or absent visible fills
- no auto-layout signal such as `stackMode`

Example from `frame and group.fig`:

### `Frame 1`

- `type: "FRAME"`
- `fillPaints`: solid white
- `fillGeometry`: present
- `frameMaskDisabled: false`
- `resizeToFit`: absent

### `Group 1`

- `type: "FRAME"`
- `fillPaints`: empty
- `fillGeometry`: absent
- `frameMaskDisabled: false`
- `resizeToFit: true`

## Auto-layout distinction

The examined auto-layout hug-content fixture did **not** use `resizeToFit`.
Instead it used stack sizing fields such as:

- `stackMode`
- `stackPrimarySizing`
- `stackCounterSizing`

That means `resizeToFit: true` currently looks group-specific in the tested
fixtures, while auto-layout frames signal sizing through stack fields.

## `SECTION`

`SECTION` is a dedicated node type and should not be inferred via heuristics.

Fixture signals:

- `type: "SECTION"`
- no fill geometry
- `frameMaskDisabled: true`

## Guidance for consumers

Consumers should not assume:

- every visible Figma group will decode as raw `GROUP`
- every `FRAME` node should be treated as a frame in higher-level tools

Safer statement:

> Some Figma groups may be serialized as frame-like `FRAME` nodes, even though
> the format also supports raw `GROUP`.

Consumers that need product-level frame vs group behavior may need a heuristic
layer above raw parsing.

## What remains unknown

- Whether modern Figma still emits raw `GROUP` in other scenarios
- Whether there is an additional discriminator beyond `resizeToFit`, fills, and
  stack fields
- Whether save/export should prefer raw `GROUP` or the frame-like encoding when
  authoring new group structures
