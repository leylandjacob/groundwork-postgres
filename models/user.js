/*
 * @file models/users.js 
 * @desc User Model
 *
 * @notes
 * 
 */

var bcrypt = require('bcrypt'),
	SALT_WORK_FACTOR = 10,
	shortid = require('shortid'),
	configKeys = require('../config/config-keys');

module.exports = bookshelf.model( 'User', {

	tableName: configKeys.db.prefix + 'users',
	idAttribute: 'id',
	hasTimestamps: true,
	

	initialize: function() {
		
		'use strict';
		this.on('creating', this.beforeCreate);
		this.on('saving', this.beforeSave);
		
	},

	/**
	 *
	 * @desc action to run before creating
	 *
	 */
	beforeCreate: function() {
		'use strict';
		this.set({id : shortid.generate()});
	},
	
	/**
	 * 
	 * @desc action to run before saving
	 * 
	 */
	beforeSave: function() {
		
		'use strict';
		
		if(this.hasChanged('password')) {
			var salt = bcrypt.genSaltSync(SALT_WORK_FACTOR);
			var hash = bcrypt.hashSync(this.get('password'), salt);
			this.set('password', hash);
		}
	},

	/**
	 *
	 * @desc compare candidate password to saved password
	 * 
	 * @param candidatePassword
	 * @param callback
	 */
	comparePassword: function(candidatePassword, callback) {
		
		'use strict';
		bcrypt.compare(candidatePassword, this.get('password'), callback);
		
	}
});