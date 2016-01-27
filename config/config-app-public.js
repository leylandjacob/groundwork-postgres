/**
 * Filename	: /config/config-app-public.js
 * Description: Publicly viewable app config variables
 *
 * Notes:
 */

var message = require('./config-messages');

var date = new Date();
module.exports = {

    production : PRODUCTION,

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

	token: 'c124931805fe4af6ac35ce598b36082a',

    messages: message

};