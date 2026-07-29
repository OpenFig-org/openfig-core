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
| Keep every `parentIndex.position` within `!`–`~` | Let it run past 0x7E (rejects the **whole file**) |
| Set `fontName.postscript` everywhere | Leave it `''` (silent font substitution) |

## Sibling ordering: `parentIndex.position`

`position` is a fractional index that Figma compares **as a string**. Two rules
follow from that, and both have cost real debugging time.

**The alphabet is printable ASCII, `!` (0x21) through `~` (0x7E).** A character
outside that range does not corrupt the node — Figma rejects the **entire file**
with `Internal error during import` and names nothing about it. Everything else
checks out while this is wrong: the archive is intact, the message parses, GUIDs
are unique, no reference dangles, and the file round-trips through a reader
unchanged. In openfig-cli this shipped silently until a slide with 693 children
produced 599 out-of-range positions and simply would not open. A bare `~` is
legitimate and appears on the canvas in working decks.

**Because comparison is lexicographic, overflowing naively into a second
character reorders siblings.** `"!"` sorts before `"!!"`, which sorts before
`'"'` — so child 95 lands between child 1 and child 2. A scheme that works
reserves the top character as a continuation marker, so any longer string sorts
after every shorter one:

```js
const FIRST = 0x21;          // '!'
const LAST  = 0x7D;          // '}' — one below '~'
const BASE  = LAST - FIRST + 1;
const MORE  = '~';           // continuation marker, sorts after every other char

function positionAt(index) {
  let out = '';
  let n = index;
  while (n >= BASE) { out += MORE; n -= BASE; }
  return out + String.fromCharCode(FIRST + n);
}
```

Indices below the ceiling stay byte-identical to the naive single-character
scheme, so adopting this does not move existing output.

Reference implementation and the measurements behind it: openfig-cli
`lib/core/node-helpers.mjs` and its `docs/figma-behaviour.md`.

## Sentinel Values

The GUID `{ sessionID: 4294967295, localID: 4294967295 }` (`0xFFFFFFFF:0xFFFFFFFF`)
is used as a "detach" sentinel in multiple contexts:

- `styleIdForFill` — detach fill from library style (required for image overrides)
- `styleIdForText` — detach text from named text style (required for custom fonts)
- `styleIdForStrokeFill` — detach stroke from library style
- `overrideKey` — appears on SLIDE nodes (not overrideable)
