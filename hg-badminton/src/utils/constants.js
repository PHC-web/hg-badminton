export const APP_NAME = '追光羽毛球'

export const ROLES = {
  super_admin: { key: 'super_admin', label: '超级管理员', icon: '🛡️' },
  admin: { key: 'admin', label: '管理员', icon: '📋' },
  captain: { key: 'captain', label: '队长', icon: '🚩' },
  referee: { key: 'referee', label: '裁判', icon: '⚡' },
  member: { key: 'member', label: '队员', icon: '🏸' }
}

export const ROLE_LIST = Object.values(ROLES)

export const MATCH_STATUS = {
  draft: { key: 'draft', label: '草稿', chip: 'gray' },
  registering: { key: 'registering', label: '报名中', chip: 'orange' },
  registered: { key: 'registered', label: '报名截止', chip: 'gray' },
  locked: { key: 'locked', label: '已锁定', chip: 'gray' },
  in_progress: { key: 'in_progress', label: '进行中', chip: 'green' },
  finished: { key: 'finished', label: '已结束', chip: 'gray' },
  closed: { key: 'closed', label: '已归档', chip: 'gray' }
}

export const TEAM_STATUS = {
  draft: { key: 'draft', label: '草稿', chip: 'gray' },
  submitted: { key: 'submitted', label: '待审核', chip: 'orange' },
  approved: { key: 'approved', label: '已审核', chip: 'green' },
  rejected: { key: 'rejected', label: '已驳回', chip: 'red' }
}

export const FIXTURE_STATUS = {
  pending: { key: 'pending', label: '未开始', chip: 'gray' },
  live: { key: 'live', label: '进行中', chip: 'orange' },
  finished: { key: 'finished', label: '已完赛', chip: 'green' },
  confirmed: { key: 'confirmed', label: '已确认', chip: 'green' }
}

export const APPLY_STATUS = {
  pending: { key: 'pending', label: '审核中', chip: 'orange' },
  approved: { key: 'approved', label: '已通过', chip: 'green' },
  rejected: { key: 'rejected', label: '已驳回', chip: 'red' }
}

export const PROGRESSION = {
  group_knockout: { key: 'group_knockout', label: '小组赛 + 淘汰赛', desc: '先分组循环，各组前 2 名出线进入淘汰赛' },
  single_knockout: { key: 'single_knockout', label: '单淘汰赛', desc: '两两对阵直接晋级，适合快速决出冠军' },
  round_robin: { key: 'round_robin', label: '单循环积分赛', desc: '全部队伍两两交手，按积分排名' }
}

export const DEFAULT_ITEMS = [
  { name: '男单', memberCount: 1, gender: 'male' },
  { name: '女单', memberCount: 1, gender: 'female' },
  { name: '男双', memberCount: 2, gender: 'male' },
  { name: '女双', memberCount: 2, gender: 'female' },
  { name: '混双', memberCount: 2, gender: 'mixed' }
]

export const DB_KEY = 'hg_badminton_db_v1'
export const USER_KEY = 'hg_badminton_user'
export const ACCESS_KEY = 'hg_badminton_access'
export const SELECTED_MATCH_KEY = 'hg_selected_match'
export const USE_CLOUD_KEY = 'hg_use_unicloud'

export const ADMIN_ROLES = ['super_admin', 'admin']
export const SCORE_ROLES = ['super_admin', 'admin', 'referee']
export const CAPTAIN_ROLES = ['super_admin', 'admin', 'captain']
