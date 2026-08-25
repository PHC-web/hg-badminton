export function judgeSetEnd(a, b, { points = 21, capPoints = 30, deuceMargin = 2 } = {}) {
  if (a === capPoints || b === capPoints) return a !== b
  return (a >= points && a - b >= deuceMargin) || (b >= points && b - a >= deuceMargin)
}

export function isDeuce(a, b, points = 21) {
  return a >= points - 1 && b >= points - 1
}

export function gamePointSide(a, b, rule) {
  if (judgeSetEnd(a + 1, b, rule) && !judgeSetEnd(a, b, rule)) return 'a'
  if (judgeSetEnd(a, b + 1, rule) && !judgeSetEnd(a, b, rule)) return 'b'
  return null
}

export function tallySets(sets = [], setsToWin = 2) {
  let a = 0
  let b = 0
  sets.forEach((s) => {
    if (s.winner === 'a') a += 1
    if (s.winner === 'b') b += 1
  })
  const finished = a >= setsToWin || b >= setsToWin
  return {
    a,
    b,
    finished,
    winner: a >= setsToWin ? 'a' : b >= setsToWin ? 'b' : null
  }
}

export function formatSets(sets = []) {
  return sets
    .filter((s) => s.aScore != null && s.bScore != null)
    .map((s) => `${s.aScore}:${s.bScore}`)
    .join(' · ')
}

export function judgeTeamWinner(subFixtures, teamRule, itemsCount) {
  const aWins = subFixtures.filter((s) => s.winner === 'a' && ['finished', 'confirmed'].includes(s.status)).length
  const bWins = subFixtures.filter((s) => s.winner === 'b' && ['finished', 'confirmed'].includes(s.status)).length
  const done = subFixtures.filter((s) => ['finished', 'confirmed'].includes(s.status)).length
  const mode = teamRule?.mode || 'firstToWin'
  const n = teamRule?.itemsWinToWin || Math.ceil((itemsCount || subFixtures.length) / 2)

  if (mode === 'firstToWin') {
    if (aWins >= n) return { winner: 'a', aScore: aWins, bScore: bWins, locked: true }
    if (bWins >= n) return { winner: 'b', aScore: aWins, bScore: bWins, locked: true }
    return { winner: null, aScore: aWins, bScore: bWins, locked: false }
  }

  if (done >= subFixtures.length && subFixtures.length) {
    if (aWins > bWins) return { winner: 'a', aScore: aWins, bScore: bWins, locked: true }
    if (bWins > aWins) return { winner: 'b', aScore: aWins, bScore: bWins, locked: true }
    return { winner: null, aScore: aWins, bScore: bWins, locked: true, draw: true }
  }
  return { winner: null, aScore: aWins, bScore: bWins, locked: false }
}
