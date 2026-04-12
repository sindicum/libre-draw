# API Reference

## Overview

LibreDraw exposes a single entry-point class and a set of TypeScript types.

### Main Class

| Export | Description |
|--------|-------------|
| [`LibreDraw`](/api/libre-draw) | Main facade class — constructor, methods, and lifecycle |

### Error Class

| Export | Description |
|--------|-------------|
| [`LibreDrawError`](/api/types#libredrawerror) | Error thrown by LibreDraw methods |

### Types

All types are exported as TypeScript type-only exports:

| Type | Description |
|------|-------------|
| [`LibreDrawFeature`](/api/types#libredrawfeature) | A Point, LineString, or Polygon feature with id, geometry, and properties |
| [`PointGeometry`](/api/types#pointgeometry) | GeoJSON Point geometry |
| [`LineStringGeometry`](/api/types#linestringgeometry) | GeoJSON LineString geometry |
| [`PolygonGeometry`](/api/types#polygongeometry) | GeoJSON Polygon geometry |
| [`LibreDrawGeometry`](/api/types#libredrawgeometry) | Supported GeoJSON geometry union |
| [`Position`](/api/types#position) | `[longitude, latitude]` coordinate pair |
| [`FeatureProperties`](/api/types#featureproperties) | Arbitrary key-value properties |
| [`LibreDrawOptions`](/api/types#libredrawoptions) | Constructor options |
| [`ToolbarOptions`](/api/types#toolbaroptions) | Toolbar configuration |
| [`ToolbarPosition`](/api/types#toolbarposition) | Toolbar placement |
| [`ToolbarControls`](/api/types#toolbarcontrols) | Which toolbar buttons to show |
| [`ModeName`](/api/types#modename) | `'idle' \| 'draw-point' \| 'draw-line' \| 'draw' \| 'select' \| 'split' \| 'setback'` |
| [`Action`](/api/types#action) | Undo/redo action interface |
| [`ActionType`](/api/types#actiontype) | `'create' \| 'update' \| 'delete' \| 'split' \| 'setback'` |
| [`NormalizedInputEvent`](/api/types#normalizedinputevent) | Unified mouse/touch event |
| [`InputType`](/api/types#inputtype) | `'mouse' \| 'touch'` |

### Events

| Event | Payload | Description |
|-------|---------|-------------|
| [`create`](/api/events#create) | `CreateEvent` | Feature created (point, line, or polygon) |
| [`update`](/api/events#update) | `UpdateEvent` | Feature edited (point, line, or polygon) |
| [`delete`](/api/events#delete) | `DeleteEvent` | Feature deleted (point, line, or polygon) |
| [`split`](/api/events#split) | `SplitEvent` | Polygon split into two polygons |
| [`splitfailed`](/api/events#splitfailed) | `SplitFailedEvent` | Split operation failed |
| [`setback`](/api/events#setback) | `SetbackEvent` | Setback operation succeeded |
| [`setbackfailed`](/api/events#setbackfailed) | `SetbackFailedEvent` | Setback operation failed |
| [`selectionchange`](/api/events#selectionchange) | `SelectionChangeEvent` | Selection changed |
| [`modechange`](/api/events#modechange) | `ModeChangeEvent` | Mode switched |

## Quick Example

```ts
import { LibreDraw } from '@sindicum/libre-draw';
import type { LibreDrawFeature, CreateEvent } from '@sindicum/libre-draw';

const draw = new LibreDraw(map);

draw.on('create', (e: CreateEvent) => {
  const feature: LibreDrawFeature = e.feature;
  console.log(feature.id, feature.geometry.coordinates);
});
```
