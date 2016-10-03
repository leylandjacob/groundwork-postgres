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
	'models/user'

],	function($, _, Backbone, Utils, UserModel){

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
		 * initialize()
		 * @desc intialize the view
		 *
		 *
		 */
		initialize: function(){

		},

		/**
		 * render()
		 * @desc Render the view
		 *
		 *
		 */
		render: function(){

		},

		/**
		 * signup()
		 *
		 *
		 * @param event
		 */
		signup: function(event) {

			event.preventDefault();
			
			var $button = $(event.currentTarget);

			var $email = $('input[name="email"]');
			var $password = $('input[name="password"]');
			var messages = Utils.getConfig().messages;
			
			var email = $email.val().toLowerCase();
			var password = $password.val();

			// email required
			if(!email){
				Utils.alert( messages.requiredEmail );
				$email.focus()
				return;
			}

			// valid email required
			if(!Utils.validateEmail(email)){
				Utils.alert( messages.invalidEmail );
				$email.focus();
				return;
			}

			// valid password strength
			if( !Utils.validatePassword( password ) ){
				$password.focus();
				return;
			}

			this.user = new UserModel();
			
			Utils.buttonLoading($button);

			this.user.save( { email : email, password: password } , {
				success: function(model, response, options) {

					Utils.buttonReset($button);
					
					if(response.status === 'error'){

						Utils.alert(response.message);
						return;
					}

					window.location = "/";

				}
			});
		},

		/**
		 * login()
		 *
		 *
		 * @param event
		 */
		login: function(event) {

			event.preventDefault();

			var $button = $(event.currentTarget);

			var form = $('#login');

			var redirect = form.attr('data-redirect') ? form.attr('data-redirect') : '/';

			var $email = $('input[name="email"]');
			var $password = $('input[name="password"]');
			var messages = Utils.getConfig().messages;

			var email = $email.val().toLowerCase();
			var password = $password.val();

			// email required
			if(!email){
				Utils.alert( messages.requiredEmail );
				$email.focus();
				return;
			}

			// password required
			if(!password){
				Utils.alert( messages.requiredPassword );
				$password.focus();
				return;
			}

			Utils.buttonLoading($button);
			
			$.post(form.attr('action'), form.serialize(), function(response) {
				
				Utils.buttonReset($button);
				
				if(response.status === 'error') {
					Utils.alert(response.message);
				} else {
					window.location = redirect;
				}

			}, 'json');
			
			return false;
			
		},

		/**
		 * 
		 * requestReset
		 * 
		 * @param event
		 * @returns {boolean}
		 */
		requestReset: function(event) {

			event.preventDefault();

			var $button = $(event.currentTarget);

			var form = $('#request-reset');

			var email = $('input[name="email"]').val();

			var messages = Utils.getConfig().messages;

			// email required
			if(!email){
				Utils.alert(messages.requiredEmail);
				return;
			}

			if(!Utils.validateEmail(email)){
				Utils.alert(messages.invalidEmail);
				return;
			}

			Utils.buttonLoading($button);

			$.post(form.attr('action'), form.serialize(), function(response) {

				Utils.buttonReset($button);
				
				if(response.status === 'error') {

					Utils.alert(response.message);

				} else {

					Utils.alert(messages.resetSuccess);

				}

			}, 'json');
			
			return false;

		},

		/**
		 *
		 * submitReset
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

				Utils.buttonReset($button);
				
				if(response.status === 'error') {

					Utils.alert(response.message);

				} else {

					window.location = "/";

				}

			}, 'json');
			
			return false;

		},


	});

});