/**
 * @file /config/config-keys.js
 * @desc Holds API Keys and Secrets
 *
 * @notes
 */
module.exports = {
	
	secret : process.env.APP_SECRET ? process.env.APP_SECRET : '1234',
	token : process.env.APP_SECRET ? process.env.APP_SECRET : '1234',

	db:{
		url: process.env.DATABASE_URL ? process.env.DATABASE_URL : '',
		prefix: process.env.DATABASE_PREFIX ? process.env.DATABASE_PREFIX : '',
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