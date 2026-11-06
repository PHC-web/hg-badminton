'use strict'

module.exports = function createScoreActions(h, actions) {
  const {
    pickId,
    getById,
    listCol,
    setDoc,
    upd,
    rem,
    userName,
    pushNotify,
    hydrateMatch,
    hydrateFixture,
    canSubmitLineupForTeam,
    canRefereeFixture,
    refreshFixtureResult,
    activeMembers,
    judgeSetEnd,
    tallySets,
    itemGenderNeed,
    validateTeamConcurrent,
    needUser,
    fail,
    nid,
    nowIso
  } = h

  return {
    async startSubFixture(data, { userId }) {
      const u = await needUser(userId)
      const id = pickId(data, ['id', 'subFixtureId'])
      const sub = await getById('sub_fixtures', id)
      if (!sub) fail('场次不存在')
      const f = await getById('fixtures', sub.fixtureId)
      if (!(await canRefereeFixture(u, f, sub))) fail('仅被指派的裁判或管理员可记分')
      if (!sub.lineupASubmitted || !sub.lineupBSubmitted) fail('双方上场名单均提交后才能开始')
      if (sub.status === 'pending') {
        await upd('sub_fixtures', id, { status: 'live' })
        await upd('fixtures', f._id, { status: 'live' })
      }
      return actions.getSubFixture(id, { userId })
    },

    async getSubFixture(data, { userId }) {
      const user = await needUser(userId)
      const id = pickId(data, ['id', 'subFixtureId'])
      const sub = await getById('sub_fixtures', id)
      if (!sub) fail('场次不存在')
      const f = await hydrateFixture(await getById('fixtures', sub.fixtureId), user)
      const match = await hydrateMatch(await getById('matches', f.matchId))
      const item = await getById('match_items', sub.itemId)
      const both = !!sub.lineupASubmitted && !!sub.lineupBSubmitted
      const canShowA = both || f.viewerOnA
      const canShowB = both || f.viewerOnB
      const refNames = []
      for (const rid of sub.refereeIds || []) refNames.push(await userName(rid))
      return {
        ...sub,
        itemName: item?.name || '单项',
        refereeNames: refNames.filter(Boolean).join('、'),
        playerAIds: canShowA ? sub.playerAIds || [] : [],
        playerBIds: canShowB ? sub.playerBIds || [] : [],
        playersA: canShowA ? sub.playersA || [] : [],
        playersB: canShowB ? sub.playersB || [] : [],
        lineupBothReady: both,
        fixture: f,
        match,
        item
      }
    },

    async submitSubLineup(data = {}, { userId }) {
      const u = await needUser(userId)
      const subId = data.subFixtureId || data.id
      const side = data.side === 'b' ? 'b' : 'a'
      const playerIds = Array.isArray(data.playerIds) ? data.playerIds.filter(Boolean) : []
      if (!subId) fail('缺少小项 id')

      const sub = await getById('sub_fixtures', subId)
      if (!sub) fail('小项不存在')
      const fixture = await getById('fixtures', sub.fixtureId)
      if (!fixture) fail('对阵不存在')
      const match = await getById('matches', fixture.matchId)
      if (!match) fail('比赛不存在')
      const item = await getById('match_items', sub.itemId)
      if (!item) fail('比赛项目不存在')

      const team = await getById('teams', side === 'a' ? fixture.teamAId : fixture.teamBId)
      if (!team) fail('队伍不存在')
      if (!canSubmitLineupForTeam(u, team)) fail('仅本队队长或管理员可提交上场名单')

      const need = Number(item.memberCount) || 1
      if (playerIds.length !== need) fail(`${item.name} 需要选择 ${need} 名队员`)

      const roster = activeMembers(team)
      const picked = playerIds.map((id) => {
        const m = roster.find((x) => x.id === id)
        if (!m) fail('只能选择本队已报名的有效队员')
        return m
      })
      if (new Set(playerIds).size !== playerIds.length) fail('队员不可重复选择')

      const genderNeed = itemGenderNeed(item.name)
      if (genderNeed.total > 0) {
        const male = picked.filter((m) => m.gender !== 'female').length
        const female = picked.filter((m) => m.gender === 'female').length
        if (male !== genderNeed.male || female !== genderNeed.female) {
          fail(`${item.name} 需要男 ${genderNeed.male} / 女 ${genderNeed.female}`)
        }
      }

      const allSubs = await listCol('sub_fixtures', { fixtureId: fixture._id })
      const teamSubs = allSubs.map((s) => {
        const isCurrent = s._id === subId
        let ids = []
        if (isCurrent) ids = playerIds
        else if (side === 'a' && s.lineupASubmitted) ids = s.playerAIds || []
        else if (side === 'b' && s.lineupBSubmitted) ids = s.playerBIds || []
        const members = ids
          .map((id) => roster.find((m) => m.id === id) || (isCurrent ? picked.find((m) => m.id === id) : null))
          .filter(Boolean)
        return { subId: s._id, members }
      })
      const err = validateTeamConcurrent(match, teamSubs)
      if (err) fail(err)

      const snapshot = picked.map((m) => ({
        id: m.id,
        userId: m.userId || '',
        name: m.name,
        gender: m.gender === 'female' ? 'female' : 'male'
      }))

      if (side === 'a') {
        await upd('sub_fixtures', subId, {
          playerAIds: playerIds,
          playersA: snapshot,
          lineupASubmitted: true,
          lineupASubmittedAt: nowIso(),
          lineupABy: u._id
        })
      } else {
        await upd('sub_fixtures', subId, {
          playerBIds: playerIds,
          playersB: snapshot,
          lineupBSubmitted: true,
          lineupBSubmittedAt: nowIso(),
          lineupBBy: u._id
        })
      }

      const next = await getById('sub_fixtures', subId)
      if (next.lineupASubmitted && next.lineupBSubmitted) {
        const teamA = await getById('teams', fixture.teamAId)
        const teamB = await getById('teams', fixture.teamBId)
        await pushNotify(teamA?.captainId, '双方名单已齐', `${item.name} 双方上场名单已提交`, {
          fixtureId: fixture._id,
          subFixtureId: subId
        })
        await pushNotify(teamB?.captainId, '双方名单已齐', `${item.name} 双方上场名单已提交`, {
          fixtureId: fixture._id,
          subFixtureId: subId
        })
        for (const rid of next.refereeIds || fixture.refereeIds || []) {
          await pushNotify(
            rid,
            '可开始执裁',
            `${teamA?.name || '待定'} vs ${teamB?.name || '待定'} · ${item.name}`,
            { fixtureId: fixture._id, subFixtureId: subId }
          )
        }
      }

      return hydrateFixture(fixture, u)
    },

    async clearSubLineup(data = {}, { userId }) {
      const u = await needUser(userId)
      const subId = data.subFixtureId || data.id
      const side = data.side === 'b' ? 'b' : 'a'
      const sub = await getById('sub_fixtures', subId)
      if (!sub) fail('小项不存在')
      if (['live', 'finished', 'confirmed'].includes(sub.status)) fail('比赛已开始，无法撤回名单')
      const fixture = await getById('fixtures', sub.fixtureId)
      const team = await getById('teams', side === 'a' ? fixture.teamAId : fixture.teamBId)
      if (!canSubmitLineupForTeam(u, team)) fail('无权撤回')
      if (side === 'a') {
        await upd('sub_fixtures', subId, {
          playerAIds: [],
          playersA: [],
          lineupASubmitted: false,
          lineupASubmittedAt: '',
          lineupABy: ''
        })
      } else {
        await upd('sub_fixtures', subId, {
          playerBIds: [],
          playersB: [],
          lineupBSubmitted: false,
          lineupBSubmittedAt: '',
          lineupBBy: ''
        })
      }
      return hydrateFixture(fixture, u)
    },

    async addPoint(data = {}, { userId }) {
      const u = await needUser(userId)
      const subFixtureId = data.subFixtureId
      const side = data.side
      const sub = await getById('sub_fixtures', subFixtureId)
      if (!sub) fail('场次不存在')
      const f = await getById('fixtures', sub.fixtureId)
      if (!(await canRefereeFixture(u, f, sub))) fail('无权记分')
      const match = await getById('matches', f.matchId)
      const rule = match.scoring || { points: 21, capPoints: 30, deuceMargin: 2 }
      if (['finished', 'confirmed'].includes(sub.status)) fail('本场已结束')
      if (sub.status === 'pending') {
        if (!sub.lineupASubmitted || !sub.lineupBSubmitted) fail('双方上场名单均提交后才能记分')
        await upd('sub_fixtures', subFixtureId, { status: 'live' })
      }
      const sets = [...(sub.sets || [{ aScore: 0, bScore: 0, winner: '' }])]
      let idx = sets.findIndex((s) => !s.winner)
      if (idx < 0) {
        sets.push({ aScore: 0, bScore: 0, winner: '' })
        idx = sets.length - 1
      }
      if (side === 'a') sets[idx].aScore += 1
      else sets[idx].bScore += 1
      const logId = nid('log_')
      await setDoc('score_logs', logId, {
        subFixtureId,
        operatorId: u._id,
        type: 'add',
        payload: { side, set: idx + 1, a: sets[idx].aScore, b: sets[idx].bScore },
        createdAt: nowIso()
      })
      let status = 'live'
      let winner = ''
      if (judgeSetEnd(sets[idx].aScore, sets[idx].bScore, rule)) {
        sets[idx].winner = sets[idx].aScore > sets[idx].bScore ? 'a' : 'b'
        const t = tallySets(sets, 2)
        if (t.finished) {
          status = 'finished'
          winner = t.winner
        } else {
          status = 'set_break'
          sets.push({ aScore: 0, bScore: 0, winner: '' })
        }
      }
      await upd('sub_fixtures', subFixtureId, {
        sets,
        status,
        winner,
        currentSet: sets.filter((s) => s.winner).length + (status === 'finished' ? 0 : 1)
      })
      await refreshFixtureResult(f._id)
      return actions.getSubFixture(subFixtureId, { userId })
    },

    async undoPoint(data, { userId }) {
      const u = await needUser(userId)
      const subFixtureId = pickId(data, ['id', 'subFixtureId'])
      const logs = (await listCol('score_logs', { subFixtureId })).filter((l) => l.type === 'add')
      logs.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
      const last = logs[logs.length - 1]
      if (!last) fail('暂无上一步记录')
      const sub = await getById('sub_fixtures', subFixtureId)
      const f = await getById('fixtures', sub.fixtureId)
      if (!(await canRefereeFixture(u, f, sub))) fail('无权撤销')
      const sets = JSON.parse(JSON.stringify(sub.sets || []))
      let idx = sets.length - 1
      while (idx >= 0 && sets[idx].aScore === 0 && sets[idx].bScore === 0 && !sets[idx].winner) {
        sets.pop()
        idx -= 1
      }
      if (idx < 0) fail('暂无上一步记录')
      if (sets[idx].winner) sets[idx].winner = ''
      if (last.payload?.side === 'a' && sets[idx].aScore > 0) sets[idx].aScore -= 1
      if (last.payload?.side === 'b' && sets[idx].bScore > 0) sets[idx].bScore -= 1
      await rem('score_logs', last._id)
      await upd('sub_fixtures', subFixtureId, {
        sets,
        status: 'live',
        winner: '',
        currentSet: sets.filter((s) => s.winner).length + 1
      })
      await refreshFixtureResult(f._id)
      return actions.getSubFixture(subFixtureId, { userId })
    },

    async confirmSubFixture(data, { userId }) {
      const u = await needUser(userId)
      const id = pickId(data, ['id', 'subFixtureId'])
      const sub = await getById('sub_fixtures', id)
      const f = await getById('fixtures', sub.fixtureId)
      if (!(await canRefereeFixture(u, f, sub))) fail('无权确认')
      if (sub.status !== 'finished') fail('比赛尚未结束')
      await upd('sub_fixtures', id, { status: 'confirmed' })
      await refreshFixtureResult(f._id)
      return actions.getFixture(f._id, { userId })
    }
  }
}
