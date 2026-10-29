// 翻訳後のソースに当てる「コード側の手直し」。localize.mjs から読み込む。
// from は日本語化後の文字列（翻訳 → POST の順で適用される）。to が既にあればスキップ（冪等）。
// oldFrom/oldTo は「旧版（中国語）に当てる版」で、verify.mjs の骨格比較に使う。

const FX_CLIENT = `// ===== 表示通貨（日本円）と為替レート =====
// レートはホストの /dsh-whale/fx.json から 6 時間ごとに取得する。取れないときは前回値 → 既定値。
// 'JPY' を 'USD' に変えればドル表示に戻る（レート取得はそのまま使える）。
var DSHW_DISPLAY_CUR = 'JPY'
var DSHW_FX = { usdJpy: 157, usdCny: 6.7, at: 0, source: 'default' }
function dshwFxApply(d) {
  if (!d) return false
  var rates = d.rates || d
  var jpy = Number(rates.usdJpy != null ? rates.usdJpy : rates.JPY)
  var cny = Number(rates.usdCny != null ? rates.usdCny : rates.CNY)
  if (!(jpy > 0)) return false
  DSHW_FX.usdJpy = jpy
  if (cny > 0) DSHW_FX.usdCny = cny
  DSHW_FX.at = Number(d.at) || Date.now()
  DSHW_FX.source = String(d.source || '')
  try { renderAmount() } catch (err) {}
  return true
}
function dshwFxLoad() {
  // まずホスト経由（キャッシュ付き）。まだルートが無い/失敗時は公開 API を直接叩く。
  function direct() {
    try {
      fetch('https://open.er-api.com/v6/latest/USD', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null }).then(function (j) {
        if (j) dshwFxApply({ usdJpy: j.rates && j.rates.JPY, usdCny: j.rates && j.rates.CNY, source: 'open.er-api.com' })
      }).catch(function () {})
    } catch (err) {}
  }
  try {
    fetch('/dsh-whale/fx.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null }).then(function (d) {
      if (d && d.ok && dshwFxApply(d)) return
      direct()
    }).catch(direct)
  } catch (err) { direct() }
}
try { setTimeout(dshwFxLoad, 0); setInterval(dshwFxLoad, 6 * 60 * 60 * 1000) } catch (err) {}
function dshwToDisplay(v, cur) {
  var n = Number(v)
  if (!isFinite(n)) return NaN
  var c = String(cur || '').toUpperCase()
  var usd = c === 'CNY' ? n / (DSHW_FX.usdCny || 6.7) : n
  return DSHW_DISPLAY_CUR === 'USD' ? usd : usd * (DSHW_FX.usdJpy || 157)
}
function dshwFmtNum(n) {
  if (!isFinite(n)) return '--'
  if (DSHW_DISPLAY_CUR === 'USD') return n.toFixed(2)
  var a = Math.abs(n)
  if (a >= 1000) return Math.round(n).toLocaleString('ja-JP')
  if (a >= 100) return String(Math.round(n))
  return n.toFixed(2)
}
function dshwMoneyText(v, cur) {
  var n = dshwToDisplay(v, cur)
  if (!isFinite(n)) return '--'
  return (DSHW_DISPLAY_CUR === 'USD' ? '$ ' : '¥ ') + dshwFmtNum(n)
}
function dshwThresholdText(v) {
  if (v === null || v === undefined || v === '') return ''
  var n = dshwToDisplay(v, 'USD')
  return isFinite(n) ? dshwFmtNum(n) : String(v)
}
// ===== GLM Coding Plan のピーク判定 =====
// 公式: ピーク = 月〜金 14:00-18:00 SGT (UTC+8)。オフピークはクレジット消費が 50%。
//  ふきだしの plan/クォータ モジュールで {glm_status} {glm_countdown} {glm_until} が使える。
function dshwGlmPeakInfo() {
  var now = new Date()
  var day = now.getUTCDay() // 0=日 6=土
  var mins = now.getUTCHours() * 60 + now.getUTCMinutes()
  var peakStart = 6 * 60   // 06:00 UTC = 14:00 UTC+8 = 15:00 日本時間
  var peakEnd = 10 * 60    // 10:00 UTC = 18:00 UTC+8 = 19:00 日本時間
  var weekday = day >= 1 && day <= 5
  var isPeak = weekday && mins >= peakStart && mins < peakEnd
  function minsUntil(targetMin, targetDay) {
    var t = (targetDay - day + 7) % 7
    var diff = t * 1440 + targetMin - mins
    if (diff <= 0) diff += 7 * 1440
    return diff
  }
  var diff = isPeak ? minsUntil(peakEnd, day) : (weekday && mins < peakStart ? minsUntil(peakStart, day) : minsUntil(peakStart, (day + 1) % 7))
  var hh = Math.floor(diff / 60), mm = diff % 60
  var cd = (hh > 0 ? hh + '時間' : '') + mm + '分'
  return {
    isPeak: isPeak,
    status: isPeak ? 'ピーク' : 'オフピーク',
    countdown: cd,
    until: isPeak ? 'ピーク終了まで ' + cd : 'ピーク開始まで ' + cd,
  }
}
function dshwGlmPeakText(key) {
  // 万一ここで例外が出ても、ふきだし全体が空にならないよう握りつぶす
  try {
    var i = dshwGlmPeakInfo()
    if (key === 'glm_status') return i.status
    if (key === 'glm_countdown') return i.countdown
    if (key === 'glm_until') return i.until
  } catch (err) {}
  return ''
}
`

