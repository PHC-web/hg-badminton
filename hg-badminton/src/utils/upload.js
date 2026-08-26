/**
 * 上传用户头像，优先 uniCloud 云存储；失败则回退本地临时路径（仅本机会话可用）
 */
export async function uploadUserAvatar(filePath, userId = 'u') {
  if (!filePath) throw new Error('未选择图片')

  try {
    if (typeof uniCloud !== 'undefined' && typeof uniCloud.uploadFile === 'function') {
      const extMatch = String(filePath).match(/\.(\w+)(\?|$)/)
      const ext = (extMatch && extMatch[1]) || 'jpg'
      const cloudPath = `avatars/${userId}_${Date.now()}.${ext}`
      const up = await uniCloud.uploadFile({
        cloudPath,
        filePath
      })
      if (up?.fileID) return up.fileID
    }
  } catch (e) {
    // 继续走本地兜底
  }

  return filePath
}
