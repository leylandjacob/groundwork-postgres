requirejs.config({
	paths: {
		'jquery' : '../node_modules/jquery/dist/jquery.min',
		'underscore' : '../node_modules/underscore/underscore-min',
		'backbone' : '../node_modules/backbone/backbone',
		'utils' : 'libs/utils',
		'bowser' : '../node_modules/bowser/src/bowser'
	},
	
	shim: {

	}

});

require([ 'app' ], function(App){
	
	App.initialize();

});