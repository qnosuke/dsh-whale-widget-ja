// 辞書とパッチ定義の健全性チェック（ネットワーク不要 / CI 用）
import fs from 'node:fs'
import path from 'node:path'
import { validateReplacement, CJK } from '../src/extract.mjs'

const root = path.dirname(new URL(import.meta.url).pathname)
const dict = JSON.parse(fs.readFileSync(path.join(root, '..', 'src', 'dict.json'), 'utf8'))
const { POST } = await import('../src/postpatch.mjs')

const errors = []
const RELS = new Set(['widget', 'server'])

let count = 0
for (const key of Object.keys(dict)) {
  if (!RELS.has(key)) { errors.push(`不明なファイル区分: ${key}`); continue }
  for (const [raw, ja] of Object.entries(dict[key])) {
    count++
    if (typeof ja !== 'string' || !ja.length) { errors.push(`空の訳: ${raw.slice(0, 40)}`); continue }
    if (!/^['"]/.test(raw)) { errors.push(`キーが文字列リテラルではない: ${raw.slice(0, 40)}`); continue }
    const kind = 'string'
    const errs = validateReplacement(raw, ja, kind)
    if (errs.length) errors.push(`${errs.join('; ')} :: ${raw.slice(0, 60)}`)
    // 訳に簡体字が残っていないか（日本語の漢字は許容するが、簡体字特有の文字は警告）
    if (/[这个们吗什么应该还没让从说开关对显确认设记录账额鱼鲸贴边务单价读图库队权块预复默]/.test(ja)) {
      errors.push(`訳に簡体字らしき文字: ${ja.slice(0, 60)}`)
    }
  }
}

if (!Array.isArray(POST) || !POST.length) errors.push('POST が空')
const seen = new Set()
for (const p of POST) {
  if (!p || typeof p !== 'object') { errors.push('POST の要素が不正'); continue }
  const rel = p.rel === 'assets/whale-widget.js' ? 'widget' : p.rel === 'lib/index.js' ? 'server' : null
  if (!rel) errors.push(`POST の rel が不正: ${p.rel}`)
  if (typeof p.from !== 'string' || !p.from) errors.push('POST の from が空')
  if (typeof p.to !== 'string' || !p.to) errors.push('POST の to が空')
  if (p.from === p.to) errors.push(`POST の from と to が同じ: ${String(p.from).slice(0, 40)}`)
  const sig = p.rel + '\u0000' + p.from
  if (seen.has(sig)) errors.push(`POST が重複: ${String(p.from).slice(0, 40)}`)
  seen.add(sig)
}

console.log(`辞書: ${count} 件 / コード手直し: ${POST.length} 件`)

// 翻訳対象のうち、日本語に仮名が無いもの（= 翻訳漏れの可能性）を情報として表示
const kana = /[\u3040-\u309f\u30a0-\u30ff]/
const noKana = Object.values(dict).flatMap((m) => Object.values(m)).filter((v) => CJK.test(v) && !kana.test(v))
console.log(`仮名を含まない訳: ${noKana.length} 件（固有名詞などは正常）`)

if (errors.length) {
  console.error(`\n✗ ${errors.length} 件の問題:`)
  for (const e of errors.slice(0, 40)) console.error('  ' + e)
  process.exit(1)
}
console.log('✓ OK')
