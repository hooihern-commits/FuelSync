const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { createWorkout, updateWorkout, getWorkouts, logCompletedWorkout } = require('../controllers/workoutController');

router.post('/', protect, createWorkout);
router.post('/log', protect, logCompletedWorkout); 
router.patch('/:id', protect, updateWorkout);
router.get('/', protect, getWorkouts);

module.exports = router;