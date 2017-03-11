/**
 * @file routes/auth.js 
 * @desc Authentication routes
 *
 * @notes
 * 
 */

// required
var express = require('express');
var router = express.Router();
var passport = require('passport');
var Promise = require("bluebird");

// libs
var userLib = require('../libs/user');
var tokenLib = require('../libs/tokens');
var emailLib = require('../libs/email');
var messages = require('../config/config-messages');
var publicConfig = require('../config/config-app-public');

// models
var UserModel = require('../models/user');
var TokenModel = require('../models/token');

/**
 * @route /login
 * @method GET
 *
 * @desc login
 *
 */
router.get('/login', userLib.requireNoLogin,  function(req, res) {
	
	'use strict';
	console.log('LOGIN')
	res.render('auth/login');
	
});

/**
 * @route /login
 * @method POST
 *
 * @desc Log a user in
 *
 */
router.post('/login', function(req, res, next) {

	'use strict';
	
	passport.authenticate('local', function(error, user, info) {

		if ( error ) { res.status(400); return res.jsend.error( error ); }
		if ( info ) { res.status(400); return res.jsend.fail( info ); }
		if ( !user ) { return res.jsend.fail({message: 'We were not able to look up a valid user.'}); }

		req.login(user, function(error) {

			if (error) { res.status(400); return res.jsend.error( error ); }
			
			return res.jsend.success(user);

		});

	})(req, res, next);}
);



/**
 * @route /signup
 * @method GET
 *
 * @desc load sign up view
 *
 */
router.get('/signup', userLib.requireNoLogin, function(req, res) {
	
	'use strict';
	res.render('auth/signup');
	
});

/*
 * @route /logout
 * @method GET
 *
 * @desc logout and redirect home
 *
 */
router.get('/logout', function(req, res) {
	
	'use strict';
	req.session.destroy();
	res.redirect('/');
	
});


/**
 * @route /forgot
 * @method GET
 *
 * @desc forgot
 *
 */
router.get('/forgot', userLib.requireNoLogin, function(req, res) {
	
	'use strict';
	res.render('auth/forgot');
	
});

/**
 * @route /forgot
 * @method POST
 *
 * @desc request a reset token and email
 *
 */
router.post('/forgot', userLib.requireNoLogin, function(req, res) {
	
	'use strict';
	new UserModel({email: req.body.email}).fetch().then(function ( user ) {

		if ( !user ) { throw messages.userNotFound; }

		return user;

	}).then( function( user) {
		
		return [user, tokenLib.generatePasswordToken( user.get('id') )];
	
	}).spread(function(user, token){

		var link = (publicConfig.company.https ? 'https://' : 'http://') + publicConfig.company.domain + '/reset/' + token.get('token');

		var emailObj = {
			transmissionBody: {
				"substitution_data": {
					"link": link
				},
				"content": {
					"template_id": "password-template",
					"from": {
						"name": publicConfig.company.appName,
						"email": publicConfig.company.email.support
					}
				},
				"subject": "Password Reset",
				recipients: [
					{address: user.get('email')}
				]
			}
		};

		return emailLib.send(emailObj);

		
	}).then(function(){
		
		res.jsend.success({});
		
	}).catch(function( error ) {
		
		console.error( error );
		res.jsend.error( error );
		
	});
	
});

/**
 * @route /reset
 * @Method GET
 *
 * @desc redirect reset requests with no token
 *
 *
 */
router.get('/reset/', userLib.requireNoLogin,  function(req, res) {
	'use strict';
	req.session.alert = messages.requiredToken;
	res.redirect('/forgot');
});

/**
 * @route /reset/:token
 * @method GET
 *
 * @desc reset token
 *
 *
 */
router.get('/reset/:token', userLib.requireNoLogin,  function(req, res) {

	'use strict';
	
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

	}).catch(function ( error ) {

		console.error(error);
		req.session.alert = messages.resetError;
		res.redirect('/forgot');

	});
});

/**
 * @route /reset/:token
 * @method POST
 *
 * @desc reset the password
 *
 */
router.post('/reset/:token', userLib.requireNoLogin,  function(req, res) {

	'use strict';

	var token = req.params.token;
	var password = req.body.password;
	var passwordConfirm = req.body.password_confirm;

	if( !token ) {
		return res.jsend.fail(messages.requiredToken);
	}

	if( !password || !passwordConfirm ) {
		return res.jsend.fail( messages.requiredPassword );
	}

	if( password !== passwordConfirm ) {
		return res.jsend.fail( messages.invalidPasswordsDontMatch );
	}

	new TokenModel({ token: token }).fetch({
		withRelated: ['user']
	}).then(function( token ) {
		
		if ( !token ) { throw messages.resetTokenNotFound; }
		
		var now = new Date();

		if( token.get('expires_at') <= now ) { throw messages.resetTokenExpired; }

		var userModel = new UserModel( token.get('user') );

		userModel.set('password', password);
		
		return [token, userModel.save()];

	}).spread(function( token, user ){
		
		req.logIn( user.toJSON(), function(error) {

			if ( error ) { throw error; }

			token.set({active: false});

			return token.save();

		});
		
	}).then(function(){
		
		res.jsend.success({});
		
	}).catch( function( error ) {
		
		console.error(errro);
		res.jsend.error(error);
		
	});
});

module.exports = router;