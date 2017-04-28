var cron = require('cron');
var async = require('async');
var _ = require('underscore');
var request = require('request');
var cheerio = require('cheerio');
var emailService = require('./../services/emailService.js');
var nodeEnv = process.env.NODE_ENV;
var db = require('monk')('ec2-54-89-200-149.compute-1.amazonaws.com:27017/bitTrack');
var priceHistoryCol = db.get("priceHistory");

var config = {
    unocoinURL: "https://www.unocoin.com/",
    zebpayURL: "https://api.zebpay.com/api/v1/ticker?currencyCode=INR"
};

function sendAlerts(config, sourceName, doc){
    var sourceLimits = config[sourceName];

    var allKeys = Object.keys(sourceLimits);

    _.each(allKeys, function(key){
        if(doc[key]){
            if(doc[key] < sourceLimits[key].min){
                var subject = "MIN ALERT: " +key +" below Min Limit in " + sourceName + " of "+sourceLimits[key].min;
                emailService.sendEmail(subject, JSON.stringify(doc));
            }

            if(doc[key] > sourceLimits[key].max){
                var subject = "MAX ALERT: " +key +" exceeding Max Limit in " + sourceName + " of "+sourceLimits[key].max;
                emailService.sendEmail(subject, JSON.stringify(doc));
            }

        } else {
            //send error email
            var subject = key +" alert Failed for " + sourceName + " ";
            emailService.sendEmail(subject, JSON.stringify(doc));
        }
    });
}

var job = new cron.CronJob('1 * * * * * ', function () {
    var currentDate = new Date();

    function main(){
        console.log("Fetching price at: ", currentDate);

        async.auto({
            unocoin: function(cb){
                var targetUrl = config.unocoinURL;
                request(targetUrl, function(error, response, html){
                    if(error)
                      return cb(null, {
                          status: 'error',
                          code: "REQUEST_ERROR",
                          msg: 'Error in getting: ' + targetUrl
                      });
                    var $ = cheerio.load(html);

                    var buyPrice = parseFloat($('#menubarbuyprice').text().replace(",",""));
                    var sellPrice = parseFloat($('#menubarsellprice').text().replace(",", ""));
                    var spread = buyPrice - sellPrice;

                    if(!buyPrice || !sellPrice)
                      return cb(null, {
                          status: 'error',
                          code: 'HTML_PARSE_ERROR',
                          msg: 'Price cant be parsed from html at: ' + targetUrl
                      });

                    var toReturn = {
                        buyPrice: buyPrice,
                        sellPrice: sellPrice,
                        spread: spread
                    };

                    return cb(null, toReturn);
                });
            },
            zebpay: function(cb){
                var targetUrl = config.zebpayURL;
                request(targetUrl, function(error, response, data){
                    if(error)
                        return cb(null, {
                            status: 'error',
                            code: "REQUEST_ERROR",
                            msg: 'Error in getting: ' + targetUrl
                        });
                    if(!data)
                        return cb(null, {
                            status: 'error',
                            code: "API_RESPONSE_ERROR",
                            msg: 'No data in api response: ' + targetUrl
                        });
                    var responseData = JSON.parse(data);


                    var toReturn = {
                        buyPrice: responseData.buy,
                        sellPrice: responseData.sell,
                        volume: responseData.volume,
                        spread: responseData.buy - responseData.sell
                    };

                    return cb(null, toReturn);
                });
            },
            alertLimits: function(cb){
                var alertLimits = db.get('alertLimits');

                alertLimits.findOne({}, {}, function(err, limits){
                    if(err){
                        emailService.sendEmail('Error in fetching alert Limits', JSON.stringify(err));
                        return cb();
                    }

                    return cb(null, limits);
                });
            },
            updatePrice: ['unocoin', 'zebpay', function(results, cb){
                var unoCoin = results.unocoin;
                var zebPay = results.zebpay;

                var toUpdate = {};
                toUpdate.timestamp = currentDate;

                //unocoin
                if(unoCoin.status && unoCoin.status === 'error'){
                    //send email
                    console.log("error in unocoin", unoCoin);
                    emailService.sendEmail('Error in unocoin', JSON.stringify(unoCoin));
                } else {
                    toUpdate.unoCoin = unoCoin;
                }

                //zebpay
                if(zebPay.status && zebPay.status === 'error'){
                    //send email
                    console.log("error in zebPay", zebPay);
                    emailService.sendEmail('Error in zebPay', JSON.stringify(zebPay));
                } else {
                    toUpdate.zebPay = zebPay;
                }

                priceHistoryCol.insert(toUpdate, function(err, insertedDoc){
                    if(err)
                      return cb(err);
                    return cb(null, toUpdate);
                });

                return cb(null, toUpdate);

            }],
            sendAlerts: ['alertLimits', 'updatePrice', function(results, cb){
                var allDoc = results.updatePrice;
                var alertConfig = results.alertLimits;

                _.each(Object.keys(allDoc), function(key){
                    if(alertConfig && alertConfig[key]){
                        sendAlerts(alertConfig, key, allDoc[key]);
                    }
                });

                return cb();

            }]
        }, function(err, results){
            if(err){
                //send failure email
                emailService.sendEmail('Some error occured', JSON.stringify(err));
            }
            console.log("Updated successfully");
        });
    }


    main();
}, null, true);
