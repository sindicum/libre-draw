# Known Limitations

What LibreDraw does not do, and the conditions its operations need. Each limit below is
current behavior; one that changes is noted in the release notes.

## Geometry

- **Point, LineString, and Polygon only.** MultiPoint, MultiLineString, MultiPolygon, and
  GeometryCollection are rejected on input, and no operation produces them: a
  [`cut`](/api/libre-draw#cut-id-cutter) that leaves several pieces makes separate
  Polygons, and a [`union`](/api/libre-draw#union-ids) whose result would be a
  MultiPolygon fails with `disjoint`.
- **Two dimensions.** Positions are `[longitude, latitude]`. An altitude or any further
  value in a position is dropped on input.
- **Coordinate range.** Longitude must be within -180 to 180 and latitude within -90 to 90.
  A shape is not split at the antimeridian, and a rotation that would leave the range or
  bend a ring across another near the antimeridian or the poles is refused
  ([`editrejected`](/api/events#editrejected) with `rotate`).
- **Stored coordinates are rounded** to
  [`coordinatePrecision`](/guide/getting-started#coordinate-precision) (8 decimal places
  by default), and a shape that rounding would make invalid is refused.
- **Valid shapes only.** A ring must be closed, have at least three distinct vertices not
  all on one line, and not cross itself; holes must lie inside the outer ring without
  crossing it, each other, or nesting. Input that breaks these rules is rejected, and
  editing that would break them is refused.
- **Feature ids are strings.** A feature with a number id, or none, gets a generated UUID.
  A `properties` value that is not a plain object becomes `{}`. Members of a Feature
  other than `id`, `geometry`, and `properties` are not kept.

## Operations

Each operation fails, changing nothing, when its condition is not met. The failure codes
are listed on the [Types](/api/types#operation-result-types) and
[Events](/api/events) pages.

| Operation                                               | Works on            | Condition                                                                                                                                                                                                        |
| ------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Split](/guide/modes#split-mode)                        | Polygon, LineString | A polygon must have no holes, and the split line must cross its outer ring exactly twice. A line is split at the first point where the split line crosses it.                                                    |
| [Cut](/guide/modes#cut-mode)                            | Polygon             | The cutter must overlap the polygon and must not cover it entirely. Several remaining pieces become separate Polygons with new ids.                                                                              |
| [Reshape](/guide/modes#reshape-mode)                    | Polygon             | The line must cross the outer ring exactly twice. Only the outer ring is reshaped, and the result must keep every hole inside it without crossing.                                                               |
| [Union](/guide/modes#union-mode)                        | Polygon             | Two or more polygons without holes that all connect, directly or through each other. The result must be a single polygon without holes.                                                                          |
| [Setback](/guide/modes#setback-mode)                    | Polygon             | The polygon must have no holes. The distance must leave part of the polygon (it cannot reach past the opposite side).                                                                                            |
| [Rotate](/guide/modes#rotate-mode)                      | Polygon, LineString | Points are not rotated.                                                                                                                                                                                          |
| [Topological editing](/guide/modes#topological-editing) | Polygon             | Only vertices at exactly the same position move together. Lines and points do not move along, and there is no shared-edge model: two polygons whose edges overlap without shared vertices are edited separately. |

## Calculation

- **Rotation** happens in Web Mercator around the shape's area-weighted centroid, so a shape
  keeps its on-screen form at any latitude.
- **Setback distances** are in meters, measured geodesically from the picked edge.
- **Areas** from [`getArea()`](/api/libre-draw#getarea-id) are computed on a sphere with the
  mean Earth radius (6,371,008.8 m). Pass `measureArea` for an ellipsoidal or projected
  area.
- **Everything else treats longitude and latitude as plane coordinates.** Split, cut,
  reshape, union, and the self-intersection checks compute in that plane; edges are not
  great circles.

## Snapping

- Snap targets are the features LibreDraw holds: point positions, line vertices and edges,
  and the vertices and edges of every polygon ring, holes included. Layers of the map that
  LibreDraw does not draw are not snap targets.
- Only features in the current viewport are considered, within the snap threshold in
  pixels (10 by default). There is no grid, angle, or length snapping; rotation snaps to
  15° steps with Shift.

## Scale and state

- LibreDraw is built for tens to hundreds of features in one session. It has no spatial
  index: hit testing scans every feature, and snapping scans the features in view.
- Features, selection, and history live in memory only. Save them with
  [`toGeoJSON()`](/api/libre-draw#togeojson) and restore them with
  [`setFeatures()`](/api/libre-draw#setfeatures-geojson), which starts a new history.
- History keeps the last [`historyLimit`](/api/types#libredrawoptions) steps (100 by
  default).
- A call that changes features during a drag cancels the drag first, even when the call
  fails; see [Calls during a drag](/guide/programmatic-api#calls-during-a-drag).

## Outside the public API

The toolbar's DOM structure and styling, the wording of messages, and modules not exported
from the package can change in any release. See
[Versioning and Stability](/guide/versioning) for what the public API covers.
