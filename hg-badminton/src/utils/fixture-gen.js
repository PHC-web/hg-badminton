const GROUP_NAMES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export function autoGroup(teamIds) {
  const n = teamIds.length
  if (n <= 4) {
    return [{ name: 'A', teamIds: [...teamIds] }]
  }
  let groupSize = 4
  if (n % 4 === 1 || n % 4 === 2) groupSize = 3
  const groups = []
  const ids = [...teamIds]
  let i = 0
  let gi = 0
  while (i < ids.length) {
    const remain = ids.length - i
    let size = groupSize
    if (remain === 5 && groupSize === 4) size = 3
    if (remain < 3 && groups.length) {
      groups[groups.length - 1].teamIds.push(...ids.slice(i))
      break
    }
    groups.push({ name: GROUP_NAMES[gi++], teamIds: ids.slice(i, i + size) })
    i += size
  }
  return groups
}

export function roundRobinRounds(teamIds) {
  const ids = [...teamIds]
  const bye = ids.length % 2 === 1
  if (bye) ids.push(null)
  const n = ids.length
  const rounds = []
  const arr = [...ids]
  for (let r = 0; r < n - 1; r++) {
    const pairs = []
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i]
      const b = arr[n - 1 - i]
      if (a && b) pairs.push([a, b])
    }
    rounds.push(pairs)
    const last = arr.pop()
    arr.splice(1, 0, last)
  }
  return rounds
}

export function nextPow2(n) {
  let p = 1
  while (p < n) p *= 2
  return p
}

export function knockoutFirstRound(teamIds) {
  const size = nextPow2(Math.max(teamIds.length, 2))
  const seeded = [...teamIds]
  while (seeded.length < size) seeded.push(null)
  const pairs = []
  for (let i = 0; i < size; i += 2) {
    pairs.push([seeded[i], seeded[i + 1]])
  }
  return { size, pairs, rounds: Math.log2(size) }
}

export function rankingFromFixtures(teams, fixtures) {
  const map = {}
  teams.forEach((t) => {
    map[t._id] = {
      teamId: t._id,
      name: t.name,
      win: 0,
      lose: 0,
      points: 0,
      setDiff: 0,
      pointDiff: 0
    }
  })
  fixtures.forEach((f) => {
    if (!['finished', 'confirmed'].includes(f.status) || !f.result) return
    const a = map[f.teamAId]
    const b = map[f.teamBId]
    if (!a || !b) return
    const as = f.result.teamAScore || 0
    const bs = f.result.teamBScore || 0
    a.setDiff += as - bs
    b.setDiff += bs - as
    if (f.result.winnerTeamId === f.teamAId) {
      a.win += 1
      a.points += 2
      b.lose += 1
      b.points += 1
    } else if (f.result.winnerTeamId === f.teamBId) {
      b.win += 1
      b.points += 2
      a.lose += 1
      a.points += 1
    }
  })
  return Object.values(map).sort((x, y) => y.points - x.points || y.setDiff - x.setDiff || y.win - x.win)
}
