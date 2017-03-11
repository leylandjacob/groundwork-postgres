/**
 * @desc Auth View
 *
 *
 */
define([
	'jquery',
	'underscore',
	'backbone',
	'utils',
	'models/core',
	'collections/core'

],	function($, _, Backbone, Utils, Model, Collection){

	'use strict';
	
	return Backbone.View.extend({

		// setup DOM Elements
		el : $('body'),

		// bind Events
		events: {
			'click .trigger-signup' : 'signup',
			'click .trigger-login' : 'login',
			'click .trigger-request-reset' : 'requestReset',
			'click .trigger-submit-reset' : 'submitReset'
		},

		/**
		 * @desc initialize the view
		 *
		 */
		initialize: function(){
			console.log('-- Auth View --');
			this.messages = Utils.getConfig().messages;
		},

		/**
		 * @desc Render the view
		 *
		 */
		render: function(){},

		/**
		 * @desc handle sign up
		 *
		 * @param event
		 */
		signup: function(event) {

			event.preventDefault();
			
			var $button = $(event.currentTarget);

			var $form = $('#signup');
			var redirect = $form.attr('data-redirect');
			var $email = $('input[name="email"]');
			var $password = $('input[name="password"]');
			
			var email = $email.val().toLowerCase();
			var password = $password.val();

			// email required
			if(!email){
				Utils.alert( this.messages.requiredEmail );
				$email.focus();
				return;
			}

			// valid email required
			if(!Utils.validateEmail(email)){
				Utils.alert( this.messages.invalidEmail );
				$email.focus();
				return;
			}

			// valid password strength
			if( !Utils.validatePassword( password ) ){
				$password.focus();
				return;
			}
			
			Utils.buttonLoading($button);

			new Model({ email : email,  password: password }, { 
				modelName: 'users'
			}).save().success(function(){
				window.location = redirect;
			}).fail(function(){
				console.log('FAIL')
				Utils.buttonReset($button);
			});
		},

		/**
		 * @desc handle login
		 *
		 * @param event
		 */
		login: function(event) {

			event.preventDefault();

			var $button = $(event.currentTarget);

			var form = $('#login');

			var redirect = form.attr('data-redirect');
			var $email = $('input[name="email"]');
			var $password = $('input[name="password"]');

			var email = $email.val().toLowerCase();
			var password = $password.val();

			// email required
			if(!email){
				Utils.alert( this.messages.requiredEmail );
				$email.focus();
				return;
			}

			// password required
			if(!password){
				Utils.alert( this.messages.requiredPassword );
				$password.focus();
				return;
			}

			Utils.buttonLoading($button);
			
			$.post(form.attr('action'), form.serialize()).success(function(){
				window.location = redirect;
			}).fail(function(response){
				Utils.alert(response);
				Utils.buttonReset($button);
			});
			
			return false;
			
		},

		/**
		 * 
		 * @desc request a password reset link
		 * 
		 * @param event
		 * @returns {boolean}
		 */
		requestReset: function(event) {
			
			var _this = this;

			event.preventDefault();

			var $button = $(event.currentTarget);

			var form = $('#request-reset');

			var email = $('input[name="email"]').val();

			// email required
			if(!email){
				Utils.alert( this.messages.requiredEmail );
				return;
			}

			// validate email
			if(!Utils.validateEmail(email)){
				Utils.alert( this.messages.invalidEmail );
				return;
			}

			Utils.buttonLoading($button);

			$.post(form.attr('action'), form.serialize(), function(response) {

				Utils.buttonReset($button);
				
				if(response.status !== 'success') {
					Utils.alert(response);
					return;
				} 

				Utils.alert(_this.messages.resetSuccess);

			}, 'json');
			
			return false;

		},

		/**
		 *
		 * @desc submit a password reset
		 * 
		 * @param event
		 * @returns {boolean}
		 */
		submitReset: function(event) {

			event.preventDefault();

			var $button = $(event.currentTarget);

			var form = $('#submit-reset');
			var password = $('input[name="password"]').val();
			var passwordConfirm = $('input[name="password_confirm"]').val();

			if( !Utils.validatePassword(password, passwordConfirm) ){
				return;
			}

			Utils.buttonLoading($button);

			$.post(form.attr('action'), form.serialize(), function(response) {
				
				if(response.status !== 'success') {
					Utils.buttonReset($button);
					Utils.alert(response);
					return;
				}

				window.location = "/";

			}, 'json');
			
			return false;

		},


	});

});