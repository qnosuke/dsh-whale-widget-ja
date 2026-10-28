// GLM ピーク判定の単体テスト（Date を差し替えて複数時刻を確認）
import fs from 'node:fs'
import path from 'node:path'
const root = path.dirname(new URL(import.meta.url).pathname)
// パッチ定義（src/postpatch.mjs）から注入後コードを取り出して検証する（dist 不要）
const { POST } = await import('../src/postpatch.mjs')
const src = POST.find((p) => p.to.includes('dshwGlmPeakInfo')).to

function grabFn(name) {
  const i = src.indexOf('function ' + name + '(')
  if (i < 0) throw new Error('not found: ' + name)
  let depth = 0
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(i, j + 1) }
  }
  throw new Error('unbalanced: ' + name)
}
const code = grabFn('dshwGlmPeakInfo') + '\n' + grabFn('dshwGlmPeakText') + '\nreturn dshwGlmPeakInfo'

// 2026-10-25 は日曜。base + day*1日 + 時刻
const SUNDAY = Date.UTC(2026, 9, 25)
function fakeNow(utcDay, utcHour, utcMin = 0) {
  const t = SUNDAY + utcDay * 86400000 + utcHour * 3600000 + utcMin * 60000
  return class extends Date {
    constructor(x) { x === undefined ? super(t) : super(x) }
    static now() { return t }
  }
}
// ※ 関数内で new Date() は引数なし → 差し替えた Date を渡す
const run = new Function('Date', code)
const cases = [
  ['水 17:00 JST (=08:00 UTC, 平日ピーク帯)', 3, 8, 0, true, 'ピーク'],
  ['水 19:30 JST (=10:30 UTC, ピーク直後)', 3, 10, 30, false, 'オフピーク'],
  ['水 14:00 JST (=05:00 UTC, ピーク直前)', 3, 5, 0, false, 'オフピーク'],
  ['土 16:00 JST (=07:00 UTC, 土曜は常にオフ)', 6, 7, 0, false, 'オフピーク'],
  ['日 16:00 JST (=07:00 UTC, 日曜も常にオフ)', 0, 7, 0, false, 'オフピーク'],
  ['月 15:00 JST (=06:00 UTC, ピーク開始瞬間)', 1, 6, 0, true, 'ピーク'],
  ['金 18:59 JST (=09:59 UTC, ピーク最後)', 5, 9, 59, true, 'ピーク'],
]
let bad = 0
for (const [name, day, h, m, wantPeak, wantStatus] of cases) {
  const D = fakeNow(day, h, m)
  const info = new Function('Date', code)(D)()
  const ok = info.isPeak === wantPeak && info.status === wantStatus
  if (!ok) bad++
  console.log(`${ok ? 'OK ' : 'NG '} ${name}: ${info.status} / ${info.until}`)
}
process.exitCode = bad ? 1 : 0
if (!bad) console.log('✓ GLM ピーク判定テスト全件 OK')
