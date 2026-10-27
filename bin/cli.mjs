#!/usr/bin/env node
// dsh-whale-widget-ja — 非公式の日本語化 + 日本円表示パッチ
//
//   dsh-whale-widget-ja apply    … 導入済みの dsh-whale-widget に適用（既定）
//   dsh-whale-widget-ja check    … 未翻訳の新規文言・上流の変更点を一覧
//   dsh-whale-widget-ja restore  … 直前のバックアップへ戻す
//
// 仕組み: プラグインの JS を構文解析し、**文字列リテラルの中身だけ**を辞書で置換する。
// 置換後に再パースし、構文エラーやプレースホルダ不一致があれば書き込まずに中止する。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { extract, validateReplacement, parses, CJK } from '../src/extract.mjs'
import { POST } from '../src/postpatch.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DICT = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'src', 'dict.json'), 'utf8'))
const PKG = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'package.json'), 'utf8'))
const TARGET = PKG.dshWhaleTarget || '0.4.2'
const FILES = [
  { key: 'widget', rel: 'assets/whale-widget.js' },
  { key: 'server', rel: 'lib/index.js' },
]
const KANA = /[\u3040-\u309f\u30a0-\u30ff]/
// 簡体字にしか無い文字（＝日本語化されていない中国語の目印）。日本語の漢字は含めない。
const CN_MARK = /[这个们时间吗什么应该还没让从说开关对显确认设记录账额鱼鲸贴边务单价读图库队权块预复默认击编选输错误缓览隐]/

const argv = process.argv.slice(2)
const cmd = argv.find((a) => !a.startsWith('-')) || 'apply'
const flag = (name) => argv.includes(name)
const opt = (name) => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}

function findPlugin() {
  const explicit = opt('--plugin') || process.env.WHALE_PLUGIN
  if (explicit) return path.resolve(explicit)
  const found = []
  try {
    const base = path.join(os.homedir(), '.dsh', 'profiles')
    for (const name of fs.readdirSync(base)) {
      const dir = path.join(base, name, 'node_modules', 'dsh-whale-widget')
      try {
        if (fs.statSync(path.join(dir, 'package.json')).isFile()) found.push(dir)
      } catch (err) {}
    }
  } catch (err) {}
  const cwdCand = path.join(process.cwd(), 'node_modules', 'dsh-whale-widget')
  try { if (fs.statSync(path.join(cwdCand, 'package.json')).isFile()) found.push(cwdCand) } catch (err) {}
  // web プロファイルを優先
  found.sort((a, b) => (b.includes(path.sep + 'web' + path.sep) ? 1 : 0) - (a.includes(path.sep + 'web' + path.sep) ? 1 : 0))
  return found[0]
}

function pluginVersion(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version || '?' } catch (err) { return '?' }
}

function applyTo(src, key, rel, warn) {
  const entries = extract(src)
  const dict = DICT[key] || {}
  const reps = []
  let textEntries = 0
  let untranslated = 0
  const untranslatedSamples = []
  for (const e of entries) {
    if (e.role !== 'text') continue
    textEntries++
    const ja = dict[e.raw]
    if (!ja) {
      if (CJK.test(e.raw) && CN_MARK.test(e.raw)) {
        untranslated++
        if (untranslatedSamples.length < 8) untranslatedSamples.push({ line: e.line, raw: e.raw.slice(0, 80) })
      }
      continue
    }
    if (ja === e.raw) continue
    const errs = validateReplacement(e.raw, ja, e.kind)
    if (errs.length) { warn.push(`L${e.line} ${errs.join('; ')} :: ${e.raw.slice(0, 60)}`); continue }
    reps.push({ start: e.start, end: e.end, ja })
  }
  reps.sort((a, b) => b.start - a.start)
  let out = src
  for (const r of reps) out = out.slice(0, r.start) + r.ja + out.slice(r.end)

  // コード側の手直し
  let postApplied = 0
  const postMissed = []
  for (const p of POST.filter((x) => x.rel === rel)) {
    if (out.includes(p.to)) { postApplied++; continue }
    if (out.includes(p.from)) { out = out.split(p.from).join(p.to); postApplied++; continue }
    if (p.required) postMissed.push(String(p.from).slice(0, 80))
  }
  return { out, replaced: reps.length, textEntries, untranslated, untranslatedSamples, postApplied, postMissed }
}

