/**
 * File Name : test/config-keys.js
 * Tests For: /config/config-keys.js, /config/config-messages.js, /config/config-app-public.js,
 * Description: config tests
 *
 * Notes:
 *
 */
var express = require('express');
var expect = require("chai").expect;
var request = require('supertest');
var app =  require('../app.js');
var Messages = require('../config/config-messages');
var Keys = require('../config/config-keys');
var publicConfig = require('../config/config-app-public');

describe("Configs", function(){

    describe("Keys", function(){

        it("should return an Object", function(){
            expect(Keys).to.be.a('object');
        });

    });
    describe("Messages", function(){
        it("should return an Object", function(){
            expect(Messages).to.be.a('object');
        });
    });
    describe("Public", function(){

        it("should return an Object", function(){
            expect(publicConfig).to.be.a('object');
        });

    });
});