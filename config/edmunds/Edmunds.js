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

  var fs = require('fs');
  var https = require("https");
  var log4js = require('log4js');
  
  var _ = require("underscore");
  _.templateSettings = {
      interpolate: /\{\{(.+?)\}\}/g
    };
  
  var EDMUNDS_BASE_URL = 'https://api.edmunds.com';
  var API_KEY = process.env.EDMUNDS_API_KEY;

  var YEAR = 2016;
  var FILE_TEMPLATE= './config/edmunds/problem.template.json';
  
  //Get a list of all vehicle makes (new, used and future) and their models.
  var LIST_MAKE_MODEL = _.template('/api/vehicle/v2/makes?state=new&year={{YEAR}}&view=full&fmt=json&api_key={{API_KEY}}');
  
  var LIST_STYLES= _.template('/api/vehicle/v2/{{MAKE}}/{{MODEL}}/{{YEAR}}/styles?view=full&fmt=json&api_key={{API_KEY}}')
  
  //Get vehicle ratings and reviews by providing vehicle make/model/year data
  var MAKE_MODEL_RATING = _.template("/api/vehiclereviews/v2/{{MAKE}}/{{MODEL}}/{{YEAR}}?sortby=thumbsUp%3AASC&pagenum=1&pagesize=10&fmt=json&api_key={{API_KEY}}");
  
  var TIME_BETWEEN_REQ_MS = 500;

  /***********logging**********/
  log4js.configure({
    appenders: [
      { type: 'console' },
      { "type": "dateFile",
        "filename": "import.log",
        "pattern": "-yyyy-MM-dd",
        "alwaysIncludePattern": false 
      }
    ]
  });
  var logger = log4js.getLogger();
  function log(m){
    logger.debug(m);
  }
  
  exports.mapEdmunds = function(data, callback){
    function transformOptions(data){
      var ops = [];
      var ids ={};
      log('Mapping Car Styles to problem options');
      var opNameTemplate = _.template("{{make}} {{model}}");
      data.forEach(function(make){
        make.models.forEach(function(model){
          var styles = model.years[0].styles;
          styles && styles.forEach(function(style){
            if(ids[style.id]){
              log('skiping: duplicate id-'+style.id);
              return;
            }
            ids[style.id] = true;
            ops.push({
              key: style.id,
              name: opNameTemplate({make:make.name, model:model.name}), 
              description: style.name, 
              values: {
//                EPAClass: style.categories && style.categories.EPAClass,
                price: style.price.baseMSRP,
//                engineType: style.engine && style.engine.type,
                engineSize: style.engine && style.engine.size,
                power: Number(style.engine && style.engine.horsepower),
//                transmission: style.transmission && style.transmission.transmissionType,
//                MPGCity: Number(style.MPG && style.MPG.city),
//                MPGHighway: Number(style.MPG && style.MPG.highway),
                MPGCombined: Math.round(style.MPG && (style.MPG.highway*0.45 + style.MPG.city*.55)),
//                drivenWheels: style.drivenWheels,
//                numOfDoors: Number(style.numOfDoors),
                averageRating: Number(style.rating && style.rating.averageRating),
                reviewsCount: Number(style.rating && style.rating.reviewsCount)
//                safety: Number(style.safety && style.safety.nhtsa && style.safety.nhtsa.overall)
              }
              //,app_data: style
            });
          });
        });
      });
      log('Mapped '+ops.length+' options');
      return ops;
    }
    fs.readFile(FILE_TEMPLATE, function(err, buff){
      if(err) {
        throw err;
      }
      var problem = JSON.parse(buff);
      problem.options = transformOptions(data);
      callback(problem);
    });
  };
  
  //import all new Cars data from Edmunds API
  exports.importEdmunds = function(callback, errCallback){
    var queue = [];
    var result;
    var reqSentCount = 0;
    var reqRecievedCount = 0;
    //var totalTasks = 0;
    var ignoreResponses = false;
    log("\n\nStart to import data.")
    var interval = setInterval(function(){
      var task = queue.shift();
//      log("remains:" + queue.length+ ":\t" + totalTasks);
      task && task();
    }, TIME_BETWEEN_REQ_MS);
    
    function done(){
      clearInterval(interval);
    //ensure that last request were responded
      var _interval = setInterval(function(){
        if(reqRecievedCount===reqSentCount){
          log("Import done.")
          log("number of requests: " + reqSentCount);
          callback(result);
          clearInterval(_interval);
        }
      }, 100);
    }
    function get(path, callback){
      reqSentCount ++;
      var url = EDMUNDS_BASE_URL + path;
      https.get(url, function(res){
        reqRecievedCount++;
        log(reqRecievedCount + "\t"+ res.statusCode + "\t" + url);
        var output = '';
        res.on('data', function(chunk) {
          output += chunk;
        });
        res.on('end', function() {
          if(ignoreResponses){
            return;
          }
          if (res.statusCode === 404) {//not found
            log(output);
            callback(undefined);
          }
          else if(res.statusCode===200){//ok
            callback(JSON.parse(output));
          }else{//errors
            reqErrFn(output);
          }
        });
      }).on('error', function(err){
        reqRecievedCount++;
        log(err);
        log(url);
        reqErrFn(err);
      });
    }
    function push(task){
      //totalTasks++;
      queue.push(task);
    }
    function reqErrFn(errMsg){
      ignoreResponses = true;
      log("Error occurred: " + errMsg);
      log("number of requests: " + reqSentCount);
      queue =[];
      clearInterval(interval);
      errCallback(errMsg);
    }
    push(function(){
      get(LIST_MAKE_MODEL({API_KEY: API_KEY, YEAR: YEAR}), function(makesModels){
        if(!makesModels){
          return reqErrFn('Error obtaining car models');
        }
        result = makesModels.makes;
        result.forEach(function(make){
          make.models.forEach(function(model){
            push(function(){
              get(LIST_STYLES( {API_KEY: API_KEY, YEAR: YEAR, MAKE:make.niceName, MODEL:model.niceName}), function(modelStyles){
                if(modelStyles && modelStyles.styles.length){
                  var styles = [modelStyles.styles[0]]; //takes only the first style
                  delete styles[0].colors;//TMI
                  model.years[0].styles = styles;
                  push(function(){
                    get(MAKE_MODEL_RATING({API_KEY: API_KEY, YEAR: YEAR, MAKE:make.niceName, MODEL:model.niceName}), function(rating){
                      styles[0].rating = rating;
                      if(rating) {
                        delete rating.reviews;//TMI
                      }
                      if(queue.length===0){
                        done();
                      }
                    });
                  });
                }else{
                  log("No styles for :" + make.niceName + "\t" +model.niceName );
                  if(queue.length===0){
                    done();
                  }
                }
              });
            });
          });
        });
      });
    });
  };
