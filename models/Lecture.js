const mongoose = require('mongoose');

const lectureSchema = new mongoose.Schema({
  subjectId: { type: String, required: true, index: true },
  chapterId: { type: String, required: true, index: true },
  title: { type: String, required: true },
  date: String,
  duration: String,
  youtubeId: String,
  imageUrl: String,
  completed: { type: Boolean, default: false },

  // ✅ NEW FIELDS - Notes & More Feature (PDF and DPP)
  // These are optional so old data will not break
  pdfLink: String,     // Google Drive link for Class PDF
  dppLink: String      // Google Drive link for DPP
}, { timestamps: true });

const Lecture = mongoose.model('Lecture', lectureSchema);

module.exports = Lecture;
