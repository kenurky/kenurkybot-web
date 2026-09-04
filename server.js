import express from 'express'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getProfile, saveProfile, getLinks, addLink, updateLink, deleteLink } from './db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3000

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

// ===== Admin panel =====
app.get('/admin', async (req, res) => {
  try {
    const [profile, links] = await Promise.all([getProfile(), getLinks()])
    res.render('admin', { data: { profile, links } })
  } catch (e) {
    res.status(500).send('Terjadi error: ' + e.message)
  }
})

app.get('/api/data', async (req, res) => {
  const [profile, links] = await Promise.all([getProfile(), getLinks()])
  res.json({ profile, links })
})

app.post('/api/links', async (req, res) => {
  try {
    const link = await addLink(req.body)
    res.json({ ok: true, link })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.put('/api/links/:id', async (req, res) => {
  try {
    const link = await updateLink(req.params.id, req.body)
    if (!link) return res.status(404).json({ ok: false, error: 'not found' })
    res.json({ ok: true, link })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.delete('/api/links/:id', async (req, res) => {
  try {
    await deleteLink(req.params.id)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.put('/api/profile', async (req, res) => {
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
