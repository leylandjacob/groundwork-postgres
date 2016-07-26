/**
 * File Name : /routes/api/users
 * Description: 
 *
 * Notes: 
 * 
*/

// required modules
var express = require('express');
var router = express.Router();
var winston = require('winston');
var UserLib= require('../../libs/user');
var Messages = require('../../config/config-messages');

// models
var UserModel = require('../../models/user');

/**
 * Route: /api/users/:id
 * Method: GET
 * Description: Get user by ID
 * 
 * @param id {String} 
 * @return user {Object}
 *
 */
router.get('/:id', function(req, res) {

	'use strict';

	var query = {id : req.params.id };
	
	UserModel.forge( query ).fetch().then( function( user ) {
	
		if( !user ) {
			
			winston.error('No User Found for id ' + req.params.id);
			return res.jerror('Bad Request', 'No User found');
			
		} else {

			return res.jsend( user.toJSON() );
			
		}
	}).catch( function( error ) {
		winston.error(error.message);
		return res.jerror('Bad Request', error.message);
	});
	
});

/**
 * Route: /api/users/
 * Method: POST
 * Description: 
 * 
 * @param id {String} 
 * @return user {Object}
 *
 */
router.post('/', function(req, res) {

	'use strict';
	
	var newUser = new UserModel(req.body);
	
	newUser.save().then( function( user ) {

			req.login(user, function (error) {

				if( error ) {

                    winston.error(error.message);
					return res.jerror('Bad Request', error.message);

				} else {

					return res.jsend( user.toJSON() );

				}

			});

	}).catch( function( error ) {

		winston.error(error.message);

		// email taken
		if(error.code === '23505'){

			return res.jerror('Bad Request', Messages.userEmailTaken);

		} else {

			return res.jerror(error);

		}
	});

});


/**
 * Route: /api/users/:id
 * Method: PUT
 * Description: Update a user by ID
 * 
 * @param id {String} 
 * @return user {Object}
 *
 */
router.put('/:id', function(req, res) {

	'use strict';
	
	var query = {id : req.params.id};
	
	var data = req.body;
		
	UserModel.forge( query ).save(data, { patch: true }).then( function( user ) {
		
		if ( !user ) {

			winston.error('No User Found for id ' + req.params.id);
			return res.jerror('Bad request', 'No Users found');
						
		} else {
			
			UserLib.updateIntercom(user.toJSON(), function() {
				return res.jsend(user.toJSON());
			});
			
			
		}
	}).catch(function( error ) {

		winston.error(error.message);
		return res.jerror('Bad request', 'No Users found');

	});
	
});


/**
 * Route: /api/users/
 * Method: DELETE
 * Description: 
 * 
 * @param id {String} 
 * @return user {Object}
 *
 */
router.delete('/:id', function(req, res) {

	'use strict';
	
	winston.error("We don't currently support DELETE user requests");
	res.jerror('Bad request', 'We don"t currently support user delete requests');
	
});


module.exports = router;