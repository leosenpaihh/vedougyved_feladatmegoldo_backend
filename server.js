require('dotenv').config({ path: './.env' });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB kapcsolat
mongoose.connect(process.env.MONGO_URI, { dbName: 'Vedougyved' })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// ── Schemák ────────────────────────────────────────────────
const FeladatSchema = new mongoose.Schema({
  subjectId: String,
  title:     String,
  question:  String,
  example:   String,
  hint:      String,
  testCases: [{ id: String, code: String }]
});
const Feladat = mongoose.model('Feladat', FeladatSchema, 'questions');

const SubjectSchema = new mongoose.Schema({
  name: { type: String, required: true }
});
const Subject = mongoose.model('Subject', SubjectSchema, 'subjects');

// ── GET / — health check ───────────────────────────────────
app.get('/', (req, res) => {
  res.json({ statusz: 'működik' });
});

// ── GET /subjects — proxy a Dashboard backendhez ──────────
app.get('/subjects', async (req, res) => {
  try {
    const response = await fetch('https://vedo-ugyved-dashboard-backend.onrender.com/api/dashboard/subjects');
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /subjects — új tantárgy létrehozása ──────────────
app.post('/subjects', async (req, res) => {
  try {
    const ujSubject = new Subject(req.body);
    await ujSubject.save();
    res.json(ujSubject);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /question — összes feladat ────────────────────────
app.get('/question', async (req, res) => {
  try {
    const feladatok = await Feladat.find();
    res.json(feladatok);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /question/:id — egy feladat id alapján ────────────
app.get('/question/:id', async (req, res) => {
  try {
    const feladat = await Feladat.findById(req.params.id);
    if (!feladat) return res.status(404).json({ message: 'Feladat nem található' });
    res.json(feladat);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /question — új feladat feltöltése ────────────────
app.post('/question', async (req, res) => {
  try {
    const ujFeladat = new Feladat(req.body);
    await ujFeladat.save();
    res.json(ujFeladat);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Backend indítása ───────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend fut a ${PORT}-as porton`));
