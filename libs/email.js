/**
 * @file libs/email.js
 * @desc Email Library
 *
 * @notes
 *
 */

// required modules
var keys = require('../config/config-keys');
var Promise = require("bluebird");

// sparkpost
var SparkPost = require('sparkpost');
var sparkpostClient = new SparkPost(keys.sparkpost.apiKey);

module.exports = {

	/**
	 * @desc sends an email template
	 *
	 * @param {Object} emailObj
	 * @return {*}
	 */
	send: function(emailObj) {
		
		'use strict';
		return new Promise(function (resolve, reject) {
			sparkpostClient.transmissions.send(emailObj, function(error, res) {
				if (error) { reject( error ); }
				resolve(res);
			});
		});
		
	}

};