<template>
  <view class="page">
    <hg-nav title="组别管理" />
    <view class="pad">
      <view class="rule-box">
        可指定一个默认组别；超级管理员审核新成员时会自动勾选该组别。
      </view>
      <view class="card add">
        <input class="input" v-model="name" placeholder="新组别名称，如：A队" />
        <view class="def-row" @click="asDefault = !asDefault">
          <view class="check" :class="{ on: asDefault }" />
          <text>设为默认</text>
        </view>
        <button class="btn-primary mini" @click="add">添加</button>
      </view>
      <view v-for="g in list" :key="g._id" class="card item">
        <view class="left">
          <view class="n">
            {{ g.name }}
            <text v-if="g.isDefault" class="badge">默认</text>
          </view>
        </view>
        <view class="ops">
          <text v-if="!g.isDefault" class="link" @click="makeDefault(g)">设为默认</text>
          <text class="link" @click="rename(g)">重命名</text>
          <text class="link danger" @click="remove(g)">删除</text>
        </view>
      </view>
      <hg-empty v-if="!list.length" text="暂无组别" />
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { api } from '@/api'
import { toast, confirm } from '@/utils/format'

const list = ref([])
const name = ref('')
const asDefault = ref(false)

async function load() {
  list.value = await api.listGroups()
}

async function add() {
  if (!name.value.trim()) {
    toast('请填写组别名称')
    return
  }
  await api.createGroup({ name: name.value.trim(), isDefault: asDefault.value })
  name.value = ''
  asDefault.value = false
  toast('已添加', 'success')
  load()
}

async function makeDefault(g) {
  await api.setDefaultGroup({ id: g._id })
  toast('已设为默认组别', 'success')
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
  if (!(await confirm(`确定删除组别「${g.name}」？须已清空该组别全部人员；活动记录会保留，仅原绑定组别可见。`))) return
  try {
    await api.deleteGroup({ id: g._id })
    toast('已删除', 'success')
    load()
  } catch (e) {
    toast(e?.message || '删除失败')
  }
}

onShow(load)
</script>

<style lang="scss" scoped>
.add {
  padding: 20rpx 24rpx;
  margin-bottom: 20rpx;
}
.add .input {
  width: 100%;
  margin: 0 0 16rpx;
  height: 72rpx;
}
.def-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  font-size: 26rpx;
  color: $hg-text2;
  margin-bottom: 16rpx;
}
.check {
  width: 32rpx;
  height: 32rpx;
  border-radius: 8rpx;
  border: 2rpx solid $hg-line;
}
.check.on {
  background: $hg-primary;
  border-color: $hg-primary;
}
.mini {
  width: 100%;
  height: 72rpx;
  font-size: 26rpx;
}
.item {
  padding: 28rpx;
  margin-bottom: 16rpx;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.n {
  font-size: 30rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.badge {
  font-size: 20rpx;
  font-weight: 600;
  color: $hg-primary;
  background: $hg-primary-light;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
}
.ops {
  display: flex;
  gap: 24rpx;
}
.link {
  font-size: 26rpx;
  color: $hg-primary;
}
.link.danger {
  color: $hg-lose;
}
</style>
