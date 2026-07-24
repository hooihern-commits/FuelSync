const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { completeOnboarding, updateProfile, changePassword } = require('../controllers/userController');

router.patch('/onboarding', protect, completeOnboarding);
router.patch('/profile', protect, updateProfile);
router.patch('/password', protect, changePassword);

module.exports = router;