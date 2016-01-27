/**
 * File Name : libs/app.js 
 * Description: App Library
 *
 * Notes:
 * 
 */

// required modules
var keys = require('../config/config-keys');
var publicConfig = require("../config/config-app-public");

module.exports = {

	/**
	 * setLocals()
	 *
	 * Description: set local variables
	 *
	 *
	 * @param req
	 * @param res
	 * @param next
	 */
	setLocals: function(req, res, next) {

		res.locals.data = {};
		res.locals.config = publicConfig;

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