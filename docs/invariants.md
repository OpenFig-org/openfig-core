# Known Invariants

Violating any of these produces silent failures or crashes on import.

| Do | Don't |
|----|-------|
| Set `phase: 'REMOVED'` | Filter nodes from `nodeChanges` |
| Use `' '` for blank text | Use `''` empty string |
| Use zstd for chunk 1 | Use deflateRaw for chunk 1 |
| Include `styleIdForFill` sentinel on image overrides | Omit it (silent ignore) |
| Include `imageThumbnail` with real hash | Omit it (image won't render) |
| Use `new Uint8Array(0)` for `thumbHash` | Use `{}` (schema error) |
| Delete `derivedTextData` on direct text edits | Leave stale cache |
| Deep-clone with typed array support | Use `JSON.parse(JSON.stringify())` |
| Roundtrip: preserve schema from source file | Roundtrip: swap in a different schema |
| Keep all chunks (pass through chunk 2+) | Drop unknown chunks |

## Sentinel Values

The GUID `{ sessionID: 4294967295, localID: 4294967295 }` (`0xFFFFFFFF:0xFFFFFFFF`)
is used as a "detach" sentinel in multiple contexts:

- `styleIdForFill` — detach fill from library style (required for image overrides)
- `styleIdForText` — detach text from named text style (required for custom fonts)
- `styleIdForStrokeFill` — detach stroke from library style
- `overrideKey` — appears on SLIDE nodes (not overrideable)
