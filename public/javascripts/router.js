define([

	'jquery',
	'underscore',
	'backbone',
	'utils'
	
],	function($, _, Backbone, Utils){
	
	'use strict';
	
	var AppRouter = Backbone.Router.extend({
	
		routes: {
			''				: 'home',
			'login' 		: 'auth',
			'signup' 		: 'auth',
			'reset/:token' 	: 'auth',
			'forgot' 		: 'auth'
		}
		
	});
	
	var initialize = function(){
	
		var router = new AppRouter();
		
		/**
		 * Home/App View
		 */
		router.on('route:home', function(){
			require(['views/app'], function (View) { var view = new View() ;});
		});
		
		/**
		 * Auth View
		 */
		router.on('route:auth', function(){
			require(['views/auth'], function (View) { var view = new View(); });
		});
		
		// start history
		Backbone.history.start({pushState: true});
		
		// check browser
		Utils.checkBrowser();

		// check alerts and reset
		Utils.resetAlert(5000);
		
		return router;
	
	};
	
	return initialize();
	
});

