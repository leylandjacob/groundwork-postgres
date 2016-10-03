/**
 * Filename	: /config/config-keys.js
 * Description: Holds API Keys and Secrets
 *
 * Notes:
 */
module.exports = {
	
	secret : process.env.APP_SECRET ? process.env.APP_SECRET : '1234',
	token : process.env.APP_SECRET ? process.env.APP_SECRET : '1234',

	db:{
		url: process.env.DATABASE_URL ? process.env.DATABASE_URL : '',
		prefix: process.env.DATABASE_PREFIX ? process.env.DATABASE_PREFIX : '',
		host: process.env.DATABASE_NAME ? process.env.DATABASE_HOST : '',
		database: process.env.DATABASE_NAME ? process.env.DATABASE_NAME : '',
		username: process.env.DATABASE_USERNAME ? process.env.DATABASE_USERNAME : '',
		password: process.env.DATABASE_PASSWORD ? process.env.DATABASE_PASSWORD : '',
		port: process.env.DATABASE_PORT ? process.env.DATABASE_PORT : '5432'
	},

	redis: {
		url : process.env.REDIS_URL ? process.env.REDIS_URL : ''
	},
	
	intercom: {
		apiKey: "",
		appId: ""
	},

	sparkpost: {
		apiKey: '1234'
	},
 
};