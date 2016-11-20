/*
 * File Name : app.js 
 * Description: Bootstraps the application and sets all routes
 *
 * Notes: 
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
var authLib = require('./libs/auth');
var Utils = require('./libs/utils');


// logging
var winston = require('winston');

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
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
	store: new RedisStore({
		url: keys.redis.url,
		logErrors: true,
		no_ready_check: true
	}),
	secret: keys.secret,
	resave: true,
	saveUninitialized: true,
	rolling: true
	
}));
app.use(passport.initialize());
app.use(passport.session());

// api routes
app.all('/api/*', Utils.authApiRequest );
app.use('/api/users', require('./routes/api/users'));


// add locals to all routes
app.all('*', function(req, res, next) {
	appLib.setLocals(req, res, next);
});

// routes
app.use('/', require('./routes/app'));
app.use('/', require('./routes/auth'));


// catch 404 and forward to error handler
app.use(function(req, res, next) {

    var err = new Error('Not Found');
    err.status = 404;
    next(err);

});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
	
    app.use(function(err, req, res, next) {

		'use strict';
		
        res.status(err.status || 500);
        winston.error(err.message);

        res.render('error', {
            message: err.message,
            error: err,
			config: publicConfig
        });

    });
}

// production error handler
// no stack traces leaked to user
app.use(function(err, req, res, next) {
	
	'use strict';
    res.status(err.status || 500);
    winston.error(err.message);

    res.render('error', {
        message: err.message,
        error: {},
		config: publicConfig
    });

});

module.exports = app;
