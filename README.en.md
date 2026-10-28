# dsh-whale-widget-ja

[![npm](https://img.shields.io/npm/v/dsh-whale-widget-ja)](https://www.npmjs.com/package/dsh-whale-widget-ja)

**Unofficial Japanese localization + JPY display patch for
[`dsh-whale-widget`](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)** —
the DeepSeek balance whale widget for DSH (DeepSeek Harness).

[日本語版 README はこちら](README.md)

* It **rewrites the files of the installed plugin** — it does not redistribute the plugin.
* **No assets are bundled** (images, GIFs, sound effects). The upstream ones are used as-is.
* Target version: **0.4.2** (works on others too; run `check` to see what is missing).

## What it changes

| Area | Change |
|---|---|
| Language | Japanese for menus, settings panels, notifications, dialogs, errors and default bubble texts (~1,300 strings / 1,600 occurrences) |
| Money | Everything shown in **JPY (¥)**, converted from USD / CNY |
| GLM peak | Detects GLM Coding Plan peak hours (**Mon–Fri 15:00–19:00 JST** = 14:00–18:00 UTC+8; off-peak costs 50% credits). Quota/plan bubble modules accept `{glm_status}` `{glm_countdown}` `{glm_until}` |
| FX rate | Fetched **every 6 hours** (also once at page load). Falls back to the last value, then to a built-in default (157 JPY/USD) |
| Dates | `zh-CN` → `ja-JP` |
| Logic | Two places that used Chinese text as a condition are adjusted (self-check result check, update-check timeout check) |

## Requirements

* `dsh-whale-widget` already installed in DSH:

```bash
dsh plugin --profile web add dsh-whale-widget
```

* Node.js 18+ (the node bundled with DSH is fine)

## Usage

```bash
npx dsh-whale-widget-ja apply
# then hard-reload the page (Cmd/Ctrl + Shift + R)
```

Or clone it if you prefer to run from source:

```bash
git clone https://github.com/qnosuke/dsh-whale-widget-ja.git
cd dsh-whale-widget-ja
npm install                 # acorn is used for AST-based rewriting
node bin/cli.mjs apply
```

### When does it take effect?

* **Client side** (most of the UI): after a hard reload.
* **Server side** (provider labels, descriptions, and the `/dsh-whale/fx.json` rate endpoint): after **restarting DSH**.
  Until then the browser fetches the rate directly from `open.er-api.com` (or uses the default).

### Restore

```bash
node bin/cli.mjs restore
node bin/cli.mjs restore --from 2026-10-27T06-49-37-886Z
```

Backups live in `<plugin>/.ja-backup/<timestamp>/`.

### After updating the plugin

```bash
dsh plugin --profile web add dsh-whale-widget
node bin/cli.mjs apply
node bin/cli.mjs check      # lists new, untranslated strings and stale patches
```

## How it works

```
bin/cli.mjs        apply / check / restore
src/extract.mjs    AST parsing with acorn; collects Chinese string literals with positions
src/dict.json      1,300 zh → ja entries
src/postpatch.mjs  code-level patches (currency conversion, FX route, logic fixes)
test/parse.mjs     sanity checks for the dictionary and patch definitions (CI)
```

1. Parse the target file and rewrite **only the contents of string literals**.
2. Validate quotes, placeholders (`{cost}` etc.), HTML tags and escapes.
3. Apply the code-level patches.
4. Re-parse. **If anything fails, nothing is written at all.**
5. On success, create a timestamped backup and replace the file atomically.

### Currency conversion

* `USD` → `¥`: `amount × usdJpy`
* `CNY` → `¥`: `amount ÷ usdCny × usdJpy`
* Under ¥100: two decimals. ¥1,000 and above: thousands separators.
* Threshold inputs (balance alert / daily budget) stay in USD; only the bubble text is converted.

### FX rate sources

1. `/dsh-whale/fx.json` on the host (6-hour cache in `$DSH_HOME/.dshw-fx.json`)
2. otherwise `https://open.er-api.com/v6/latest/USD` from the browser
3. otherwise the built-in defaults (157 JPY/USD, 6.7 CNY/USD)

## Notes

* **Unofficial.** Not affiliated with the upstream project or DeepSeek (see [NOTICE](NOTICE)).
* Images / GIFs / sounds are **not included**; the upstream plugin's assets are used.
* If upstream changes its code in a breaking way, `apply` stops **without writing anything**
  (fail-safe). Please open an issue so it can be updated.
* Japanese text is longer than Chinese, so a few menu rows may look tighter.

## Publishing (maintainers)

Either publish locally:

```bash
npm login --registry https://registry.npmjs.org
npm publish --registry https://registry.npmjs.org --access public
```

or create a GitHub Release — `.github/workflows/publish.yml` publishes automatically.
Add an `NPM_TOKEN` secret (Automation token) under **Settings → Secrets and variables → Actions** first.

## License

MIT — see [LICENSE](LICENSE). Code copyright belongs to MeteorNOX (upstream);
translation data and tooling belong to this project's contributors.
