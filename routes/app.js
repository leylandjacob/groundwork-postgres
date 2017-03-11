/*
 * @file routes/app.js 
 * @desc Home and App routes
 *
 * @notes
 * 
*/
 
// required modules
var express = require('express');
var router = express.Router();

/*
 * @route /
 * @method GET
 *
 * @desc load home page or load dashboard
 * 
*/
router.get('/',  function(req, res) {

	'use strict';
	
	if (req.user) { return res.render('app'); }
	
	res.render('home');
	
	
});

/*
 * @route /styles
 * @method GET
 *
 * @desc load style guide
 * 
 */
router.get('/styles',  function(req, res) {

	'use strict';
	res.render('styles');

});


module.exports = router;