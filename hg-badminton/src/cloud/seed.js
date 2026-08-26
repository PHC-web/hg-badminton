import { col, resetDb } from './db'

function iso(y, m, d, h = 9, mi = 0) {
  return new Date(y, m - 1, d, h, mi).toISOString()
}

export function seedDemo(force = false) {
  const users = col('users').all()
  if (users.length && !force) return { seeded: false }
  resetDb()
  const now = nowIsoSafe()

  const userList = [
    {
      _id: 'u_lin',
      nickname: '林教练',
      realName: '林教练',
      phone: '13800002091',
      department: '羽毛球协会',
      gender: 'male',
      roles: ['super_admin', 'admin', 'captain', 'referee', 'member'],
      contacts: [{ name: '临时球友', phone: '13900000001', department: '外援' }]
    },
    {
      _id: 'u_admin',
      nickname: '管理小周',
      realName: '周敏',
      phone: '13800001111',
      department: '行政部',
      gender: 'female',
      roles: ['admin', 'member'],
      contacts: []
    },
    {
      _id: 'u_li',
      nickname: '李飞',
      realName: '李飞',
      phone: '13800012091',
      department: '市场部',
      gender: 'male',
      roles: ['captain', 'member'],
      contacts: []
    },
    {
      _id: 'u_zhao',
      nickname: '赵迅',
      realName: '赵迅',
      phone: '13500001122',
      department: '技术部',
      gender: 'male',
      roles: ['captain', 'member'],
      contacts: []
    },
    {
      _id: 'u_wang',
      nickname: '王浩然',
      realName: '王浩然',
      phone: '13900008842',
      department: '产品部',
      gender: 'male',
      roles: ['referee', 'member'],
      contacts: []
    },
    {
      _id: 'u_chen',
      nickname: '陈明',
      realName: '陈明',
      phone: '13400003344',
      department: '运营部',
      gender: 'male',
      roles: ['referee', 'member'],
      contacts: []
    },
    {
      _id: 'u_zhang',
      nickname: '张思雨',
      realName: '张思雨',
      phone: '13700005510',
      department: '设计部',
      gender: 'female',
      roles: ['member'],
      contacts: []
    },
    {
      _id: 'u_liu',
      nickname: '刘洋',
      realName: '刘洋',
      phone: '13600007731',
      department: '技术部',
      gender: 'male',
      roles: ['member'],
      contacts: []
    },
    {
      _id: 'u_sun',
      nickname: '孙悦',
      realName: '孙悦',
      phone: '13100009900',
      department: '市场部',
      gender: 'female',
      roles: ['member'],
      contacts: []
    },
    {
      _id: 'u_guest',
      nickname: '围观同学',
      realName: '围观同学',
      phone: '15000006666',
      department: '人事部',
      gender: 'male',
      roles: ['member'],
      contacts: []
    }
  ].map((u) => ({
    ...u,
    avatar: '',
    openid: `demo_${u._id}`,
    groupIds: u.groupIds || [],
    verified: true,
    approveStatus: 'approved',
    createdAt: now
  }))
  col('users').insertMany(userList)

  col('groups').insertMany([
    { _id: 'g_a', name: 'A队', isDefault: true, createdAt: now, creatorId: 'u_lin' },
    { _id: 'g_b', name: 'B队', isDefault: false, createdAt: now, creatorId: 'u_lin' },
    { _id: 'g_c', name: 'C队', isDefault: false, createdAt: now, creatorId: 'u_admin' }
  ])

  // 给演示用户挂组别
  ;['u_li', 'u_zhang', 'u_wang'].forEach((id) => {
    const u = col('users').findOne(id)
    if (u) col('users').update(id, { groupIds: ['g_a'] })
  })
  ;['u_zhao', 'u_liu', 'u_sun'].forEach((id) => {
    const u = col('users').findOne(id)
    if (u) col('users').update(id, { groupIds: ['g_b'] })
  })

  // 日常活动
  col('activities').insertMany([
    {
      _id: 'a_week',
      name: '周三晚场日常局',
      location: '市体育馆 3 号馆',
      startTime: iso(2026, 8, 26, 19, 0),
      endTime: iso(2026, 8, 26, 21, 0),
      registerStart: iso(2026, 8, 20, 0, 0),
      registerEnd: iso(2026, 8, 26, 12, 0),
      maxCount: 4,
      allowGroupIds: ['g_a', 'g_b'],
      notice: '请自备球拍；迟到 15 分钟自动取消名额进入候补。',
      status: 'open',
      creatorId: 'u_lin',
      createdAt: now
    },
    {
      _id: 'a_weekend',
      name: '周末混双练习',
      location: '羽你同行球馆',
      startTime: iso(2026, 8, 30, 14, 0),
      endTime: iso(2026, 8, 30, 17, 0),
      registerStart: iso(2026, 8, 22, 0, 0),
      registerEnd: iso(2026, 8, 29, 23, 59),
      maxCount: 8,
      allowGroupIds: ['g_a'],
      notice: '仅 A 队可见并可报名。',
      status: 'open',
      creatorId: 'u_admin',
      createdAt: now
    }
  ])

  col('activity_registrations').insertMany([
    reg('ar1', 'a_week', 'u_li', '李飞', '13800012091', '市场部', 'confirmed', 0),
    reg('ar2', 'a_week', 'u_zhang', '张思雨', '13700005510', '设计部', 'confirmed', 0),
    reg('ar3', 'a_week', 'u_liu', '刘洋', '13600007731', '技术部', 'confirmed', 0),
    reg('ar4', 'a_week', 'u_wang', '王浩然', '13900008842', '产品部', 'confirmed', 0),
    reg('ar5', 'a_week', 'u_sun', '孙悦', '13100009900', '市场部', 'queued', 1),
    reg('ar6', 'a_weekend', 'u_li', '李飞', '13800012091', '市场部', 'confirmed', 0)
  ].map((r) => ({ ...r, createdAt: now, isProxy: false, proxyByUserId: '' })))

  // 单循环比赛
  const match = {
    _id: 'm_rr',
    name: '2026 秋季单循环友谊赛',
    location: '市体育馆羽毛球馆',
    startDate: iso(2026, 9, 12, 9),
    endDate: iso(2026, 9, 13, 18),
    registerStart: iso(2026, 8, 20, 0),
    registerEnd: iso(2026, 9, 5, 23, 59),
    status: 'registering',
    progression: 'round_robin',
    maxTeams: 8,
    maxMalePerTeam: 4,
    maxFemalePerTeam: 4,
    scoring: { points: 21, deuceMargin: 2, capPoints: 30, setsPerMatch: 3 },
    teamRule: { mode: 'firstToWin', itemsWinToWin: 3 },
    notice: '单循环积分赛，胜 2 分负 1 分；请各队按时完成报名。',
    creatorId: 'u_lin',
    published: true,
    createdAt: now
  }
  col('matches').insert(match)

  const items = [
    ['mi_ms', '男单', 1, 1],
    ['mi_ws', '女单', 1, 2],
    ['mi_md', '男双', 2, 3],
    ['mi_wd', '女双', 2, 4],
    ['mi_xd', '混双', 2, 5]
  ].map(([id, name, memberCount, sort]) => ({ _id: id, matchId: 'm_rr', name, memberCount, sort }))
  col('match_items').insertMany(items)

  col('teams').insertMany([
    {
      _id: 't_feiyu',
      matchId: 'm_rr',
      name: '飞羽俱乐部',
      department: '市场部',
      slogan: '飞得更高',
      captainId: 'u_li',
      members: [
        mem('u_li', '李飞', '13800012091', 'male', '市场经理', 'active'),
        mem('u_zhang', '张思雨', '13700005510', 'female', '设计师', 'active'),
        mem('u_liu', '刘洋', '13600007731', 'male', '工程师', 'active'),
        mem('', '王小美', '13911112222', 'female', '实习生', 'pending')
      ],
      createdAt: now
    },
    {
      _id: 't_xunjie',
      matchId: 'm_rr',
      name: '迅捷羽球队',
      department: '技术部',
      slogan: '快如闪电',
      captainId: 'u_zhao',
      members: [
        mem('u_zhao', '赵迅', '13500001122', 'male', '技术经理', 'active'),
        mem('u_sun', '孙悦', '13100009900', 'female', '产品运营', 'active')
      ],
      createdAt: now
    }
  ])

  col('match_spectators').insert({
    _id: 'sp1',
    matchId: 'm_rr',
    userId: 'u_guest',
    status: 'pending',
    reason: '想观摩学习单循环赛制',
    reviewerId: '',
    createdAt: now
  })

  return { seeded: true }
}

function nowIsoSafe() {
  return new Date().toISOString()
}

function reg(id, activityId, userId, name, phone, department, status, queueNo) {
  return { _id: id, activityId, userId, name, phone, department, status, queueNo }
}

function mem(userId, name, phone, gender, job, status) {
  return {
    id: `${userId || 'x'}_${Math.random().toString(36).slice(2, 6)}`,
    userId,
    name,
    phone,
    gender,
    idCard: '',
    job,
    status
  }
}
