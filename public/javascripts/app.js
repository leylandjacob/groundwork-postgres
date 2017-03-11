/**
 * @desc Initialize the App
 * 
 *
 */
define([
	'jquery',
	'underscore',
	'backbone',
	'bootstrap',
	'utils',
	'config',
	'router'
  
],	function($, _, Backbone, Bootstrap, Utils, config, Router){
	
	var initialize = function(){

		/**
		 * Append token to all ajax requests
		 */
		$.ajaxPrefilter(function (options, originalOptions, jqXHR) {
			
			if (config != null) {
				if (options.url.search("/api/") != -1) {
					options.url = options.url + '?token=' +  config.token;
				}
			}

		});

		Router.initialize();
		
	};

	return {

	initialize: initialize

	};
  
});