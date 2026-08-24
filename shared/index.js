const timezone = require('./timezone');
const sports = require('./sports');
const upload = require('./upload');

module.exports = { ...timezone, ...sports, ...upload };