const ORIG_FMT_MONEY = [
  'function apiFmtMoney(v, cur) {',
  '  var n = Number(v)',
  "  if (!isFinite(n)) return '--'",
  "  var c = String(cur || '')",
  "  if (c === 'USD') return '$ ' + n.toFixed(2)",
  "  if (c === 'CNY') return '¥ ' + n.toFixed(2)",
  "  return n.toFixed(2) + (c ? ' ' + c : '')",
  '}',
].join('\n')

export const POST = [
  // ===== 画面側：日本円表示 + 為替レート取得 =====
  {
    rel: 'assets/whale-widget.js',
    from: ORIG_FMT_MONEY,
    to: FX_CLIENT + '\n' + [
      'function apiFmtMoney(v, cur) {',
      "  var c = String(cur || '').toUpperCase()",
      "  if (c && c !== 'CNY' && c !== 'USD') {",
      '    var raw = Number(v)',
      "    return isFinite(raw) ? raw.toFixed(2) + ' ' + c : '--'",
      '  }',
      '  return dshwMoneyText(v, c)',
      '}',
    ].join('\n'),
  },
  {
    rel: 'assets/whale-widget.js',
    from: [
      'function fmt(balance, currency) {',
      '  var num = Number(balance)',
      "  var fixed = isFinite(num) ? num.toFixed(2) : '--'",
      "  return currency === 'CNY' ? '¥ ' + fixed : fixed + ' ' + currency",
      '}',
    ].join('\n'),
    to: 'function fmt(balance, currency) { return dshwMoneyText(balance, currency) }',
  },
  {
    rel: 'assets/whale-widget.js',
    from: [
      'function usageCostValue(amount) {',
      "  if (amount === null || amount === undefined || amount === '') return '--'",
      '  var n = Number(amount)',
      "  return isFinite(n) ? n.toFixed(2) : '--'",
      '}',
    ].join('\n'),
    to: [
      'function usageCostValue(amount) {',
      "  if (amount === null || amount === undefined || amount === '') return '--'",
      "  var n = dshwToDisplay(amount, 'CNY')",
      "  return isFinite(n) ? dshwFmtNum(n) : '--'",
      '}',
    ].join('\n'),
  },
  // しきい値（{below}/{amount}）も表示通貨へ換算
  {
    rel: 'assets/whale-widget.js',
    from: "    .replace(/\\{below\\}/g, below != null ? String(below) : '')",
    to: "    .replace(/\\{below\\}/g, below != null ? dshwThresholdText(below) : '')",
    required: true,
  },
  {
    rel: 'assets/whale-widget.js',
    from: "    .replace(/\\{amount\\}/g, amount != null ? String(amount) : '')",
    to: "    .replace(/\\{amount\\}/g, amount != null ? dshwThresholdText(amount) : '')",
    required: true,
  },
  // 手動クォータ（金額単位）も円換算
  {
    rel: 'assets/whale-widget.js',
    from: "  return (i.unit === 'money' ? '¥' : '') + apiFmtQuotaNum(i.used) + (i.unit === 'money' ? '' : '')",
    to: "  return (i.unit === 'money' ? '¥ ' : '') + apiFmtQuotaNum(i.unit === 'money' ? dshwToDisplay(i.used, 'CNY') : i.used)",
    required: true,
  },
  {
    rel: 'assets/whale-widget.js',
    from: "  return (i.unit === 'money' ? '¥' : '') + apiFmtQuotaNum(i.left) + ''",
    to: "  return (i.unit === 'money' ? '¥ ' : '') + apiFmtQuotaNum(i.unit === 'money' ? dshwToDisplay(i.left, 'CNY') : i.left)",
    required: true,
  },
  {
    rel: 'assets/whale-widget.js',
    from: "  return (i.unit === 'money' ? '¥' : '') + apiFmtQuotaNum(i.total) + ''",
    to: "  return (i.unit === 'money' ? '¥ ' : '') + apiFmtQuotaNum(i.unit === 'money' ? dshwToDisplay(i.total, 'CNY') : i.total)",
    required: true,
  },
  // 統計グラフの見出しも円（JPY）固定
  {
    rel: 'assets/whale-widget.js',
    from: "'直近30日の消費 ・ ' + chartCurrency + '（棒をクリックで当日を表示）'",
    to: "'直近30日の消費 ・ ' + 'JPY' + '（棒をクリックで当日を表示）'",
    oldFrom: "'近30天消费 · ' + chartCurrency + '（点柱查看当日）'",
    oldTo: "'近30天消费 · ' + 'JPY' + '（点柱查看当日）'",
    required: true,
  },

  // ===== サーバー側：為替レートの取得と配信（6 時間キャッシュ） =====
  {
    rel: 'lib/index.js',
    from: "const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')",
    to: `const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')

// ===== 表示用の為替レート（USD→JPY / USD→CNY）=====
// 6 時間キャッシュ。外部 API が落ちても「前回値 → 既定値」で必ず返す（UI を止めない）。
const FX_CACHE_FILE = path.join(DSH_HOME, '.dshw-fx.json')
const FX_TTL_MS = 6 * 60 * 60 * 1000
const FX_FALLBACK = { usdJpy: 157, usdCny: 6.7 }
let fxMemo = null
function readFxCacheFile() {
  try { return JSON.parse(fs.readFileSync(FX_CACHE_FILE, 'utf8')) } catch (err) { return null }
}
async function readFxRates(force) {
  const now = Date.now()
  if (!force && fxMemo && now - Number(fxMemo.at || 0) < FX_TTL_MS) return fxMemo
  const saved = readFxCacheFile()
  if (!force && saved && saved.ok && now - Number(saved.at || 0) < FX_TTL_MS) { fxMemo = saved; return saved }
  const sources = [
    { name: 'open.er-api.com', url: 'https://open.er-api.com/v6/latest/USD' },
    { name: 'frankfurter.app', url: 'https://api.frankfurter.app/latest?from=USD&to=JPY,CNY' },
  ]
  for (const src of sources) {
    try {
      const res = await fetch(src.url, { signal: AbortSignal.timeout(6000), headers: { 'user-agent': 'dsh-whale-widget' } })
      if (!res.ok) continue
      const j = await res.json()
      const rates = (j && j.rates) || {}
      const jpy = Number(rates.JPY)
      const cny = Number(rates.CNY)
      if (!(jpy > 0)) continue
      const payload = {
        ok: true, at: now, usdJpy: jpy,
        usdCny: cny > 0 ? cny : Number((saved && saved.usdCny) || FX_FALLBACK.usdCny),
        source: src.name,
      }
      fxMemo = payload
      try { fs.writeFileSync(FX_CACHE_FILE, JSON.stringify(payload)) } catch (err) {}
      return payload
    } catch (err) {}
  }
  const payload = {
    ok: false, at: now,
    usdJpy: Number((saved && saved.usdJpy) || FX_FALLBACK.usdJpy),
    usdCny: Number((saved && saved.usdCny) || FX_FALLBACK.usdCny),
    source: 'fallback',
  }
  fxMemo = payload
  return payload
}`,
  },
  {
    rel: 'lib/index.js',
    from: [
      '          res.end(JSON.stringify(aboutPayload(req)))',
      '        } catch (err) {',
      '          res.writeHead(200, JSON_HEADERS)',
      "          res.end(JSON.stringify({ ok: false, error: String((err && err.message) || err).slice(0, 160) }))",
      '        }',
      '      },',
      '    }))',
    ].join('\n'),
    to: [
      '          res.end(JSON.stringify(aboutPayload(req)))',
      '        } catch (err) {',
      '          res.writeHead(200, JSON_HEADERS)',
      "          res.end(JSON.stringify({ ok: false, error: String((err && err.message) || err).slice(0, 160) }))",
      '        }',
      '      },',
      '    }))',
      '    // 為替レート（表示用）：6 時間キャッシュ。取得失敗時も前回値／既定値で応答する。',
      '    disposers.push(registerRoute({',
      "      kind: 'exact',",
      "      path: '/dsh-whale/fx.json',",
      '      handler: async (req, res) => {',
      '        try {',
      '          const payload = await readFxRates(false)',
      '          res.writeHead(200, JSON_HEADERS)',
      '          res.end(JSON.stringify(payload))',
      '        } catch (err) {',
      '          res.writeHead(200, JSON_HEADERS)',
      "          res.end(JSON.stringify({ ok: false, error: String((err && err.message) || err).slice(0, 160) }))",
      '        }',
      '      },',
      '    }))',
    ].join('\n'),
  },

  // ===== 翻訳に伴うロジック調整 =====
  { rel: 'assets/whale-widget.js', from: "toLocaleString('zh-CN'", to: "toLocaleString('ja-JP'", required: true },
  { rel: 'lib/index.js', from: "|| 'zh_CN'", to: "|| 'ja_JP'", required: true },
  // 確認ボタンの文言判定：日本語のダイアログは「削除」を含む
  { rel: 'assets/whale-widget.js', from: ".indexOf('删除') !== -1 ? '削除'", to: ".indexOf('削除') !== -1 ? '削除'", required: true },
  // セルフチェックの成否アイコン判定：結果文字列が「成功…」になった
  { rel: 'assets/whale-widget.js', from: "/^通过/.test(aboutSelfResult)", to: "/^成功/.test(aboutSelfResult)", required: true },
  // アップデート確認のタイムアウト判定：メッセージが「タイムアウト」になった
  { rel: 'lib/index.js', from: "/超时/.test(String(err1.message || ''))", to: "/超时|タイムアウト|timeout/i.test(String(err1.message || ''))", required: true },
  // plan/クォータ モジュールのプレースホルダに GLM ピーク情報を追加
  {
    rel: 'assets/whale-widget.js',
    from: [
      "    var pwin = bubblePlanWinOf(m)",
      "    map['plan'] = apiPlanUsedText(m.modelId, pwin)",
      "    map['plan_used'] = map['plan']",
      "    map['plan_left'] = apiPlanLeftText(m.modelId, pwin)",
      "    map['plan_reset'] = apiPlanResetText(m.modelId, pwin)",
      "    return map",
    ].join('\n'),
    to: [
      "    var pwin = bubblePlanWinOf(m)",
      "    map['plan'] = apiPlanUsedText(m.modelId, pwin)",
      "    map['plan_used'] = map['plan']",
      "    map['plan_left'] = apiPlanLeftText(m.modelId, pwin)",
      "    map['plan_reset'] = apiPlanResetText(m.modelId, pwin)",
      "    // GLM Coding Plan のピーク/オフピーク（公式: 平日 14-18時 UTC+8、オフピークは 50%）",
      "    map['glm_status'] = dshwGlmPeakText('glm_status')",
      "    map['glm_countdown'] = dshwGlmPeakText('glm_countdown')",
      "    map['glm_until'] = dshwGlmPeakText('glm_until')",
      "    return map",
    ].join('\n'),
    required: true,
  },
  // ふきだしモジュールのヘルプ（? アイコン・入力欄例示）に GLM ピークのプレースホルダを載せる
  {
    rel: 'assets/whale-widget.js',
    from: [
      "    add('plan', 'サブスククォータの使用率（複数ウィンドウのプロバイダーでは「表示スタイル」で選んだウィンドウ、ウィンドウラベル付き）')",
      "    add('plan_left', 'サブスククォータの残量率（同上）')",
      "    add('plan_reset', 'サブスククォータ更新までのカウントダウン（同上。全ウィンドウ時はコンパクト表示）')",
      "    return arr",
    ].join('\n'),
    to: [
      "    add('plan', 'サブスククォータの使用率（複数ウィンドウのプロバイダーでは「表示スタイル」で選んだウィンドウ、ウィンドウラベル付き）')",
      "    add('plan_left', 'サブスククォータの残量率（同上）')",
      "    add('plan_reset', 'サブスククォータ更新までのカウントダウン（同上。全ウィンドウ時はコンパクト表示）')",
      "    add('glm_status', 'GLM ピーク状態（ピーク=平日 15:00–19:00 JST / オフピークは消費 50%）')",
      "    add('glm_countdown', 'GLM ピーク⇔オフピーク 切替までのカウントダウン')",
      "    add('glm_until', 'GLM ピークの開始/終了まで（ラベル付き）')",
      "    return arr",
    ].join('\n'),
    oldFrom: [
      "    add('plan', '订阅额度已用百分比（多窗口厂商按「显示样式」所选窗口，带窗口标签）')",
      "    add('plan_left', '订阅额度剩余百分比（同上）')",
      "    add('plan_reset', '订阅额度刷新倒计时（同上；全部窗口时为紧凑倒计时）')",
      "    return arr",
    ].join('\n'),
    oldTo: [
      "    add('plan', '订阅额度已用百分比（多窗口厂商按「显示样式」所选窗口，带窗口标签）')",
      "    add('plan_left', '订阅额度剩余百分比（同上）')",
      "    add('plan_reset', '订阅额度刷新倒计时（同上；全部窗口时为紧凑倒计时）')",
      "    add('glm_status', 'GLM ピーク状態（ピーク=平日 15:00–19:00 JST / オフピークは消費 50%）')",
      "    add('glm_countdown', 'GLM ピーク⇔オフピーク 切替までのカウントダウン')",
      "    add('glm_until', 'GLM ピークの開始/終了まで（ラベル付き）')",
      "    return arr",
    ].join('\n'),
    required: true,
  },
  {
    rel: 'assets/whale-widget.js',
    from: "inp.placeholder = isModelPlan ? '例: {plan} クォータ ・ {plan_reset} リセット時刻'",
    oldFrom: "inp.placeholder = isModelPlan ? '例: {plan} 额度 ・ {plan_reset} 重置倒计时'",
    to: "inp.placeholder = isModelPlan ? '例: 【{glm_status}】{plan} クォータ ・ {plan_reset} リセット時刻'",
    required: true,
  },
  {
    rel: 'assets/whale-widget.js',
    from: "'{plan} クォータ / {plan_left} 残り / {plan_reset} リセット時刻（複数ウィンドウ時は「表示スタイル」で選択したウィンドウに従って変化）'",
    oldFrom: "'{plan} 额度 / {plan_left} 剩余 / {plan_reset} 重置倒计时（多窗口厂商随「显示样式」所选窗口变化）'",
    to: "'{plan} クォータ / {plan_left} 残り / {plan_reset} リセット時刻（複数ウィンドウ時は「表示スタイル」で選択したウィンドウに従って変化） ／ GLM ピーク: {glm_status} {glm_countdown} {glm_until}'",
    required: true,
  },
  {
    rel: 'assets/whale-widget.js',
    from: "'このプロバイダーのサブスク枠（プロバイダー API から取得、手動ではありません）；テンプレート変数 {plan} クォータ / {plan_reset} リセット時刻 / {plan_left} 残り' + planWinHint",
    oldFrom: "'该厂商的订阅额度（来自厂商 API，非手动）；模板变量 {plan} 额度 / {plan_reset} 重置倒计时 / {plan_left} 剩余' + planWinHint",
    to: "'このプロバイダーのサブスク枠（プロバイダー API から取得、手動ではありません）；テンプレート変数 {plan} クォータ / {plan_reset} リセット時刻 / {plan_left} 残り / {glm_status} GLMピーク' + planWinHint",
    required: true,
  },
]
