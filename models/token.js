/**
 * File Name : models/tokens.js
 * Description: Token Model
 *
 * Notes:
 *
 */

var shortid = require('shortid'),
	configKeys = require('../config/config-keys');

var Token = bookshelf.Model.extend({

	tableName: configKeys.db.prefix + 'tokens',
	idAttribute: 'id',
	hasTimestamps: true,
	
	initialize: function(){

		'use strict';

		this.on('saving', this.beforeSave);

	},

	/**
	 *
	 * beforeSave
	 *
	 */
	beforeSave: function() {

		'use strict';

		// sets the ID of a new model
		if(this.isNew()){
			this.set({id : shortid.generate()});
		}

	}
});

module.exports = Token;