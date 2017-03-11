/**
 * @file libs/api.js
 * @desc API Library
 *
 * @notes
 *
 */
	
// models
var TokenModel = require('../models/token');


module.exports = {
	

	/*
	 * @desc Authenticate an API request
	 *
	 * @param {Object} req
	 * @param {Object} res
	 * @param {Function} Next
	 *
	 */
	authApiRequest: function(req, res, next) {
		
		'use strict';
		
		var token = req.query.token;
		
		if (typeof token === 'undefined' || token === '') {

			res.status(401);
			return res.jsend.fail({token: 'No token provided.'});
			
		}
		
		new TokenModel({
			token : token,
			active: true
		}).fetch().then(function( model ) {
			
			if( !model ){ res.status(404); return res.jsend.fail({token: 'No valid token found.'}); }
			
			return next();
			
		}).catch(function( error ) {

			res.status(400);
			return res.jsend.error(error);
			
		});
		
	}
	
};
