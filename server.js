'use strict';

require('dotenv').config({silent: true});

if (process.env.GOOGLE_ANALYTICS_ID) {
  process.env.GOOGLE_ANALYTICS_ID = process.env.GOOGLE_ANALYTICS_ID.replace(/\"/g, '');
}

var app = require('./app.js');

// Deployment tracking (optional, helps us out)
require('cf-deployment-tracker-client').track();

var port = process.env.VCAP_APP_PORT || 3000;
app.listen(port);
console.log('listening at:', port);
