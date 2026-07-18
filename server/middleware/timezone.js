const { IANAZone } = require('luxon');

function attachTimezone(req, res, next) {
  const headerTz = req.headers['x-timezone'];
  req.timezone = headerTz && IANAZone.isValidZone(headerTz) ? headerTz : 'UTC';
  next();
}

module.exports = { attachTimezone };