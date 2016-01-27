/**
 * @desc Utils
 * 
 *
 */
define([

	'jquery',
	'config',
	'bowser'
	
],	function($, config, bowser){
	
    return {

        /**
         * getConfig() get the site config
         *
         *
         * @return {Object} returns the config or null
         *
         */
        getConfig: function() {
            if (config) { //should loaded as a global on the page
                return config;
            }
            return null;
        },

        /**
         * guid() generates a guid id
         *
         *
         * @return {String} returns a guid string
         *
         */
        guid: function() {
            return this.s4() + this.s4() + '-' + this.s4() + '-' + this.s4() + '-' +
                   this.s4() + '-' + this.s4() + this.s4() + this.s4();
        },

        /**
         * s4() generates a random number
         *
         *
         * @return {String} returns a random number
         *
         */
        s4: function() {
            return Math.floor((1 + Math.random()) * 0x10000)
               .toString(16)
               .substring(1);
        },

        /**
         * getFileExt() get a file extension name
         *
         * @param {String} filename
         * @return {String} returns the extension name
         *
         */
        getFileExt: function(filename) {
            return filename.split('.').pop();
        },

        /**
         * getUniqueName() get a unique file name
         *
         * @param {String} filename
         * @return {String} returns guid + file extension
         *
         */
        getUniqueName: function(fileName) {
            return Utils.guid() + '.' + Utils.getFileExt(fileName);
        },

        /**
         * getImagePath() get the full path to an image
         *
         * @param {String} image
         * @param {String} folder (optional)
         *
         * @return {Object} returns full path to image on
         *
         */
        getImagePath: function(image, folder) {
            var config = Utils.getConfig();

            if (folder != '') {
                folder = folder + '/';
            }

            if (config.cloudFront != '') {
                return 'https://' + config.cloudFront +  '/' + folder + image;
            }

            return 'https://' + config.s3Bucket +  '.s3.amazonaws.com/' + folder + image;
        },

        /**
         * getQueryVariable() get a query variable form
         * the current window URL
         *
         * @param {String} variable
         * @return {String} returns the key or null
         *
         */
        getQueryVariable: function(variable) {
            var query = window.location.search.substring(1);
            var vars = query.split('&');
            for (var i = 0; i < vars.length; i++) {
                var pair = vars[i].split('=');
                if (decodeURIComponent(pair[0]) == variable) {
                    return decodeURIComponent(pair[1]);
                }
            }
            return null;
        },

        /**
         * getIdFromUrl() get the id from
         * the current window URL
         *
         * @return {String} returns the id
         *
         */
        getIdFromUrl: function() {
            return window.location.pathname.split('/').slice(-1).pop();
        },

        /**
         * getFormData() get a forms data
         *
         *
         * @return {String} id (name of the form to get data from)
         *
         */
        getFormData: function(id) {

            var $inputs = $('#' + id + ' :input');

            var values = {};
            $inputs.each(function() {

                values[this.name] = $(this).val();

            });

            return values;
        },

        /**
         * validateEmail() validate an email address
         *
         * @param {String} email
         *
         * @return {Boolean} returns true if valid
         *
         */
        validateEmail: function(email) {
            var re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
            return re.test(email);
        },

        /**
         *
         * validatePasswordLength() validate password length
         *
         * @param password
         * @return {Boolean} returns true if valid
         */
        validatePasswordLength: function(password){
            return password.length > 6;
        },

        /**
         *
         * validatePasswordLength() validate password length
         *
         * @param password
         * @return {Boolean} returns true if valid
         */
        validatePasswordNumber: function(password){
            var re = /[0-9]/;
            return re.test(password);
        },

        /**
         *
         * validatePasswordLowercaseCharacter() validate password lowercase character
         *
         * @param password
         * @return {Boolean} returns true if valid
         */
        validatePasswordLowercaseCharacter: function(password){
            var re = /[a-z]/;
            return re.test(password);
        },

        /**
         *
         * validatePasswordUppercaseCharacter() validate password uppercase character
         *
         * @param password
         * @return {Boolean} returns true if valid
         */
        validatePasswordUppercaseCharacter: function(password){
            var re = /[A-Z]/;
            return re.test(password);
        },

        /**
         *
         * validatePasswordSpecialCharacter() validate password special character
         *
         * @param password
         * @return {Boolean} returns true if valid
         */
        validatePasswordSpecialCharacter: function(password){
            var re = /(?=.*[!@#$%^&*])/;
            return re.test(password);
        },

        /**
         *
         * validatePassword() check validation and return message
         *
         * @param password
         * @param passwordConfirm
         */
        validatePassword: function(password, passwordConfirm) {

            // password required
            if(!password){
                this.alert(this.getConfig().messages.requiredPassword);
                return false;
            }

            // password length
            if(!this.validatePasswordLength(password)){
                this.alert(this.getConfig().messages.invalidPasswordLength);
                return false;
            }

            // password number
            if(!this.validatePasswordNumber(password)){
                this.alert(this.getConfig().messages.invalidPasswordNumber);
                return false;
            }

            // password lowercase character
            if(!this.validatePasswordLowercaseCharacter(password)){
                this.alert(this.getConfig().messages.invalidPasswordLowercaseCharacter);
                return false;
            }

            // password uppercase character
            if(!this.validatePasswordUppercaseCharacter(password)){
                this.alert(this.getConfig().messages.invalidPasswordUppercaseCharacter);
                return false;
            }

            // password special character
            if(!this.validatePasswordSpecialCharacter(password)){
                this.alert(this.getConfig().messages.invalidPasswordSpecialCharacter);
                return false;
            }

            // match to password
            if(passwordConfirm) {
                if (password != passwordConfirm) {
                    this.alert(this.getConfig().messages.invalidPasswordsDontMatch);
                    return false;
                }
            }

            return true;
        },


        /**
         * alert() shows an alert
         *
         * @param {Object} obj from Messages or custom
         *
         *
         */
        alert: function(obj){

            var $notice = $('.alerts');

            var alert = '<li class="alert animated fadeInDown ' + (obj.type ? obj.type : "info") + '">' +
                '<span class="alert-message">' + (obj.message ? obj.message : "Sorry. Something did not work properly.") +
                '</span></li>';

            $notice.prepend(alert);

            this.resetAlert();

            $notice.off();

            $notice.on('click', function(){
                $(this).addClass('fadeOutUp');
            })
        },

        /**
         * resetAlert() clears the last alert
         *
         *
         *
         */
        resetAlert: function(delay){

            setTimeout(function(){

                $('.alerts li:last-child').addClass('fadeOutUp');

                setTimeout(function(){
                    $('.alerts li:last-child').remove();
                }, 400)

            }, delay ? delay : 3000);
        },

        /**
         * checkBrowser() Checks the browser for old versions and displays a message
         *
         *
         *
         */
        checkBrowser: function(){

            var oldBrowser = false;

            if(bowser.firefox && bowser.version < 16){
                oldBrowser = true;
            }

            if(bowser.chrome && bowser.version < 26){
                oldBrowser = true;
            }

            if(bowser.msie && bowser.version < 10){
                oldBrowser = true;
            }

            if(bowser.safari && bowser.version < 6.1){
                oldBrowser = true;
            }

            if(oldBrowser){
                $('.upgrade-browser').addClass('old-browser');
            }

        },

        /**
         * trackUser() Checks the browser for old versions and displays a message
         *
         * @param {String} tracking_event (name of the event to track)
         * @param {Object} data (all the data!)
         *
         */
        track : function(tracking_event, data){
            data.date_created = Date.now();
            analytics.track(tracking_event, data);
        }

    };
				
});