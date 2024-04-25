# flex-grid.js

## What?

![Screenshot of the layout of many photos, cut off at the top and bottom. The photos are arranged into columns, and there's a consistent small gap between photos, but many of the wider photos span multiple columns](/photos-screenshot.png?raw=true "Demo screenshot")

[flex-grid.js](./flex-grid.js) is the implementation of the photo layout algorithm written for
[my website](https://sharnoff.io/photos).

It is written in plain JS with no dependencies, and the file itself is just the definition of a
class, which itself takes arbitrary `div`s of predetermined size as input.

The layout algorithm satisfies a few properties:

1. Items are displayed
2. Items may have whatever "true" dimensions you like, and they will be scaled to fit within the
   multi-column layout; and
3. Items can be displayed across multiple columns, while keeping everything aligned by slightly
   cropping others (within specified bounds).

While this was written with the purpose of displaying photos, it could be used for anything else
that is sufficiently photo-like.

## Why?

At the time this was written, I was looking to build a nice display for my photos on my website.
Existing solutions appeared to have any one of the following issues:

1. Wide aspect ratio photos would always be super small (only squished into a single column)
2. There could be large and inconsistent gaps between the items

Additionally, while I would have *loved* a CSS-only solution, the only option at the time would have
ordered photos by filling from left-to-right rather than top-to-bottom.

## How?

Download `flex-grid.js`, or reference the raw github content page. I.e.

```html
<script src="/path/to/flex-grid.js" async></script>
<!-- ... or whatever other method you have for bundling your JS -->
```

This defines the `FlexGrid` class for you to use.

In general, usage requires knowing the concrete sizes of each item, which looks something like:
```javascript
{
  element: /* DOM Element for the item */,
  dims: {
    width:  /* "true" width of the item in pixels */,
    height: /* "true" height of the item in pixels */,
  },
}
```

**For more information**, refer to the documentation on `FlexGrid`'s `constructor` method, or the
example usage in [examples/](./examples).
