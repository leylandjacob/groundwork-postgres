/**
* @file libs/utils.js
* @desc Utils Library
*
* @notes
*
*/

// required
var crypto = require("crypto");

module.exports = {

	/*
	* @desc generate a token
	*
	* @param {Number} length
	* @return {String}
	*
	*/
	generateToken: function(length){
		'use strict';
		return crypto.randomBytes(16).toString('hex');
	},

	
	/*
	* @desc create a GUID
	*
	* @return {String}
	*
	*/
	guid: function() {
		'use strict';
		return this.s4() + this.s4() + '-' + this.s4() + '-' + this.s4() + '-' +
		this.s4() + '-' + this.s4() + this.s4() + this.s4();
	},


	/*
	* @desc ???
	*
	* @return {String}
	*
	*/
	s4: function() {
		'use strict';
		return Math.floor((1 + Math.random()) * 0x10000)
		.toString(16)
		.substring(1);
	},


	/*
	* @desc get a file extension
	*
	* @return {String}
	*
	*/
	getFileExt: function(filename) {
		'use strict';
		return filename.split('.').pop();
	},


	/*
	* @desc generate a unique filename
	*
	* @param {String} fileName
	* @return {String}
	*
	*/
	getUniqueFileName: function(fileName) {
		'use strict';
		return this.guid() + '.' + this.getFileExt(fileName);
	},

	
	/*
	* @desc ???
	*
	* @param {?} value
	* @return {String}
	*
	*/
	getHash: function(value) {
		'use strict';
		return crypto.createHash("md5").update(value).digest("hex");
	}

};
