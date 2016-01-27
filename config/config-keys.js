/**
 * Filename	: /config/config-keys.js
 * Description: Holds API Keys and Secrets
 *
 * Notes:
 */
module.exports = {
	
	secret : process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'development' ? process.env.APP_SECRET : 'UFEqoNgHsA36tRcrxECYKRCJuLMoNLYe',
	
	db:{
		prefix: process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'development' ? process.env.DATABASE_PREFIX : '',
		host: process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'development' ? process.env.DATABASE_HOST : '',
		database: process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'development' ? process.env.DATABASE_NAME : '',
		username: process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'development' ? process.env.DATABASE_USERNAME : '',
		password: process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'development' ? process.env.DATABASE_PASSWORD : '',
		port: process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'development' ? process.env.DATABASE_PORT : '5432'

	},
	
	intercom: {
		apiKey: "",
		appId: ""
	},
	
	mandrill: {
		apiKey: process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'development'  ? process.env.MANDRILL_API_KEY : 'pX6MzCZEJMCruuoEE2J2kA'
	}
 
};