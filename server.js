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
  test:      String,
  point:     { type: Number, default: 0 },
  order:     { type: Number, default: 0 }
});
const Feladat = mongoose.model('Feladat', FeladatSchema, 'questions');

const SubjectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  subjectId: { type: String, unique: true },  // Az eredeti backend azonosítója
  languages: [{ name: String }],  
  imageURL: { type: String, default: '' }
});
const Subject = mongoose.model('Subject', SubjectSchema, 'subjects');

// ── GET / — health check ───────────────────────────────────
app.get('/', (req, res) => {
  res.json({ statusz: 'működik' });
});

// ── GET /subjects — tantárgyak lekérése (támogatja a language filtert!) ──
app.get('/subjects', async (req, res) => {
  try {
    const languageFilter = req.query.languages;
    let filter = {};
    
    if (languageFilter) {
      const languages = languageFilter.split(',');
      filter = { 'languages.name': { $all: languages } };
    }
    
    const subjects = await Subject.find(filter).sort({ order: 1 });
    res.json(subjects);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /subjects/sync — tantárgyak szinkronizálása a dashboard backendről ──
app.get('/subjects/sync', async (req, res) => {
  try {
    const response = await fetch('https://vedo-ugyved-dashboard-backend.onrender.com/api/dashboard/subjects');
    const dashboardSubjects = await response.json();
    
    // Szinkronizáljuk a meglévő tantárgyakat
    for (const ds of dashboardSubjects) {
      const existing = await Subject.findOne({ subjectId: ds.subjectId });
      if (!existing) {
        // Új tantárgy létrehozása
        const newSubject = new Subject({
          subjectId: ds.subjectId,
          name: ds.subjectName,
          languages: [],  // Alapértelmezett üres nyelvlista
          order: ds.order || 0
        });
        await newSubject.save();
        console.log(`Új tantárgy hozzáadva: ${ds.subjectName}`);
      } else if (existing.name !== ds.subjectName) {
        // Név frissítése
        existing.name = ds.subjectName;
        await existing.save();
        console.log(`Tantárgy név frissítve: ${ds.subjectName}`);
      }
    }
    
    res.json({ message: 'Szinkronizáció kész', count: dashboardSubjects.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /subjects/:id/languages — tantárgy nyelveinek frissítése ──
app.put('/subjects/:id/languages', async (req, res) => {
  try {
    const { languages } = req.body; // languages: string[] pl. ["javascript", "java"]
    const subject = await Subject.findById(req.params.id);
    if (!subject) return res.status(404).json({ message: 'Tantárgy nem található' });
    
    subject.languages = languages.map(lang => ({ name: lang }));
    await subject.save();
    
    res.json({ message: 'Nyelvek frissítve', languages: subject.languages });
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

// ── PUT /subjects/:id — tantárgy frissítése ───────────────
app.put('/subjects/:id', async (req, res) => {
  try {
    const subject = await Subject.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!subject) return res.status(404).json({ message: 'Tantárgy nem található' });
    res.json(subject);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /subjects/:id — tantárgy törlése ───────────────
app.delete('/subjects/:id', async (req, res) => {
  try {
    const subject = await Subject.findByIdAndDelete(req.params.id);
    if (!subject) return res.status(404).json({ message: 'Tantárgy nem található' });
    res.json({ message: 'Tantárgy törölve', id: req.params.id });
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

// ── PUT /question/:id — feladat frissítése ────────────────
app.put('/question/:id', async (req, res) => {
  try {
    const feladat = await Feladat.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!feladat) return res.status(404).json({ message: 'Feladat nem található' });
    res.json(feladat);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /question/:id — feladat törlése ────────────────
app.delete('/question/:id', async (req, res) => {
  try {
    const feladat = await Feladat.findByIdAndDelete(req.params.id);
    if (!feladat) return res.status(404).json({ message: 'Feladat nem található' });
    res.json({ message: 'Feladat törölve', id: req.params.id });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Backend indítása ───────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend fut a ${PORT}-as porton`));