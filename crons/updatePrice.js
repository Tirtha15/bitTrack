var cron = require('cron');
var async = require('async');
var _ = require('underscore');
var request = require('request');
var cheerio = require('cheerio');
var nodeEnv = process.env.NODE_ENV;
var db;

var config = {
    unocoinURL: "https://www.unocoin.com/",
    zebpayURL: "https://api.zebpay.com/api/v1/ticker?currencyCode=INR"
};

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

                    return cb(null, {
                        buyPrice: buyPrice,
                        sellPrice: sellPrice,
                        spread: spread
                    });
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
            updatePrice: ['unocoin', 'zebpay', function(results, cb){
                var unoCoin = results.unocoin;
                var zebPay = results.zebpay;

                var toUpdate = {};
                toUpdate.timestamp = currentDate;

                //unocoin
                if(unoCoin.status && unoCoin.status === 'error'){
                    //send email
                } else {
                    toUpdate.unoCoin = unoCoin;
                }

                //zebpay
                if(zebPay.status && zebPay.status === 'error'){
                    //send email
                } else {
                    toUpdate.zebPay = zebPay;
                }

                console.log("toUpdate", toUpdate);

                return cb();

            }]
        }, function(err, results){
            if(err){
                //send failure email
                console.log("some err occured", err);
            }
            console.log("Updated successfull");
        });
    }


    main();
}, null, true);
