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
require('express-jsend');

/**
 *
 * TODO: Use process.env.DATABASE_URL connection string when knex fixes https://github.com/tgriesser/knex/issues/852
 */
var knex = require('knex')({
	client: 'pg',
	connection: {
		host: keys.db.host,
		user: keys.db.username,
		password: keys.db.password,
		database: keys.db.database,
		port: keys.db.port,
		ssl: true
	},
	//debug: true
});

bookshelf = require('bookshelf')(knex);

var authLib = require('./libs/auth');
var appLib = require('./libs/app');
var Utils = require('./libs/utils');


// logging
winston = require('winston');

var logFile = PRODUCTION ? 'logs/log-production.log' : 'logs/log-dev.log';

winston.add( winston.transports.File, {
    filename: logFile,
    timestamp: true,
    json: true,
    handleExceptions: true
});

// routes
var home = require('./routes/app');
var auth = require('./routes/auth');
var api_users = require('./routes/api/users');

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
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
	store: new RedisStore({
		url: keys.redis.url,
		//ttl: 7200
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
app.use('/api/users', api_users);


// add locals to all routes
app.all('*', function(req, res, next) {
	appLib.setLocals(req, res, next);
});

// routes
app.use('/', home);
app.use('/', auth);


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

        res.status(err.status || 500);
        winston.error(err.message);

        res.render('error', {
            message: err.message,
            error: err
        });

    });
}

// production error handler
// no stack traces leaked to user
app.use(function(err, req, res, next) {

    res.status(err.status || 500);
    winston.error(err.message);

    res.render('error', {
        message: err.message,
        error: {}
    });

});


module.exports = app;
