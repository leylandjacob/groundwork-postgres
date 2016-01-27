define([
  'underscore',
  'backbone'
  
], function(_, Backbone){

	var UserModel = Backbone.Model.extend({
		
		urlRoot : '/api/users/',
		
		// set the model id to _id
		idAttribute: "_id",

		/**
		 * parse()
		 * @desc parse the response
		 *
		 * @param res
		 * @returns {Object}
		 */
		parse: function(res){

			return res.data;

		},

		/**
		 * initialize()
		 * @desc initialize the model
		 *
		 */
		initialize: function(){

		}
	
	});

	return UserModel;

});