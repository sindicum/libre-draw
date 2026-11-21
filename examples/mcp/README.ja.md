# LibreDraw MCP ブリッジ（参照実装）

[English](./README.md) | 日本語

AI エージェント（Claude Code やほかの MCP クライアント）が、ポインタやツールバーに触れずに、公開 API を通して LibreDraw の地図上の地物を読み書きできるようにする MCP サーバーです。`OperationResult` / `origin` の契約を実際に動かす例になっています。

```
MCP client ──stdio──▶ server/index.ts ──WebSocket──▶ browser page ──▶ LibreDraw (src/)
                      (14 tools)        127.0.0.1:8787   page/main.ts
```

Node のサーバーは中継するだけです。各ツールは LibreDraw のメソッド 1 つに対応し、引数はそのまま渡され、戻り値（幾何操作では `OperationResult`）は手を加えずに返ります。幾何演算・検証・履歴・イベントはすべて、ブラウザ上の LibreDraw の中にあります。

## できること

| ツール           | LibreDraw の呼び出し                            | 戻り値                                 |
| ---------------- | ----------------------------------------------- | -------------------------------------- |
| `get_features`   | `toGeoJSON()`                                   | FeatureCollection                      |
| `get_feature`    | `getFeatureById(id)`                            | Feature または `null`                  |
| `add_features`   | `addFeatures(features)`                         | `AddFeatureResult[]`                   |
| `update_feature` | `updateFeature(id, { geometry, properties })`   | `OperationResult`                      |
| `delete_feature` | `deleteFeature(id)`                             | 削除した Feature または `null`         |
| `split`          | `split(id, [start, end])`                       | `OperationResult`                      |
| `setback`        | `setback(id, { ring?, index }, distanceMeters)` | `OperationResult`                      |
| `rotate`         | `rotate(id, angleDeg)`                          | `OperationResult`                      |
| `union`          | `union(ids)`                                    | `OperationResult`                      |
| `cut`            | `cut(id, cutter)`                               | `OperationResult`                      |
| `reshape`        | `reshape(id, line)`                             | `OperationResult`                      |
| `select_feature` | `selectFeature(id)`                             | `{ ok: true }` または `{ ok, reason }` |
| `undo` / `redo`  | `undo()` / `redo()`                             | `boolean`                              |

