<template>
  <view class="page">
    <hg-nav title="对阵表" :back="false">
      <template #right><text @click="share">分享</text></template>
    </hg-nav>
    <view class="pad">
      <hg-match-picker @change="load" />
      <view v-if="data.match" class="card seg-wrap">
        <view class="seg">
          <view class="seg-item" :class="{ active: view === 'group' }" @click="view = 'group'">小组循环</view>
          <view class="seg-item" :class="{ active: view === 'knockout' }" @click="view = 'knockout'">淘汰赛</view>
          <view class="seg-item" :class="{ active: view === 'round' }" @click="view = 'round'">轮次表</view>
        </view>
      </view>

      <view v-if="view === 'group'">
        <view v-for="g in data.groups" :key="g._id" class="card gcard">
          <view class="gt">{{ g.groupName }} 组 <text class="gs">· {{ g.fixtures.length }} 场</text></view>
          <view class="thead">
            <text class="c name">队伍</text>
            <text class="c">胜</text>
            <text class="c">负</text>
            <text class="c">积分</text>
          </view>
          <view v-for="r in g.rank" :key="r.teamId" class="trow">
            <text class="c name">{{ r.name }}</text>
            <text class="c">{{ r.win }}</text>
            <text class="c">{{ r.lose }}</text>
            <text class="c pts">{{ r.points }}</text>
          </view>
        </view>
        <hg-fixture-card
          v-for="f in groupFixtures"
          :key="f._id"
          :item="f"
          @click="open(f)"
        />
        <hg-empty v-if="!groupFixtures.length" text="暂无小组赛对阵，管理员可生成对阵表" />
      </view>

      <view v-if="view === 'knockout'">
        <view class="card ko">
          <view class="gt">🏆 淘汰赛</view>
          <view class="bracket">
            <view v-for="col in koCols" :key="col.name" class="col">
              <view class="cn">{{ col.name }}</view>
              <view v-for="f in col.list" :key="f._id" class="b-node" :class="{ win: f.status === 'finished' }" @click="open(f)">
                <view class="tn">{{ f.teamAName }} vs {{ f.teamBName }}</view>
                <view class="sc">{{ f.result?.teamAScore ?? '—' }}:{{ f.result?.teamBScore ?? '—' }}</view>
              </view>
            </view>
          </view>
        </view>
        <hg-empty v-if="!koFixtures.length" text="暂无淘汰赛对阵" />
      </view>

      <view v-if="view === 'round'">
        <view v-for="r in rounds" :key="r.name" class="card gcard">
          <view class="gt">{{ r.name }}</view>
          <hg-fixture-card v-for="f in r.list" :key="f._id" :item="f" @click="open(f)" />
        </view>
        <hg-empty v-if="!rounds.length" text="暂无轮次数据" />
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { api } from '@/api'
import { useMatchStore } from '@/stores/match'
import { useUserStore } from '@/stores/user'
import { toast } from '@/utils/format'

const store = useMatchStore()
const user = useUserStore()
const view = ref('group')
const data = ref({ match: null, groups: [], fixtures: [] })

const groupFixtures = computed(() => (data.value.fixtures || []).filter((f) => f.stage === 'group'))
const koFixtures = computed(() => (data.value.fixtures || []).filter((f) => f.stage === 'knockout'))
const koCols = computed(() => {
  const map = {}
  koFixtures.value.forEach((f) => {
    if (!map[f.round]) map[f.round] = []
    map[f.round].push(f)
  })
  return Object.keys(map).map((name) => ({ name, list: map[name] }))
})
const rounds = computed(() => {
  const map = {}
  ;(data.value.fixtures || []).forEach((f) => {
    if (!map[f.round]) map[f.round] = []
    map[f.round].push(f)
  })
  return Object.keys(map).map((name) => ({ name, list: map[name] }))
})

async function load() {
  if (!user.loggedIn) {
    uni.navigateTo({ url: '/pages/login/index' })
    return
  }
  await store.refreshList()
  if (!store.selectedId) {
    data.value = { match: null, groups: [], fixtures: [] }
    return
  }
  data.value = await api.listFixtures(store.selectedId)
  const p = data.value.match?.progression
  if (p === 'single_knockout') view.value = 'knockout'
  else if (p === 'round_robin') view.value = 'round'
  else view.value = 'group'
}

function open(f) {
  if (!f.teamAId || !f.teamBId) {
    toast('对阵双方尚未产生')
    return
  }
  uni.navigateTo({ url: `/pages/fixture/detail?id=${f._id}` })
}

function share() {
  toast('对阵链接已复制（演示）')
}

onShow(load)
</script>

<style lang="scss" scoped>
.seg-wrap {
  padding: 28rpx;
  margin-bottom: 20rpx;
}
.seg {
  display: flex;
  background: #EDEEF1;
  border-radius: 20rpx;
  padding: 6rpx;
  gap: 6rpx;
}
.seg-item {
  flex: 1;
  text-align: center;
  padding: 14rpx 0;
  font-size: 24rpx;
  border-radius: 16rpx;
  color: $hg-text2;
}
.seg-item.active {
  background: #fff;
  color: $hg-primary;
  font-weight: 600;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.08);
}
.gcard {
  overflow: hidden;
  margin-bottom: 20rpx;
  padding-bottom: 12rpx;
}
.gt {
  padding: 24rpx 28rpx 8rpx;
  font-weight: 600;
  font-size: 28rpx;
}
.gs {
  font-size: 22rpx;
  color: $hg-text3;
  font-weight: 400;
}
.thead, .trow {
  display: flex;
  padding: 16rpx 28rpx;
  font-size: 24rpx;
}
.thead {
  color: $hg-text3;
  border-bottom: 1rpx solid $hg-line;
}
.trow {
  border-bottom: 1rpx solid #F7F8FA;
}
.c {
  width: 80rpx;
  text-align: center;
}
.c.name {
  flex: 1;
  text-align: left;
  width: auto;
}
.pts {
  color: $hg-primary;
  font-weight: 700;
}
.ko {
  padding: 24rpx;
  margin-bottom: 16rpx;
}
.bracket {
  display: flex;
  gap: 20rpx;
  overflow-x: auto;
  padding-bottom: 12rpx;
}
.col {
  min-width: 200rpx;
}
.cn {
  font-size: 22rpx;
  color: $hg-text3;
  margin-bottom: 12rpx;
}
.b-node {
  background: #fff;
  border-radius: 16rpx;
  box-shadow: 0 4rpx 20rpx rgba(16, 24, 40, 0.05);
  padding: 16rpx;
  font-size: 22rpx;
  text-align: center;
  margin-bottom: 16rpx;
}
.b-node.win {
  border: 3rpx solid $hg-primary;
}
.tn {
  font-weight: 600;
  font-size: 24rpx;
  margin-bottom: 4rpx;
}
</style>
