<template>
  <view class="h">待审核</view>
  <view class="card" v-for="u in pending" :key="u._id">
    <view class="who">{{ u.realName || u.nickname }} · {{ u.phone }} · {{ u.department || '未填部门' }}</view>
    <view class="chips">
      <text v-for="g in groups" :key="g._id" class="chip" :class="{ on: (selected[u._id] || []).includes(g._id) }" @click="toggle(u._id, g._id)">{{ g.name }}</text>
    </view>
    <view class="ops">
      <text class="link danger" @click="reject(u)">拒绝</text>
      <text class="link" @click="pass(u)">通过</text>
    </view>
  </view>
  <view v-if="!pending.length" class="empty">暂无待审用户</view>

  <view class="h" style="margin-top: 28px;">全部用户</view>
  <view class="table">
    <view class="tr" v-for="u in list" :key="u._id">
      <view>
        <view class="n">{{ u.realName || u.nickname }}</view>
        <view class="s">{{ (u.roles || []).map(roleLabel).join(' / ') }} · {{ (u.groupNames || []).join('、') || '未分组' }}</view>
      </view>
      <view class="ops">
        <text class="link" @click="editRoles(u)">角色</text>
        <text class="link" @click="editGroups(u)">组别</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { api } from '@/api'
import { useUserStore } from '@/stores/user'
import { ROLES } from '@/utils/constants'
import { confirm, roleLabel, toast } from '@/utils/format'

const user = useUserStore()
const pending = ref([])
const list = ref([])
const groups = ref([])
const selected = reactive({})
const defaultGroupId = ref('')

async function load() {
  const [p, us, gs, def] = await Promise.all([
    api.listPendingUsers(),
    api.listUsers(),
    api.listGroups(),
    api.getDefaultGroup()
  ])
  pending.value = p || []
  list.value = us || []
  groups.value = gs || []
  defaultGroupId.value = def?._id || gs?.find((g) => g.isDefault)?._id || ''
  pending.value.forEach((u) => {
    if (!selected[u._id]) selected[u._id] = defaultGroupId.value ? [defaultGroupId.value] : []
  })
}

function toggle(uid, gid) {
  const cur = selected[uid] || []
  selected[uid] = cur.includes(gid) ? cur.filter((x) => x !== gid) : [...cur, gid]
}

async function pass(u) {
  const groupIds = selected[u._id] || []
  if (!groupIds.length) return toast('请选择组别')
  await api.approveUser({ userId: u._id, approved: true, groupIds })
  toast('已通过', 'success')
  load()
}

async function reject(u) {
  if (!(await confirm(`拒绝「${u.realName || u.nickname}」？`))) return
  await api.approveUser({ userId: u._id, approved: false, reason: '未通过审核' })
  toast('已拒绝')
  load()
}

function editRoles(u) {
  const allow = user.assignable
  uni.showActionSheet({
    itemList: allow.map((k) => `${(u.roles || []).includes(k) ? '取消' : '授予'} ${ROLES[k].label}`),
    success: async (res) => {
      const role = allow[res.tapIndex]
      let roles = [...(u.roles || [])]
      if (roles.includes(role)) roles = roles.filter((x) => x !== role)
      else roles.push(role)
      if (!roles.includes('member')) roles.push('member')
      await api.setUserRoles({ userId: u._id, roles })
      toast('已更新')
      load()
    }
  })
}

function editGroups(u) {
  if (!groups.value.length) return toast('请先创建组别')
  uni.showActionSheet({
    itemList: groups.value.map((g) => `${(u.groupIds || []).includes(g._id) ? '移出' : '加入'} ${g.name}`),
    success: async (res) => {
      const g = groups.value[res.tapIndex]
      let groupIds = [...(u.groupIds || [])]
      if (groupIds.includes(g._id)) groupIds = groupIds.filter((x) => x !== g._id)
      else groupIds.push(g._id)
      await api.setUserGroups({ userId: u._id, groupIds })
      toast('已更新')
      load()
    }
  })
}

onMounted(load)
</script>

<style lang="scss" scoped>
.h { font-size: 22px; font-weight: 800; margin-bottom: 12px; color: #1a2332; }
.card { background: #fff; border-radius: 12px; padding: 14px 16px; margin-bottom: 10px; }
.who { font-weight: 600; margin-bottom: 8px; font-size: 16px; color: #1a2332; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { padding: 5px 10px; border: 1px solid #c5d0db; border-radius: 999px; font-size: 14px; color: #1a2332; }
.chip.on { border-color: #006db8; color: #006db8; background: #e8f3fb; }
.ops { display: flex; gap: 12px; margin-top: 10px; }
.link { color: #006db8; font-size: 15px; }
.danger { color: #e5484d; }
.empty { color: #4a5563; font-size: 16px; margin-bottom: 16px; }
.table { background: #fff; border-radius: 12px; }
.tr { display: flex; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #f7f8fa; font-size: 16px; color: #1a2332; }
.n { font-weight: 700; }
.s { font-size: 14px; color: #4a5563; margin-top: 4px; }
</style>
