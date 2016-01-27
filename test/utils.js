/**
 * File Name : test/utils.js
 * Tests For: /libs/utils.js
 * Description: utils tests
 *
 * Notes:
 *
 */
var express = require('express');
var expect = require("chai").expect;
var should = require("chai").should;
var request = require('supertest');
var Utils = require('../libs/utils');

describe("UtilsClass", function(){

    describe(".generateToken()", function() {

        it("should return a random 32 character string", function () {
            expect(Utils.generateToken()).to.be.a('string');
            expect(Utils.generateToken()).to.have.length(32);
        });
    });

    describe(".incrementToken()", function() {

        it("should return a 32 character string", function () {
            //TODO Write test to increment token
        });
    });


    describe(".guid()", function() {

        it("should return a 36 character string", function () {
            expect(Utils.guid()).to.be.a('string');
            expect(Utils.guid()).to.have.length(36);
        });
    });

    describe(".s4()", function() {

        it("should return a 4 character string", function () {
            expect(Utils.s4()).to.be.a('string');
            expect(Utils.s4()).to.have.length(4);
        });
    });

    describe(".getFileExt()", function() {

        it("should return a string equal to jpg", function () {
            var file = 'testfile.jpg';
            expect(Utils.getFileExt(file)).to.be.a('string');
            expect(Utils.getFileExt(file)).to.equal('jpg');
        });
    });

    describe(".getUniqueFileName()", function() {

        it("should return a 40 character unique filename", function () {
            var file = 'testfile.jpg';
            expect(Utils.getUniqueFileName(file)).to.be.a('string');
            expect(Utils.getUniqueFileName(file)).to.have.length(40);
        });
    });

    describe(".getHash()", function() {

        it("should return a hashed 32 characted string", function () {
            var value = '123456789';
            expect(Utils.getHash(value)).to.be.a('string');
            expect(Utils.getHash(value)).to.have.length(32);
        });
    });

    describe(".authApiRequest()", function() {

        it("should authenticate api requests", function () {
            //TODO: write tet to authenticate API
        });
    });
});