/**
 * File Name : test/app.js
 * Tests For: /libs/app.js
 * Description: app tests
 *
 * Notes:
 *
 */
var express = require('express');
var expect = require("chai").expect;
var should = require('chai').should();
var request = require('supertest');
PRODUCTION = false;
var appLib = require('../libs/app');

describe("AppClass", function(){

    describe(".setLocals()", function(){

        var app = express();

        it("should set local variables", function(done){
            app.get('/testLocals', appLib.setLocals, function(req, res){
                res.status(200).send(res.locals);
            });
            request(app)
                .get('/testLocals')
                .expect(200)
                .end(function (err, res) {
                    expect(res.body.config).to.be.a('object');
                    expect(res.body.data).to.be.a('object');
                    should.not.exist(res.body.user);
                    done();
                });
        });
        it("should set local user in locals and data when user exists", function(done){
            app.get('/testLocalsWithUser', function(req, res, next){req.user=true;next();}, appLib.setLocals, function(req, res){
                res.status(200).send(res.locals);
            });
            request(app)
                .get('/testLocalsWithUser')
                .expect(200)
                .end(function (err, res) {
                    expect(res.body.config).to.be.a('object');
                    expect(res.body.data).to.be.a('object');
                    should.exist(res.body.user);
                    should.exist(res.body.data.user);
                    done();
                });
        });

    });

});