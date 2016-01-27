/**
 * @desc User Model
 * 
 *
 */
define([
  'underscore',
  'backbone',
  'models/user'

], function(_, Backbone, UserModel){

	var UsersCollection = Backbone.Collection.extend({
		
		model : UserModel,

		url: '/api/users/all',
		
		// initalize the collection
		initialize: function(options){
			
		}

	});
	
	return UsersCollection;
	
});