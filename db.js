import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_FILE = join(__dirname, 'data/links.json')

const SUPABASE_URL = 'https://uvqepasdunhexecoghbu.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2cWVwYXNkdW5oZXhlY29naGJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1MTU3MjQsImV4cCI6MjEwNDA5MTcyNH0.T-NvV3ATpW9L9JXWCQIeja_69pev7gKJQtpmvUvckEg'

const DEFAULT_PROFILE = {
  name: 'KenurkyBot',
  handle: '@kenurky',
  bio: '',
  avatar_url: ''
}
const DEFAULT_LINKS = []

function env(k) {
  // dukung penamaan ganda
  return process.env[k] || process.env[k.toLowerCase().replace('_', '')] || supabaseDefaults[k]
}
const supabaseDefaults = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: SUPABASE_KEY,
  SUPABASE_KEY
}
const sbUrl = env('SUPABASE_URL')
const sbKey = env('SUPABASE_ANON_KEY') || env('SUPABASE_KEY')

function isSb() {
  return !!(sbUrl && sbKey)
}

async function sb(path, method, body) {
  const res = await fetch(`${sbUrl}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: sbKey,
      Authorization: `Bearer ${sbKey}`,
      'Content-Type': 'application/json',
      ...(method === 'POST' || method === 'PATCH' ? { Prefer: 'return=representation' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  })
  if (!res.ok) throw new Error(`supabase ${method} ${path} -> ${res.status}`)
  const text = await res.text()
  return text ? JSON.parse(text) : []
}

// ===== Profile =====
async function getProfile() {
  if (isSb()) {
    const rows = await sb('profile?select=*', 'GET')
    return rows[0] || { ...DEFAULT_PROFILE }
  }
  return readJson().profile
}

async function saveProfile(patch) {
  if (isSb()) {
    const existing = await getProfile()
    const data = { id: existing.id || 'main', ...existing, ...patch }
    const id = existing.id || 'main'
    const rows = await sb(`profile?id=eq.${id}`, 'PATCH', data)
    return (Array.isArray(rows) ? rows[0] : rows) || data
  }
  const data = readJson()
  data.profile = { ...data.profile, ...patch }
  writeJson(data)
  return data.profile
}

// ===== Links =====
async function getLinks() {
  if (isSb()) {
    return await sb('kenurky?select=*&order=id', 'GET')
  }
  return readJson().links
}

async function addLink(link) {
  const row = { id: link.id || 'link-' + Date.now(), ...link }
  if (isSb()) {
    const rows = await sb('kenurky', 'POST', row)
    return (Array.isArray(rows) ? rows[0] : rows) || row
  }
  const data = readJson()
  data.links.push(row)
  writeJson(data)
  return row
}

async function updateLink(id, patch) {
  if (isSb()) {
    const rows = await sb(`kenurky?id=eq.${id}`, 'PATCH', patch)
    return (Array.isArray(rows) ? rows[0] : rows) || patch
  }
  const data = readJson()
  const idx = data.links.findIndex(x => x.id === id)
  if (idx === -1) return null
  data.links[idx] = { ...data.links[idx], ...patch, id }
  writeJson(data)
  return data.links[idx]
}

async function deleteLink(id) {
  if (isSb()) {
    await sb(`kenurky?id=eq.${id}`, 'DELETE')
    return true
  }
  const data = readJson()
  data.links = data.links.filter(x => x.id !== id)
  writeJson(data)
  return true
}

// ===== File JSON (fallback local) =====
function readJson() {
  try {
    return JSON.parse(readFileSync(DATA_FILE, 'utf8'))
  } catch {
    return { profile: { ...DEFAULT_PROFILE }, links: [...DEFAULT_LINKS] }
  }
}
function writeJson(d) {
  writeFileSync(DATA_FILE, JSON.stringify(d, null, 2))
}

export { getProfile, saveProfile, getLinks, addLink, updateLink, deleteLink, isSb }
