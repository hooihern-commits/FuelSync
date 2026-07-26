const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { getTodayReadiness } = require('../controllers/readinessController');

router.get('/today', protect, getTodayReadiness);

module.exports = router;
