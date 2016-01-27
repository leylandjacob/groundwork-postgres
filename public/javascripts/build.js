/**
 * @desc Start the App
 * 
 * RUN: node r.js -o build.js
 */
({
    baseUrl: ".",
    paths: {
        'jquery' : '../node_modules/jquery/dist/jquery.min',
		'underscore' : '../node_modules/underscore/underscore-min',
		'backbone' : '../node_modules/backbone/backbone',
		'utils' : 'libs/utils',
		'bowser' : '../node_modules/bowser/src/bowser',
		'config': 'empty:'
	},
    name: "main",
    out: "main-built.js"
})