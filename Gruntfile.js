module.exports = function(grunt) {
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        compass: {
            dist: {
                options: {
                    sassDir: 'public/stylesheets/_scss',
                    cssDir: 'public/builds/',
                    outputStyle: 'compressed'
                }
            }
        },
        watch: {
            css: {
                files: '**/*.scss',
                tasks: ['compass', 'versioning'],
                options: {
                    livereload: true
                },
            }
        },
        versioning: {
            options: {
                grepFiles: [
                    'views/layout.jade',
                ]
            },
            js: {
                src: [
                    'public/builds/main-built.js',
                ]
            },
            css: {
                src: [
                    'public/builds/style.css',
                ]
            },
        },
        requirejs: {
            compile: {
                options: {
                    baseUrl: 'public/javascripts/',
                    mainConfigFile: 'public/javascripts/main.js',
                    name: "main",
                    out: "public/builds/main-built.js",
                    optimize: "uglify2",
                    uglify2 : {
                        compress : {
                            drop_console : true,
                        }
                    },
                    preserveLicenseComments: false,
                    findNestedDependencies: true,
                    generateSourceMaps: true
                }
            }
        }
    });
    grunt.loadNpmTasks('grunt-version-assets');
    grunt.loadNpmTasks('grunt-contrib-compass');
    grunt.loadNpmTasks('grunt-contrib-requirejs');
    grunt.loadNpmTasks('grunt-contrib-watch');
    grunt.registerTask('production',['compass', 'requirejs', 'versioning']);
    grunt.registerTask('default',['watch']);
};