function commandApply() {
  const dir = findPlugin()
  if (!dir) {
    console.error('dsh-whale-widget が見つかりません。先に `dsh plugin --profile web add dsh-whale-widget` で導入するか、--plugin <path> を指定してください。')
    process.exit(1)
  }
  const version = pluginVersion(dir)
  console.log(`対象: ${dir}`)
  console.log(`プラグイン版: ${version} (このパッチの検証済み版: ${TARGET})`)
  if (version !== TARGET) console.log('⚠ 検証済み版と異なります。適用は続行しますが、check で未翻訳を確認してください。')

  const results = []
  for (const f of FILES) {
    const srcPath = path.join(dir, f.rel)
    const src = fs.readFileSync(srcPath, 'utf8')
    const warn = []
    const r = applyTo(src, f.key, f.rel, warn)
    if (warn.length) {
      console.error(`✗ ${f.rel}: 置換の検証に失敗しました（何も書き込みません）`)
      for (const w of warn) console.error('   ' + w)
      process.exit(1)
    }
    if (r.postMissed.length) {
      console.error(`✗ ${f.rel}: 上流のコードが変わったため適用できない手直しがあります（何も書き込みません）`)
      for (const m of r.postMissed) console.error('   ' + m)
      console.error('   → このプラグイン版には未対応です。issue で知らせてください。')
      process.exit(1)
    }
    if (!parses(r.out)) {
      console.error(`✗ ${f.rel}: 置換後のコードが構文エラーです（何も書き込みません）`)
      process.exit(1)
    }
    results.push({ f, srcPath, out: r.out, ...r })
  }

  if (flag('--dry-run')) {
    for (const r of results) console.log(`[dry-run] ${r.f.rel}: ${r.replaced} 箇所 / 未翻訳 ${r.untranslated}`)
    return
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupDir = path.join(dir, '.ja-backup', stamp)
  fs.mkdirSync(backupDir, { recursive: true })
  for (const r of results) {
    fs.copyFileSync(r.srcPath, path.join(backupDir, r.f.rel.replace(/\//g, '_')))
    const tmp = r.srcPath + '.ja-tmp'
    fs.writeFileSync(tmp, r.out)
    fs.renameSync(tmp, r.srcPath)
    console.log(`✓ ${r.f.rel}: ${r.replaced} 箇所を置換（未翻訳 ${r.untranslated}）`)
  }
  console.log(`バックアップ: ${backupDir}`)
  console.log('')
  console.log('反映: 画面はハードリロード（Cmd/Ctrl + Shift + R）。')
  console.log('      サーバー側の文言と為替レート配信（/dsh-whale/fx.json）は DSH 再起動後に有効になります。')
  const samples = results.flatMap((r) => r.untranslatedSamples.map((s) => `${r.f.rel} L${s.line}: ${s.raw}`))
  if (samples.length) {
    console.log('')
    console.log('未翻訳の文言（上流で追加されたもの）:')
    for (const s of samples) console.log('  ' + s)
    console.log('  → 全部見るには `dsh-whale-widget-ja check`')
  }
}

function commandCheck() {
  const dir = findPlugin()
  if (!dir) { console.error('dsh-whale-widget が見つかりません（--plugin <path> で指定できます）'); process.exit(1) }
  console.log(`対象: ${dir} (${pluginVersion(dir)})`)
  let total = 0
  for (const f of FILES) {
    const src = fs.readFileSync(path.join(dir, f.rel), 'utf8')
    const dict = DICT[f.key] || {}
    const todo = []
    const seen = new Set()
    for (const e of extract(src)) {
      if (e.role !== 'text' || !CJK.test(e.raw) || !CN_MARK.test(e.raw) || seen.has(e.raw)) continue
      seen.add(e.raw)
      if (!dict[e.raw]) todo.push(e)
    }
    total += todo.length
    console.log(`\n== ${f.rel}: 未翻訳 ${todo.length} 件`)
    for (const t of todo.slice(0, 40)) console.log(`  L${t.line} ${t.raw.slice(0, 110)}`)
    if (todo.length > 40) console.log(`  … 他 ${todo.length - 40} 件`)
  }
  // 上流の変更で当たらなくなった手直し
  const missed = []
  for (const f of FILES) {
    const src = fs.readFileSync(path.join(dir, f.rel), 'utf8')
    for (const p of POST.filter((x) => x.rel === f.rel)) {
      if (src.includes(p.to) || src.includes(p.from)) continue
      missed.push(`${f.rel}: ${String(p.from).slice(0, 90)}`)
    }
  }
  if (missed.length) {
    console.log('\n⚠ 上流のコードが変わり、当たらなくなった手直し:')
    for (const m of missed) console.log('  ' + m)
  }
  console.log(`\n合計 未翻訳: ${total}`)
  if (!total && !missed.length) console.log('未翻訳はありません。')
}

function commandRestore() {
  const dir = findPlugin()
  if (!dir) { console.error('dsh-whale-widget が見つかりません'); process.exit(1) }
  const base = path.join(dir, '.ja-backup')
  let stamps = []
  try { stamps = fs.readdirSync(base).sort() } catch (err) {}
  if (!stamps.length) { console.error('バックアップがありません: ' + base); process.exit(1) }
  const pick = opt('--from') || stamps[stamps.length - 1]
  const src = path.join(base, pick)
  if (!fs.existsSync(src)) { console.error('バックアップが見つかりません: ' + src); process.exit(1) }
  for (const f of FILES) {
    const from = path.join(src, f.rel.replace(/\//g, '_'))
    if (!fs.existsSync(from)) continue
    const to = path.join(dir, f.rel)
    const tmp = to + '.ja-tmp'
    fs.copyFileSync(from, tmp)
    fs.renameSync(tmp, to)
    console.log(`✓ ${f.rel} を ${pick} の内容に戻しました`)
  }
  console.log('画面をハードリロードしてください（サーバー側は DSH 再起動後）。')
}

switch (cmd) {
  case 'apply': commandApply(); break
  case 'check': commandCheck(); break
  case 'restore': commandRestore(); break
  case 'version': console.log(`${PKG.name} ${PKG.version} (target: dsh-whale-widget ${TARGET})`); break
  default:
    console.log(`dsh-whale-widget-ja ${PKG.version}

使い方:
  dsh-whale-widget-ja apply [--plugin <path>] [--dry-run]   日本語化 + 日本円表示を適用
  dsh-whale-widget-ja check [--plugin <path>]               未翻訳の文言・上流の変更点を一覧
  dsh-whale-widget-ja restore [--from <timestamp>]          直前のバックアップへ戻す
  dsh-whale-widget-ja version                               バージョン表示

対象プラグイン: ${TARGET}（未満・以上でも適用は可。check で差分を確認）`)
}
