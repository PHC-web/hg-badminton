/**
 * CLI 编译前注入 UNI_CLOUD_PROVIDER。
 * 必须在 @dcloudio/vite-plugin-uni 之前 import，否则 uni-cloud 插件读到空空间。
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function parseDotEnv(text) {
  const out = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i <= 0) continue
    const key = line.slice(0, i).trim()
    let val = line.slice(i + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

const collected = {}
for (const name of ['.env', '.env.local']) {
  const file = resolve(process.cwd(), name)
  if (!existsSync(file)) continue
  Object.assign(collected, parseDotEnv(readFileSync(file, 'utf8')))
}
for (const [key, val] of Object.entries(collected)) {
  if (process.env[key] === undefined) process.env[key] = val
}

const spaceId = process.env.VITE_UNICLOUD_SPACE_ID || ''
const clientSecret = process.env.VITE_UNICLOUD_CLIENT_SECRET || ''
const endpoint = process.env.VITE_UNICLOUD_ENDPOINT || 'https://api.next.bspapp.com'
const spaceName = process.env.VITE_UNICLOUD_SPACE_NAME || 'hg-badminton'

if (spaceId && clientSecret) {
  if (!process.env.UNI_CLOUD_SPACES) {
    process.env.UNI_CLOUD_SPACES = JSON.stringify([
      {
        provider: 'aliyun',
        name: spaceName,
        id: spaceId,
        clientSecret,
        apiEndpoint: endpoint,
        failoverEndpoint: ''
      }
    ])
  }
  console.log(`[unicloud] CLI 已注入服务空间 ${spaceName} (${spaceId})`)
} else if (!spaceId || !clientSecret) {
  console.warn(
    '[unicloud] 未找到 VITE_UNICLOUD_SPACE_ID / VITE_UNICLOUD_CLIENT_SECRET。网页后台请复制 .env.example 为 .env.local 后填写。'
  )
}
