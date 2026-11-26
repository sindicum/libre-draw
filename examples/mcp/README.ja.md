# AI で LibreDraw を動かす: ローカル MCP デモ

[English](./README.md) | 日本語

「この区画を道路に沿って分割して」のように AI エージェントに言葉で頼むと、ブラウザの地図がそのとおりに変わります。このデモは Claude Code（またはほかの MCP クライアント）を MCP で LibreDraw の地図につなぎ、エージェントがマウスの代わりに LibreDraw の公開 API で地図を編集します。

始める前に、このデモが何で、何でないかを確認してください。

- **自分のパソコンの中だけで動きます。** MCP サーバーも地図のページもローカルで動き、ネットワークには何も公開しません。
- **npm パッケージには含まれていません。** `npm install @sindicum/libre-draw` では入りません。このリポジトリを clone して、そこから実行します。
- **体験用のデモで、本番構成のひな形ではありません。** 実際の Web アプリにエージェントをつなぐ方法は [In production](https://sindicum.github.io/libre-draw/guide/programmatic-api#in-production)（英語）を参照してください。

## 必要なもの

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/)（現行の LTS。リポジトリの CI は Node.js 24 を使っています）
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code)（ほかの MCP クライアントでも動きます。[ほかの MCP クライアント](#ほかの-mcp-クライアント)を参照）
- Web ブラウザと、地図タイルを読み込むためのインターネット接続
- ターミナルを 2 つ。1 つは地図のページを動かしたままにし、もう 1 つで Claude Code を動かします

## 試してみる

### 1. コードを取得する

```bash
git clone https://github.com/sindicum/libre-draw.git
cd libre-draw
npm install
cd examples/mcp && npm install && cd ../..
```

1 回目の `npm install` はライブラリの準備、2 回目は MCP サーバーの準備です。最初に 1 回だけ行います。

### 2. 地図のページを起動する（ターミナル 1）

`libre-draw` フォルダで実行します。

```bash
npx vite examples/mcp
```

表示された URL（既定では http://localhost:5173）をブラウザで開きます。サンプルの区画（長方形）とそれを横切る道路（線）を載せた地図、LibreDraw のツールバー、右側のログパネルが表示されます。この時点のパネルには「waiting for the MCP server」と表示されます。このターミナルは起動したままにしておきます。

### 3. サーバーを登録して Claude Code を起動する（ターミナル 2）

こちらも `libre-draw` フォルダで実行します。

```bash
claude mcp add libredraw -- npx --prefix examples/mcp tsx examples/mcp/server/index.ts
claude
```

`claude` は必ず `libre-draw` フォルダで起動してください。登録はそのフォルダにだけ効き、コマンドもそのフォルダからの相対パスを使っています。ほかの場所で起動した Claude Code にはツールが現れません。

Claude Code が起動すると MCP サーバーも起動し、ブラウザのログパネルが「connected to the MCP server」に変わります。

### 4. 接続を確かめる

Claude Code に次のように頼みます。

> libredraw の get_features ツールで、地図上の地物を見せて。

地図上の 2 つの地物 `parcel`（区画）と `road`（道路）が返ってきます。代わりに `{ "ok": false, "reason": "no-client" }` が返ったときは、地図のページが開いていません。手順 2 の URL を開いてください。

### 5. 編集を頼む

> 区画を道路に沿って分割して。

エージェントは `get_features` で道路の座標を読み、それを使って `split` を呼びます。地図上では区画が 2 つのポリゴンになり、ログパネルには `api` バッジ付きの `split` イベントが表示されます。`api` は、エージェントによる変更であることを表します。続けて次のように頼みます。

> 今の操作を元に戻して。

区画が 1 つに戻ります。ほかにも「区画を 30 度回転して」「区画の北側の辺を 20 m 内側に下げて」「区画をもう一度道路で分割して、2 つを結合し直して」などを頼めます。

自分でツールバーを使って何かを描いたり動かしたりすると、ログパネルには `user` バッジ付きで表示されます。LibreDraw のすべてのイベントは、この区別を `origin` フィールドに持っています。

### 6. 後片付け

ターミナル 1 で `Ctrl+C` を押して地図のページを止め、Claude Code を終了します。登録が不要になったら、次のコマンドで外します。

```bash
claude mcp remove libredraw
```

## うまくいかないとき

- **Claude Code に libredraw のツールがない。** `libre-draw` フォルダ以外で起動したか、`claude mcp add` より前に起動しています。Claude Code を終了し、`libre-draw` フォルダでもう一度 `claude` を起動してください。`claude mcp list` で登録されているか確かめられます。
- **どのツールも `no-client` を返す。** 地図のページが開いていないか、ブラウザのタブを閉じています。手順 2 の URL を開いてください。ページは自動で再接続します。
- **ログパネルが「waiting for the MCP server」のまま。** Claude Code が起動していないか、ポート 8787 がほかで使われていてサーバーが起動できていません（このデモを動かしているほかの Claude Code のセッションなど）。そのセッションを終了するか、サーバー側の `LIBREDRAW_BRIDGE_PORT` とページ側の `VITE_LIBREDRAW_BRIDGE_PORT` を同じ番号にしてポートを変えてください。
- **2 つ目のタブがつながらない。** 同時に接続できるページは 1 つです。もう一方のタブを閉じてください。

## 仕組み

コードを理解したい、流用したい開発者向けの説明です。

```
MCP client ──stdio──▶ server/index.ts ──WebSocket──▶ browser page ──▶ LibreDraw (src/)
                      (14 tools)        127.0.0.1:8787   page/main.ts
```

MCP クライアントが Node のサーバーを起動し、stdio で通信します。サーバーは中継するだけです。各ツールは LibreDraw のメソッド 1 つに対応し、引数はそのまま渡され、戻り値（幾何操作では `OperationResult`）は手を加えずに返ります。幾何演算・検証・履歴・イベントはすべて、ブラウザ上の LibreDraw の中にあります。ページは要求に答えるだけなので、ツールバーでの変更はエージェントに通知されません。エージェントは操作の前に `get_features` で現在の状態を読み直します。

### ツール

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

### 失敗のとき

失敗は例外になりません。エージェントは理由を読んでやり直せます。幾何的な失敗は `{ ok: false, reason: 'invalid-intersection-count' }` などで返り、地図上では何も変わりません。`select_feature` に未知の id を渡すと `{ ok: false, reason: 'not-found' }`、`add_features` の不正な地物は配列の該当する要素に `{ valid: false, reason: 'invalid-feature', message }` として返ります（`reason` は常にコードで、検証の失敗では読める説明が `message` に入ります）。ページが接続されていない間は、どのツールも待たずにすぐ `{ ok: false, reason: 'no-client' }` を返します。LibreDraw 自体が例外を投げるのはインスタンスの誤用のときだけです（[Programmatic API](https://sindicum.github.io/libre-draw/guide/programmatic-api) を参照）。それもページ側の振り分けが安全策として `{ ok: false, reason: 'dispatch-error', message }` に変えます。

### ほかの MCP クライアント

クライアントの設定に次を追加し、`cwd` を clone した場所にします。

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

### 制限

- 同時に接続できるページは 1 つです。2 つ目のページの接続は拒否されます（`one page only`）。
- 認証もリモートアクセスもありません。WebSocket サーバーは `127.0.0.1` だけで待ち受けるので（`lsof -nP -iTCP:8787 -sTCP:LISTEN` で確認できます）、このマシンからしか接続できません。ブラウザからの接続は `Origin` でも検査し、`localhost`・`127.0.0.1`・`[::1]` から配信されたページだけを受け付けます（`local pages only`）。
- stdio だけに対応しています。HTTP / SSE のトランスポートはありません。
- サーバーは中継するだけで、GeoJSON を検証しません。検証は LibreDraw が行い、理由を返します。

### 構成

```
examples/mcp/
├── index.html            地図とログパネル
├── page/main.ts          地図・LibreDraw・ログパネル・ブリッジクライアントをつなぐ
├── page/dispatch.ts      ツール名 → LibreDraw のメソッド（ルートのテストスイートで単体テスト）
├── page/bridge-client.ts 再接続付きの WebSocket クライアント
├── page/log-panel.ts     origin で区別したイベント、ツール呼び出し、接続状態
├── page/sample.ts        区画と道路
├── server/index.ts       McpServer + stdio トランスポート + WebSocket サーバー
├── server/tools.ts       14 個のツール定義（zod の入力スキーマ）
├── server/bridge-host.ts タイムアウト付きのリクエスト / レスポンス仲介（単体テストあり）
└── server/origin.ts      ブラウザ接続の Origin 検査（単体テストあり）
```

このディレクトリで `npm run typecheck` を実行すると、サーバーとページの型を検査します。
