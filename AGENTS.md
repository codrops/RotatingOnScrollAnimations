# AGENTS.md

Notes for coding agents working on this repo. Read [README.md](README.md) first for what the demo is.

## Setup

- There is no build step, no package.json and nothing to install. Plain HTML, CSS and JS.
- Serve the root with any static server (`npx serve .` or `python3 -m http.server`). The WebGL pages load ES modules, which don't load from `file://`.
- GSAP, ScrollTrigger and Lenis are vendored in `js/` and loaded as classic scripts before the page's script, so `gsap`, `ScrollTrigger` and `Lenis` are globals. Don't import them.
- three.js (0.186.1) is vendored as `js/three.module.min.js` + `js/three.core.min.js`, and the WebGL scripts import it with `import * as THREE from './three.module.min.js'`. The package ships no minified build, so these are jsDelivr's minified files, with the module's import of `./three.core.js` changed to `./three.core.min.js`. Keep that change if you update three.js.
- There are no automated tests. Check a change in a browser: scroll the whole page down and back up, slowly and fast, and watch the console. Check a phone width and `prefers-reduced-motion: reduce` too.

## Map

| Path | What it is |
| --- | --- |
| `index.html`…`index15.html` | One page per variation (01 is `index.html`). Same frame and markup; they differ in the `demo-<N>` body class, the image set and order, the marquee font class and names, and the script. |
| `js/index.js`…`js/index15.js` | One self-contained script per page, on purpose: each can be read on its own next to the article. There are no shared modules. |
| `css/base.css` | All styles: the `.demo-<N>` variables (colours, image size and ratio, marquee), the frame and its nav, the marquee, the gallery and the `.webgl` canvas. |
| `assets/*.webp` | 20 portrait images (960×1200). |
| `assets/landscape/*.webp` | 20 landscape images (1456×816). |
| `js/*.min.js` | Vendored libraries. Leave them alone. |

## How a page works

- `.gallery` holds 20 `.gallery__item` divs with an inline `background-image`. `createGalleryWrappers()` wraps each in a `.gallery__item-wrap` (perspective, width and spacing). `positionGalleryItems()` spreads the wraps sideways on a sine wave, capped so they stay on screen.
- Lenis does the scrolling. Its `raf` runs on `gsap.ticker`, its `scroll` event calls `ScrollTrigger.update`, and `lagSmoothing(0)` is set.
- The `.mark` marquee is fixed and moves with a scrubbed ScrollTrigger on `.gallery`.
- Preloading: the DOM pages decode every background image with `new Image()` + `image.decode()` (`preloadImages`). The WebGL pages load textures with `THREE.TextureLoader.loadAsync` (`preloadTextures`). There is no imagesLoaded.
- Reduced motion: no Lenis and no gallery animation, so the images stay flat and scrolling is native. The marquee still follows the scroll.

## Variations

01–05 are the author's originals. 06–15 were made with Claude. DOM-only variations come before the WebGL ones.

| # | Effect | How |
| --- | --- | --- |
| 01 | Random tumble on X, Y and Z | DOM, scrubbed `fromTo` |
| 02 | Big X spins pushed back in depth | DOM, scrubbed `fromTo` |
| 03 | X flip around a circular path, with brightness and saturation | DOM, `onUpdate` |
| 04 | Y spins, blurred and desaturated by scroll speed | DOM, `onUpdate` + velocity |
| 05 | X spin held flat in the middle, stretched and blurred at the ends | DOM, `onUpdate` |
| 06 | Orbit: images revolve around an axis behind the screen, a helix | DOM, `onUpdate` |
| 07 | Drum: images bend around the inside of a horizontal drum and go liquid while scrolling | WebGL, continuous |
| 08 | Paper roll: tilted rolls unroll into view and roll away | WebGL, ScrollTrigger |
| 09 | Ribbon twist around the vertical axis, top rows leading | WebGL, ScrollTrigger |
| 10 | Tiles flip and scatter in depth, then assemble | WebGL, ScrollTrigger |
| 11 | Turning tiles: a flat grid of tiles turned out of place by quarter turns. They turn into place as the image comes in through the bottom edge, stay put while all of it is in view, and turn out again once its top reaches the top edge | WebGL, continuous |
| 12 | Swell: images ride over slow waves fixed on the screen, calm in the middle; the waves grow with scroll speed | WebGL, continuous + velocity |
| 13 | Slices: horizontal slices fan out around the vertical centre line and close one after another | WebGL, ScrollTrigger |
| 14 | Vortex: always in a soft, off-centre whirlpool that twists one way below the middle and the other way above; ripples with scroll speed | WebGL, continuous + velocity |
| 15 | Spiral: images wrap around a tower that turns as they rise | WebGL, continuous |

## Adding a variation

What has worked so far: abstract, smooth and organic deformations of the image itself, like bending round a shape the images flow through (07, 15), twisting (09), rolling (08), tiles (10) and liquid motion driven by scroll speed. What hasn't: literal objects and props (book pages, boxes, origami, fabric, a globe), anything that reads as a sphere or dome (including tiles tipping away from a centre), sharp tips or hard geometric shapes, and a lot of sideways drift.

