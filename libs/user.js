/**
 * File Name : libs/users.js
 * Description: User Library
 *
 * Notes:
 * 
 */

// required modules
var keys = require('../config/config-keys');
var Intercom = require('intercom.io');

var UserModel = require('../models/user');

var intercom_settings = {
  apiKey: keys.intercom.apiKey,
  appId: keys.intercom.appId
};

module.exports = {

	/**
	 * requireLogin()
	 *
     * @desc if !user redirect
     *
	 * @param req
	 * @param res
	 * @param next
	 */
	requireLogin: function(req, res, next) {

		'use strict';
		
		if(!req.user){
			return res.redirect('/');
		}
		next();
	},

	/**
	 * requireNoLogin()
     *
     * @desc if user redirect
	 *
	 * @param req
	 * @param res
	 * @param next
	 */
	requireNoLogin: function(req, res, next) {
		
		'use strict';
		
		if(req.user){
			return res.redirect('/');
		}
		next();
	},

	/**
	 * updateIntercom() 
	 * 
	 *
	 * @param {Object} user
	 * @param {Function} callback
	 *
	 */
	updateIntercom: function(user, callback){

		'use strict';
		
		var intercom = new Intercom(intercom_settings);
	
		intercom.updateUser({
			"user_id" : user._id,
			"email" : user.email,
			"name" : user.username,
			"custom_data": {
				"active": user.active
			}  
	
		}, function(error, response) {
		
			callback(error, response);
		
		});	
	}
};