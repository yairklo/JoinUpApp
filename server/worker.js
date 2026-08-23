process.env.RUN_HTTP_SERVER = 'false';
process.env.RUN_BACKGROUND_JOBS = process.env.RUN_BACKGROUND_JOBS || 'true';
require('./index.js');
