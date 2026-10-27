// AST 抽取：返回含中文的字符串字面量 / 模板片段（含位置、用途、上下文）。
import { createRequire } from 'node:module'
const require = createRequire('/Users/adlibmacmini2021/node_modules/')
const acorn = require('acorn')

export const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

const MATCH_METHODS = new Set(['includes', 'indexOf', 'startsWith', 'endsWith', 'replace', 'replaceAll', 'match', 'search', 'localeCompare'])

export function extract(src) {
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true })
  const parents = new Map()
  const compare = new Set()
  const matchArgs = new Set()
  const caseTest = new Set()
  const objKey = new Set()

  function walk(node, parent) {
    if (!node || typeof node.type !== 'string') return
    parents.set(node, parent)
    if (node.type === 'BinaryExpression' && ['===', '!==', '==', '!='].includes(node.operator)) {
      for (const side of [node.left, node.right]) {
        if (side.type === 'Literal' && typeof side.value === 'string') compare.add(side)
      }
    }
    if (node.type === 'SwitchCase' && node.test && node.test.type === 'Literal') caseTest.add(node.test)
    if (node.type === 'Property' && !node.computed && node.key && node.key.type === 'Literal') objKey.add(node.key)
    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression'
        && node.callee.property && MATCH_METHODS.has(node.callee.property.name)) {
      for (const a of node.arguments) {
        if (a.type === 'Literal' && typeof a.value === 'string') matchArgs.add(a)
        if (a.type === 'TemplateLiteral') for (const q of a.quasis) matchArgs.add(q)
      }
    }
    for (const k of Object.keys(node)) {
      if (k === 'start' || k === 'end' || k === 'loc' || k === 'range') continue
      const v = node[k]
      if (Array.isArray(v)) { for (const c of v) walk(c, node) } else if (v && typeof v.type === 'string') walk(v, node)
    }
  }
  walk(ast, null)

  const out = []
  function roleOf(node) {
    if (compare.has(node) || caseTest.has(node) || matchArgs.has(node)) return 'compare'
    if (objKey.has(node)) return 'objkey'
    return 'text'
  }
  function lineAt(pos) { return src.slice(0, pos).split('\n').length }

  function visit(node) {
    if (!node || typeof node.type !== 'string') return
    if (node.type === 'Literal' && typeof node.value === 'string') {
      const raw = src.slice(node.start, node.end)
      if (CJK.test(raw)) out.push({ kind: 'string', role: roleOf(node), start: node.start, end: node.end, raw, line: lineAt(node.start) })
    } else if (node.type === 'TemplateLiteral') {
      for (const q of node.quasis) {
        const raw = src.slice(q.start, q.end)
        if (CJK.test(raw)) out.push({ kind: 'quasi', role: roleOf(node), start: q.start, end: q.end, raw, line: lineAt(q.start) })
      }
    }
    for (const k of Object.keys(node)) {
      if (k === 'start' || k === 'end' || k === 'loc' || k === 'range') continue
      const v = node[k]
      if (Array.isArray(v)) { for (const c of v) visit(c) } else if (v && typeof v.type === 'string') visit(v)
    }
  }
  visit(ast)
  return out
}

export function placeholders(s) {
  return [...new Set((s.match(/\{[a-zA-Z_][a-zA-Z0-9_]*\}/g) || []))].sort().join(',')
}
export function tags(s) {
  return (s.match(/<\/?[a-zA-Z][^>]*>/g) || []).join('|')
}

// 校验一条译文是否可安全替换 raw
export function validateReplacement(raw, ja, kind) {
  const errs = []
  if (typeof ja !== 'string' || !ja.length) errs.push('空译文')
  if (kind === 'string') {
    const q = raw[0]
    if (ja[0] !== q || ja[ja.length - 1] !== q) errs.push('引用符不一致')
    const inner = ja.slice(1, -1)
    if (/(?<!\\)\n/.test(inner)) errs.push('未转义换行')
  } else {
    if (/(?<!\\)`/.test(ja)) errs.push('未转义反引号')
    if (/(?<!\\)\$\{/.test(ja)) errs.push('未转义 ${')
  }
  if (placeholders(raw) !== placeholders(ja)) errs.push('占位符不一致: ' + placeholders(raw) + ' vs ' + placeholders(ja))
  if (kind === 'string' && tags(raw) !== tags(ja)) errs.push('HTML タグ不一致')
  return errs
}

export function parses(code) {
  try { acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true }); return true } catch (e) { return false }
}
