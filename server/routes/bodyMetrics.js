const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { logMetrics, getLatest, getHistory } = require('../controllers/bodyMetricsController');

router.post('/', protect, logMetrics);
router.get('/latest', protect, getLatest);
router.get('/history', protect, getHistory);

module.exports = router;