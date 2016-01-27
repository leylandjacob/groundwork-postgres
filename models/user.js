/**
 * File Name : models/users.js 
 * Description: User Model
 *
 * Notes: 
 * 
 */

var bcrypt = require('bcrypt'),
	SALT_WORK_FACTOR = 10,
	shortid = require('shortid'),
	configKeys = require('../config/config-keys');

var User = bookshelf.Model.extend({

	tableName: configKeys.db.prefix + 'users',
	idAttribute: 'id',
	hasTimestamps: true,
	

	initialize: function() {
		
		'use strict';
		
		this.on('saving', this.beforeSave);
		
	},

	beforeSave: function() {

		'use strict';

		if(this.isNew()){
			this.set({id : shortid.generate()});
		}

		if(this.hasChanged('password')) {
			var salt = bcrypt.genSaltSync(SALT_WORK_FACTOR);
			var hash = bcrypt.hashSync(this.get('password'), salt);
			this.set('password', hash);
		}
	},

	comparePassword: function(candidatePassword, callback) {

		bcrypt.compare(candidatePassword, this.get('password'), function (error, isMatch) {

			if (error) {

				callback(error);

			} else {

				callback(null, isMatch);

			}
		});
	}
});

module.exports = User;