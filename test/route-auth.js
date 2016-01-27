/**
 * File Name : test/email.js
 * Tests For: /libs/email.js
 * Description: email tests
 *
 * Notes:
 *
 */
var express = require('express');
var app = require('../app');
var expect = require("chai").expect;
var request = require('supertest');
var UserModel = require('../models/user');

describe("RouteAuth", function(){

    describe("GET /login", function(){

        it("should render login page", function(done){

            request(app)
                .get('/login')
                .expect(200, done);
        });

    });

	describe("POST /login", function(){

		var newUser = new UserModel({email: 'abc@example.com', password: 'Abc123!'});

		newUser.save();

		it("should return 400 Bad Request with no credentials", function(done){

			request(app)
				.post('/login')
				.expect(200)
				.expect(function(res){
					delete res.body.message;
				})
				.expect({status: 'error', code: 'Bad Request'})
				.end(function(error, response){
					done(error);
				});

		});

		it("should return 404 No User for unknown credentials", function(done){

			request(app)
				.post('/login')
				.send({email: '123@example.com', password: 'Abc123!'})
				.expect(200)
				.expect(function(res){
					delete res.body.message;
				})
				.expect({status: 'error', code: 'No User'})
				.end(function(error, response){
					done(error);
				});
		});


		it("should return 400 Bad Request for non-accepted email or password", function(done){

			request(app)
				.post('/login')
				.send({email: 'abc@example.com', password: 'cats'})
				.expect(200)
				.expect(function(res){
					delete res.body.message;
				})
				.expect({status: 'error', code: 'No User'})
				.end(function(error, response){
					done(error);
				});
		});

		it("should return 200 for correct credentials", function(done){

			request(app)
				.post('/login')
				.send({email: 'abc@example.com', password: 'Abc123!'})
				.expect(200)
				.expect({ status: 'success' })
				.end(function(error, response){
					done(error);
				});
		});


	});

});