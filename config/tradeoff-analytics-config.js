/**
 * Copyright 2014 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

var watson = require('watson-developer-cloud'),
    extend = require('util')._extend;

var defaultConnectionDetails = {
    url: 'https://gateway.watsonplatform.net/tradeoff-analytics/api/v1',
    version: 'v1'
};

module.exports = {
  setupToken: function(app,credentials) {
    // override defaults
    credentials = extend(defaultConnectionDetails, credentials);
    credentials = extend(credentials, getServiceCreds('tradeoff_analytics')); 
    var params = {
      url: credentials.url
    };

    var authorization = watson.authorization(credentials);

    app.post('/api/tradeoff-analytics-token', function(req, res) {
      authorization.getToken(params, function (err, token) {
        if (!token) {
          console.log('error:', err);
          res.status(500).send("Error retrieving token");
        } else {
          res.send(token);
        }
      });
    });
  }
};

/**
 * if VCAP_SERVICES exists then it returns username, password and url
 * for the first service that stars with 'name' or {} otherwise
 * @param  String name, service name
 * @return {Object} the service credentials or {} if
 * name is not found in VCAP_SERVICES
 */
function getServiceCreds(name) {
  if (process.env.VCAP_SERVICES) {
    var services = JSON.parse(process.env.VCAP_SERVICES);
    for (var service_name in services) {
      if (service_name.indexOf(name) === 0) {
        var service = services[service_name][0];
        return service.credentials;
      }
    }
  }
  return {};
}