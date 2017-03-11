/**
 * @file libs/app.js 
 * @desc App Library
 *
 * @notes
 * 
 */

// required modules
var keys = require('../config/config-keys');
var publicConfig = require("../config/config-app-public");
var _ = require('underscore');
var _string = require('underscore.string');
var moment = require('moment');

module.exports = {
	
	/**
	 *
	 * @desc set local variables
	 *
	 * @param req
	 * @param res
	 * @param next
	 */
	setLocals: function(req, res, next) {
		
		'use strict';
		
		res.locals.data = {};
		res.locals.config = publicConfig;
		res.locals._ = _;
		res.locals._string = _string;
		res.locals.moment = moment;
		
		if (req.user) {
			res.locals.user = req.user;
			res.locals.data.user = req.user;
		}
		
		if(req.session && req.session.alert){
			res.locals.alert = req.session.alert;
			delete req.session.alert;
		}
		
		next();
		
	}
};