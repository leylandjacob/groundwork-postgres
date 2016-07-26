/**
 * File Name : libs/auth.js 
 * Description: Auth Library
 *
 * Notes: 
 * 
 */
var express = require('express');
var passport = require('passport');
var winston = require('winston');
var LocalStrategy = require('passport-local').Strategy;
var keys = require('../config/config-keys');
var messages = require('../config/config-messages');
var UserModel = require('../models/user');

/**
 * Serialize the user in to the session
 */
passport.serializeUser(function(user, done) {
	'use strict';
	done(null, user.get('id'));
});

/**
 * Deserialize the user in to the session
 */
passport.deserializeUser(function(id, done) {
	'use strict';
	new UserModel({ id : id }).fetch().then(function(user) {
		if(user){
			user.toJSON();
		}
		done(null, user);
	});
});

/**
 *
 * Setup the Passport local authentication.
 *
 *
 */
passport.use(new LocalStrategy({
        usernameField: 'email'
    },
    function(email, password, done) {

		'use strict';

        new UserModel({ email: email }).fetch().then(function(user) {

            if (!user) {
                return done(null, false, messages.userNotFound);
            }

            // compare the passwords
            user.comparePassword(password, function(error, isMatch) {

                if (error) {
                    winston.error(error.message ? error.message : 'Error comparing passwords.');
                    return done(messages.loginError);
                }

                if(!isMatch) {
                    return done(null, false, messages.passwordIncorrect);
                }

				var now = new Date();

                user.save({ last_login_at : now }).then(function(user){
                    return done(null, user);
                });

            });
        }).catch(function(error) {
                winston.error(error.message);
                return done(messages.loginError);
        });
    }
));