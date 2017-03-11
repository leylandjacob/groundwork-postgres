/**
 * @file libs/auth.js 
 * @desc Auth Library
 *
 * @notes 
 * 
 */

// required modules
var express = require('express');
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var keys = require('../config/config-keys');
var Messages = require('../config/config-messages');
var UserModel = require('../models/user');

/**
 * @desc Serialize the user in to the session
 */
passport.serializeUser(function(user, done) {
	'use strict';
	done(null, user.get('id'));
});

/**
 * @desc Deserialize the user in to the session
 */
passport.deserializeUser(function(id, done) {
	'use strict';
	new UserModel({ id : id }).fetch().then(function(user) {
		if(user){
			done(null, user.toJSON());
		} else {
			done(null, user);
		}
	});
});

/**
 * @desc setup Passport local authentication strategy
 */
passport.use(new LocalStrategy({ usernameField: 'email' }, 
	
	function(email, password, done) {
		
		'use strict';
		
		new UserModel({ email: email }).fetch().then(function(user) {
		
			if (!user) { throw 'userNotFound'; }
			return user;
			
		}).then(function(user){
			
			// compare the passwords
			user.comparePassword(password, function(error, isMatch) {

				if (error) { throw error;}
				if (!isMatch) {throw 'passwordIncorrect'; }
				return user;
				
			});
			
		}).then(function(user){
			
			var now = new Date();
			return user.save({ last_login_at : now });
			
		}).then(function(user){
			
			return done(null, user);
			
		}).catch(function(error) {
			
			if (error === 'userNotFound') { return done(null, false, Messages.userNotFound); }
			if (error === 'passwordIncorrect') { return done(null, false, Messages.passwordIncorrect); }
			console.error(error);
			return done(error);
			
		});
	}
));