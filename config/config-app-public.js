/**
 * @file /config/config-app-public.js
 * @desc Publicly viewable app config variables
 *
 * @notes
 */

var message = require('./config-messages');
var keys = require('./config-keys');

var date = new Date();

module.exports = {

	production : PRODUCTION,
	token: keys.token,

	company: {
		name: 'Groundwork Postgres',
		legalName: 'Groundwork Postgres Inc.',
		appName: 'Groundwork Postgres — A groundwork project.',
		domain: 'GroundworkPostgres.com',
		https: PRODUCTION,
		meta: {
			title: 'Groundwork Postgres',
			description: 'The Groundwork Postgres',
			keywords: 'Keyword, Keyword, Keyword',
			author: 'Company Author',
			thumbnail : ''
		},
		address: {
			fullAddress : '6020 West Oaks Blvd. Suite 180 Rocklin, CA 95765',
			streetAddress: '6020 West Oaks Blvd. Suite 180',
			city: 'Rocklin',
			state: 'CA',
			zipcode: '95765',
			addressLink: 'https://maps.google.com'
		},
		phone: {
			main: '',
			support: ''
		},
		email: {
			main: 'hello@company.com',
			support: 'help@company.com'
		},
		support: {
			url: 'help.company.com'
		},
		social: {
			facebook: '',
			twitter: ''
		},
		copyright : date.getFullYear()
	},
	
	messages: message

};