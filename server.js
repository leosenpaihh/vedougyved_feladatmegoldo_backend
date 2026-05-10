const { authenticateToken } = require("./auth.js");
require('dotenv').config({ path: './.env' });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const KIERTEKELO_URL = process.env.KIERTEKELO_URL || console.error("KIERTEKELO_URL nincs beallitva!!!");

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB kapcsolat
mongoose.connect(process.env.MONGO_URI, { dbName: 'Vedougyved' })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// ── Schemák ────────────────────────────────────────────────
const QuestionSchema = new mongoose.Schema({
  lessonId:  mongoose.Schema.Types.ObjectId,
  title:     String,
  question:  String,
  example:   String,
  hint:      String,
  test:      String,
  order:     Number,
  point:     Number,
});
const Question = mongoose.model('Question', QuestionSchema, 'questions');

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
    const { solution, usedHint, attempts} = req.body;

    try {
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const question = await Question.findById(questionId);
      if (!question) {
        return res.status(404).json({ message: "Question not found" });
      }

      let entry = user.completed_questions.find(
        q => q.question_id === questionId
      );

      let isNewEntry = false;
      if (!entry) {
        isNewEntry = true;
        entry = {
          question_id: questionId,
          solution,
          attempts: attempts,
          usedHint: usedHint,
          point: question.point
        };
      } else {
        entry.attempts = attempts;
        entry.solution = solution;
        entry.usedHint = entry.usedHint || usedHint;
      }

      // -------------------------
      // SCORE (ALWAYS RUNS)
      // -------------------------
      let points = question.point;
      if (entry.attempts > 1) {
        points -= (entry.attempts - 1) * 10;
      }

      if (entry.usedHint) {
        points -= 20;
      }

      entry.point = Math.max(points, 10);
      user.markModified("completed_questions");
      if(isNewEntry){
        user.completed_questions.push(entry);
      }

      await user.save();

      return res.json(entry);

    } catch (err) {
      return res.status(500).json({ message: err.message });
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
    const questions = await Question.find();
    res.json(questions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /question/:id — egy feladat id alapján ────────────
app.get('/question/:id', async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ message: 'Feladat nem található' });
    res.json(question);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /question — új feladat feltöltése ────────────────
app.post('/question', async (req, res) => {
  try {
    const newQuestion = new Question(req.body);
    await newQuestion.save();
    res.json(newQuestion);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /question/:id — feladat frissítése ────────────────
app.put('/question/:id', async (req, res) => {
  try {
    const question = await Question.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!question) return res.status(404).json({ message: 'Feladat nem található' });
    res.json(question);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /question/:id — feladat törlése ────────────────
app.delete('/question/:id', async (req, res) => {
  try {
    const question = await Question.findByIdAndDelete(req.params.id);
    if (!question) return res.status(404).json({ message: 'Feladat nem található' });
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
    const questions = await Question.find({ lessonId });
    const questionIds = questions.map(q => q._id.toString());

    // 2. remove them from completed_questions
    user.completed_questions = user.completed_questions.filter(
      q => !questionIds.includes(q.question_id.toString())
    );

    await user.save();

    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/execute", async (req, res) => {
  const resp = await fetch(`${KIERTEKELO_URL}/execute`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": req.header("authorization"),
    },
    body: JSON.stringify(req.body),
  });
  const result = await resp.json();

  res.json(result);
});

app.post("/test", async (req, res) => {
  const resp = await fetch(`${KIERTEKELO_URL}/test`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": req.header("authorization"),
    },
    body: JSON.stringify(req.body),
  });
  const result = await resp.json();

  res.json(result);
});

// ── Backend indítása ───────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend fut a ${PORT}-as porton`));
