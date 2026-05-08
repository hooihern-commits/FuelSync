const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { preWorkoutAdvice, postWorkoutAdvice } = require('../controllers/suggestionController');

router.post('/pre', protect, preWorkoutAdvice);
router.post('/post', protect, postWorkoutAdvice);

module.exports = router;