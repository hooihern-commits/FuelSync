const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { preWorkoutAdvice, postWorkoutAdvice, getLatestSuggestion } = require('../controllers/suggestionController');

router.post('/pre', protect, preWorkoutAdvice);
router.post('/post', protect, postWorkoutAdvice);
router.get('/latest', protect, getLatestSuggestion);

module.exports = router;