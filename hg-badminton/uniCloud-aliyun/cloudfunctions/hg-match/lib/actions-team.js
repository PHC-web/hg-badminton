'use strict'

module.exports = function createTeamActions(h, actions) {
  const {
    pickId,
    getById,
    listCol,
    setDoc,
    upd,
    rem,
    needAdmin,
    activeMembers,
    teamCaptainName,
    pushNotify,
    isAdmin,
    hasAnyRole,
    genderCount,
    needUser,
    fail,
    nid,
    nowIso
  } = h

  return {
    async saveTeam(data = {}, { userId }) {
      const u = await needUser(userId)
      if (!hasAnyRole(u, ['super_admin', 'admin', 'captain'])) fail('需要队长权限')
      const match = await getById('matches', data.matchId)
      if (!match || match.deleted) fail('比赛不存在')
      if (match.status !== 'registering' && !isAdmin(u)) fail('当前不可报名')
      if (!data.name) fail('请填写队名')
      if (!data.department) fail('请填写部门')

      const adminMode = isAdmin(u)
      let team = data._id ? await getById('teams', data._id) : null
      if (team && team.matchId !== data.matchId) fail('队伍不属于本场比赛')
      if (!team && !adminMode) {
        const mine = await listCol('teams', { matchId: data.matchId, captainId: u._id })
        team = mine[0] || null
      }
      if (team && !adminMode && team.captainId !== u._id) fail('无权编辑该队伍')

      let captainId = team?.captainId || ''
      let captainName =
        data.captainName !== undefined ? String(data.captainName || '').trim() : team?.captainName || ''
      let captainPhone =
        data.captainPhone !== undefined
          ? String(data.captainPhone || '').trim()
          : team?.captainPhone || ''

      if (adminMode) {
        if (data.captainId) {
          const cap = await getById('users', data.captainId)
          if (!cap || cap.deleted) fail('指定队长不存在')
          captainId = cap._id
          if (!captainName) captainName = cap.realName || cap.nickname || ''
          if (!captainPhone) captainPhone = cap.phone || ''
        } else if (captainPhone) {
          const users = await listCol('users', { phone: captainPhone }, 20)
          const cap = users.find((x) => !x.deleted)
          captainId = cap ? cap._id : ''
          if (cap && !captainName) captainName = cap.realName || cap.nickname || ''
        } else if (!team) {
          captainId = ''
        }
      } else {
        captainId = team?.captainId || u._id
        if (!captainName) captainName = u.realName || u.nickname || ''
        if (!captainPhone) captainPhone = u.phone || ''
      }

      let members = Array.isArray(data.members) ? [...data.members] : [...(team?.members || [])]
      members = members.map((m) => ({
        id: m.id || nid('mb_'),
        userId: m.userId || '',
        name: m.name || '',
        phone: m.phone || '',
        gender: m.gender === 'female' ? 'female' : 'male',
        idCard: m.idCard || '',
        job: m.job || '',
        status: m.status || 'active',
        isCaptain: !!m.isCaptain
      }))
      if (captainPhone) {
        members = members.map((m) => ({ ...m, isCaptain: m.phone === captainPhone }))
      }

      const active = members.filter((m) => m.status === 'active')
      if (active.filter((m) => m.gender === 'male').length > match.maxMalePerTeam) fail('男队员人数已超限')
      if (active.filter((m) => m.gender === 'female').length > match.maxFemalePerTeam) {
        fail('女队员人数已超限')
      }

      const teams = await listCol('teams', { matchId: data.matchId })
      if (!team && teams.length >= match.maxTeams) fail('报名队伍已满')
      const dup = teams.find((t) => t.name === data.name && (!team || t._id !== team._id))
      if (dup) fail(`队名「${data.name}」已存在`)

      const payload = {
        matchId: data.matchId,
        name: data.name,
        department: data.department,
        slogan: data.slogan || '',
        captainId,
        captainName,
        captainPhone,
        members
      }
      if (team) return upd('teams', team._id, payload)
      const tid = nid('t_')
      return setDoc('teams', tid, { ...payload, createdAt: nowIso() })
    },

    async importMatchTeams(data = {}, { userId }) {
      const admin = await needAdmin(userId)
      const matchId = data.matchId
      const rows = Array.isArray(data.teams) ? data.teams : []
      if (!matchId) fail('缺少比赛 id')
      if (!rows.length) fail('没有可导入的队伍')
      const match = await getById('matches', matchId)
      if (!match || match.deleted) fail('比赛不存在')

      let created = 0
      let updated = 0
      for (const row of rows) {
        if (!row?.name) fail('存在缺少队名的行')
        if (!row?.department) fail(`队伍「${row.name}」缺少部门`)
        const all = await listCol('teams', { matchId })
        const exist = all.find((t) => t.name === row.name)
        const members = (row.members || []).map((m) => ({
          id: nid('mb_'),
          userId: '',
          name: m.name,
          phone: m.phone,
          gender: m.gender === 'female' ? 'female' : 'male',
          idCard: m.idCard || '',
          job: m.job || '',
          status: 'active',
          isCaptain: false
        }))
        if (row.captainPhone) {
          const i = members.findIndex((m) => m.phone === row.captainPhone)
          if (i >= 0) members[i] = { ...members[i], isCaptain: true }
        }
        await actions.saveTeam(
          {
            _id: exist?._id,
            matchId,
            name: row.name,
            department: row.department,
            slogan: row.slogan || '',
            captainName: row.captainName || '',
            captainPhone: row.captainPhone || '',
            members
          },
          { userId: admin._id }
        )
        if (exist) updated += 1
        else created += 1
      }
      return { ok: true, created, updated, total: rows.length }
    },

    async importTeamMembers(data = {}, { userId }) {
      const u = await needUser(userId)
      if (!hasAnyRole(u, ['super_admin', 'admin', 'captain'])) fail('需要队长权限')
      const matchId = data.matchId
      const incoming = Array.isArray(data.members) ? data.members : []
      if (!matchId) fail('缺少比赛 id')
      if (!incoming.length) fail('没有可导入的队员')

      let team = data.teamId ? await getById('teams', data.teamId) : null
      if (!team) {
        const mine = await listCol('teams', { matchId, captainId: u._id })
        team = mine[0] || null
      }
      if (!team) fail('请先创建并保存队伍基本信息')
      if (!isAdmin(u) && team.captainId !== u._id) fail('无权编辑该队伍')

      const members = [...(team.members || [])]
      for (const raw of incoming) {
        if (!raw?.name || !raw?.phone) fail('队员须含姓名与手机号')
        const gender = raw.gender === 'female' ? 'female' : 'male'
        const idx = members.findIndex((m) => m.phone === String(raw.phone).trim())
        const next = {
          id: idx >= 0 ? members[idx].id : nid('mb_'),
          userId: idx >= 0 ? members[idx].userId || '' : '',
          name: String(raw.name).trim(),
          phone: String(raw.phone).trim(),
          gender,
          idCard: String(raw.idCard || '').trim(),
          job: String(raw.job || '').trim(),
          status: idx >= 0 ? members[idx].status || 'active' : 'active',
          isCaptain: idx >= 0 ? !!members[idx].isCaptain : false
        }
        if (idx >= 0) members[idx] = next
        else members.push(next)
      }

      return actions.saveTeam(
        {
          _id: team._id,
          matchId: team.matchId,
          name: team.name,
          department: team.department,
          slogan: team.slogan || '',
          members
        },
        { userId }
      )
    },

    async deleteTeam(data = {}, { userId }) {
      await needAdmin(userId)
      const id = pickId(data, ['id', 'teamId'])
      const team = await getById('teams', id)
      if (!team) fail('队伍不存在')
      await rem('teams', id)
      return { ok: true }
    },

    async applyJoinTeam(data = {}, { userId }) {
      const u = await needUser(userId)
      const team = await getById('teams', data.teamId)
      if (!team) fail('队伍不存在')
      const match = await getById('matches', team.matchId)
      if (!match || match.deleted || match.status !== 'registering') fail('当前不可报名')
      if ((team.members || []).some((m) => m.userId === u._id && m.status !== 'cancel_pending')) {
        fail('您已在该队伍中或待审批')
      }
      const name = data.name || u.realName || u.nickname
      const phone = data.phone || u.phone
      const gender = data.gender || u.gender || 'male'
      if (!name || !phone) fail('请填写姓名和手机号')
      if (!data.idCard) fail('请填写身份证号')
      const active = activeMembers(team)
      if (gender === 'male' && genderCount(team.members, 'male') >= match.maxMalePerTeam) fail('男队员已满')
      if (gender === 'female' && genderCount(team.members, 'female') >= match.maxFemalePerTeam) {
        fail('女队员已满')
      }
      if (active.length >= match.maxMalePerTeam + match.maxFemalePerTeam) fail('队伍人数已满')

      const members = [
        ...(team.members || []),
        {
          id: nid('mb_'),
          userId: u._id,
          name,
          phone,
          gender,
          idCard: data.idCard,
          job: data.job || '',
          status: 'pending'
        }
      ]
      await upd('users', u._id, { realName: u.realName || name, phone: u.phone || phone, gender })
      await upd('teams', team._id, { members })
      await pushNotify(team.captainId, '入队申请', `${name} 申请加入「${team.name}」`, { teamId: team._id })
      return { ok: true }
    },

    async reviewTeamMember(data = {}, { userId }) {
      const u = await needUser(userId)
      const { teamId, memberId, action } = data
      const team = await getById('teams', teamId)
      if (!team) fail('队伍不存在')
      if (team.captainId !== u._id && !isAdmin(u)) fail('仅队长或管理员可审批')
      const match = await getById('matches', team.matchId)
      const members = [...(team.members || [])]
      const idx = members.findIndex((m) => m.id === memberId)
      if (idx < 0) fail('成员不存在')
      const mb = members[idx]
      if (action === 'approve') {
        if (mb.gender === 'male' && genderCount(members, 'male') >= match.maxMalePerTeam) fail('男队员已满')
        if (mb.gender === 'female' && genderCount(members, 'female') >= match.maxFemalePerTeam) {
          fail('女队员已满')
        }
        members[idx] = { ...mb, status: 'active' }
        await pushNotify(mb.userId, '入队通过', `您已加入「${team.name}」`, { teamId })
      } else if (action === 'reject') {
        members.splice(idx, 1)
        await pushNotify(mb.userId, '入队未通过', `「${team.name}」未通过您的入队申请`, { teamId })
      } else if (action === 'approve_cancel') {
        members.splice(idx, 1)
      } else if (action === 'reject_cancel') {
        members[idx] = { ...mb, status: 'active' }
      } else if (action === 'remove') {
        members.splice(idx, 1)
      } else fail('未知操作')
      return upd('teams', teamId, { members })
    },

    async requestLeaveTeam(data = {}, { userId }) {
      const u = await needUser(userId)
      const team = await getById('teams', data.teamId)
      if (!team) fail('队伍不存在')
      const members = [...(team.members || [])]
      const idx = members.findIndex((m) => m.userId === u._id && m.status === 'active')
      if (idx < 0) fail('您不在该队伍中')
      members[idx] = { ...members[idx], status: 'cancel_pending' }
      await upd('teams', team._id, { members })
      await pushNotify(team.captainId, '取消报名申请', `${members[idx].name} 申请退出「${team.name}」`, {
        teamId: team._id
      })
      return { ok: true }
    },

    async listTeams(data, { userId }) {
      await needUser(userId)
      const matchId = pickId(data, ['matchId', 'id'])
      const teams = await listCol('teams', { matchId })
      return teams.map((t) => ({
        ...t,
        captainName: teamCaptainName(t),
        activeCount: activeMembers(t).length
      }))
    },

    async getMyTeam(data, { userId }) {
      const u = await needUser(userId)
      const matchId = pickId(data, ['matchId', 'id'])
      const teams = await listCol('teams', { matchId })
      return (
        teams.find(
          (t) => t.captainId === u._id || (t.members || []).some((m) => m.userId === u._id)
        ) || null
      )
    }
  }
}
