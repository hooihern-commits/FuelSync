// Every API route, as one router. app.js mounts it at /v1 and, for app
// builds released before versioning, at the root.
const express = require('express');
const router = express.Router();
const { authLimiter, syncLimiter } = require('../middleware/rateLimit');

router.use('/auth',         authLimiter, require('./auth'));
router.use('/meals',        require('./meals'));
router.use('/workouts',     require('./workouts'));
router.use('/suggestions',  require('./suggestions'));
router.use('/recovery',     require('./recovery'));
router.use('/readiness',    require('./readiness'));
router.use('/body-metrics', require('./bodyMetrics'));
router.use('/users',        require('./users'));
router.use('/sync',         syncLimiter, require('./sync'));

module.exports = router;
