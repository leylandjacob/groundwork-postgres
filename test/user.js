/**
 * File Name : test/email.js
 * Tests For: /libs/email.js
 * Description: email tests
 *
 * Notes:
 *
 */
var express = require('express');
var expect = require("chai").expect;
var request = require('supertest');
var User = require('../libs/user');

describe("UserClass", function(){

    describe(".requireLogin()", function(){

        it("should redirect non logged in users", function(done){

            var app = express();

            app.get('/testLogin', function(req, res, next){
                req.user = false;
                next();
            }, User.requireLogin, function(req, res){
                res.status(200).send();
            });

            request(app)
                .get('/testLogin')
                .expect(302, done);
        });

    });

    describe(".requireNoLogin()", function(){

        it("should redirect logged in users", function(done){
            var app = express();

            app.get('/testNoLogin', function(req, res, next){
                req.user = true;
                next();
            }, User.requireNoLogin, function(req, res){
                res.status(200).send();
            });

            request(app)
                .get('/testNoLogin')
                .expect(302, done);
        });

    });

    describe(".updateIntercom()", function(){

        it("should update an intercom user", function(){
            //TODO: Add intercom test with test data
        });

    });

});