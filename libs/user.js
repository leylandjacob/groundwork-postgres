/**
 * @file libs/users.js
 * @desc User Library
 *
 * @notes
 * 
 */

// required modules

module.exports = {

	/**
	 *
     * @desc if user continue
     *
	 * @param req
	 * @param res
	 * @param next
	 */
	requireLogin: function(req, res, next) {

		'use strict';
		if(req.user){ return next();}
		return res.redirect('/');
		
	},

	/**
	 *
	 * @desc if !user continue
	 *
	 * @param req
	 * @param res
	 * @param next
	 */
	requireNoLogin: function(req, res, next) {
		
		'use strict';
		if(!req.user){ return next(); }
		return res.redirect('/');
	}
	
};