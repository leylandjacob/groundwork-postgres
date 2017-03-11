/*
 * @file app.js 
 * @desc start the application
 *
 * @notes
 * 
*/

PRODUCTION = process.env.NODE_ENV === 'production';

if(process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'development') {
	require('newrelic');
}

var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var compression = require('compression');
var keys = require("./config/config-keys");
var session = require('express-session');
var passport = require('passport');
var robots = require('robots.txt');
var jsend = require('jsend');

var pg = require('pg');
pg.defaults.ssl = true;

var knex = require('knex')({
	client: 'pg',
	connection: keys.db.url
});

bookshelf = require('bookshelf')(knex);
bookshelf.plugin('registry');
bookshelf.plugin('pagination');

var publicConfig = require('./config/config-app-public');
var appLib = require('./libs/app');
var apiLib = require('./libs/api');
var authLib = require('./libs/auth');

// start the app
var app = express();

// redis 
var RedisStore = require('connect-redis')(session);

// gzip and compression
app.use(compression());

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// uncomment after placing your favicon in /public
app.use(favicon(path.join(__dirname, 'public/images/favicon/', 'favicon.ico')));
app.use(robots(__dirname + '/robots.txt'));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'), { maxAge: PRODUCTION ? 604800000 : 0 }));
app.use(session({
	//store: new RedisStore({
	//	url: keys.redis.url,
	//	logErrors: true,
	//	no_ready_check: true
	//}),
	cookie: {
		maxAge: 5259492000,
		domain: PRODUCTION ? '.example.com' : ''
	},
	secret: keys.secret,
	resave: true,
	saveUninitialized: true,
	rolling: true
	
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(jsend.middleware);

// api routes
app.all('/api/*', apiLib.authApiRequest );
app.use('/api/users', require('./routes/api/users'));
app.use('/api/', require('./routes/api/core'));


// add locals to all routes
app.all('*', appLib.setLocals, function(req, res, next) {
	'use strict';
	console.log('Next');
	next();
});

// routes
app.use('/', require('./routes/app'));
app.use('/', require('./routes/auth'));

// catch 404 and forward to error handler
app.use(function(req, res, next) {
	
	'use strict';
	var err = new Error('Not Found');
	err.status = 404;
	next(err);
	
});

// error handlers
app.use(function(err, req, res, next) {
	
	'use strict';
	res.status(err.status || 500);
	console.error(err);
	
	res.render('error', {
		message: err.message,
		error: err,
		config: publicConfig
	});

});

module.exports = app;