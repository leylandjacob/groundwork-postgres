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
	
	'use strict';
	
	return Backbone.Collection.extend({
		
		model : UserModel,

		url: '/api/users/all',
		
		// initialize the collection
		initialize: function(options){
			
		}

	});
	
});