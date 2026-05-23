import PhysicalExam from '../models/PhysicalExam.js';
import PhysicalResult from '../models/PhysicalResult.js';

// Create a new physical exam record
export const createPhysicalExam = async (req, res) => {
  try {
    const { title, date, batch, totalMarks } = req.body;
    const newExam = await PhysicalExam.create({
      title,
      date,
      batch,
      totalMarks,
      createdBy: req.user.id
    });
    res.status(201).json({ success: true, exam: newExam });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get all physical exam records
export const getPhysicalExams = async (req, res) => {
  try {
    const exams = await PhysicalExam.find().sort({ date: -1 });
    res.status(200).json({ success: true, exams });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update a physical exam
export const updatePhysicalExam = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, date, batch, totalMarks } = req.body;
    const exam = await PhysicalExam.findByIdAndUpdate(
      id,
      { title, date, batch, totalMarks },
      { new: true }
    );
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });
    res.status(200).json({ success: true, exam });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete a physical exam and all its results
export const deletePhysicalExam = async (req, res) => {
  try {
    const { id } = req.params;
    const exam = await PhysicalExam.findById(id);
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });

    // Delete all results associated with this exam
    await PhysicalResult.deleteMany({ exam: id });
    await PhysicalExam.findByIdAndDelete(id);

    res.status(200).json({ success: true, message: "Exam and all associated results deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Upload results for a physical exam
export const uploadPhysicalResults = async (req, res) => {
  try {
    const { examId, results } = req.body; // results: [{ studentId, score }]

    if (!examId || !results || !Array.isArray(results)) {
      return res.status(400).json({ success: false, message: "Invalid data" });
    }

    const savedResults = await Promise.all(results.map(async (item) => {
      return await PhysicalResult.findOneAndUpdate(
        { student: item.studentId, exam: examId },
        { score: Number(item.score) },
        { upsert: true, new: true }
      );
    }));

    res.status(200).json({
      success: true,
      message: `${savedResults.length} results saved successfully`,
      count: savedResults.length
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get results for specific exam
export const getPhysicalExamResults = async (req, res) => {
  try {
    const { id } = req.params;
    const results = await PhysicalResult.find({ exam: id }).populate('student', 'name indexNumber');
    res.status(200).json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get results for specific exam (Student side - filtered by batch)
export const getBatchResultsForStudent = async (req, res) => {
  try {
    const { id } = req.params; // exam ID
    const studentBatch = req.user.batch;

    const exam = await PhysicalExam.findById(id);
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });

    // Check if exam is for student's batch or 'all'
    if (!exam.batch.includes(studentBatch) && !exam.batch.includes('all')) {
      return res.status(403).json({ success: false, message: "Results not available for your batch" });
    }

    const results = await PhysicalResult.find({ exam: id })
      .populate({
        path: 'student',
        select: 'name indexNumber batch',
        match: { batch: studentBatch } // Only match students from the current student's batch
      })
      .sort({ score: -1 }); // Rank by score

    // Filter out null students (those not in the current student's batch)
    const filteredResults = results.filter(res => res.student);

    res.status(200).json({ success: true, results: filteredResults });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get a student's own history of physical exam results
export const getMyPhysicalResults = async (req, res) => {
  try {
    let studentId = req.user.id;

    // Admin can request history for any student
    if (req.user.role === 'instructor' && req.query.studentId) {
      studentId = req.query.studentId;
    }

    const results = await PhysicalResult.find({ student: studentId })
      .populate('exam', 'title date totalMarks')
      .sort({ 'exam.date': -1 });

    // Sort manually if populate sort didn't work as expected
    const sortedResults = results.sort((a, b) => new Date(b.exam?.date) - new Date(a.exam?.date));

    res.status(200).json({ success: true, results: sortedResults });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


