/**
 * File Name : routes/auth.js 
 * Description: Authentication routes
 *
 * Notes: 
 * 
 */

// required
var express = require('express');
var router = express.Router();
var passport = require('passport');
var async = require('async');

// libs
var Utils = require('../libs/utils');
var userLib = require('../libs/user');
var tokenLib = require('../libs/tokens');
var emailLib = require('../libs/email');
var messages = require('../config/config-messages');
var publicConfig = require('../config/config-app-public');
require('express-jsend');

// models
var UserModel = require('../models/user');
var TokenModel = require('../models/token');

/**
 * Route: /login
 * Method: GET
 *
 * Description: login
 *
 *
 */
router.get('/login', userLib.requireNoLogin,  function(req, res) {

    res.render('auth/login');

});

/**
 * Route: /login
 * Method: POST
 *
 * Description: Log user in
 *
 *
 */
router.post('/login', function(req, res, next) {

        passport.authenticate('local', function(error, user, info) {

            if (error || info && info.message === 'Missing credentials') {
		   		return res.jerror('Bad Request', error);
            }

            if (!user) {
		   		return res.jerror('No User', info);
            }

            req.login(user, function(error) {

                if (error) {
                    return res.jerror('Bad Request', messages.loginError);
                }

                return res.jsend();

            });

        })(req, res, next);
    }
);



/**
 * Route: /signup
 * Method: GET
 *
 * Description: Signup
 *
 *
 */
router.get('/signup', userLib.requireNoLogin, function(req, res) {

    res.render('auth/signup');

});

/*
 * Route: /logout
 * Method: GET
 *
 * Description: logout and redirect home
 *
 *
 */
router.get('/logout', function(req, res) {

    req.session.destroy();
    res.redirect('/');

});


/**
 * Route: /forgot
 * Method: GET
 *
 * Description: forgot
 *
 *
 */
router.get('/forgot', userLib.requireNoLogin, function(req, res) {

    res.render('auth/forgot');

});

/**
 * Route: /forgot
 * Method: POST
 *
 * Description: request a reset token and email
 *
 *
 */
router.post('/forgot', userLib.requireNoLogin, function(req, res) {

    async.waterfall([

        // find user
        function(callback) {
            new UserModel({email: req.body.email}).fetch().then(function (user) {

                if (!user) {
                    return callback(messages.userNotFound, null);
                }

				callback(null, user.toJSON());

            }).catch(function( error ) {
				callback(error, null);
			});
        },

        // add token to user
        function(user, callback) {

            tokenLib.generatePasswordToken( user.id , function (error, token) {
                callback(error, user, token);
            });

        },

        // send email
        function(user, token, callback) {

            var link = (publicConfig.company.https ? 'https://' : 'http://') + publicConfig.company.domain + '/reset/' + token;

            var emailObj = {
                to: [{email: user.email}],
                from_email: publicConfig.company.email.support,
                from_name: publicConfig.company.appName,
                subject: 'Password Reset for ' + publicConfig.company.appName,
                html : '<a href="' + link + '">' + link + '</a>'
            };

            emailLib.send(emailObj, function(error, data) {

                if (error) {

                    callback(error, null);

                } else {

                    callback(null, data);

                }
            });

        }

    ], function( error, result )  {

        if ( error ) {

            winston.error( error );
            res.jerror('Bad Request', error);

        } else {

            res.jsend();

        }

    });

});

/**
 * Route: /reset
 * Method: GET
 *
 * Description: redirect reset requests with no token
 *
 *
 */
router.get('/reset/', userLib.requireNoLogin,  function(req, res) {
    req.session.alert = messages.requiredToken;
    res.redirect('/forgot');
});

/**
 * Route: /reset/:token
 * Method: GET
 *
 * Description: reset token
 *
 *
 */
router.get('/reset/:token', userLib.requireNoLogin,  function(req, res) {

    var tokenSubmitted = req.params.token;

    if( !tokenSubmitted ) {
        req.session.alert = messages.requiredToken;
        return res.redirect('/forgot');
    }

    new TokenModel({ token: tokenSubmitted }).fetch().then(function( token ) {

		if (!token) {

			req.session.alert = messages.resetTokenNotFound;
			res.redirect('/forgot');

		} else {

			var now = new Date();

			if( token.get('expires_at') <=  now){

				req.session.alert = messages.resetTokenExpired;
				res.redirect('/forgot');

			} else {

				res.locals.token = token.get('token');
				res.render('auth/reset');

			}
		}

    }).catch(function () {

		req.session.alert = messages.resetError;
		res.redirect('/forgot');

	});
});

/**
 * Route: /reset/:token
 * Method: POST
 *
 * Description: reset the password
 *
 *
 */
router.post('/reset/:token', userLib.requireNoLogin,  function(req, res) {

	'use strict';

    var token = req.params.token;
    var password = req.body.password;
    var passwordConfirm = req.body.password_confirm;

    if( !token ) {
        return res.jerror('Bad Request', messages.requiredToken);
    }

    if( !password || !passwordConfirm ) {
        return res.jerror('Bad Request', messages.requiredPassword);
    }

    if( password !== passwordConfirm ) {
        return res.jerror('Bad Request', messages.invalidPasswordsDontMatch);
    }

    new TokenModel({ token: token }).fetch().then(function( token ) {

         if ( !token ) {

            res.jerror('Bad Request', messages.resetTokenNotFound);

        } else {

			var now = new Date();

            if( token.get('expires_at') <= now ) {

                res.jerror('Bad Request', messages.resetTokenExpired);

            } else {

				var user = new UserModel({id : token.get('user')});
				user.fetch().then(function( user ) {

                    if ( !user ) {

                        res.jerror('Bad Request', messages.userNotFound);

                    } else {

                        user.set('password', password);

                        user.save().then( function( user ) {

                            req.logIn( user, function(error) {

                                if ( error ) {
                                    return res.jerror('Bad Request', messages.loginError);
                                }

                                token.set({active: false, used : 1});

                                token.save().then(function() {
                                    res.jsend();
                                });

                            });
                        }).catch(function( error ) {
							return res.jerror('Bad Request', messages.generalError);
						});

                    }

                }).catch( function( error ){
					return res.jerror('Bad Request', messages.resetError);
				});

            }
        }

    }).catch(function(error) {
		return res.jerror('Bad Request', messages.resetError);
	});
});

module.exports = router;	