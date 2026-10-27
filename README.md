# dsh-whale-widget-ja

DSH（DeepSeek Harness）Web 画面右下の **小鲸鱼ウィジェット** [`dsh-whale-widget`](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget) を
**日本語 + 日本円表示**にする非公式パッチです。

* 上流プラグインの**ファイルを書き換えるだけ**（再配布物ではありません）
* 画像・GIF・効果音などの**素材は一切同梱しません**（上流のものをそのまま使います）
* 対象バージョン: **0.4.2**（それ以外でも適用は可能。`check` で差分を確認できます）

## できること

| 項目 | 変更内容 |
|---|---|
| 言語 | メニュー・設定パネル・通知・確認ダイアログ・エラー・既定のふきだし文言まで日本語（約 1,300 文言 / 1,600 箇所） |
| 金額 | すべて **日本円（¥）** 表示。USD / CNY 建ての金額を換算 |
| 為替 | **6 時間ごとに自動取得**（画面を開いた直後にも 1 回）。取得できなければ前回値 → 既定値（157 円/USD） |
| 日時 | `zh-CN` → `ja-JP` |
| ロジック | 中国語を条件に使っていた 2 か所（セルフチェックの成否判定・更新確認のタイムアウト判定）を日本語に合わせて調整 |

## 必要なもの

* DSH に `dsh-whale-widget` が導入済みであること

```bash
dsh plugin --profile web add dsh-whale-widget
```

* Node.js 18 以上（DSH に同梱の node でも可）

## 使い方

```bash
# 1) このリポジトリを取得
git clone https://github.com/<YOUR-NAME>/dsh-whale-widget-ja.git
cd dsh-whale-widget-ja

# 2) 適用（バックアップ自動作成）
node bin/cli.mjs apply

# 3) 画面をハードリロード（Cmd/Ctrl + Shift + R）
```

npm に公開されていれば `npx dsh-whale-widget-ja apply` でも実行できます。

### 反映のタイミング

* **画面側**（メニュー・設定・通知など大部分）: ハードリロードで即反映
* **サーバー側**（プロバイダー名・説明文・`/dsh-whale/fx.json` の為替配信）: **DSH の再起動後**

再起動前でも、為替はブラウザから `open.er-api.com` を直接取得して動きます（だめなら既定値）。

### 戻す

```bash
node bin/cli.mjs restore          # 直前のバックアップへ
node bin/cli.mjs restore --from 2026-10-27T06-47-29-349Z
```

バックアップは `<プラグイン>/.ja-backup/<timestamp>/` に残ります。

### プラグインを更新したとき

```bash
dsh plugin --profile web add dsh-whale-widget   # 上流を更新
node bin/cli.mjs apply                          # 再適用
node bin/cli.mjs check                          # 新しく増えた文言を確認
```

`check` は「未翻訳の中国語」と「上流の変更で当たらなくなった手直し」を一覧します。
新規文言も日本語にしたい場合は、`src/dict.json` に追記して PR してください。

## 仕組み

```
bin/cli.mjs        … apply / check / restore
src/extract.mjs    … acorn で AST を解析し、文字列リテラル内の中国語を位置付きで抽出
src/dict.json      … 中国語 → 日本語 の対応表（1,300 件）
src/postpatch.mjs  … コード側の手直し（通貨換算・為替取得ルート・判定ロジックなど）
test/parse.mjs     … 辞書とパッチ定義の健全性チェック（CI で実行）
```

適用の流れ:

1. 対象ファイルを構文解析し、**文字列リテラルの中身だけ**を辞書で置換（コメントやコードは触らない）
2. 引用符・`{cost}` などのプレースホルダ・HTML タグ・エスケープが一致するか検証
3. コード側の手直し（`postpatch.mjs`）を適用
4. 置換後に再パース。**どこかで失敗したら 1 バイトも書き込まずに中止**
5. 成功時のみ、タイムスタンプ付きバックアップを取ってからアトミックに差し替え

### 金額換算

* `USD` → `¥` : `amount × usdJpy`
* `CNY` → `¥` : `amount ÷ usdCny × usdJpy`
* 100 円未満は小数 2 桁、1,000 円以上は 3 桁区切り
* しきい値（残高アラート・今日の予算）の**入力は USD のまま**。ふきだし内の表示だけ円換算します

### 為替レート

1. ホストの `/dsh-whale/fx.json`（6 時間キャッシュ、`$DSH_HOME/.dshw-fx.json`）
2. 無ければブラウザから `https://open.er-api.com/v6/latest/USD` を直接取得
3. それも失敗したら既定値（157 円/USD・6.7 元/USD）

取得元は `open.er-api.com` → `frankfurter.app` の順に試します。
自動取得を止めたい / レートを固定したい場合は、適用後のファイルにある
`DSHW_DISPLAY_CUR` と `DSHW_FX`、`dshwFxLoad` の呼び出し行を編集してください
（`src/postpatch.mjs` の同じ箇所を直せば再適用でも維持されます）。

## 注意点

* **非公式**です。上流プロジェクト・DeepSeek 社とは関係ありません（[NOTICE](NOTICE)）。
* 画像・GIF・効果音は**同梱していません**。上流プラグインの素材をそのまま使います。
* 上流の破壊的な変更（文言や関数の書き換え）があった場合、`apply` は**安全側に倒して中止**します。
  そのときは issue で知らせてもらえれば追従します。
* 日本語は中国語より文字数が多いため、メニュー行が多少窮屈に見えることがあります。

## 開発

```bash
npm test          # 辞書・パッチ定義の整合性チェック
node bin/cli.mjs apply --dry-run
```

翻訳の追加・修正は `src/dict.json`（キー = 元の中国語リテラル、値 = 日本語リテラル）で行います。
`{cost}` `{session}` などのプレースホルダと HTML タグは**そのまま**残してください（`npm test` が検証します）。

## ライセンス

MIT。[LICENSE](LICENSE) を参照してください。
コードの著作権は上流の MeteorNOX 氏に、翻訳データとツールは本プロジェクトの貢献者に帰属します。
