const { authenticateToken } = require("./auth.js");
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
  lessonId:  String,
  title:     String,
  question:  String,
  example:   String,
  hint:      String,
  test:      String,
  order:     Number,
  point:     Number,
});
const Feladat = mongoose.model('Feladat', FeladatSchema, 'questions');

const SubjectSchema = new mongoose.Schema({
  name: { type: String, required: true }
});
const Subject = mongoose.model('Subject', SubjectSchema, 'subjects');

const LessonSchema = new mongoose.Schema({
  title: { type: String, required: true },
  subjectId: { type: String, required: true },
});
const Lesson = mongoose.model('Lesson', LessonSchema, 'lessons');

const CompletedQuestionSchema = new mongoose.Schema({
  question_id: String,
  point: Number,
  solution: String,
  attempts: { type: Number, default: 0 },
  usedHint: { type: Boolean, default: false }
}, { _id: false });

const UserSchema = new mongoose.Schema({
  first_name: String,
  last_name: String,
  email: String,
  password: String,
  teacher: Boolean,
  _class: String,
  subjects: Array,
  lessons: Array,
  completed_questions: [CompletedQuestionSchema]
});
const User = mongoose.model('User', UserSchema, 'users');


// ── GET / — health check ───────────────────────────────────
app.get('/', (req, res) => {
  res.json({ statusz: 'működik' });
});

// ha akarnánk profil gombot maybe kéne ez, egyelőre itt marad placeholdernek
app.get("/user", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("-password");
    if (!user) return res.status(404).json({ message: 'Felhasználó nem található' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

///////////////////////////////////////////////////////////////
/// pontozás és eredmény mentés, lehet rossz lehet nem IDK
///////////////////////////////////////////////////////////////
app.put(
  "/user/question/:questionId",
  authenticateToken,
  async (req, res) => {

    const userId = req.user.userId;
    const { questionId } = req.params;
    const { solution, usedHint } = req.body;

    try {
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const question = await Question.findById(questionId); // fontos!
      if (!question) {
        return res.status(404).json({ message: "Question not found" });
      }

      let entry = user.completed_questions.find(
        q => q.question_id === questionId
      );

      if (!entry) {
        // első próbálkozás
        entry = {
          question_id: questionId,
          solution,
          attempts: 1,
          usedHint: !!usedHint,
          point: question.point // max pont kezdetben
        };

        user.completed_questions.push(entry);
      } else {
        // új próbálkozás
        entry.attempts += 1;
        entry.solution = solution;

        if (usedHint) {
          entry.usedHint = true;
        }
      }

      // PONT SZÁMOLÁS BACKENDEN
      let points = question.point;

      if (entry.attempts > 1) {
        points -= (entry.attempts - 1) * 10;
      }

      if (entry.usedHint) {
        points -= 20;
      }

      //csak 10ig lehet lemenni
      entry.point = Math.max(points, 10);

      await user.save();

      res.json(entry);

    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);


// ── GET /subjects — tantárgyak lekérdezése ──────────
app.get('/subjects', async (req, res) => {
  try {
    const tantargyak = await Subject.find();
    res.json(tantargyak);
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

// ── GET /lessons — proxy a Dashboard backendhez ──────────
app.get('/lessons', async (req, res) => {
  try {
    const lessons = await Lesson.find();
    res.json(lessons);
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


app.delete("/user/lesson/:lessonId/questions", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { lessonId } = req.params;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // 1. get questions for lesson
    const questions = await Feladat.find({ lessonId });
    const questionIds = questions.map(q => q._id.toString());

    // 2. remove them from completed_questions
    user.completed_questions = user.completed_questions.filter(
      q => !questionIds.includes(q.question_id)
    );

    await user.save();

    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Backend indítása ───────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend fut a ${PORT}-as porton`));
