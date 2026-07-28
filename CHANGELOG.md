# Changelog

All notable changes to `openfig-core` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.7] - 2026-05-22

### Added

- **`convertDeckToFig` API** — A tree-transform under `src/convert.ts` that strips visual slides scaffolding (`SLIDE_GRID`, `SLIDE_ROW`, `SLIDE`, `MODULE`) and positions visual frames onto a flat design page.
- **Component & Symbol Override Baking** — Implemented recursive cloning and unique GUID remapping for nested components, baking customized character overrides and fill/stroke paints directly onto the cloned target nodes.
- **Comprehensive API Exports** — Exposed programmatic transform helpers and type definitions (`ConvertOptions`, etc.) in `src/index.ts`.

## [0.3.6] - 2026-03-25

### Added

- **Isomorphic Parser & Encoder** — Initial open-source release of the isomorphic `.fig` and `.deck` file parser and Kiwi binary encoder, allowing reading and writing of Figma's schema-driven format in both Node.js and browser runtimes.
- **Kiwi Schema Interoperability** — Integration of schema-driven Kiwi binary serialization, resolving zip archives (`fzstd`/`fflate` decoders), geometry nodes, vector path conversions, and gradient color structures.

[0.3.7]: https://github.com/OpenFig-org/openfig-core/releases/tag/v0.3.7
[0.3.6]: https://github.com/OpenFig-org/openfig-core/releases/tag/v0.3.6
