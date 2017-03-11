/**
 * @file /routes/api/users
 * @desc 
 *
 * @notes
 * 
*/

// required modules
var express = require('express');
var router = express.Router();

// models
var UserModel = require('../../models/user');

/**
 * @route /api/users/
 * @method POST
 * @desc create a new user and log them in 
 * 
 * @param id {String} 
 * @return user {Object}
 *
 */
router.post('/', function(req, res) {

	'use strict';
	
	//TODO: validation before saving
	
	var newUser = new UserModel(req.body);
	
	newUser.save().then( function( user ) {

		req.login(user, function (error) {

			if (error) { throw error; }

			return res.jsend.success(user.toJSON());
			
		});

	}).catch( function( error ) {
		
		console.error(error);
		// email taken
		res.status(400);
		if(error.code === '23505'){
			res.jsend.fail({email : 'This email is already in use.'});
		} else {
			res.jsend.error(error);
		}
		
	});

});

module.exports = router;