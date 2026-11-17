const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { syncBatch, getSyncState, getDailySummaries } = require('../controllers/syncController');

router.post('/batch', protect, syncBatch);
router.get('/state', protect, getSyncState);
router.get('/summary', protect, getDailySummaries);

module.exports = router;
