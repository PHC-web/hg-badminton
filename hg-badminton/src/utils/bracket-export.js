/**
 * 纸质对阵表（矩阵）构建与导出
 * 单元格格式对齐打印稿：轮次 / 场地号 / 时间
 */

function pad2(n) {
  return `${n}`.padStart(2, '0')
}

export function formatHm(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeCsv(v) {
  const s = String(v ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/**
 * @param {{ teams: Array, fixtures: Array, match?: object }} data
 */
export function buildBracketMatrix(data) {
  const teams = (data.teams || []).map((t) => ({
    _id: t._id,
    name: t.name || '未命名'
  }))
  const fixtures = data.fixtures || []
  const byPair = new Map()
  fixtures.forEach((f) => {
    if (!f.teamAId || !f.teamBId) return
    const k1 = `${f.teamAId}|${f.teamBId}`
    const k2 = `${f.teamBId}|${f.teamAId}`
    const cell = {
      fixtureId: f._id,
      round: f.roundShort || String(f.round || '').replace(/^第/, '').replace(/轮$/, '') || '',
      venue: String(f.venue || '').replace(/场地/g, ''),
      time: formatHm(f.scheduleTime),
      scheduleTime: f.scheduleTime || '',
      code: f.code || '',
      scoreA: f.result?.teamAScore,
      scoreB: f.result?.teamBScore,
      winnerTeamId: f.result?.winnerTeamId || ''
    }
    byPair.set(k1, cell)
    byPair.set(k2, {
      ...cell,
      // 对角单元格同一场，展示相同
    })
  })

  const n = teams.length
  const cells = []
  for (let i = 0; i < n; i++) {
    const row = []
    for (let j = 0; j < n; j++) {
      if (i === j) {
        row.push({ type: 'diag', text: '' })
        continue
      }
      const cell = byPair.get(`${teams[i]._id}|${teams[j]._id}`)
      if (!cell) {
        row.push({ type: 'empty', text: '' })
        continue
      }
      // 只在上三角或固定方向展示，避免重复：以队伍下标 i < j 存 canonical，两边都显示（纸质表两侧都有）
      row.push({
        type: 'match',
        ...cell,
        text: [cell.round, cell.venue, cell.time].filter(Boolean).join('\n')
      })
    }
    cells.push(row)
  }

  return {
    title: data.match?.name ? `对阵表 · ${data.match.name}` : '对阵表',
    location: data.match?.location || '',
    teams,
    cells
  }
}

/** Excel 友好 CSV（单元格内用 | 分隔轮次/场地/时间） */
export function matrixToCsv(matrix) {
  const header = ['', ...matrix.teams.map((t) => t.name), '得分', '名次']
  const rows = [header]
  matrix.cells.forEach((row, i) => {
    const line = [matrix.teams[i].name]
    row.forEach((c) => {
      if (c.type === 'match') {
        line.push([c.round, c.venue, c.time].filter(Boolean).join(' | '))
      } else {
        line.push('')
      }
    })
    line.push('', '')
    rows.push(line)
  })
  return `\ufeff${rows.map((r) => r.map(escapeCsv).join(',')).join('\r\n')}`
}

/** 可打印 HTML（接近 A1 对阵表） */
export function matrixToHtml(matrix) {
  const teamCount = matrix.teams.length
  const colW = Math.max(72, Math.floor(900 / Math.max(teamCount + 1, 1)))
  const rowsHtml = matrix.cells
    .map((row, i) => {
      const tds = row
        .map((c) => {
          if (c.type === 'diag') {
            return `<td class="diag"></td>`
          }
          if (c.type !== 'match') {
            return `<td class="empty"></td>`
          }
          return `<td class="match"><div class="r">${escapeHtml(c.round)}</div><div class="v">${escapeHtml(c.venue)}</div><div class="t">${escapeHtml(c.time)}</div></td>`
        })
        .join('')
      return `<tr><th class="rowh">${escapeHtml(matrix.teams[i].name)}</th>${tds}<td class="extra"></td><td class="extra"></td></tr>`
    })
    .join('')

  const head = matrix.teams.map((t) => `<th style="min-width:${colW}px">${escapeHtml(t.name)}</th>`).join('')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(matrix.title)}</title>
<style>
  @page { size: A1 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: "PingFang SC","Microsoft YaHei",sans-serif; color:#111; margin: 16px; }
  h1 { font-size: 22px; margin: 0 0 6px; text-align: center; }
  .sub { text-align:center; color:#666; font-size: 13px; margin-bottom: 14px; }
  table { border-collapse: collapse; width: 100%; table-layout: fixed; font-size: 12px; }
  th, td { border: 1px solid #333; padding: 6px 4px; text-align: center; vertical-align: middle; }
  th { background: #f3f3f3; font-weight: 600; word-break: break-all; }
  .rowh { text-align: left; background: #f7f7f7; width: 110px; }
  .diag { background: #e8e8e8; }
  .match .r { font-weight: 700; font-size: 14px; }
  .match .v { margin-top: 2px; }
  .match .t { margin-top: 2px; color: #222; }
  .extra { background: #fafafa; width: 56px; }
  .tip { margin-top: 12px; font-size: 12px; color: #666; }
  @media print {
    body { margin: 0; }
    .tip { display: none; }
  }
</style>
</head>
<body>
  <h1>${escapeHtml(matrix.title)}</h1>
  <div class="sub">${escapeHtml(matrix.location || '')}</div>
  <table>
    <thead>
      <tr><th></th>${head}<th>得分</th><th>名次</th></tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <p class="tip">单元格：轮次 / 场地号 / 预计时间。可用浏览器打印为 PDF（建议横向 A1/A3）。</p>
</body>
</html>`
}

export function downloadTextFile(filename, content, encoding = 'utf8') {
  return new Promise((resolve, reject) => {
    let base = ''
    // #ifdef MP-WEIXIN
    try {
      // eslint-disable-next-line no-undef
      base = `${wx.env.USER_DATA_PATH}`
    } catch (e) {
      base = ''
    }
    // #endif
    if (!base) {
      uni.setClipboardData({
        data: String(content).replace(/^\ufeff/, ''),
        success: () => {
          uni.showToast({ title: '已复制，可粘贴保存', icon: 'none' })
          resolve({ mode: 'clipboard' })
        },
        fail: reject
      })
      return
    }
    const path = `${base}/${filename}`
    try {
      uni.getFileSystemManager().writeFileSync(path, content, encoding)
      uni.openDocument({
        filePath: path,
        showMenu: true,
        fileType: filename.endsWith('.html') ? 'html' : undefined,
        success: () => resolve({ mode: 'document', path }),
        fail: () => {
          uni.setClipboardData({
            data: String(content).replace(/^\ufeff/, ''),
            success: () => resolve({ mode: 'clipboard' }),
            fail: reject
          })
        }
      })
    } catch (e) {
      reject(e)
    }
  })
}
