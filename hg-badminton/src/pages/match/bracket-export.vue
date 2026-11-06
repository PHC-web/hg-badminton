<template>
  <view class="page">
    <hg-nav title="导出对阵表" />
    <view class="pad" v-if="matrix">
      <view class="rule-box">
        下表对齐纸质「对阵表」：单元格为「轮次 / 场地 / 预计时间」。可导出 Excel（CSV）或打印用 HTML。
      </view>
      <view class="row actions">
        <button class="btn-ghost" @click="exportCsv">导出 Excel</button>
        <button class="btn-primary" @click="exportHtml">导出打印稿</button>
      </view>

      <scroll-view scroll-x class="table-wrap">
        <view class="table">
          <view class="tr head">
            <view class="th corner"></view>
            <view v-for="t in matrix.teams" :key="'h-' + t._id" class="th">{{ t.name }}</view>
            <view class="th">得分</view>
            <view class="th">名次</view>
          </view>
          <view v-for="(row, i) in matrix.cells" :key="'r-' + matrix.teams[i]._id" class="tr">
            <view class="th rowh">{{ matrix.teams[i].name }}</view>
            <view
              v-for="(c, j) in row"
              :key="'c-' + i + '-' + j"
              class="td"
              :class="c.type"
            >
              <template v-if="c.type === 'match'">
                <view class="r">{{ c.round }}</view>
                <view class="v">{{ c.venue }}</view>
                <view class="t">{{ c.time }}</view>
              </template>
            </view>
            <view class="td extra"></view>
            <view class="td extra"></view>
          </view>
        </view>
      </scroll-view>
    </view>
    <view v-else class="pad">
      <hg-empty :text="err || '加载中…'" />
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { api } from '@/api'
import { toast } from '@/utils/format'
import {
  buildBracketMatrix,
  matrixToCsv,
  matrixToHtml,
  downloadTextFile
} from '@/utils/bracket-export'

const matchId = ref('')
const matrix = ref(null)
const err = ref('')

async function load() {
  try {
    const data = await api.getBracketTable(matchId.value)
    if (!(data.fixtures || []).length) {
      err.value = '请先生成对阵'
      matrix.value = null
      return
    }
    matrix.value = buildBracketMatrix(data)
  } catch (e) {
    err.value = e?.message || '加载失败'
    matrix.value = null
  }
}

async function exportCsv() {
  if (!matrix.value) return
  try {
    await downloadTextFile('对阵表.csv', matrixToCsv(matrix.value))
    toast('已打开文件，可转发或用 Excel 打开', 'success')
  } catch (e) {
    toast(e?.message || '导出失败')
  }
}

async function exportHtml() {
  if (!matrix.value) return
  try {
    await downloadTextFile('对阵表-打印稿.html', matrixToHtml(matrix.value))
    toast('已打开打印稿，可用浏览器打印为 PDF', 'success')
  } catch (e) {
    toast(e?.message || '导出失败')
  }
}

onLoad((q) => {
  matchId.value = q.id || ''
  if (matchId.value) load()
  else err.value = '缺少比赛 id'
})
</script>

<style lang="scss" scoped>
.actions {
  gap: 16rpx;
  margin: 20rpx 0 24rpx;
}
.actions button { flex: 1; }
.table-wrap {
  width: 100%;
  white-space: nowrap;
  border-radius: 16rpx;
  background: #fff;
  box-shadow: 0 4rpx 20rpx rgba(16, 24, 40, 0.05);
}
.table {
  display: inline-block;
  min-width: 100%;
}
.tr {
  display: flex;
  border-bottom: 1rpx solid $hg-line;
}
.tr.head { background: #F5F6F8; }
.th, .td {
  width: 140rpx;
  min-height: 110rpx;
  padding: 10rpx 8rpx;
  border-right: 1rpx solid $hg-line;
  box-sizing: border-box;
  flex-shrink: 0;
  white-space: normal;
  word-break: break-all;
  font-size: 20rpx;
  color: $hg-text2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}
.corner { width: 160rpx; }
.rowh {
  width: 160rpx;
  font-weight: 600;
  color: $hg-text;
  background: #FAFBFC;
  align-items: flex-start;
  text-align: left;
}
.td.diag { background: #EEE; }
.td.match .r { font-weight: 700; font-size: 26rpx; color: $hg-text; }
.td.match .v { margin-top: 4rpx; }
.td.match .t { margin-top: 4rpx; color: $hg-primary; font-weight: 600; }
.td.extra { width: 80rpx; background: #FAFAFA; }
</style>
