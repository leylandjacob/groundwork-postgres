/*
 * File Name : routes/app.js 
 * Description: Home and App routes
 *
 * Notes: 
 * 
*/
 
// required modules
var express = require('express');
var router = express.Router();

//libs
var messages = require('../config/config-messages');

/*
 * Route: /
 * Method: GET
 *
 * Description: load home page or load dashboard
 * 
 *
*/
router.get('/',  function(req, res) {

	'use strict';
	
	if (req.user) {

		res.render('app');

	} else {

		res.render('home');

	}
	
});


module.exports = router;