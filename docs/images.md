# Images

## Storage

Image files are stored in the `images/` directory inside the ZIP archive. Each file
is named by its **40-character lowercase hex SHA-1 hash** with no file extension:

```
images/
  780960f6236bd1305ceeb2590ca395e36e705816
  3edd7b8ee12e0f653393f430503ff8738e4e5dc7
```

Both full-resolution images and their thumbnails (~320px wide PNGs) are stored here,
each under their own hash.

## Thumbnail Generation

Every image requires a companion thumbnail:
- Resize to ~320px wide (maintain aspect ratio, don't enlarge)
- Save as PNG
- Store in `images/` under its own SHA-1 hash

## Image Override on Symbol Instance

See [overrides.md](overrides.md) for the full image override structure used when
replacing an image placeholder inside a component instance.

## Freestanding Image on Slide ✅

A freestanding image on a slide is a `ROUNDED_RECTANGLE` node with a `fillPaints`
entry of `type: 'IMAGE'`. There is no dedicated image node type.

Key differences from symbol image overrides:
- No `styleIdForFill` sentinel needed
- `proportionsConstrained: true` to lock aspect ratio
- `fillGeometry` is present but not required (Figma recomputes)
- `cornerRadius` fields work for rounded image frames

```javascript
{
  type: 'ROUNDED_RECTANGLE',
  proportionsConstrained: true,
  size: { x: 800, y: 600 },
  fillPaints: [{
    type: 'IMAGE',
    opacity: 1,
    visible: true,
    blendMode: 'NORMAL',
    transform: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 },
    image: { hash: Uint8Array(20), name: 'hex-sha1-string' },
    imageThumbnail: { hash: Uint8Array(20), name: 'hex-sha1-string' },
    imageScaleMode: 'FILL',
    scale: 0.5,
    originalImageWidth: 2044,
    originalImageHeight: 2155,
    thumbHash: new Uint8Array(0),
    altText: '',
  }],
}
```
