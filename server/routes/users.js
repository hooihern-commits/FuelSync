const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { completeOnboarding } = require('../controllers/userController');

router.patch('/onboarding', protect, completeOnboarding);

module.exports = router;