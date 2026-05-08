const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { logMeal, getMeals } = require('../controllers/mealController');

router.post('/', protect, logMeal);
router.get('/', protect, getMeals);

module.exports = router;