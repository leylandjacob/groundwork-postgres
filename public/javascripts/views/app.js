/**
 * @desc App View
 * 
 *
 */
define([

	'jquery',
	'underscore',
	'backbone',
	'utils',
	'models/user'
	
],	function($, _, Backbone, Utils, UserModel){
	
	'use strict';
	
	return Backbone.View.extend({
		
		// setup DOM Elements
		el : $('body'),
		
		// bind Events
		events: {

		},

		/**
		 * initialize()
		 * @desc initialize the view
		 *
		 * @param options
		 */
		initialize: function(options){

		},
		
		/**
		 * render()
		 * @desc Render the view
		 * 
		 * 
		 */			
		render: function(){
			
			// No render
			
		}
				
	});
						
});