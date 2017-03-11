define([
	'jquery',
	'underscore',
	'backbone',
	'utils',
	'text!templates/pagination.html'

],	function($, _, Backbone, Utils, Template){

	'use strict';

	return Backbone.View.extend({

		// setup DOM Elements
		el : $('body'),
		$paginationView: $('#js-view-pagination'),
		paginationTemplate: _.template(Template),

		// bind Events
		events: {
			'click .trigger-jump-page' : 'jumpPage',
			'click .trigger-next-page' : 'nextPage',
			'click .trigger-previous-page' : 'previousPage',
			'click .trigger-change-order' : 'changeOrder'
			// change size
			// order by
		},

		/**
		 * initialize()
		 * @desc initialize the view
		 *
		 * @param options
		 */
		initialize: function(options){
			
			console.log('-- Pagination View --');
			
			this.parentView = options.view;
			this.template = options.template;
			this.collection = options.collection;
			this.pagination = options.pagination;

			this.listenTo(this.collection, 'sync', this.render);

			this.render();

		},

		/**
		 * @desc render the view
		 */
		render: function(){
			
			if(this.pagination.get('rowCount')){
				this.$paginationView.empty().append(this.paginationTemplate({
					pagination: this.pagination.toJSON()
				}));
			} else {
				this.$paginationView.empty();
			}
		},


		/**
		 * @desc load the next page of data
		 * @param event
		 */
		nextPage: function( event ){

			event.preventDefault();

			var _this = this;

			var $clicked = $(event.currentTarget);

			if($clicked.hasClass('disabled')){
				return;
			}
			
			this.collection.updateFetchOptions({
				data: { 
					page: Number(this.pagination.get('page')) + 1
				}
			});
			
			this.collection.fetchPage();
		},

		//previousPage: function( event ){
		//
		//	event.preventDefault();
		//
		//	var _this = this;
		//
		//	var $clicked = $(event.currentTarget);
		//
		//	if($clicked.hasClass('disabled')){
		//		return;
		//	}
		//
		//	Utils.loadView(this.$view);
		//	window.scrollTo(0, 0);
		//
		//	this.collection.page = Number(this.collection.page) - 1;
		//
		//	this.collection.fetchPage(function(response){
		//		_this.pagination = response.pagination;
		//		_this.parentView.render();
		//	});
		//
		//},

		//jumpPage: function( event ){
		//
		//	event.preventDefault();
		//
		//	var _this = this;
		//
		//	//Utils.loadView(this.view.$el);
		//	//window.scrollTo(0, 0);
		//
		//	var $clicked = $(event.currentTarget);
		//
		//	this.collection.page = Number($clicked.attr('data-page'));
		//
		//	this.collection.fetchPage(function(response){
		//		_this.pagination = response.pagination;
		//		_this.parentView.render();
		//	});
		//
		//},

		//changeOrder: function( event ){
		//
		//	event.preventDefault();
		//
		//	var _this = this;
		//
		//	var $clicked = $(event.currentTarget);
		//
		//	Utils.loadView(this.$view);
		//	window.scrollTo(0, 0);
		//
		//	this.collection.order = ($clicked.attr('data-direction') ? '-' : '') + $clicked.attr('data-field');
		//
		//	$('.btn-th .fa').removeClass('fa-rotate-180');
		//
		//	if(!$clicked.attr('data-direction')){
		//		$clicked.find('.fa').addClass('fa-rotate-180');
		//	} else {
		//		$clicked.find('.fa').removeClass('fa-rotate-180');
		//	}
		//
		//	$clicked.attr('data-direction', $clicked.attr('data-direction') ? '' : '-');
		//
		//	this.collection.fetchPage(function(response){
		//		_this.pagination = response.pagination;
		//		_this.render();
		//	});
		//
		//},

	});

});