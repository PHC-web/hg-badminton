import { DEFAULT_CONCURRENT } from './constants'

export function normalizeConcurrent(raw) {
  const d = DEFAULT_CONCURRENT
  const c = raw && typeof raw === 'object' ? raw : {}
  return {
    enabled: !!c.enabled,
    allowMale: !!c.allowMale,
    allowFemale: !!c.allowFemale,
    maxMalePeople: Math.max(0, Number(c.maxMalePeople) || 0),
    maxFemalePeople: Math.max(0, Number(c.maxFemalePeople) || 0),
    maxMaleItems: Math.max(1, Number(c.maxMaleItems) || 1),
    maxFemaleItems: Math.max(1, Number(c.maxFemaleItems) || 1)
  }
}

/** 根据小项名称推断所需男女人数 */
export function itemGenderNeed(itemName = '') {
  const n = String(itemName)
  if (n.includes('混')) return { male: 1, female: 1, total: 2 }
  if (n.includes('女双')) return { male: 0, female: 2, total: 2 }
  if (n.includes('男双')) return { male: 2, female: 0, total: 2 }
  if (n.includes('女单') || (n.includes('女') && n.includes('单'))) return { male: 0, female: 1, total: 1 }
  if (n.includes('男单') || (n.includes('男') && n.includes('单'))) return { male: 1, female: 0, total: 1 }
  return { male: 0, female: 0, total: 0 }
}

/**
 * 校验本队在一场团体赛中的上场名单是否符合兼项规则
 * @param {object} match
 * @param {Array} teamSubs 本队在各小项已选/将选的名单 [{ subId, memberIds, members }]
 * @param {string} currentSubId
 */
export function validateTeamConcurrent(match, teamSubs) {
  const cfg = normalizeConcurrent(match.concurrent)
  const countById = new Map()
  const genderById = new Map()

  teamSubs.forEach((row) => {
    ;(row.members || []).forEach((m) => {
      if (!m?.id) return
      countById.set(m.id, (countById.get(m.id) || 0) + 1)
      genderById.set(m.id, m.gender === 'female' ? 'female' : 'male')
    })
  })

  const males = [...countById.entries()].filter(([id]) => genderById.get(id) === 'male')
  const females = [...countById.entries()].filter(([id]) => genderById.get(id) === 'female')

  const maleMulti = males.filter(([, c]) => c > 1)
  const femaleMulti = females.filter(([, c]) => c > 1)

  if (!cfg.enabled) {
    if (maleMulti.length || femaleMulti.length) {
      return '本场比赛不允许兼项，同一队员只能打 1 个小项'
    }
    return ''
  }

  if (!cfg.allowMale && maleMulti.length) {
    return '本场比赛不允许男生兼项'
  }
  if (!cfg.allowFemale && femaleMulti.length) {
    return '本场比赛不允许女生兼项'
  }

  if (cfg.allowMale) {
    for (const [id, c] of males) {
      if (c > cfg.maxMaleItems) {
        return `男生每人最多兼项 ${cfg.maxMaleItems} 个小项`
      }
    }
    if (maleMulti.length > cfg.maxMalePeople) {
      return `男生兼项人数最多 ${cfg.maxMalePeople} 人`
    }
  }

  if (cfg.allowFemale) {
    for (const [id, c] of females) {
      if (c > cfg.maxFemaleItems) {
        return `女生每人最多兼项 ${cfg.maxFemaleItems} 个小项`
      }
    }
    if (femaleMulti.length > cfg.maxFemalePeople) {
      return `女生兼项人数最多 ${cfg.maxFemalePeople} 人`
    }
  }

  return ''
}
