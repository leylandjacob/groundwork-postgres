requirejs.config({
	paths: {
		'config': 'empty:',
		'data': 'empty:',
		'jquery' : '../node_modules/jquery/dist/jquery.min',
		'underscore' : '../node_modules/underscore/underscore-min',
		'backbone' : '../node_modules/backbone/backbone',
		'text' : '../node_modules/requirejs-text/text',
		'utils' : 'libs/utils',
		'bowser' : '../node_modules/bowser/src/bowser',
		'bootstrap' : '../stylesheets/_scss/_07-vendors/bootstrap/dist/js/bootstrap.min',
		'moment' : '../node_modules/moment/moment'
	},

	shim: {
		'bootstrap' : {
			deps: ['jquery'],
			exports: 'Bootstrap'
		}
	}

});

require([ 'app' ], function(App){
	
	'use strict';
	App.initialize();

});