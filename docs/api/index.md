# API Reference

## Overview

LibreDraw exposes a single entry-point class and a set of TypeScript types.

### Main Class

| Export                         | Description                                             |
| ------------------------------ | ------------------------------------------------------- |
| [`LibreDraw`](/api/libre-draw) | Main facade class — constructor, methods, and lifecycle |

### Error Class

| Export                                        | Description                       |
| --------------------------------------------- | --------------------------------- |
| [`LibreDrawError`](/api/types#libredrawerror) | Error thrown by LibreDraw methods |

### Types

All types are exported as TypeScript type-only exports:

| Type                                                                                                                                                                                                                                                           | Description                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| [`LibreDrawFeature`](/api/types#libredrawfeature)                                                                                                                                                                                                              | A Point, LineString, or Polygon feature with id, geometry, and properties                                                                |
| [`FeatureCollection`](/api/types#featurecollection)                                                                                                                                                                                                            | GeoJSON FeatureCollection of `LibreDrawFeature`                                                                                          |
| [`PointGeometry`](/api/types#pointgeometry)                                                                                                                                                                                                                    | GeoJSON Point geometry                                                                                                                   |
| [`LineStringGeometry`](/api/types#linestringgeometry)                                                                                                                                                                                                          | GeoJSON LineString geometry                                                                                                              |
| [`PolygonGeometry`](/api/types#polygongeometry)                                                                                                                                                                                                                | GeoJSON Polygon geometry                                                                                                                 |
| [`LibreDrawGeometry`](/api/types#libredrawgeometry)                                                                                                                                                                                                            | Supported GeoJSON geometry union                                                                                                         |
| [`Position`](/api/types#position)                                                                                                                                                                                                                              | `[longitude, latitude]` coordinate pair                                                                                                  |
| [`FeatureProperties`](/api/types#featureproperties)                                                                                                                                                                                                            | Arbitrary key-value properties                                                                                                           |
| [`LibreDrawOptions`](/api/types#libredrawoptions)                                                                                                                                                                                                              | Constructor options                                                                                                                      |
| [`KeyboardOptions`](/api/types#keyboardoptions)                                                                                                                                                                                                                | Keyboard shortcut configuration                                                                                                          |
| [`SnapConfig`](/api/types#snapconfig)                                                                                                                                                                                                                          | Snapping configuration                                                                                                                   |
| [`ToolbarOptions`](/api/types#toolbaroptions)                                                                                                                                                                                                                  | Toolbar configuration                                                                                                                    |
| [`ToolbarPosition`](/api/types#toolbarposition)                                                                                                                                                                                                                | Toolbar placement                                                                                                                        |
| [`ToolbarControls`](/api/types#toolbarcontrols)                                                                                                                                                                                                                | Which toolbar buttons to show                                                                                                            |
| [`ModeName`](/api/types#modename)                                                                                                                                                                                                                              | `'idle' \| 'draw-point' \| 'draw-line' \| 'draw-polygon' \| 'draw-rectangle' \| 'select' \| 'split' \| 'union' \| 'setback' \| 'rotate'` |
| [`Action`](/api/types#action)                                                                                                                                                                                                                                  | Undo/redo action interface                                                                                                               |
| [`ActionType`](/api/types#actiontype)                                                                                                                                                                                                                          | `'create' \| 'update' \| 'delete' \| 'split' \| 'setback' \| 'union' \| 'batch'`                                                         |
| [`FeatureStoreInterface`](/api/types#featurestoreinterface)                                                                                                                                                                                                    | Store surface an `Action` applies to                                                                                                     |
| [`StyleConfig`](/api/types#styleconfig)                                                                                                                                                                                                                        | Full render style (fill, outline, preview, edit handles, midpoints, points)                                                              |
| [`PartialStyleConfig`](/api/types#partialstyleconfig)                                                                                                                                                                                                          | Partial style overrides for the constructor and `setStyle()`                                                                             |
| [`FillStyle`](/api/types#fillstyle), [`OutlineStyle`](/api/types#outlinestyle), [`PreviewStyle`](/api/types#previewstyle), [`EditVertexStyle`](/api/types#editvertexstyle), [`MidpointStyle`](/api/types#midpointstyle), [`PointStyle`](/api/types#pointstyle) | Sections of `StyleConfig`                                                                                                                |
| [`VertexStyle`](/api/types#vertexstyle)                                                                                                                                                                                                                        | **Deprecated.** Kept for compatibility, has no effect                                                                                    |
| [`LibreDrawEventMap`](/api/events#event-map)                                                                                                                                                                                                                   | Event name → payload map used by `on()` / `off()`                                                                                        |
| `CreateEvent`, `UpdateEvent`, `DeleteEvent`, `SplitEvent`, `SplitFailedEvent`, `SetbackEvent`, `SetbackFailedEvent`, `UnionEvent`, `UnionFailedEvent`, `RotateEvent`, `SelectionChangeEvent`, `ModeChangeEvent`, `DraftChangeEvent`                            | Event payloads, see [Events](/api/events)                                                                                                |
| [`SplitFailReason`](/api/events#splitfailed), [`SetbackFailReason`](/api/events#setbackfailed), [`UnionFailReason`](/api/events#unionfailed)                                                                                                                   | Failure reasons carried by the `*failed` events                                                                                          |
| [`NormalizedInputEvent`](/api/types#normalizedinputevent)                                                                                                                                                                                                      | Unified mouse/touch event                                                                                                                |
| [`InputType`](/api/types#inputtype)                                                                                                                                                                                                                            | `'mouse' \| 'touch'`                                                                                                                     |
| [`Locale`](/api/types#locale)                                                                                                                                                                                                                                  | `'en' \| 'ja'`                                                                                                                           |
| [`Messages`](/api/types#messages)                                                                                                                                                                                                                              | UI strings of the toolbar and popups                                                                                                     |

### Events

| Event                                            | Payload                | Description                               |
| ------------------------------------------------ | ---------------------- | ----------------------------------------- |
| [`create`](/api/events#create)                   | `CreateEvent`          | Feature created (point, line, or polygon) |
| [`update`](/api/events#update)                   | `UpdateEvent`          | Feature edited (point, line, or polygon)  |
| [`delete`](/api/events#delete)                   | `DeleteEvent`          | Feature deleted (point, line, or polygon) |
| [`split`](/api/events#split)                     | `SplitEvent`           | Polygon split into two polygons           |
| [`splitfailed`](/api/events#splitfailed)         | `SplitFailedEvent`     | Split operation failed                    |
| [`setback`](/api/events#setback)                 | `SetbackEvent`         | Setback operation succeeded               |
| [`setbackfailed`](/api/events#setbackfailed)     | `SetbackFailedEvent`   | Setback operation failed                  |
| [`union`](/api/events#union)                     | `UnionEvent`           | Two polygons merged into one              |
| [`unionfailed`](/api/events#unionfailed)         | `UnionFailedEvent`     | Union operation failed                    |
| [`rotate`](/api/events#rotate)                   | `RotateEvent`          | Feature rotated                           |
| [`selectionchange`](/api/events#selectionchange) | `SelectionChangeEvent` | Selection changed                         |
| [`modechange`](/api/events#modechange)           | `ModeChangeEvent`      | Mode switched                             |
| [`draftchange`](/api/events#draftchange)         | `DraftChangeEvent`     | In-progress drawing vertex count changed  |

### Values

Runtime exports besides the two classes above:

| Export                                                                                                                                                                        | Description                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [`DEFAULT_STYLE_CONFIG`](/api/types#style-defaults-and-merging)                                                                                                               | The built-in `StyleConfig`                                                          |
| [`mergeStyleConfig`](/api/types#style-defaults-and-merging)                                                                                                                   | Merge partial overrides onto the defaults                                           |
| [`BatchAction`](/api/types#batchaction), [`SplitAction`](/api/types#action-classes), [`SetbackAction`](/api/types#action-classes), [`UnionAction`](/api/types#action-classes) | Action classes recorded in the history, exported so integrations can recognise them |

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
