const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { submitCheckin, getCheckin } = require('../controllers/recoveryController');

router.post('/', protect, submitCheckin);
router.get('/:workout_id', protect, getCheckin);

module.exports = router;