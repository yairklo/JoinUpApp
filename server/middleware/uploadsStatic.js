const express = require('express');

// Serves /uploads from disk. A missing file answers with a bare, empty 404: the JSON
// "Route not found" body made Chrome block <img> loads with ERR_BLOCKED_BY_ORB, which
// hides the real 404 and breaks onError fallbacks. The short max-age keeps clients from
// hammering the API for files that were wiped by an old ephemeral-disk deploy.
function mountUploads(app, dir) {
  app.use('/uploads', (req, res, next) => {
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  });
  app.use('/uploads', express.static(dir));
  app.use('/uploads', (req, res) => {
    res.status(404).set('Cache-Control', 'public, max-age=300').end();
  });
}

module.exports = { mountUploads };
