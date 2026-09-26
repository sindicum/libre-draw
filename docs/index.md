---
layout: home

hero:
  name: LibreDraw
  text: A Geometry Editor for MapLibre GL JS
  tagline: Built for real editing work such as maintaining parcels and boundaries. Beyond drawing, it covers the edits that come after — splitting, merging, and setting back polygons — together with undo/redo, snapping, and touch-first input.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: API Reference
      link: /api/
    - theme: alt
      text: Live Demo
      link: /examples/

features:
  - title: Editing Beyond Drawing
    details: Split a polygon or line, merge adjacent polygons, set back a polygon edge inward by a given distance, and rotate features — all built in. Rectangles aligned with roads or existing boundaries can be drawn in one go as angled rectangles. Setback distances and rotation angles can be entered as numeric values.

  - title: Touch Without Compromise
    details: Supports tap, long-press, double-tap, and drag gestures. Polygons are finished by tapping their first or last vertex and lines by tapping their last, with no reliance on double-tap timing. Pinch gestures are left to map zoom. The same operations work with a mouse and keyboard.

  - title: Precise Input with a Center Reticle
    details: Move the map under a crosshair fixed at the center of the screen and tap a button to place each point. Your finger never hides the spot, so you can draw accurately on a phone while checking aerial imagery and existing boundaries. Works with point, line, polygon, and rectangle drawing, with snapping.

  - title: Consistent Undo / Redo
    details: Every operation, from creation to split, merge, rotate, setback, and delete, goes into a single history, and each one is undone in a single step. Keyboard shortcuts are supported and the history limit is configurable.

  - title: Zero Config
    details: Just pass a MapLibre Map instance and the built-in toolbar appears, ready for editing. Toolbar buttons and position, styles, and the UI language (English or Japanese) can be changed as needed.

  - title: The Same Editing API, With or Without the UI
    details: Split, merge, rotate, setback, and update are also available as public methods that return structured results. They share the same geometry logic and undo/redo history as the toolbar, so changes made from application code, automation, or an AI agent can be undone just the same.
---
