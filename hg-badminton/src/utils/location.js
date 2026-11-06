import { toast } from './format'

export function emptyGeo() {
  return { name: '', address: '', latitude: 0, longitude: 0 }
}

export function sanitizeGeo(raw) {
  if (!raw || typeof raw !== 'object') return null
  const latitude = Number(raw.latitude)
  const longitude = Number(raw.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  if (!latitude && !longitude) return null
  return {
    name: String(raw.name || '').trim(),
    address: String(raw.address || '').trim(),
    latitude,
    longitude
  }
}

export function hasGeo(target) {
  return !!sanitizeGeo(target?.geo || target)
}

export function chooseMapLocation() {
  return new Promise((resolve, reject) => {
    const pick = (latitude, longitude) => {
      const opts = {
        success(res) {
          const geo = sanitizeGeo({
            name: res.name,
            address: res.address,
            latitude: res.latitude,
            longitude: res.longitude
          })
          if (!geo) {
            reject(new Error('未获取到有效地点'))
            return
          }
          resolve({
            location: geo.name || geo.address,
            geo
          })
        },
        fail(err) {
          const msg = String(err?.errMsg || '')
          if (msg.includes('cancel')) {
            reject(Object.assign(new Error('cancel'), { cancel: true }))
            return
          }
          reject(new Error('选点失败，请检查位置权限'))
        }
      }
      if (latitude != null && longitude != null) {
        opts.latitude = latitude
        opts.longitude = longitude
      }
      uni.chooseLocation(opts)
    }

    uni.getLocation({
      type: 'gcj02',
      success: (pos) => pick(pos.latitude, pos.longitude),
      fail: () => pick()
    })
  })
}

export function openMapLocation(target) {
  const geo = sanitizeGeo(target?.geo || target)
  if (!geo) {
    toast('暂无精确位置')
    return
  }
  uni.openLocation({
    latitude: geo.latitude,
    longitude: geo.longitude,
    name: geo.name || target?.location || '比赛地点',
    address: geo.address || target?.location || '',
    fail: () => toast('打开地图失败')
  })
}
