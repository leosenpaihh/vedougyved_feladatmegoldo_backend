const { authenticateToken } = require("./auth.js");
require('dotenv').config({ path: './.env' });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI, { dbName: 'Vedougyved' })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// ── Schemák ──────────────────────────────────────────────
const FeladatSchema = new mongoose.Schema({
  subjectId: String,
  title:     String,
  question:  String,
  example:   String,
  hint:      String,
  test:      String,
  point:     { type: Number, default: 0 },  // ← 2.-ből
  order:     { type: Number, default: 0 }   // ← 2.-ből
});
const Feladat = mongoose.model('Feladat', FeladatSchema, 'questions');

const SubjectSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  languages: [{ name: String }],
  imageURL:  { type: String, default: '' },
  order:     { type: Number, default: 0 }
});
const Subject = mongoose.model('Subject', SubjectSchema, 'subjects');

const CompletedQuestionSchema = new mongoose.Schema({
  question_id: String
}, { _id: false });
const SubjectsObjectSchema = new mongoose.Schema({
  subjectid: String,
  completed_questions: [CompletedQuestionSchema]
}, { _id: false });
const UserSchema = new mongoose.Schema({
  first_name: String,
  last_name:  String,
  email:      String,
  password:   String,
  teacher:    Boolean,
  subjects:   [SubjectsObjectSchema],
  _class:     String
});
const User = mongoose.model('User', UserSchema, 'users');

// ── Health check ─────────────────────────────────────────
app.get('/', (req, res) => res.json({ statusz: 'működik' }));

// ── User endpoints ────────────────────────────────────────
app.get('/user', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) return res.status(404).json({ message: 'Felhasználó nem található' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.put('/user/subject/:subjectId/question/:questionId', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { subjectId, questionId } = req.params;
  try {
    // Először próbáld meg hozzáadni ha már létezik a subject
    let user = await User.findOneAndUpdate(
      { _id: userId, "subjects.subjectid": subjectId },
      { $addToSet: { "subjects.$.completed_questions": { question_id: questionId } } },
      { new: true }
    );

    // Ha nem volt ilyen subject, hozd létre
    if (!user) {
      user = await User.findByIdAndUpdate(
        userId,
        { $addToSet: { subjects: { subjectid: subjectId, completed_questions: [{ question_id: questionId }] } } },
        { new: true }
      );
    }

    if (!user) return res.status(404).json({ message: 'Felhasználó nem található' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Subjects endpoints ────────────────────────────────────
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

app.get('/subjects/sync', async (req, res) => {
  try {
    const response = await fetch('https://vedo-ugyved-dashboard-backend.onrender.com/api/dashboard/subjects');
    const dashboardSubjects = await response.json();
    for (const ds of dashboardSubjects) {
      const existing = await Subject.findOne({ _id: ds.subjectId });
      if (!existing) {
        await new Subject({ _id: ds.subjectId, name: ds.subjectName, order: ds.order || 0 }).save();
      } else if (existing.name !== ds.subjectName) {
        existing.name = ds.subjectName;
        await existing.save();
      }
    }
    res.json({ message: 'Szinkronizáció kész', count: dashboardSubjects.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.put('/subjects/:id/languages', async (req, res) => {
  try {
    const { languages } = req.body;
    const subject = await Subject.findById(req.params.id);
    if (!subject) return res.status(404).json({ message: 'Tantárgy nem található' });
    subject.languages = languages.map(lang => ({ name: lang }));
    await subject.save();
    res.json({ message: 'Nyelvek frissítve', languages: subject.languages });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/subjects', async (req, res) => {
  try {
    const ujSubject = new Subject(req.body);
    await ujSubject.save();
    res.json(ujSubject);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.put('/subjects/:id', async (req, res) => {
  try {
    const subject = await Subject.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!subject) return res.status(404).json({ message: 'Tantárgy nem található' });
    res.json(subject);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.delete('/subjects/:id', async (req, res) => {
  try {
    const subject = await Subject.findByIdAndDelete(req.params.id);
    if (!subject) return res.status(404).json({ message: 'Tantárgy nem található' });
    res.json({ message: 'Tantárgy törölve', id: req.params.id });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Question endpoints ────────────────────────────────────
app.get('/question', async (req, res) => {
  try {
    const feladatok = await Feladat.find();
    res.json(feladatok);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/question/:id', async (req, res) => {
  try {
    const feladat = await Feladat.findById(req.params.id);
    if (!feladat) return res.status(404).json({ message: 'Feladat nem található' });
    res.json(feladat);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/question', async (req, res) => {
  try {
    const ujFeladat = new Feladat(req.body);
    await ujFeladat.save();
    res.json(ujFeladat);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.put('/question/:id', async (req, res) => {
  try {
    const feladat = await Feladat.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!feladat) return res.status(404).json({ message: 'Feladat nem található' });
    res.json(feladat);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.delete('/question/:id', async (req, res) => {
  try {
    const feladat = await Feladat.findByIdAndDelete(req.params.id);
    if (!feladat) return res.status(404).json({ message: 'Feladat nem található' });
    res.json({ message: 'Feladat törölve', id: req.params.id });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Indítás ───────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend fut a ${PORT}-as porton`));
