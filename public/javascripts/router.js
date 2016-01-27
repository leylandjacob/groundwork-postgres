/**
 * @desc Client Side Router
 * 
 *
 */
define([

	'jquery',
	'underscore',
	'backbone',
	'utils'
	
],	function($, _, Backbone, Utils){
	
		var AppRouter = Backbone.Router.extend({
		
			routes: {
				
				''			: 'home',

				// auth routes
				'login' 		: 'auth',
				'signup' 		: 'auth',
				'reset/:token' 	: 'auth',
				'forgot' 		: 'auth'
					 				 				 				 
			}
		});
		
		var initialize = function(){
		
			var router = new AppRouter;

            /**
             * Home/App View
             */
			router.on('route:home', function(){
			
				require(['views/app'], function (AppView) {    
					var appView = new AppView();
				});
			
			});

            /**
             * Auth View
             */
			router.on('route:auth', function(){

				require(['views/auth'], function (AuthView) {
					var authView = new AuthView();
				});

			});
						
			// start history
			Backbone.history.start({pushState: true});
			
			// check browser
			Utils.checkBrowser();

			// check alerts and reset
			Utils.resetAlert(5000);
		
		};
		
	return {
		
		initialize : initialize
		
	};
	
});

