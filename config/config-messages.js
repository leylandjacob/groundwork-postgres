/**
 * Filename	: /config/config-messages.js
 * Description: Publicly viewable messages shared server and client side and returned as part of the site config
 *
 * Notes:
 */
var date = new Date();
module.exports = {

    // global messages
    generalError    : { type: 'error', message: '<p><b>Oh snap!</b> Something went wrong.</p>' },
    serverError     : { type: 'error', message: '<p><b>Oh no!</b> Error connecting to server. Try again.</p>'},

    // auth
    loginError     : { type: 'error', message: '<p><b>Sorry.</b> We could not log you in. Please contact support.</p>'},
    signupError     : { type: 'error', message: '<p><b>Sorry.</b> We could not sign you up. Please contact support.</p>'},
    userEmailTaken     : { type: 'error', message: '<p><b>Sorry.</b> This email is already in use.</p>'},
    userNotFound    : { type: 'error', message: '<p><b>Sorry.</b> No user with this email was found. Try again.</p>'},
    passwordIncorrect     : { type: 'error', message: '<p><b>Sorry.</b> Email is correct, but password is incorrect. Try again.</p>'},

    // reset
    resetError      : { type: 'error', message: '<p><b>Sorry.</b> We could not process that reset request. Please contact support.</p>'},
    resetSuccess : { type: 'success', message: '<p><b>Success!</b> Check your email inbox for a password reset email.</p>'},
    resetTokenExpired : { type: 'error', message: '<p><b>Sorry.</b> The reset token provided has expired. Please try again.</p>'},
    resetTokenNotFound : { type: 'error', message: '<p><b>Sorry.</b> The a valid reset token is required. Please try again.</p>'},

    // required
    requiredEmail     : { type: 'error', message: '<p><b>Hold on!</b> Email is required.</p>'},
    requiredPassword     : { type: 'error', message: '<p><b>Hold on!</b> Password is required.</p>'},
    requiredToken     : { type: 'error', message: '<p><b>Hold on!</b> A token is required.</p>'},

    // invalid
    invalidEmail     : { type: 'error', message: '<p><b>Hold on!</b> Email looks invalid. Try again.</p>'},
    invalidPasswordLength: { type: 'error', message: '<p><b>Hold on!</b> Password must be greater than 6 characters. Try again.</p>'},
    invalidPasswordNumber: { type: 'error', message: '<p><b>Hold on!</b> Password must contain a number. Try again.</p>'},
    invalidPasswordLowercaseCharacter: { type: 'error', message: '<p><b>Hold on!</b> Password must contain a lowercase character. Try again.</p>'},
    invalidPasswordUppercaseCharacter: { type: 'error', message: '<p><b>Hold on!</b> Password must contain an uppercase character. Try again.</p>'},
    invalidPasswordSpecialCharacter: { type: 'error', message: '<p><b>Hold on!</b> Password must contain a special character. Try again.</p>'},
    invalidPasswordsDontMatch: { type: 'error', message: '<p><b>Oops!</b> Passwords don\'t match. Try again.</p>'}

};