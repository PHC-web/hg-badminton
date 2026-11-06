/**
 * 比赛报名 Excel（CSV）模板与解析
 * CSV 可用 Excel / WPS 直接打开与编辑；小程序侧用 chooseMessageFile 导入。
 */

export const MEMBER_HEADERS = ['姓名', '手机号', '性别', '身份证号', '岗位']
export const TEAM_HEADERS = [
  '队名',
  '部门',
  '队伍宣言',
  '队长姓名',
  '队长手机',
  '队员姓名',
  '手机号',
  '性别',
  '身份证号',
  '岗位'
]

function escapeCsvCell(v) {
  const s = String(v ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function toCsv(rows) {
  return rows.map((r) => r.map(escapeCsvCell).join(',')).join('\r\n')
}

/** Excel 友好：UTF-8 BOM */
export function withBom(csv) {
  return `\ufeff${csv}`
}

export function memberTemplateCsv() {
  return withBom(
    toCsv([
      MEMBER_HEADERS,
      ['张三', '13800138000', '男', '110101199001011234', '一传'],
      ['李四', '13900139000', '女', '110101199002021234', '二传']
    ])
  )
}

export function teamTemplateCsv() {
  return withBom(
    toCsv([
      TEAM_HEADERS,
      ['追光一队', '技术部', '全力以赴', '王队长', '13700137000', '张三', '13800138000', '男', '110101199001011234', '一传'],
      ['追光一队', '技术部', '全力以赴', '王队长', '13700137000', '李四', '13900139000', '女', '110101199002021234', '二传'],
      ['追光二队', '市场部', '', '赵队长', '13600136000', '赵队长', '13600136000', '男', '', '队长']
    ])
  )
}

function splitCsvLine(line) {
  const out = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else inQ = false
      } else cur += c
    } else if (c === '"') inQ = true
    else if (c === ',') {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

export function parseCsv(text) {
  const raw = String(text || '')
    .replace(/^\ufeff/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
  const lines = raw.split('\n').filter((l) => l.trim())
  if (!lines.length) return { headers: [], rows: [] }
  const headers = splitCsvLine(lines[0]).map((h) => h.replace(/\s/g, ''))
  const rows = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line)
    const obj = {}
    headers.forEach((h, i) => {
      obj[h] = cells[i] ?? ''
    })
    return obj
  })
  return { headers, rows }
}

export function normalizeGender(v) {
  const s = String(v || '').trim()
  if (/^(女|female|f|2)$/i.test(s)) return 'female'
  return 'male'
}

export function parseMemberRows(rows) {
  const list = []
  for (const r of rows) {
    const name = r['姓名'] || r['队员姓名'] || ''
    const phone = r['手机号'] || ''
    if (!name && !phone) continue
    if (!name || !phone) throw new Error(`队员「${name || phone}」缺少姓名或手机号`)
    list.push({
      name: String(name).trim(),
      phone: String(phone).trim(),
      gender: normalizeGender(r['性别']),
      idCard: String(r['身份证号'] || '').trim(),
      job: String(r['岗位'] || '').trim()
    })
  }
  return list
}

/** 按队名分组；同一队名多行合并队员 */
export function parseTeamRows(rows) {
  const map = new Map()
  for (const r of rows) {
    const teamName = String(r['队名'] || '').trim()
    if (!teamName) continue
    if (!map.has(teamName)) {
      map.set(teamName, {
        name: teamName,
        department: String(r['部门'] || '').trim(),
        slogan: String(r['队伍宣言'] || '').trim(),
        captainName: String(r['队长姓名'] || '').trim(),
        captainPhone: String(r['队长手机'] || '').trim(),
        members: []
      })
    }
    const team = map.get(teamName)
    if (!team.department && r['部门']) team.department = String(r['部门']).trim()
    if (!team.slogan && r['队伍宣言']) team.slogan = String(r['队伍宣言']).trim()
    if (!team.captainName && r['队长姓名']) team.captainName = String(r['队长姓名']).trim()
    if (!team.captainPhone && r['队长手机']) team.captainPhone = String(r['队长手机']).trim()

    const mbName = String(r['队员姓名'] || '').trim()
    const mbPhone = String(r['手机号'] || '').trim()
    if (mbName && mbPhone) {
      const exists = team.members.some((m) => m.phone === mbPhone)
      if (!exists) {
        team.members.push({
          name: mbName,
          phone: mbPhone,
          gender: normalizeGender(r['性别']),
          idCard: String(r['身份证号'] || '').trim(),
          job: String(r['岗位'] || '').trim()
        })
      }
    }
  }
  return Array.from(map.values())
}

function userDataPath() {
  // #ifdef MP-WEIXIN
  try {
    // eslint-disable-next-line no-undef
    return `${wx.env.USER_DATA_PATH}`
  } catch (e) {
    /* fallthrough */
  }
  // #endif
  return ''
}

/** 写出 CSV 并打开，便于用 Excel / 微信转发保存 */
export function downloadCsvTemplate(filename, csvContent) {
  return new Promise((resolve, reject) => {
    const base = userDataPath()
    if (!base) {
      // H5 等：复制到剪贴板
      uni.setClipboardData({
        data: csvContent.replace(/^\ufeff/, ''),
        success: () => {
          uni.showToast({ title: '模板已复制，可粘贴到 Excel', icon: 'none' })
          resolve({ mode: 'clipboard' })
        },
        fail: reject
      })
      return
    }
    const path = `${base}/${filename}`
    try {
      const fs = uni.getFileSystemManager()
      fs.writeFileSync(path, csvContent, 'utf8')
      uni.openDocument({
        filePath: path,
        showMenu: true,
        success: () => resolve({ mode: 'document', path }),
        fail: (e) => {
          uni.setClipboardData({
            data: csvContent.replace(/^\ufeff/, ''),
            success: () => {
              uni.showToast({ title: '已复制模板内容', icon: 'none' })
              resolve({ mode: 'clipboard' })
            },
            fail: () => reject(e)
          })
        }
      })
    } catch (e) {
      reject(e)
    }
  })
}

/** 选择 CSV 文件并解析 */
export function pickAndParseCsv() {
  return new Promise((resolve, reject) => {
    // #ifdef MP-WEIXIN
    uni.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['csv', 'txt'],
      success: (res) => {
        const f = res.tempFiles?.[0]
        if (!f?.path) {
          reject(new Error('未选择文件'))
          return
        }
        const name = (f.name || '').toLowerCase()
        if (/\.xlsx?$/.test(name)) {
          reject(new Error('请将 Excel 另存为 CSV（逗号分隔）后再导入'))
          return
        }
        uni.getFileSystemManager().readFile({
          filePath: f.path,
          encoding: 'utf-8',
          success: (r) => {
            try {
              resolve(parseCsv(r.data))
            } catch (e) {
              reject(e)
            }
          },
          fail: (e) => reject(new Error(e.errMsg || '读取文件失败'))
        })
      },
      fail: (e) => {
        if (e.errMsg && /cancel/i.test(e.errMsg)) reject(new Error('已取消'))
        else reject(new Error(e.errMsg || '选择文件失败'))
      }
    })
    return
    // #endif

    // H5 回退
    // #ifdef H5
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.csv,text/csv,text/plain'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) {
        reject(new Error('未选择文件'))
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        try {
          resolve(parseCsv(String(reader.result || '')))
        } catch (e) {
          reject(e)
        }
      }
      reader.onerror = () => reject(new Error('读取文件失败'))
      reader.readAsText(file, 'utf-8')
    }
    input.click()
    return
    // #endif

    reject(new Error('当前端不支持文件导入，请在微信小程序中使用'))
  })
}
