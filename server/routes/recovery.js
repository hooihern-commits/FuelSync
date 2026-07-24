const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { submitCheckin, getCheckin, getLatestRecovery } = require('../controllers/recoveryController');

router.post('/', protect, submitCheckin);
router.get('/latest', protect, getLatestRecovery);  // must precede /:workout_id
router.get('/:workout_id', protect, getCheckin);

module.exports = router;