import { DB_KEY } from '@/utils/constants'

const COLLECTIONS = [
  'users',
  'matches',
  'match_items',
  'teams',
  'groups',
  'fixtures',
  'sub_fixtures',
  'photos',
  'score_logs',
  'role_applications'
]

function empty() {
  const db = { version: 1 }
  COLLECTIONS.forEach((c) => {
    db[c] = []
  })
  return db
}

let cache = null

export function loadDb() {
  if (cache) return cache
  try {
    const raw = uni.getStorageSync(DB_KEY)
    cache = raw && raw.users ? raw : empty()
  } catch (e) {
    cache = empty()
  }
  return cache
}

export function saveDb() {
  uni.setStorageSync(DB_KEY, cache)
}

export function resetDb() {
  cache = empty()
  saveDb()
  return cache
}

export function col(name) {
  const db = loadDb()
  if (!db[name]) db[name] = []
  return {
    all() {
      return db[name]
    },
    find(pred) {
      return db[name].filter(pred)
    },
    findOne(pred) {
      if (typeof pred === 'string') return db[name].find((d) => d._id === pred) || null
      return db[name].find(pred) || null
    },
    insert(doc) {
      db[name].push(doc)
      saveDb()
      return doc
    },
    insertMany(docs) {
      db[name].push(...docs)
      saveDb()
      return docs
    },
    update(id, patch) {
      const i = db[name].findIndex((d) => d._id === id)
      if (i < 0) return null
      db[name][i] = { ...db[name][i], ...patch, updatedAt: new Date().toISOString() }
      saveDb()
      return db[name][i]
    },
    remove(id) {
      const i = db[name].findIndex((d) => d._id === id)
      if (i < 0) return false
      db[name].splice(i, 1)
      saveDb()
      return true
    },
    removeWhere(pred) {
      db[name] = db[name].filter((d) => !pred(d))
      saveDb()
    }
  }
}

export { COLLECTIONS }
