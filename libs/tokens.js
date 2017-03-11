/**
 * @file libs/token.js
 * @desc Token Library
 *
 * @notes
 *
 */

// required modules
var Utils = require('../libs/utils');

// models
var TokenModel = require('../models/token');

module.exports = {

	/**
	 * 
	 * @desc generate a password token
	 * 
	 * @param userId
	 * @returns {*}
	 */
	generatePasswordToken: function(userId){
		
		'use strict';
		
		var token = Utils.generateToken();
		var tomorrow = new Date();
		tomorrow.setDate(tomorrow.getDate() + 1);

		return new TokenModel({
			token: token,
			active: true,
			expires_at : tomorrow,
			user : userId
		}).save();
		
	}

};