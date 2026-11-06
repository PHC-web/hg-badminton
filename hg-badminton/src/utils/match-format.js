import { DEFAULT_ITEMS } from './constants'

export const ITEM_CATALOG = [
  { name: '男单', memberCount: 1 },
  { name: '女单', memberCount: 1 },
  { name: '男双', memberCount: 2 },
  { name: '女双', memberCount: 2 },
  { name: '混双', memberCount: 2 }
]

export const ITEM_NAMES = ITEM_CATALOG.map((i) => i.name)

const ITEM_MEMBER_COUNT = Object.fromEntries(ITEM_CATALOG.map((i) => [i.name, i.memberCount]))

export const TEAM_FORMATS = [
  { key: 'bo3', label: '三局两胜', desc: '先赢 2 项即获胜', mode: 'firstToWin', itemsWinToWin: 2, itemCount: 3 },
  { key: 'bo5', label: '五局三胜', desc: '先赢 3 项即获胜', mode: 'firstToWin', itemsWinToWin: 3, itemCount: 5 },
  { key: 'play3', label: '打满三局', desc: '三项全部打完再计胜负', mode: 'playAll', itemsWinToWin: 2, itemCount: 3 },
  { key: 'play5', label: '打满五局', desc: '五项全部打完再计胜负', mode: 'playAll', itemsWinToWin: 3, itemCount: 5 }
]

export const ITEM_PRESETS = [
  {
    key: 'standard',
    label: '标准五项',
    desc: '男单、女单、男双、女双、混双',
    items: DEFAULT_ITEMS
  },
  {
    key: 'mdxd',
    label: '男双混双',
    desc: '男双、混双、男双、混双、男双',
    items: [
      { name: '男双', memberCount: 2 },
      { name: '混双', memberCount: 2 },
      { name: '男双', memberCount: 2 },
      { name: '混双', memberCount: 2 },
      { name: '男双', memberCount: 2 }
    ]
  }
]

export function cloneItems(list) {
  return (list || []).map((it) => ({
    name: it.name,
    memberCount: Number(it.memberCount) || ITEM_MEMBER_COUNT[it.name] || 1
  }))
}

export function catalogItem(name) {
  return ITEM_CATALOG.find((i) => i.name === name) || null
}

export function sanitizeMatchItems(raw) {
  if (!Array.isArray(raw) || !raw.length) {
    throw new Error('请至少选择 1 个项目')
  }
  if (raw.length > 9) throw new Error('每场项目最多 9 项')
  return raw.map((it, i) => {
    const name = String(it?.name || '').trim()
    const memberCount = ITEM_MEMBER_COUNT[name]
    if (!memberCount) throw new Error(`不支持的项目：${name || '空'}`)
    return { name, memberCount, sort: i + 1 }
  })
}

export function sanitizeTeamRule(raw, itemCount) {
  const n = Math.max(1, Number(itemCount) || 1)
  const mode = raw?.mode === 'playAll' ? 'playAll' : 'firstToWin'
  const win = Math.max(1, Math.min(n, Number(raw?.itemsWinToWin) || Math.ceil(n / 2)))
  return { mode, itemsWinToWin: win }
}

export function defaultTeamRule(itemCount = 5) {
  return sanitizeTeamRule({ mode: 'firstToWin' }, itemCount)
}

export function teamRuleLabel(rule, itemCount) {
  const n = Number(itemCount) || 0
  if (!n) return ''
  if (rule?.mode === 'playAll') return `打满${toCNNum(n)}局`
  const w = rule?.itemsWinToWin || Math.ceil(n / 2)
  return `${toCNNum(n)}局${toCNNum(w)}胜`
}

export function itemsLabel(items) {
  return (items || []).map((it) => it.name).filter(Boolean).join('、')
}

export function matchFormatKey(rule, items) {
  const n = (items || []).length
  const mode = rule?.mode || 'firstToWin'
  const win = rule?.itemsWinToWin || Math.ceil(n / 2)
  const found = TEAM_FORMATS.find((f) => f.itemCount === n && f.mode === mode && f.itemsWinToWin === win)
  return found?.key || ''
}

export function matchItemPresetKey(items) {
  const names = (items || []).map((it) => it.name).join(',')
  const found = ITEM_PRESETS.find((p) => p.items.map((it) => it.name).join(',') === names)
  return found?.key || ''
}

function toCNNum(n) {
  const map = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']
  const v = Number(n) || 0
  return map[v] || String(v)
}