1. Copy the closest page to `index<N>.html`. Change the `demo-<N>` body class, the `Demo <N>` title, the script `src`, the image order (or set), the marquee font class (`font-1`…`font-4`) and the marquee names. Names are never reused from another page.
2. Copy the closest script to `js/index<N>.js`.
3. Add a `.demo-<N>` block to `css/base.css`, plus `.demo-<N> .gallery__item-wrap` for spacing if needed. Colours, fonts and image sets are combinations of 01–05's; don't bring in new palettes or font families.
4. Add the number to the `.frame__demos` nav on **every** page: `<a class="frame__demo" href="index<N>.html">NN</a>`. On its own page it's `<span class="frame__demo frame__demo--current">NN</span>` instead. The grid holds five per row (three rows for 01–15) and `css/base.css` handles the wrapping.
5. Update this file's Variations table, and the README credits if a new library comes in.

## WebGL conventions (07–15)

- Markup: `<div class="gallery gallery--webgl">` hides the DOM items, which still do the layout and scrolling. A `<canvas class="webgl">` goes right after the gallery and before `.mark`, so the marquee blends over it.
- Space: a `PerspectiveCamera` at z = 1000, with the field of view matched to the viewport height, so 1 unit is 1 CSS px at z = 0, y up. Vertex shaders work in px: `vec3 pos = position * vec3(uSize, 1.0);`.
- Every frame (`gsap.ticker`, added after Lenis), each plane is moved onto its item's `getBoundingClientRect()` and `uSize` is updated. `frustumCulled = false`, since the shaders move vertices far from the geometry's bounds.
- Draw only on change. `render()` returns early unless `needsRender` is set or the first item's `top` has moved. A still page makes no draws at all.
  - `needsRender` is set by `resizeWebGL()` and at the top of every trigger's `onUpdate` (a refresh can change uniforms without scrolling).
  - The scroll-speed pages (07, 12, 14) also keep drawing while their effect is still settling.
  - Anything new that changes what's drawn without the page moving must set `needsRender = true`.
- Colour: textures stay in `NoColorSpace` and the shaders don't include `colorspace_fragment`, so colours match the CSS. Sample through the "Same as background-size: cover" snippet. A colour uniform read from CSS is set with `setStyle(value, THREE.LinearSRGBColorSpace)`, so it isn't converted (see 07).
- Rest state: most variations are flat and in place in the middle of the viewport. The continuous flows (07, 14, 15) never quite are, on purpose. Either way, the lighting leaves the image untouched wherever it faces the viewer (`mix(dark, 1.0, normal.z)` is 1 when `normal.z` is 1).
- Two ways to drive it:
  - A ScrollTrigger per item (08, 09, 10, 13) sets uniforms in `onUpdate`. Keep `scrub: true`: without it, `onUpdate` doesn't run during a refresh, so the images wouldn't get their state on load and resize.
  - A continuous mapping (07, 11, 12, 14, 15) computes each image's state from where it is on the screen in `render()`, with no triggers. It can't pop, so prefer it.
- **No pop-in.** Nothing may appear on screen without moving in from an edge. With a trigger, the mesh jumps from flat to its start state when the trigger starts, so that state must still be entirely off-screen. Two things bring it on-screen early:
  - Geometry reaching past the item's rect (08's tilted rolls).
  - Depth behind the screen: perspective pulls a point at z = −d towards the middle of the viewport by `(viewport.height / 2) × d / 1000` px at the edge (09's twisted rows, 10's scattered tiles, 13's slices). Depth towards the viewer pushes things outwards and is harmless.
  
  Start and end the trigger that much earlier with function-based `start` and `end` (`getReach()`), which are re-evaluated on refresh. Check it by counting an image's visible pixels just before and just after its trigger starts: both must be 0. Mappings that wrap round (07's drum) `discard` past the valid angle, or far-away images come back as ghosts.
- Scroll-speed effects (07 liquid, 12 waves, 14 ripples) take Lenis's `velocity` into a shared uniform object spread into every material. It's eased with `1 - Math.pow(1 - k, gsap.ticker.deltaRatio())` so it behaves the same at any frame rate, and settles to 0 at rest. Nothing moves on its own when the page is still.
- Pieces that move independently (10's and 11's tiles, 13's slices) need their own vertices: build a `BufferGeometry` rather than share `PlaneGeometry` vertices across the crease.
- Don't declare a variable called `normal` in a vertex shader (three.js already defines the attribute). The files use `facing`.
- Reduced motion: no triggers and no Lenis, so the uniforms keep their flat defaults. Continuous mappings flatten out (`uCurve` 0.000001, no twist).

## Style

- Two-space indentation, single quotes, semicolons, trailing commas. Follow what's in the file.
- The same section headers (`// ----` blocks) and function names in every script: `createGalleryWrappers`, `positionGalleryItems`, `initWebGL`, `resizeWebGL`, `render`, `initGalleryAnimation` (`updateGallery` in the continuous ones: 07, 11, 12, 14 and 15), `animateMarquee`, `initEvents`, `init`.
- Few comments, short and plain, like the originals. They say what something looks like or why, not what the code does.
- Fonts only from the Typekit kit, through `font-1`…`font-4`. No italics.
- No build tooling and no new dependencies unless asked.

## Ask before changing

- Variations 01–05, which are the author's own, beyond bug fixes.
- The pages' `<title>`, the `frame__title` heading, the tags and the Article, All demos and GitHub links.
- The images and the README credits.
