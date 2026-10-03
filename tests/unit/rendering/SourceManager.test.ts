import { describe, it, expect, beforeEach } from 'vitest';
import type { Map as MaplibreMap } from 'maplibre-gl';
import { SourceManager } from '../../../src/rendering/SourceManager';
import { SOURCE_IDS } from '../../../src/rendering/layers';

type SourceOptions = { type: 'geojson'; data: GeoJSON.FeatureCollection; promoteId?: string };

/** Minimal map stand-in that records the options each source was added with. */
class FakeMap {
  readonly added: Array<{ id: string; options: SourceOptions }> = [];
  private sources = new Map<string, SourceOptions>();

  getSource(id: string): SourceOptions | undefined {
    return this.sources.get(id);
  }

  addSource(id: string, options: SourceOptions): void {
    this.added.push({ id, options });
    this.sources.set(id, options);
  }

  removeSource(id: string): void {
    this.sources.delete(id);
  }

  optionsFor(id: string): SourceOptions | undefined {
    return this.sources.get(id);
  }
}

function createManager(): { map: FakeMap; manager: SourceManager } {
  const map = new FakeMap();
  return { map, manager: new SourceManager(map as unknown as MaplibreMap) };
}

describe('SourceManager', () => {
  let map: FakeMap;
  let manager: SourceManager;

  beforeEach(() => {
    ({ map, manager } = createManager());
  });

  it('should add all six sources on initialize', () => {
    manager.initialize();

    expect(map.added.map((s) => s.id).sort()).toEqual(
      [
        SOURCE_IDS.FEATURES,
        SOURCE_IDS.PREVIEW,
        SOURCE_IDS.EDGE_HIGHLIGHT,
        SOURCE_IDS.EDIT_VERTICES,
        SOURCE_IDS.SNAP_INDICATOR,
        SOURCE_IDS.ROTATION_CENTER,
      ].sort()
    );
    expect(manager.hasAllSources()).toBe(true);
  });

  it('should promote libre-draw:id on the features source', () => {
    // promoteId keeps the string feature ids that setFeatureState needs.
    manager.initialize();

    expect(map.optionsFor(SOURCE_IDS.FEATURES)?.promoteId).toBe('libre-draw:id');
  });

  it('should not promote ids on the sources that carry no feature state', () => {
    manager.initialize();

    for (const id of [
      SOURCE_IDS.PREVIEW,
      SOURCE_IDS.EDGE_HIGHLIGHT,
      SOURCE_IDS.EDIT_VERTICES,
      SOURCE_IDS.SNAP_INDICATOR,
      SOURCE_IDS.ROTATION_CENTER,
    ]) {
      expect(map.optionsFor(id)?.promoteId).toBeUndefined();
    }
  });

  it('should start every source empty', () => {
    manager.initialize();

    for (const { options } of map.added) {
      expect(options.type).toBe('geojson');
      expect(options.data).toEqual({ type: 'FeatureCollection', features: [] });
    }
  });

  it('should not add a source twice when initialized again', () => {
    manager.initialize();
    manager.initialize();

    expect(map.added).toHaveLength(6);
  });

  it('should re-add missing sources after a style swap removed them', () => {
    manager.initialize();
    map.removeSource(SOURCE_IDS.FEATURES);

    manager.initialize();

    expect(map.optionsFor(SOURCE_IDS.FEATURES)?.promoteId).toBe('libre-draw:id');
    expect(manager.hasAllSources()).toBe(true);
  });

  it('should report missing sources', () => {
    expect(manager.hasAllSources()).toBe(false);
  });

  it('should remove every source on destroy', () => {
    manager.initialize();

    manager.destroy();

    expect(manager.hasAllSources()).toBe(false);
  });
});
