import express from 'express'
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_FILE = join(__dirname, 'data/links.json')
const PORT = process.env.PORT || 3000

const app = express()
app.use(express.json())
app.use(express.static(join(__dirname, 'public')))
app.set('view engine', 'ejs')
app.set('views', join(__dirname, 'views'))

function loadData() {
  try {
    return JSON.parse(readFileSync(DATA_FILE, 'utf8'))
  } catch {
    return { profile: { name: 'KenurkyBot', handle: '@kenurky', bio: '', avatarUrl: '' }, links: [] }
  }
}

function saveData(data) {
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2))
}

// ===== Halaman utama (linktree) =====
app.get('/', (req, res) => {
  res.render('index', { data: loadData() })
})

// ===== Halaman cek lokasi nomor =====
app.get('/lokasi', (req, res) => {
  res.render('lokasi')
})

// API: cek lokasi nomor (mock sederhana, ganti sesuai kebutuhan)
app.post('/api/lokasi', (req, res) => {
  const nomor = (req.body?.nomor || '').replace(/[^\d]/g, '')
  if (!nomor) return res.json({ ok: false, error: 'Nomor wajib diisi' })
  if (nomor.length < 7) return res.json({ ok: false, error: 'Nomor tidak valid' })

  // Simulasi hasil — nanti bisa dihubungkan ke fitur bot / API eksternal.
  const kota = ['Kota Bandung', 'Kota Jakarta', 'Kota Surabaya', 'Kota Medan', 'Kota Makassar', 'Kota Semarang']
  const prov = ['Jawa Barat', 'DKI Jakarta', 'Jawa Timur', 'Sumatera Utara', 'Sulawesi Selatan', 'Jawa Tengah']
  const idx = Math.abs(hashNomor(nomor)) % kota.length

  res.json({
    ok: true,
    nomor: nomor,
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
  const tiga = nomor.slice(0, 3)
  const empat = nomor.slice(0, 4)
  if (/^08(1[1-9]|2[1-9]|3[1-9])/.test(nomor)) return 'Telkomsel'
  if (/^08(5[1-9]|5[0]|5[1])/.test(nomor)) return 'Telkomsel'
  if (/^081[4-6]|^085[5-8]|^0856/.test(nomor)) return 'Indosat'
  if (/^081[7-9]|^0859|^087[7-8]/.test(nomor)) return 'XL Axiata'
  if (/^083[1-3]|^0838/.test(nomor)) return 'Axis'
  if (/^089[4-9]/.test(nomor)) return 'Tri (3)'
  if (/^088[0-9]/.test(nomor)) return 'Smartfren'
  return 'Operator tidak diketahui'
}

// ===== Admin API (buat edit link) =====
app.get('/admin', (req, res) => {
  res.render('admin', { data: loadData() })
})

app.get('/api/data', (req, res) => {
  res.json(loadData())
})

app.post('/api/links', (req, res) => {
  const data = loadData()
  const l = req.body
  l.id = l.id || 'link-' + Date.now()
  data.links.push(l)
  saveData(data)
  res.json({ ok: true, link: l })
})

app.put('/api/links/:id', (req, res) => {
  const data = loadData()
  const idx = data.links.findIndex(x => x.id === req.params.id)
  if (idx === -1) return res.status(404).json({ ok: false, error: 'not found' })
  data.links[idx] = { ...data.links[idx], ...req.body, id: req.params.id }
  saveData(data)
  res.json({ ok: true, link: data.links[idx] })
})

app.delete('/api/links/:id', (req, res) => {
  const data = loadData()
  data.links = data.links.filter(x => x.id !== req.params.id)
  saveData(data)
  res.json({ ok: true })
})

app.put('/api/profile', (req, res) => {
  const data = loadData()
  data.profile = { ...data.profile, ...req.body }
  saveData(data)
  res.json({ ok: true, profile: data.profile })
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[kenurkybot-web] running on http://0.0.0.0:${PORT}`)
})
