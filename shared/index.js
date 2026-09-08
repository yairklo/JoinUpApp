const timezone = require('./timezone');
const sports = require('./sports');
const upload = require('./upload');
const loadingMotifs = require('./loadingMotifs');
const cityAliases = require('./cityAliases');

module.exports = { ...timezone, ...sports, ...upload, ...loadingMotifs, ...cityAliases };
