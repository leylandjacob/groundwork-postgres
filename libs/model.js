/**
 * @file libs/model.js
 * @desc Core Models Library
 *
 * @notes
 *
 */

module.exports = {

	/**
	 *
	 * @desc Fetch a collection of models
	 *
	 * @param modelName
	 * @param options
	 * @return {*}
	 */
	fetchCollection: function(modelName, options) {

		'use strict';

		var Model = module.exports.getModel(modelName);

		if( !Model ) {
			throw {message: 'Invalid model parameter.'};
		}

		return Model.forge().query(function(qb){

			// where
			if(options.where){
				qb.where(options.where);
			}

			// or where
			if(options.orWhere){
				qb.orWhere(options.orWhere);
			}

			// order
			if(options.orderBy && options.order){
				qb.orderBy(options.orderBy, options.order);
			} else {
				qb.orderBy('created_at', 'desc');
			}

			//search
			if(options.searchKeys && options.searchTerm){
				qb.where(function(){

					var _this = this;
					var keys = options.searchKeys.split(',');

					keys.forEach(function(key){
						_this.orWhere(key, 'ILIKE', '% '+options.searchTerm+'%');
						_this.orWhere(key, 'ILIKE', ''+options.searchTerm+'%');
					});

				});
			}
		}).fetchPage({
			page: (options.page ? options.page : 1),
			pageSize: (options.pageSize ? options.pageSize : 25),
			withRelated: (options.withRelated ? Array.isArray(options.withRelated) ? options.withRelated : options.withRelated.split(',') : [])
		});
	},

	/**
	 *
	 * @desc Fetch a single model
	 *
	 * @param modelName
	 * @param options
	 * @return {*}
	 */
	fetchModel: function(modelName, options) {

		'use strict';
		var Model = module.exports.getModel(modelName);

		if( !Model ) {
			throw { message: 'Invalid model parameter.' };
		}

		return Model.forge().query(function(qb){
			
			// where
			if(options.where){
				qb.where(options.where);
			}

			// or where
			if(options.orWhere){
				qb.where(options.orWhere);
			}
			
		}).fetch({
			withRelated: (options.withRelated ? Array.isArray(options.withRelated) ? options.withRelated : options.withRelated.split(',') : [])
		});

	},


	/**
	 * @desc return a model by name
	 *
	 * @param name
	 * @returns {*}
	 */
	getModel: function(name){
		'use strict';
		switch (name) {
			// core models
			case 'users':
				return require('../models/user');
			case 'tokens':
				return require('../models/tokens');

			// no model found
			default:
				return false;
		}
		
	}
};