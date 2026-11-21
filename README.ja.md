# LibreDraw

[English](./README.md) | 日本語

[![npm version](https://img.shields.io/npm/v/%40sindicum%2Flibre-draw.svg)](https://www.npmjs.com/package/@sindicum/libre-draw)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/sindicum/libre-draw/actions/workflows/ci.yml/badge.svg)](https://github.com/sindicum/libre-draw/actions/workflows/ci.yml)

[MapLibre GL JS](https://maplibre.org/) 向けの、ポイント・ライン・ポリゴンの描画・編集ライブラリです。

## 特長

- **設定不要** — `new LibreDraw(map)` だけで、ツールバー付きの描画機能がすぐに使えます
- **ポイントの描画** — クリック／タップでポイントを置きます
- **ラインの描画** — クリック／タップで頂点を追加し、最後の頂点をクリック／タップして確定します
- **ポリゴンの描画** — クリック／タップで頂点を置き、最初または最後の頂点をクリック／タップして閉じます
- **矩形の描画** — 対角の 2 点をクリック／タップして、軸に平行な矩形を作ります
- **角度付き矩形の描画** — 任意の角度の底辺をクリック／タップし、続けて幅を決める点を指定します
- **選択と編集** — 地物をクリックして選択し、頂点のドラッグで形を変え、中間点のドラッグで頂点を追加します。ポリゴンの穴も同じ方法で編集できます
- **地物のドラッグ** — 選択したポイント・ライン・ポリゴン全体をドラッグして移動します
- **分割** — 2 点を結ぶ分割線で、ポリゴンやラインを 2 つに分けます
- **切り抜き** — 輪郭を描いてポリゴンから領域を取り除きます（穴、切り欠き、別々の断片）
- **境界の引き直し** — ポリゴンの境界と 2 回交わるラインを描き、境界の一部を描き直して面積を足したり削ったりします
- **統合** — 接している、または重なっている 2 つ以上のポリゴンを 1 つにまとめます。クリックで選択し、Enter キーか実行ボタンを押します
- **辺のセットバック** — 選択した辺を内側へずらし、セットバックした帯を取り除きます
- **回転** — ポリゴンやラインを、ドラッグまたは相対角度の入力で回転します
- **スナップ** — 描画・編集中に、近くの既存の頂点や辺に頂点が吸着します
- **元に戻す／やり直す** — すべての操作が履歴に残ります
- **GeoJSON の入出力** — 標準的な GeoJSON の FeatureCollection（Point、LineString、Polygon）を読み込み・書き出しできます
- **タッチ優先** — 十分な大きさのタッチターゲット（44px 以上）、長押し、ジェスチャーの扱いなど、モバイルを前提に設計しています
- **中央十字による入力** — 指で隠れる場所をタップする代わりに、地図の中央に固定した十字と「点を追加」「1 つ戻す」「完了」ボタンで点を置けます。ツールバーまたは API で切り替えます
- **MapLibre のレイヤーによる見た目の指定** — 地物と編集用ハンドルの見た目を、通常の MapLibre のレイヤー定義と式で指定できます。エクスポートしている `DEFAULT_LAYERS` から始められます
- **自己交差の防止** — 不正なポリゴンになる編集は拒否します。外輪と交わる穴や、外輪の外に出る穴も含みます
- **フレームワーク非依存** — バニラ JS、React、Vue など、どのフレームワークでも使えます
- **TypeScript** — 型定義を同梱しています
- **ヘッドレスモード** — ツールバーを無効にして、すべてを API から操作できます

## クイックスタート

```bash
npm install @sindicum/libre-draw maplibre-gl
```

```typescript
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { LibreDraw } from '@sindicum/libre-draw';

// MapLibre GL JS v6 は、一度渡した URL から worker を読み込みます（これは Vite での書き方です。
// ほかのバンドラーは https://maplibre.org/maplibre-gl-js/docs/#installation を参照）。
// MapLibre v5 では worker がバンドルに含まれるので、この呼び出しと上の import は不要です。
maplibregl.setWorkerUrl(workerUrl);

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://demotiles.maplibre.org/style.json',
  center: [0, 0],
  zoom: 2,
});

const draw = new LibreDraw(map);

draw.on('create', (e) => {
  console.log('Feature created:', e.feature.geometry.type, e.feature);
});

draw.on('update', (e) => {
  console.log('Feature updated:', e.feature.geometry.type, e.feature);
});
```

## API

### コンストラクタ

```typescript
new LibreDraw(map: maplibregl.Map, options?: LibreDrawOptions)
```

### メソッド

| メソッド                            | 説明                                                                                                                                                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setMode(mode)`                     | モードを切り替えます: `'idle'`、`'draw-point'`、`'draw-line'`、`'draw-polygon'`、`'draw-rectangle'`、`'draw-angled-rectangle'`、`'select'`、`'split'`、`'union'`、`'setback'`、`'rotate'`、`'cut'`、`'reshape'` |
| `getMode()`                         | 現在のモードを返します                                                                                                                                                                                          |
| `setInputMethod(method)`            | 描画モードでの点の置き方を選びます: `'tap'`（地図をクリック／タップ）または `'reticle'`（中央十字と「点を追加」ボタン）                                                                                         |
| `getInputMethod()`                  | 現在の入力方式を返します                                                                                                                                                                                        |
| `setTopologicalEditing(enabled)`    | select モードで、ポリゴンが共有する頂点を一緒に編集するかどうかを切り替えます                                                                                                                                   |
| `getTopologicalEditing()`           | 共有する頂点を一緒に編集するかどうかを返します                                                                                                                                                                  |
| `finishDrawing()`                   | 描画中のラインまたはポリゴンを確定します                                                                                                                                                                        |
| `cancelDrawing()`                   | 描画中の下書きを破棄します                                                                                                                                                                                      |
| `undoLastVertex()`                  | 下書きに最後に置いた点を取り消します                                                                                                                                                                            |
| `getDraftVertexCount()`             | 下書きの点の数を返します                                                                                                                                                                                        |
| `getFeatures()`                     | すべての地物を配列で返します                                                                                                                                                                                    |
| `toGeoJSON()`                       | すべての地物を GeoJSON の FeatureCollection で書き出します                                                                                                                                                      |
| `getFeatureById(id)`                | ID で地物を 1 件取得します                                                                                                                                                                                      |
| `setFeatures(geojson)`              | すべての地物を GeoJSON の FeatureCollection で置き換えます（全件を置き換えるか何も変えないか。`{ ok, ... }` を返す）                                                                                            |
| `addFeatures(features)`             | GeoJSON の Feature の配列を追加します（1 ステップで元に戻せる）。地物ごとに `{ valid, id, reason?, message? }` を 1 件返し、不正なものは例外ではなくそこで報告します                                            |
| `validateFeature(feature)`          | 追加せず、例外も投げずに、`addFeatures` と同じ規則でオブジェクトを検査します                                                                                                                                    |
| `deleteFeature(id)`                 | ID で地物を削除します（元に戻せる）                                                                                                                                                                             |
| `updateFeature(id, patch)`          | 地物のジオメトリとプロパティの一方または両方を置き換えます（元に戻せる、`{ ok, ... }` を返す）                                                                                                                  |
| `rotate(id, angleDeg)`              | ポリゴンまたはラインを重心のまわりに回転します（元に戻せる、`{ ok, ... }` を返す）                                                                                                                              |
| `split(id, line)`                   | 2 点を通る線に沿って、ポリゴンまたはラインを分割します（元に戻せる、`{ ok, ... }` を返す）                                                                                                                      |
| `setback(id, edge, distanceMeters)` | ポリゴンの辺を、メートル単位の距離だけ内側へ動かします（元に戻せる、`{ ok, ... }` を返す）                                                                                                                      |
| `union(ids)`                        | 2 つ以上のポリゴンを 1 つに統合します（元に戻せる、`{ ok, ... }` を返す）                                                                                                                                       |
| `cut(id, cutter)`                   | リングで囲んだ領域をポリゴンから切り抜きます（元に戻せる、`{ ok, ... }` を返す）                                                                                                                                |
| `reshape(id, line)`                 | ポリゴンの外輪の一部をラインで置き換えます（元に戻せる、`{ ok, ... }` を返す）                                                                                                                                  |
| `selectFeature(id)`                 | プログラムから地物を選択します（未知の id では `false` を返す）                                                                                                                                                 |
| `selectFeatures(ids)`               | 複数の地物を一度に選択します（空のリストか未知の id を含むと `false` を返す）                                                                                                                                   |
| `clearSelection()`                  | 選択を解除します                                                                                                                                                                                                |
| `getSelectedFeatureIds()`           | 選択中の地物の ID を返します                                                                                                                                                                                    |
| `undo()`                            | 最後の操作を元に戻します                                                                                                                                                                                        |
| `redo()`                            | 最後に元に戻した操作をやり直します                                                                                                                                                                              |
| `canUndo()` / `canRedo()`           | 元に戻せる／やり直せる操作があるかを返します（`historychange` イベントにも含まれる）                                                                                                                            |
| `setSetbackDistance(meters)`        | セットバックモードがプレビューし適用する距離を設定します（ツールバーの入力欄の値。`toolbar: false` でも使える）                                                                                                 |
| `getSetbackDistance()`              | その距離を返します                                                                                                                                                                                              |
| `getSetbackEdge()`                  | セットバックモードで選んだ辺を返します（選ぶまでは `undefined`）。`setback()` に渡せます                                                                                                                        |
| `setLayers(layers)`                 | LibreDraw が描画に使う MapLibre のレイヤーを置き換えます（`DEFAULT_LAYERS` と `SOURCE_IDS` を参照）                                                                                                             |
| `on(event, callback)`               | イベントリスナーを登録します                                                                                                                                                                                    |
| `off(event, callback)`              | イベントリスナーを解除します                                                                                                                                                                                    |
| `destroy()`                         | すべてのリソースを解放します                                                                                                                                                                                    |

### イベント

| イベント          | ペイロード                                            | 説明                                                         |
| ----------------- | ----------------------------------------------------- | ------------------------------------------------------------ |
| `create`          | `{ feature }`                                         | 地物が作成された（ポイント、ライン、ポリゴン）               |
| `update`          | `{ feature, oldFeature }`                             | 地物が更新された                                             |
| `delete`          | `{ feature }`                                         | 地物が削除された                                             |
| `split`           | `{ originalFeature, features: [featureA, featureB] }` | ポリゴンまたはラインが 2 つに分割された                      |
| `splitfailed`     | `{ reason, featureId }`                               | 分割に失敗した                                               |
| `setback`         | `{ originalFeature, feature, edgeIndex, distance }`   | セットバックに成功した                                       |
| `setbackfailed`   | `{ reason, featureId }`                               | セットバックに失敗した                                       |
| `union`           | `{ originalFeatures: [...features], feature }`        | 2 つ以上のポリゴンが 1 つに統合された                        |
| `unionfailed`     | `{ reason, featureIds }`                              | 統合に失敗した                                               |
| `cut`             | `{ originalFeature, features: [...pieces] }`          | ポリゴンから領域が切り抜かれた                               |
| `cutfailed`       | `{ reason, featureId }`                               | 切り抜きに失敗した                                           |
| `reshape`         | `{ originalFeature, feature }`                        | ポリゴンの境界の一部が引き直された                           |
| `reshapefailed`   | `{ reason, featureId }`                               | 境界の引き直しに失敗した                                     |
| `rotate`          | `{ originalFeature, feature, angle }`                 | ポリゴンまたはラインが回転した                               |
| `selectionchange` | `{ selectedIds }`                                     | 選択が変わった                                               |
| `modechange`      | `{ mode, previousMode }`                              | モードが変わった                                             |
| `draftchange`     | `{ vertexCount }`                                     | 描画中の下書きの点が増減した、または下書きが確定・破棄された |
| `historychange`   | `{ canUndo, canRedo }`                                | 元に戻す／やり直すの履歴が変わった                           |
| `editrejected`    | `{ action, reason, featureId? }`                      | 地図上の編集または回転が拒否され、何も変わらなかった         |

どのペイロードにも `origin: 'api' | 'user'` が含まれます。リスナーは、API を通した変更（自分の `addFeatures()` / `deleteFeature()` / `undo()` など）と、利用者のポインタ・ツールバー・キーボードによる操作を見分けられます。

### オプション

```typescript
interface LibreDrawOptions {
  toolbar?:
    | boolean
    | {
        position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
        controls?: {
          drawPoint?: boolean;
          drawLine?: boolean;
          drawPolygon?: boolean;
          drawRectangle?: boolean;
          drawAngledRectangle?: boolean;
          inputMethod?: boolean; // タップ／中央十字の切り替え
          select?: boolean;
          split?: boolean;
          cut?: boolean;
          reshape?: boolean;
          union?: boolean;
          setback?: boolean;
          rotate?: boolean;
          delete?: boolean;
          undo?: boolean;
          redo?: boolean;
        };
      };
  keyboard?: boolean | { undoRedo?: boolean }; // Ctrl/Cmd+Z、Ctrl/Cmd+Shift+Z、Ctrl+Y。既定: true
  historyLimit?: number; // 既定: 100
  layers?: LayerSpecification[]; // DEFAULT_LAYERS の代わりに描画に使う MapLibre のレイヤー
  snap?: boolean | { enabled?: boolean; threshold?: number }; // 既定: true
  locale?: 'en' | 'ja'; // UI の言語。既定: 'en'
  messages?: Partial<Messages>; // UI の文言を個別に上書き
  inputMethod?: 'tap' | 'reticle'; // 描画モードでの点の置き方。既定: 'tap'
  coordinatePrecision?: number | false; // 保存する座標の小数点以下の桁数（0〜15）。既定: 8
  topologicalEditing?: boolean; // 隣り合うポリゴンが共有する頂点を一緒に編集する。既定: false
}
```

`toolbar: false` でヘッドレスモード（API のみで UI なし）になります。元に戻す／やり直すのキーボードショートカットはヘッドレスモードでも有効で、地図にフォーカスがあるときだけ動きます。無効にするには `keyboard: false` を指定します。

## ドキュメント

デモ付きのドキュメント（英語）は次の場所にあります。

**https://sindicum.github.io/libre-draw/**

どのメソッドも戻り値（`{ ok, ... }`、地物ごとの結果、または真偽値）で答え、例外を投げるのはインスタンスの誤用のときだけです。そのため、同じ API を自分のコードからも AI エージェントからも使えます。戻り値と例外の一覧と `origin` の規則は [Programmatic API](https://sindicum.github.io/libre-draw/guide/programmatic-api) を参照してください。ローカルで使う MCP サーバーの参照実装が [`examples/mcp`](./examples/mcp) にあります。

## バージョン

LibreDraw は [セマンティックバージョニング](https://semver.org/) に従います。1.0.0 以降、公開 API を壊すのはメジャーバージョンだけです（1.0.0 より前は、`0.x` のマイナーバージョンでも壊すことがあります）。公開 API の範囲は [Versioning and Stability](https://sindicum.github.io/libre-draw/guide/versioning) を参照してください。

## 開発

```bash
# 依存パッケージのインストール
npm install

# サンプル付きの開発サーバーを起動
npm run dev

# テスト
npm test

# Lint
npm run lint

# 型チェック
npm run typecheck

# ビルド
npm run build

# ドキュメントサイト
npm run docs:dev

# 整形（Prettier）
npm run format
```

`.git-blame-ignore-revs` には、コードの整形だけを行ったコミットが載っています。clone ごとに一度次を実行すると、`git blame` がそれらを飛ばし、各行を実際に書いた人を表示します（GitHub の blame 表示は設定なしでこのファイルを反映します）。

```bash
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

## 動作要件

- MapLibre GL JS v5 または v6（peer dependency、`>=5.0.0 <7.0.0`）
- WebGL に対応したモダンブラウザ（MapLibre v6 では WebGL2）

## ライセンス

[MIT](./LICENSE)
