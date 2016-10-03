/**
 * File Name : libs/email.js
 * Description: Email Library
 *
 * Notes:
 *
 */

// required modules
var keys = require('../config/config-keys');

// sparkpost
var SparkPost = require('sparkpost');
var sparkpostClient = new SparkPost(keys.sparkpost.apiKey);

module.exports = {

	/**
	 * send() sends an email template
	 *
	 * @param {Object} emailObj
	 * @param {Function} callback
	 */
	send: function(emailObj, callback) {

		'use strict';

		sparkpostClient.transmissions.send(emailObj, function(error, res) {
			if (error) {
				winston.log(error);
				callback(error, null);
			} else {
				callback(null, res);
			}
		});

	}

};