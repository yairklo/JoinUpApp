const timezone = require('./timezone');
const sports = require('./sports');
const upload = require('./upload');
const loadingMotifs = require('./loadingMotifs');

module.exports = { ...timezone, ...sports, ...upload, ...loadingMotifs };
