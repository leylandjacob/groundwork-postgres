define([
	'jquery',
	'underscore',
	'backbone',
	'utils',
	'models/core',
	'views/pagination'

], function($, _, Backbone, Utils, Model, PaginationView){

	'use strict';

	var modelName = null;

	return Backbone.Collection.extend({

		/**
		 * @desc set the model
		 * @param attr
		 * @param options
		 * @returns {*}
		 */
		model: function(attr, options) {
			return new Model(attr, {modelName: modelName});
		},

		/**
		 * @desc parse the response
		 *
		 * @param response
		 * @returns {Object}
		 */
		parse: function(response){
			return response.data;
		},

		url: '/api/',
		fetchOptions: {},
		fetchOptionDefaults: {
			reset: false,
			remove: false,
			data: {
				page: 1,
				pageSize: 25,
				where: {},
				orWhere: {},
				orderBy: 'created_at',
				order: 'DESC',
				searchKeys: null,
				searchTerm: null,
				withRelated: null
			}
		},

		/**
		 *
		 * @desc initialize the collection
		 * @param collection
		 * @param options
		 */
		initialize: function(collection, options){

			var _this = this;

			if( !options ){ return console.error('An options object is required.');}
			if( !options.modelName ){ return console.error('A valid options.modelName parameter is required.');}
			modelName = options.modelName;

			this.updateFetchOptions(options.fetchOptions ? options.fetchOptions : {});

			this.url = this.url + modelName + (this.fetchOptions.urlPath ? this.fetchOptions.urlPath : '/paginate');


			if(options.pagination){
				this.initPagination(options);
			}
		},

		/**
		 * @desc initialize a pagination view
		 */
		initPagination: function(options){

			this.pagination = new Model(options.pagination, {modelName: 'pagination'});
			this.updateFetchOptions({
				data:{
					page: this.pagination.get('page'),
					pageSize: this.pagination.get('pageSize')
				}
			});
			this.paginationView = new PaginationView({
				view: options.view,
				template: options.template,
				collection: this,
				pagination: this.pagination
			});
			this.pagination.on('change', function(){
				_this.updateFetchOptions({
					data:{
						page: _this.pagination.get('page'),
						pageSize: _this.pagination.get('pageSize')
					}
				});
			});
		},

		/**
		 * @desc catch all api errors that are not 200
		 */
		errorHandler: function(model, response, options){
			console.error(response.responseJSON);
			Utils.alert(response.responseJSON ? response.responseJSON : Utils.getConfig().messages.generalError);
		},

		/**
		 * @desc update fetch options
		 * @param newOptions {Object}
		 */
		updateFetchOptions: function(newOptions){
			this.fetchOptions =  $.extend(true, {}, this.fetchOptionDefaults, this.fetchOptions, newOptions);
		},

		/**
		 * @desc fetch a paginated collection
		 */
		fetchPage: function(){

			console.log('Fetching collection...');

			var _this = this;

			this.fetch({
				reset: this.fetchOptions.reset,
				remove: this.fetchOptions.remove,
				data: this.fetchOptions.data,
				success: function(collection, response){
					if(_this.pagination) {
						_this.pagination.set(response.pagination);
					}
				}
			});
		},
	});

});