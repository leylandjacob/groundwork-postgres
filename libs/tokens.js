/**
 * File Name : libs/token.js
 * Description: Token Library
 *
 * Notes:
 *
 */

// required modules
var keys = require('../config/config-keys');
var Utils = require('../libs/utils');

// models
var TokenModel = require('../models/token');


module.exports = {

	generatePasswordToken: function(userId, callback){
		
		'use strict';
		
		var token = Utils.generateToken();
		var tomorrow = new Date();
		tomorrow.setDate(tomorrow.getDate() + 1);

		var tokenModel = new TokenModel({
			token: token,
			active: true,
			expires_at : tomorrow,
			user : userId
		});

		tokenModel.save().then(function (token) {
			 callback(null, token.toJSON());
		}).catch(function(error) {
			callback(error.message, null);
		});
	}

};