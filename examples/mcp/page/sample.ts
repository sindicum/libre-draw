import type { LibreDrawFeature } from '../../../src';

/**
 * One parcel and one road that crosses it, near Tokyo Station. The demo in
 * the README asks the AI to split the parcel along the road: the road's end
 * points are a valid two-point split line for `parcel`.
 */
export const SAMPLE_FEATURES: LibreDrawFeature[] = [
  {
    id: 'parcel',
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [139.762, 35.68],
          [139.772, 35.68],
          [139.772, 35.688],
          [139.762, 35.688],
          [139.762, 35.68],
        ],
      ],
    },
    properties: { name: 'parcel', landUse: 'field' },
  },
  {
    id: 'road',
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: [
        [139.76, 35.6825],
        [139.774, 35.6865],
      ],
    },
    properties: { name: 'road' },
  },
];
