
module.exports = function(grunt) {
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        compass: {
            dist: {
                options: {
                    sassDir: 'public/stylesheets/_scss',
                    cssDir: 'public/stylesheets/',
                    outputStyle: 'compressed'
                }
            }
        },
        watch: {
            css: {
                files: '**/*.scss',
                tasks: ['compass'],
                options: {
                    livereload: true
                },
            }
        }
    });
    grunt.loadNpmTasks('grunt-contrib-compass');
    grunt.loadNpmTasks('grunt-contrib-watch');
    grunt.registerTask('default',['watch']);
};