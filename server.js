import express from 'express'
import { createHash } from 'crypto'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getProfile, saveProfile, getLinks, addLink, updateLink, deleteLink } from './db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3000

const ADMIN_PASS = process.env.ADMIN_PASS || 'kenurkybot7'
const ADMIN_COOKIE = 'kenurky_admin'
const AUTH_TOKEN = createHash('sha256').update('kenurky:' + ADMIN_PASS).digest('hex')

function parseCookies(req) {
  const out = {}
  const raw = req.headers.cookie || ''
  for (const part of raw.split(';')) {
    const i = part.indexOf('=')
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

function isAuthed(req) {
  return parseCookies(req)[ADMIN_COOKIE] === AUTH_TOKEN
}

function requireAuth(req, res, next) {
  if (isAuthed(req)) return next()
  if (req.method !== 'GET') return res.status(401).json({ ok: false, error: 'unauthorized' })
  res.redirect('/admin/login')
}

const app = express()
app.use(express.json())
app.use(express.static(join(__dirname, 'public')))
app.set('view engine', 'ejs')
app.set('views', join(__dirname, 'views'))

// ===== Halaman utama (linktree) =====
app.get('/', async (req, res) => {
  try {
    const [profile, links] = await Promise.all([getProfile(), getLinks()])
    res.render('index', { data: { profile, links } })
  } catch (e) {
    res.status(500).send('Terjadi error: ' + e.message)
  }
})

// ===== Halaman cek lokasi nomor =====
app.get('/lokasi', (req, res) => res.render('lokasi'))

// ===== Halaman tools =====
app.get('/tools', (req, res) => res.render('tools'))

const TIKTOK_API_URL = 'https://anabot.my.id/api/download/tiktok'
const TIKTOK_API_KEY = process.env.TIKTOK_API_KEY || 'freeApikey'
const TIKTOK_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

async function ambilDataTiktok(url) {
  const params = { url, apikey: TIKTOK_API_KEY }
  const errors = []

  async function tryFetch(method, body, headers = {}) {
    const res = await fetch(TIKTOK_API_URL, {
      method,
      headers: { 'User-Agent': TIKTOK_UA, ...headers },
      body,
      signal: AbortSignal.timeout(20_000)
    })
    if (!res.ok) throw new Error(`[${res.status}] ${await res.text()}`)
    return res.json()
  }

  // Strategi 1: POST JSON
  try {
    return await tryFetch('POST', JSON.stringify(params), { 'Content-Type': 'application/json' })
  } catch (e) { errors.push(`POST json: ${e.message}`) }

  // Strategi 2: POST form-urlencoded
  try {
    const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
    return await tryFetch('POST', qs, { 'Content-Type': 'application/x-www-form-urlencoded' })
  } catch (e) { errors.push(`POST form: ${e.message}`) }

  // Strategi 3: GET query
  try {
    const qs = '?' + Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
    return await tryFetch('GET', null, {})
  } catch (e) { errors.push(`GET query: ${e.message}`) }

  throw new Error('Semua metode request gagal: ' + errors.join(' | '))
}

app.post('/api/tiktok', async (req, res) => {
  try {
    const url = (req.body?.url || '').trim()
    if (!url) return res.json({ ok: false, error: 'Link TikTok wajib diisi' })
    if (!/tiktok\.com|tiktok/i.test(url)) return res.json({ ok: false, error: 'Link bukan dari TikTok' })

    const data = await ambilDataTiktok(url)
    if (!data || data.success === false) {
      return res.json({ ok: false, error: 'API TikTok gagal merespons. Coba link lain.', raw: data })
    }

    const isi = data.data ?? data.result ?? data
    const result = isi.result ?? isi
    const videoUrl = result?.nowatermark || result?.no_watermark || result?.video || result?.without_watermark || data?.video || result?.wm
    const caption = result?.description || result?.title || result?.caption || ''
    const thumbnail = result?.thumbnail || data?.thumbnail || ''

    if (!videoUrl) {
      return res.json({ ok: false, error: 'Tidak menemukan URL video (link mungkin tidak valid).', raw: data })
    }

    res.json({ ok: true, videoUrl, caption, thumbnail })
  } catch (e) {
    res.json({ ok: false, error: 'Error TikTok: ' + e.message })
  }
})

app.get('/api/tiktok/dl', async (req, res) => {
  try {
    const videoUrl = req.query.url
    if (!videoUrl || !/^https?:\/\//.test(videoUrl)) return res.status(400).json({ ok: false, error: 'URL tidak valid' })

    const upstream = await fetch(videoUrl, {
      headers: { 'User-Agent': TIKTOK_UA, 'Referer': 'https://www.tiktok.com/' },
      redirect: 'follow',
      signal: AbortSignal.timeout(60_000)
    })
    if (!upstream.ok) return res.status(502).json({ ok: false, error: 'Gagal mengambil video (HTTP ' + upstream.status + ')' })

    const buffer = Buffer.from(await upstream.arrayBuffer())
    res.set('Content-Type', 'video/mp4')
    res.set('Content-Disposition', 'attachment; filename="tiktok-video.mp4"')
    res.set('Content-Length', buffer.length)
    res.send(buffer)
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Download gagal: ' + e.message })
  }
})

// ===== Instagram downloader =====
const IG_API_URL = 'https://anabot.my.id/api/download/instagram'

function isVideoUrl(u) {
  return /\.(mp4|m4v|mov)(\?|$)/i.test(u || '')
}

app.get('/api/ig', async (req, res) => {
  try {
    const url = (req.query.url || '').trim()
    if (!url) return res.json({ ok: false, error: 'Link Instagram wajib diisi' })
    if (!/instagram\.com/i.test(url)) return res.json({ ok: false, error: 'Link bukan dari Instagram' })

    const apiRes = await fetch(IG_API_URL + '?' + new URLSearchParams({ url, apikey: TIKTOK_API_KEY }), {
      headers: { accept: 'application/json', 'User-Agent': TIKTOK_UA },
      signal: AbortSignal.timeout(20_000)
    })
    if (!apiRes.ok) return res.json({ ok: false, error: 'API Instagram gagal (HTTP ' + apiRes.status + ')' })
    const data = await apiRes.json()

    if (!data || data.success === false) {
      return res.json({ ok: false, error: 'API Instagram gagal merespons.', raw: data })
    }

    const isi = data.data ?? data.result ?? data
    const items = Array.isArray(isi?.result) ? isi.result
      : Array.isArray(isi?.media) ? isi.media
      : Array.isArray(isi) ? isi
      : (isi?.url || isi?.thumbnail ? [isi] : [])

    const mapped = items.map(it => ({
      url: it?.url || it?.video || it?.image || it?.thumbnail || null,
      isVideo: isVideoUrl(it?.url || it?.video || it?.image || it?.thumbnail)
    })).filter(it => it.url)

    if (!mapped.length) {
      return res.json({ ok: false, error: 'Tidak menemukan media di response API.', raw: data })
    }

    res.json({ ok: true, total: mapped.length, items: mapped })
  } catch (e) {
    res.json({ ok: false, error: 'Error Instagram: ' + e.message })
  }
})

app.get('/api/ig/dl', async (req, res) => {
  try {
    const mediaUrl = req.query.url
    if (!mediaUrl || !/^https?:\/\//.test(mediaUrl)) return res.status(400).json({ ok: false, error: 'URL tidak valid' })

    const upstream = await fetch(mediaUrl, {
      headers: { 'User-Agent': TIKTOK_UA, 'Referer': 'https://www.instagram.com/' },
      redirect: 'follow',
      signal: AbortSignal.timeout(60_000)
    })
    if (!upstream.ok) return res.status(502).json({ ok: false, error: 'Gagal mengambil media (HTTP ' + upstream.status + ')' })

    const buffer = Buffer.from(await upstream.arrayBuffer())
    const isVideo = isVideoUrl(mediaUrl)
    res.set('Content-Type', isVideo ? 'video/mp4' : 'image/jpeg')
    res.set('Content-Disposition', 'attachment; filename="' + (isVideo ? 'instagram-video.mp4' : 'instagram-image.jpg') + '"')
    res.set('Content-Length', buffer.length)
    res.send(buffer)
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Download gagal: ' + e.message })
  }
})

app.post('/api/lokasi', (req, res) => {
  const nomor = (req.body?.nomor || '').replace(/[^\d]/g, '')
  if (!nomor) return res.json({ ok: false, error: 'Nomor wajib diisi' })
  if (nomor.length < 7) return res.json({ ok: false, error: 'Nomor tidak valid' })

  const kota = ['Kota Bandung', 'Kota Jakarta', 'Kota Surabaya', 'Kota Medan', 'Kota Makassar', 'Kota Semarang']
  const prov = ['Jawa Barat', 'DKI Jakarta', 'Jawa Timur', 'Sumatera Utara', 'Sulawesi Selatan', 'Jawa Tengah']
  const idx = Math.abs(hashNomor(nomor)) % kota.length

  res.json({
    ok: true,
    nomor,
    kode: nomor.slice(0, 2),
    operator: deteksiOperator(nomor),
    kota: kota[idx],
    provinsi: prov[idx]
  })
})

function hashNomor(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return h
}

function deteksiOperator(nomor) {
  if (/^081[4-6]/.test(nomor)) return 'Indosat'
  if (/^085[5-8]/.test(nomor)) return 'Indosat'
  if (/^081[7-9]/.test(nomor)) return 'XL Axiata'
  if (/^0859/.test(nomor)) return 'XL Axiata'
  if (/^087[7-8]/.test(nomor)) return 'XL Axiata'
  if (/^083[1-3]/.test(nomor)) return 'Axis'
  if (/^0838/.test(nomor)) return 'Axis'
  if (/^089[4-9]/.test(nomor)) return 'Tri (3)'
  if (/^088/.test(nomor)) return 'Smartfren'
  if (/^08(1[0-3]|22|2[3-9]|2[0-1])/.test(nomor)) return 'Telkomsel'
  return 'Operator tidak diketahui'
}

// ===== Halaman login admin =====
app.get('/admin/login', (req, res) => {
  if (isAuthed(req)) return res.redirect('/admin')
  res.render('login')
})

app.post('/admin/login', express.urlencoded({ extended: false }), (req, res) => {
  if (req.body?.password === ADMIN_PASS) {
    res.setHeader('Set-Cookie', `${ADMIN_COOKIE}=${AUTH_TOKEN}; Path=/; HttpOnly; Max-Age=2592000`)
    return res.redirect('/admin')
  }
  res.status(401).render('login', { error: 'Password salah!' })
})

app.get('/admin/logout', (req, res) => {
  res.setHeader('Set-Cookie', `${ADMIN_COOKIE}=; Path=/; Max-Age=0`)
  res.redirect('/admin/login')
})

// ===== Admin panel =====
app.get('/admin', requireAuth, async (req, res) => {
  try {
    const [profile, links] = await Promise.all([getProfile(), getLinks()])
    res.render('admin', { data: { profile, links } })
  } catch (e) {
    res.status(500).send('Terjadi error: ' + e.message)
  }
})

app.get('/api/data', requireAuth, async (req, res) => {
  const [profile, links] = await Promise.all([getProfile(), getLinks()])
  res.json({ profile, links })
})

app.post('/api/links', requireAuth, async (req, res) => {
  try {
    const link = await addLink(req.body)
    res.json({ ok: true, link })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.put('/api/links/:id', requireAuth, async (req, res) => {
  try {
    const link = await updateLink(req.params.id, req.body)
    if (!link) return res.status(404).json({ ok: false, error: 'not found' })
    res.json({ ok: true, link })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.delete('/api/links/:id', requireAuth, async (req, res) => {
  try {
    await deleteLink(req.params.id)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.put('/api/profile', requireAuth, async (req, res) => {
  try {
    const profile = await saveProfile(req.body)
    res.json({ ok: true, profile })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// Express app untuk Vercel
export default app

// Jalan lokal (bukan Vercel)
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[kenurkybot-web] running on http://0.0.0.0:${PORT}`)
  })
}
