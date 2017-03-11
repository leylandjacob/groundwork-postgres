/**
 * @file models/tokens.js
 * @desc User Model
 *
 * @notes
 *
 */

var shortid = require('shortid'),
	configKeys = require('../config/config-keys');

module.exports = bookshelf.model( 'Token', {

	tableName: configKeys.db.prefix + 'tokens',
	idAttribute: 'id',
	hasTimestamps: true,
	
	initialize: function(){
		
		'use strict';
		this.on('saving', this.beforeSave);
		this.on('creating', this.beforeCreate);
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
	}
});