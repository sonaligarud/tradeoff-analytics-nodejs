'use strict';

var app = require('./app.js');

// Deployment tracking (optional, helps us out)
require('cf-deployment-tracker-client').track();

var port = process.env.VCAP_APP_PORT || 3000;
app.listen(port);
console.log('listening at:', port);
