<template>
  <view class="bar">
    <input class="inp" v-model="name" placeholder="新组别名称，如 A队" />
    <text class="chk" @click="asDefault = !asDefault">{{ asDefault ? '☑' : '☐' }} 设为默认</text>
    <button class="btn" @click="add">添加</button>
  </view>
  <view class="table">
    <view class="tr head"><text>名称</text><text>操作</text></view>
    <view class="tr" v-for="g in list" :key="g._id">
      <text>{{ g.name }} <text v-if="g.isDefault" class="badge">默认</text></text>
      <view class="ops">
        <text v-if="!g.isDefault" class="link" @click="makeDefault(g)">设为默认</text>
        <text class="link" @click="rename(g)">重命名</text>
        <text class="link danger" @click="remove(g)">删除</text>
      </view>
    </view>
    <view v-if="!list.length" class="empty">暂无组别</view>
  </view>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { api } from '@/api'
import { confirm, toast } from '@/utils/format'

const list = ref([])
const name = ref('')
const asDefault = ref(false)

async function load() {
  list.value = (await api.listGroups()) || []
}

async function add() {
  if (!name.value.trim()) return toast('请填写组别名称')
  await api.createGroup({ name: name.value.trim(), isDefault: asDefault.value })
  name.value = ''
  asDefault.value = false
  toast('已添加', 'success')
  load()
}

async function makeDefault(g) {
  await api.setDefaultGroup({ id: g._id })
  toast('已设为默认', 'success')
  load()
}

function rename(g) {
  uni.showModal({
    title: '重命名组别',
    editable: true,
    placeholderText: g.name,
    success: async (res) => {
      if (!res.confirm) return
      const n = (res.content || '').trim()
      if (!n) return
      await api.updateGroup({ id: g._id, name: n })
      toast('已更新', 'success')
      load()
    }
  })
}

async function remove(g) {
  if (!(await confirm(`删除组别「${g.name}」？`))) return
  await api.deleteGroup({ id: g._id })
  toast('已删除')
  load()
}

onMounted(load)
</script>

<style lang="scss" scoped>
.bar { display: flex; gap: 12px; align-items: center; margin-bottom: 16px; }
.inp { flex: 1; height: 42px; border: 1px solid #c5d0db; border-radius: 8px; padding: 0 12px; font-size: 16px; color: #1a2332; }
.chk { font-size: 15px; color: #3d4a57; }
.btn { height: 42px; padding: 0 16px; background: #006db8; color: #fff; border: none; border-radius: 8px; font-size: 15px; }
.table { background: #fff; border-radius: 12px; overflow: hidden; font-size: 16px; color: #1a2332; }
.tr { display: flex; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #f7f8fa; }
.tr.head { font-weight: 700; color: #4a5563; font-size: 15px; }
.ops { display: flex; gap: 12px; }
.link { color: #006db8; font-size: 15px; }
.danger { color: #e5484d; }
.badge { color: #006db8; font-size: 14px; }
.empty { padding: 20px; color: #4a5563; font-size: 16px; }
</style>
