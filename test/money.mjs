// 通貨換算まわりの単体テスト（ビルド後のファイルから関数を抜き出して実行）
import fs from 'node:fs'
import path from 'node:path'
const root = path.dirname(new URL(import.meta.url).pathname)
const src = fs.readFileSync(path.join(root, 'dist', 'assets', 'whale-widget.js'), 'utf8')

function grab(name) {
  const i = src.indexOf('function ' + name + '(')
  if (i < 0) throw new Error('not found: ' + name)
  let depth = 0
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(i, j + 1) }
  }
  throw new Error('unbalanced: ' + name)
}
const code = [
  "var DSHW_DISPLAY_CUR = 'JPY'",
  'var DSHW_FX = { usdJpy: 157, usdCny: 6.7, at: 0, source: "test" }',
  grab('dshwToDisplay'), grab('dshwFmtNum'), grab('dshwMoneyText'), grab('dshwThresholdText'),
  grab('apiFmtMoney'), grab('fmt'), grab('usageCostValue'),
  'return { apiFmtMoney, fmt, usageCostValue, dshwMoneyText, dshwThresholdText }',
].join('\n')
const m = new Function(code)()
const { apiFmtMoney, fmt, usageCostValue, dshwMoneyText, dshwThresholdText } = m

const cases = [
  ['USD → 円', apiFmtMoney(2.1, 'USD'), '¥ 330'],
  ['CNY → 円', apiFmtMoney(6.7, 'CNY'), '¥ 157'],
  ['通貨未指定', apiFmtMoney(1, ''), '¥ 157'],
  ['その他通貨はそのまま', apiFmtMoney(0.5, 'EUR'), '0.50 EUR'],
  ['fmt USD', fmt(2.1, 'USD'), '¥ 330'],
  ['fmt CNS', fmt(6.7, 'CNY'), '¥ 157'],
  ['少額は小数2桁', dshwMoneyText(0.05, 'USD'), '¥ 7.85'],
  ['1000以上は3桁区切り', dshwMoneyText(10, 'USD'), '¥ 1,570'],
  ['usageCostValue(CNY)', usageCostValue(0.067), '1.57'],
  ['usageCostValue null', usageCostValue(null), '--'],
  ['しきい値 5 USD', dshwThresholdText(5), '785'],
  ['しきい値 null', dshwThresholdText(null), ''],
]
let bad = 0
for (const [name, got, want] of cases) {
  const ok = got === want
  if (!ok) bad++
  console.log((ok ? 'OK  ' : 'NG  ') + name + ': ' + JSON.stringify(got) + (ok ? '' : ' (期待 ' + JSON.stringify(want) + ')'))
}
process.exitCode = bad ? 1 : 0
