define([
	'jquery',
	'underscore',
	'backbone', 
	'utils'
  
], function($, _, Backbone, Utils){
	
	'use strict';

	return Backbone.Model.extend({
		
		urlRoot : '/api/',
		
		/**
		 * @desc parse the response
		 *
		 * @param response
		 * @returns {Object}
		 */
		parse: function(response){
			return response.data;
		},


		/**
		 * @desc initialize the model
		 * @param model
		 * @param options
		 */
		initialize: function(model, options){
			
			if(  !options || !options.modelName ){return console.error('A valid modelName parameter is required.');}
			this.urlRoot = this.urlRoot + options.modelName;
			this.on('error', this.errorHandler, this);
		},

		/**
		 * @desc catch all api errors that are not 200
		 */
		errorHandler: function(model, response, options){
			console.error(response.responseJSON);
			Utils.alert(response.responseJSON ? response.responseJSON : Utils.getConfig().messages.generalError);
		}
	
	});
	
});