失敗は例外になりません。幾何的な失敗は `{ ok: false, reason: 'invalid-intersection-count' }` などで返ります。`select_feature` に未知の id を渡すと `{ ok: false, reason: 'not-found' }`、`add_features` の不正な地物は配列の該当する要素に `{ valid: false, reason: 'invalid-feature', message }` として返ります（`reason` は常にコードで、検証の失敗では読める説明が `message` に入ります）。ページが接続されていない間は、どのツールも待たずにすぐ `{ ok: false, reason: 'no-client' }` を返します。LibreDraw 自体が例外を投げるのはインスタンスの誤用のときだけです（[Programmatic API](https://sindicum.github.io/libre-draw/guide/programmatic-api) を参照）。それもページ側の振り分けが安全策として `{ ok: false, reason: 'dispatch-error', message }` に変えます。

## セットアップ

リポジトリのルートで実行します。

```bash
# 1. ライブラリの依存パッケージ（clone ごとに 1 回）
npm install

# 2. サーバーの依存パッケージ（この例の中に置く）
cd examples/mcp && npm install && cd ../..

# 3. 地図のページ（リポジトリの Vite と src/ のソースを使う）
npx vite examples/mcp
```

表示された URL（既定では http://localhost:5173）を開きます。ページには、サンプルの区画と道路を載せた地図、LibreDraw のツールバー、右側のログパネルが表示されます。サーバーが起動するまで、パネルには「waiting for the MCP server」と表示されます。

### Claude Code にサーバーを登録する

```bash
claude mcp add libredraw -- npx --prefix examples/mcp tsx examples/mcp/server/index.ts
```

または、MCP クライアントの設定に次を追加します。

```json
{
  "mcpServers": {
    "libredraw": {
      "command": "npx",
      "args": ["--prefix", "examples/mcp", "tsx", "examples/mcp/server/index.ts"],
      "cwd": "/path/to/libre-draw"
    }
  }
}
```

サーバーは `ws://127.0.0.1:8787`（ループバックのみ）でページからの接続を待ちます。ポートは、サーバー側では環境変数 `LIBREDRAW_BRIDGE_PORT`、ページ側では `VITE_LIBREDRAW_BRIDGE_PORT` で変えられます。ページは自動で再接続するので、どちらを先に起動してもかまいません。

### 動作確認

クライアントに `get_features` を呼ばせます。ページを開いていれば、地物 `parcel` と `road` を含むサンプルの FeatureCollection が返ります。ページを閉じていれば `{ "ok": false, "reason": "no-client" }` が返ります。

## デモ:「この区画を道路に沿って分割して」

サンプルデータには、区画のポリゴンが 1 つと、それを横切る道路のラインが 1 本あります。エージェントに次のように頼みます。

> Split the parcel along the road.

十分な能力のあるエージェントは、次のように動きます。

1. `get_features` を呼び、`road` の座標を読む
2. 区画をまたぐ道路上の 2 点を選ぶ（道路の両端でよい）
3. `{ "id": "parcel", "line": [[139.76, 35.6825], [139.774, 35.6865]] }` で `split` を呼ぶ

地図上では区画が 2 つのポリゴンになり、ログパネルには `api` バッジ（API を通した変更）付きの `split` イベントが表示されます。`undo` で区画は元に戻ります。エージェントが区画とちょうど 2 回交わらない線を選ぶと、結果は `{ "ok": false, "reason": "invalid-intersection-count" }` になり、エージェントはやり直せます。失敗したときは地図上で何も変わりません。

エージェントが動いている間にツールバーで何かを描いたり動かしたりすると、同じイベントが `user` バッジ付きで表示されます。この区別が、LibreDraw のすべてのイベントにある `origin` フィールドです。

## 制限

- 同時に接続できるページは 1 つです。2 つ目のページの接続は拒否されます（`one page only`）。
- 認証もリモートアクセスもありません。WebSocket サーバーは `127.0.0.1` だけで待ち受けるので（`lsof -nP -iTCP:8787 -sTCP:LISTEN` で確認できます）、このマシンからしか接続できません。ローカルのエージェントとローカルのブラウザをつなぐためのものです。ブラウザからの接続は `Origin` でも検査し、`localhost`・`127.0.0.1`・`[::1]` から配信されたページだけを受け付けます（`local pages only`）。
- stdio だけに対応しています。HTTP / SSE のトランスポートはありません。
- サーバーは中継するだけで、GeoJSON を検証しません。検証は LibreDraw が行い、理由を返します。

## 構成

```
examples/mcp/
├── index.html            地図とログパネル
├── page/main.ts          地図・LibreDraw・ログパネル・ブリッジクライアントをつなぐ
├── page/dispatch.ts      ツール名 → LibreDraw のメソッド（ルートのテストスイートで単体テスト）
├── page/bridge-client.ts 再接続付きの WebSocket クライアント
├── page/log-panel.ts     origin で区別したイベント、ツール呼び出し、接続状態
├── page/sample.ts        区画と道路
├── server/index.ts       McpServer + stdio トランスポート + WebSocket サーバー
├── server/tools.ts       12 個のツール定義（zod の入力スキーマ）
├── server/bridge-host.ts タイムアウト付きのリクエスト / レスポンス仲介（単体テストあり）
└── server/origin.ts      ブラウザ接続の Origin 検査（単体テストあり）
```

このディレクトリで `npm run typecheck` を実行すると、サーバーとページの型を検査します。
