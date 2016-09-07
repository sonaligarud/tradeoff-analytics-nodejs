/**
 * Copyright 2015 IBM Corp. All Rights Reserved.
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

// security.js
var secure     = require('express-secure-only'),
  rateLimit    = require('express-rate-limit'),
  csrf         = require('csurf'),
  cookieParser = require('cookie-parser'),
  helmet       = require('helmet'),
  request      = require('request');

module.exports = function (app) {
  app.enable('trust proxy');

  // 1. redirects http to https
  app.use(secure());

  // 2. helmet with custom CSP policy
  var cspReportUrl = '/report-csp-violation';
  app.use(helmet({
    contentSecurityPolicy: {
      // Specify directives as normal.
      directives: {
        defaultSrc: ["'self'"], // default value for unspecified directives that end in "src"
        // underscore requires unsafe-eval, google analytics needs unsafe-inline
        scriptSrc: ["'self'", "'unsafe-eval'", "'unsafe-inline'", 'code.jquery.com', 'cdnjs.cloudflare.com/', 'www.google-analytics.com'],
        //styleSrc: ["'self'"], // no inline css
        imgSrc: ["'self'", 'www.google-analytics.com'], // note that * doesn't include 'data:'
        connectSrc: ["'self'", '*.watsonplatform.net'], // ajax domains
        //fontSrc: ["'self'"], // cdn?
        objectSrc: [], // embeds (e.g. flash)
        //mediaSrc: ["'self'", '*.watsonplatform.net'], // allow watson TTS streams
        childSrc: [], // child iframes
        frameAncestors: [], // parent iframes
        formAction: ["'self'"], // where can forms submit to
        pluginTypes: [], // e.g. flash, pdf
        //sandbox: ['allow-forms', 'allow-scripts', 'allow-same-origin'], // options: allow-forms allow-same-origin allow-scripts allow-top-navigation
        reportUri: cspReportUrl
      },

      // Set to true if you only want browsers to report errors, not block them.
      // You may also set this to a function(req, res) in order to decide dynamically
      // whether to use reportOnly mode, e.g., to allow for a dynamic kill switch.
      reportOnly: false,

      // Set to true if you want to blindly set all headers: Content-Security-Policy,
      // X-WebKit-CSP, and X-Content-Security-Policy.
      setAllHeaders: false,

      // Set to true if you want to disable CSP on Android where it can be buggy.
      disableAndroid: false,

      // Set to false if you want to completely disable any user-agent sniffing.
      // This may make the headers less compatible but it will be much faster.
      // This defaults to `true`.
      browserSniff: true
    }
  }));
  // endpoint for browsers to report CSP violations to
  app.post(cspReportUrl, function(req, res) {
    console.log('Content Security Policy Violation:\n', req.body);
    res.status(204).send(); // 204 = No Content
  });


  // 3. setup cookies
  var secret = Math.random().toString(36).substring(7);
  app.use(cookieParser(secret));

  // 4. csrf
  var csrfProtection = csrf({ cookie: true });
  app.get('/', csrfProtection, function(req, res, next) {
    req._csrfToken = req.csrfToken();
    next();
  });

  // 5. rate limiting
  var limiter = rateLimit({
    windowMs: 30 * 1000, // seconds
    delayMs: 0,
    max: 6,
    message: JSON.stringify({
      error:'Too many requests, please try again in 30 seconds.',
      code: 429
    })
  });

  // 6. captcha
  var captchaKeys = {
    site: process.env.CAPTCHA_SITE || '<captcha-site>',
    secret: process.env.CAPTCHA_SECRET || '<captcha-secret>'
  };

  var checkCaptcha = function(req, res, next) {
    if (req.body && req.body.recaptcha) {
      request({
        url: 'https://www.google.com/recaptcha/api/siteverify',
        method: 'POST',
        form: {
          secret: captchaKeys.secret,
          response: req.body.recaptcha,
          remoteip: req.ip
        },
        json: true
      }, function(error, response, body) {
        if (body.success) {
          limiter.resetIp(req.ip);
          next();
        } else {
          next({
            code: 'EBADCSRFTOKEN',
            error: 'Wrong captcha'
          });
        }
      });
    } else {
      next();
    }
  };

  app.use('/api/', csrfProtection, checkCaptcha, limiter);
};
