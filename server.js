// server.js - Complete Version for Project02

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const app = express();

// Import Models
const User = require('./models/User');
const Chapter = require('./models/Chapter');
const Lecture = require('./models/Lecture');
const LiveSchedule = require('./models/LiveSchedule');
const Score = require('./models/Score');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use(cookieParser());

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log('✅ MongoDB Connected Successfully'))
.catch(err => console.error('❌ MongoDB Error:', err));

// Email Transporter (for password reset)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Login Rate Limiter
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, msg: 'Too many login attempts. Try again later.' }
});

// ====================== AUTH MIDDLEWARE ======================
const authenticate = (req, res, next) => {
  const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, msg: "Please login first" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ success: false, msg: "Invalid or expired token" });
  }
};

const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, msg: "Access denied. Admin only." });
  }
  next();
};

// ====================== AUTH ROUTES ======================

// Register (use once for seeding)
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ success: false, msg: 'User already exists' });

    user = new User({ name, email, password, role: role || 'student' });
    await user.save();
    res.status(201).json({ success: true, msg: 'User created successfully' });
  } catch (err) {
    res.status(500).json({ success: false, msg: 'Server error' });
  }
});

// Login
app.post('/api/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(400).json({ success: false, msg: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      success: true,
      msg: 'Login successful',
      role: user.role,
      name: user.name
    });
  } catch (err) {
    res.status(500).json({ success: false, msg: 'Server error' });
  }
});

// Forgot Password (temporary without email)
app.post('/api/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ success: false, msg: 'No account found with this email' });

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 15 * 60 * 1000;
    await user.save();

    const resetLink = `${process.env.FRONTEND_URL}/reset-password.html?token=${resetToken}`;
    console.log(`🔗 Reset link for ${email}: ${resetLink}`);

    res.json({
      success: true,
      msg: 'Password reset link generated. Check terminal for the link.'
    });
  } catch (err) {
    res.status(500).json({ success: false, msg: 'Server error' });
  }
});

// Reset Password
app.post('/api/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });
    if (!user) return res.status(400).json({ success: false, msg: 'Invalid or expired token' });

    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ success: true, msg: 'Password reset successful.' });
  } catch (err) {
    res.status(500).json({ success: false, msg: 'Server error' });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true, msg: 'Logged out successfully' });
});

// Get current user
app.get('/api/me', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json({ success: true, role: user.role, name: user.name });
  } catch (err) {
    res.status(500).json({ success: false, msg: 'Server error' });
  }
});

// ====================== YOUR ORIGINAL ROUTES ======================

// Chapters
app.get('/api/chapters', async (req, res) => {
  try {
    const { subjectId } = req.query;
    if (!subjectId) return res.status(400).json({ error: "subjectId is required" });
    const chapters = await Chapter.find({ subjectId }).sort({ order: 1, createdAt: 1 });
    res.json(chapters);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chapters', authenticate, isAdmin, async (req, res) => {
  try {
    const chapter = new Chapter(req.body);
    await chapter.save();
    res.json({ success: true, chapter });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/chapters/:id', authenticate, isAdmin, async (req, res) => {
  try {
    await Lecture.deleteMany({ chapterId: req.params.id });
    await Chapter.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Lectures
app.get('/api/lectures', async (req, res) => {
  try {
    const { subjectId, chapterId } = req.query;
    let query = {};
    if (subjectId) query.subjectId = subjectId;
    if (chapterId) query.chapterId = chapterId;
    const lectures = await Lecture.find(query).sort({ createdAt: 1 });
    res.json(lectures);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/lectures', authenticate, isAdmin, async (req, res) => {
  try {
    const lecture = new Lecture(req.body);
    await lecture.save();
    res.json({ success: true, lecture });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/lectures/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const lecture = await Lecture.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!lecture) return res.status(404).json({ success: false, message: "Lecture not found" });
    res.json({ success: true, lecture });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/lectures/:id', authenticate, isAdmin, async (req, res) => {
  try {
    await Lecture.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/lectures/:id/complete', authenticate, async (req, res) => {
  try {
    const lecture = await Lecture.findByIdAndUpdate(
      req.params.id,
      { completed: true },
      { new: true }
    );
    if (!lecture) return res.status(404).json({ success: false, message: "Lecture not found" });
    res.json({ success: true, lecture });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ====================== LIVE SCHEDULES (NEW) ======================
app.get('/api/live-schedules', async (req, res) => {
  try {
    const schedules = await LiveSchedule.find().sort({ startTime: 1 });
    res.json(schedules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/live-schedules', authenticate, isAdmin, async (req, res) => {
  try {
    const schedule = new LiveSchedule(req.body);
    await schedule.save();
    res.status(201).json({ success: true, schedule });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/live-schedules/:id', authenticate, isAdmin, async (req, res) => {
  try {
    await LiveSchedule.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ====================== SERVER START ======================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on ${PORT}`));
