/**
 * File Name : libs/email.js 
 * Description: Email Library
 *
 * Notes:
 * 
 */

// required modules
var keys = require('../config/config-keys');


// set mandril key
var mandrill = require('mandrill-api/mandrill');
var mandrill_client = new mandrill.Mandrill(keys.mandrill.apiKey);


module.exports = {
	
	/**
	 * send_template() sends an email template
	 * 
	 * @param {Object} emailObj
	 * @param {String} tempName
	 * @param {String} content
	 * @param {Function} callback
	 */
	sendTemplate: function(emailObj, tempName, content, callback) {

		mandrill_client.messages.sendTemplate({ 
			"template_name": tempName,
			"template_content": content,
			message: emailObj
		}, function(result) {
			callback(null, result);
		}, function (error) {
			callback(error, null);
		});

	},

	/**
	 * send_template() sends an email template
	 *
	 * @param {Object} emailObj
	 * @param {Function} callback
	 */
	send: function(emailObj, callback) {

		mandrill_client.messages.send({message: emailObj}, function(result) {
			callback(null, result);
		}, function (error) {
			callback(error, null);
		});

	}
	
};