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
	
	
		var AppView = Backbone.View.extend({
			
			// setup DOM Elements
			el : $('body'),
			
			// bind Events
			events: {

			},

			/**
			 * initialize()
             * @desc intialize the view
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
				
	return AppView;
				
});