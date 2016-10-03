/**
 * @desc Start the App
 * 
 * RUN: node r.js -o build.js
 */
({
    baseUrl: ".",
	paths: {
		requireLib: 'require',
		'config': 'empty:',
		'data': 'empty:',
		'jquery' : '../node_modules/jquery/dist/jquery.min',
		'underscore' : '../node_modules/underscore/underscore-min',
		'backbone' : '../node_modules/backbone/backbone',
		'utils' : 'libs/utils',
		'bowser' : '../node_modules/bowser/src/bowser',
		'bootstrap' : '../stylesheets/_scss/_07-vendors/bootstrap/dist/js/bootstrap.min',
	},

	shim: {
		'bootstrap' : {
			deps: ['jquery'],
			exports: 'Bootstrap'
		}
	},
	optimize: "uglify2",
	uglify2 : {
		compress : {
			drop_console : true,
		}
	},
	preserveLicenseComments: false,
	findNestedDependencies: true,
	generateSourceMaps: true,
	include: 'requireLib',
	name: "main",
	out: "main-built.js"
});