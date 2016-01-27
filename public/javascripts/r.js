/**
 * @license r.js 2.1.20 Copyright (c) 2010-2015, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/requirejs for details
 */

/*
 * This is a bootstrap script to allow running RequireJS in the command line
 * in either a Java/Rhino or Node environment. It is modified by the top-level
 * dist.js file to inject other files to completely enable this file. It is
 * the shell of the r.js file.
 */

/*jslint evil: true, nomen: true, sloppy: true */
/*global readFile: true, process: false, Packages: false, print: false,
 console: false, java: false, module: false, requirejsVars, navigator,
 document, importScripts, self, location, Components, FileUtils */

var requirejs, require, define, xpcUtil;
(function (console, args, readFileFunc) {
    var fileName, env, fs, vm, path, exec, rhinoContext, dir, nodeRequire,
        nodeDefine, exists, reqMain, loadedOptimizedLib, existsForNode, Cc, Ci,
        version = '2.1.20',
        jsSuffixRegExp = /\.js$/,
        commandOption = '',
        useLibLoaded = {},
    //Used by jslib/rhino/args.js
        rhinoArgs = args,
    //Used by jslib/xpconnect/args.js
        xpconnectArgs = args,
        readFile = typeof readFileFunc !== 'undefined' ? readFileFunc : null;

    function showHelp() {
        console.log('See https://github.com/jrburke/r.js for usage.');
    }

    if ((typeof navigator !== 'undefined' && typeof document !== 'undefined') ||
        (typeof importScripts !== 'undefined' && typeof self !== 'undefined')) {
        env = 'browser';

        readFile = function (path) {
            return fs.readFileSync(path, 'utf8');
        };

        exec = function (string) {
            return eval(string);
        };

        exists = function () {
            console.log('x.js exists not applicable in browser env');
            return false;
        };

    } else if (typeof process !== 'undefined' && process.versions && !!process.versions.node) {
        env = 'node';

        //Get the fs module via Node's require before it
        //gets replaced. Used in require/node.js
        fs = require('fs');
        vm = require('vm');
        path = require('path');
        //In Node 0.7+ existsSync is on fs.
        existsForNode = fs.existsSync || path.existsSync;

        nodeRequire = require;
        nodeDefine = define;
        reqMain = require.main;

        //Temporarily hide require and define to allow require.js to define
        //them.
        require = undefined;
        define = undefined;

        readFile = function (path) {
            return fs.readFileSync(path, 'utf8');
        };

        exec = function (string, name) {
            return vm.runInThisContext(this.requirejsVars.require.makeNodeWrapper(string),
                name ? fs.realpathSync(name) : '');
        };

        exists = function (fileName) {
            return existsForNode(fileName);
        };


        fileName = process.argv[2];

        if (fileName && fileName.indexOf('-') === 0) {
            commandOption = fileName.substring(1);
            fileName = process.argv[3];
        }
    } else if (typeof Packages !== 'undefined') {
        env = 'rhino';

        fileName = args[0];

        if (fileName && fileName.indexOf('-') === 0) {
            commandOption = fileName.substring(1);
            fileName = args[1];
        }

        //Exec/readFile differs between Rhino and Nashorn. Rhino has an
        //importPackage where Nashorn does not, so branch on that. This is a
        //coarser check -- detecting readFile existence might also be enough for
        //this spot. However, sticking with importPackage to keep it the same
        //as other Rhino/Nashorn detection branches.
        if (typeof importPackage !== 'undefined') {
            rhinoContext = Packages.org.mozilla.javascript.ContextFactory.getGlobal().enterContext();

            exec = function (string, name) {
                return rhinoContext.evaluateString(this, string, name, 0, null);
            };
        } else {
            exec = function (string, name) {
                load({ script: string, name: name});
            };
            readFile = readFully;
        }

        exists = function (fileName) {
            return (new java.io.File(fileName)).exists();
        };

        //Define a console.log for easier logging. Don't
        //get fancy though.
        if (typeof console === 'undefined') {
            console = {
                log: function () {
                    print.apply(undefined, arguments);
                }
            };
        }
    } else if (typeof Components !== 'undefined' && Components.classes && Components.interfaces) {
        env = 'xpconnect';

        Components.utils['import']('resource://gre/modules/FileUtils.jsm');
        Cc = Components.classes;
        Ci = Components.interfaces;

        fileName = args[0];

        if (fileName && fileName.indexOf('-') === 0) {
            commandOption = fileName.substring(1);
            fileName = args[1];
        }

        xpcUtil = {
            isWindows: ('@mozilla.org/windows-registry-key;1' in Cc),
            cwd: function () {
                return FileUtils.getFile("CurWorkD", []).path;
            },

            //Remove . and .. from paths, normalize on front slashes
            normalize: function (path) {
                //There has to be an easier way to do this.
                var i, part, ary,
                    firstChar = path.charAt(0);

                if (firstChar !== '/' &&
                    firstChar !== '\\' &&
                    path.indexOf(':') === -1) {
                    //A relative path. Use the current working directory.
                    path = xpcUtil.cwd() + '/' + path;
                }

                ary = path.replace(/\\/g, '/').split('/');

                for (i = 0; i < ary.length; i += 1) {
                    part = ary[i];
                    if (part === '.') {
                        ary.splice(i, 1);
                        i -= 1;
                    } else if (part === '..') {
                        ary.splice(i - 1, 2);
                        i -= 2;
                    }
                }
                return ary.join('/');
            },

            xpfile: function (path) {
                var fullPath;
                try {
                    fullPath = xpcUtil.normalize(path);
                    if (xpcUtil.isWindows) {
                        fullPath = fullPath.replace(/\//g, '\\');
                    }
                    return new FileUtils.File(fullPath);
                } catch (e) {
                    throw new Error((fullPath || path) + ' failed: ' + e);
                }
            },

            readFile: function (/*String*/path, /*String?*/encoding) {
                //A file read function that can deal with BOMs
                encoding = encoding || "utf-8";

                var inStream, convertStream,
                    readData = {},
                    fileObj = xpcUtil.xpfile(path);

                //XPCOM, you so crazy
                try {
                    inStream = Cc['@mozilla.org/network/file-input-stream;1']
                        .createInstance(Ci.nsIFileInputStream);
                    inStream.init(fileObj, 1, 0, false);

                    convertStream = Cc['@mozilla.org/intl/converter-input-stream;1']
                        .createInstance(Ci.nsIConverterInputStream);
                    convertStream.init(inStream, encoding, inStream.available(),
                        Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);

                    convertStream.readString(inStream.available(), readData);
                    return readData.value;
                } catch (e) {
                    throw new Error((fileObj && fileObj.path || '') + ': ' + e);
                } finally {
                    if (convertStream) {
                        convertStream.close();
                    }
                    if (inStream) {
                        inStream.close();
                    }
                }
            }
        };

        readFile = xpcUtil.readFile;

        exec = function (string) {
            return eval(string);
        };

        exists = function (fileName) {
            return xpcUtil.xpfile(fileName).exists();
        };

        //Define a console.log for easier logging. Don't
        //get fancy though.
        if (typeof console === 'undefined') {
            console = {
                log: function () {
                    print.apply(undefined, arguments);
                }
            };
        }
    }

    /** vim: et:ts=4:sw=4:sts=4
     * @license RequireJS 2.1.20 Copyright (c) 2010-2015, The Dojo Foundation All Rights Reserved.
     * Available via the MIT or new BSD license.
     * see: http://github.com/jrburke/requirejs for details
     */
//Not using strict: uneven strict support in browsers, #392, and causes
//problems with requirejs.exec()/transpiler plugins that may not be strict.
    /*jslint regexp: true, nomen: true, sloppy: true */
    /*global window, navigator, document, importScripts, setTimeout, opera */


    (function (global) {
        var req, s, head, baseElement, dataMain, src,
            interactiveScript, currentlyAddingScript, mainScript, subPath,
            version = '2.1.20',
            commentRegExp = /(\/\*([\s\S]*?)\*\/|([^:]|^)\/\/(.*)$)/mg,
            cjsRequireRegExp = /[^.]\s*require\s*\(\s*["']([^'"\s]+)["']\s*\)/g,
            jsSuffixRegExp = /\.js$/,
            currDirRegExp = /^\.\//,
            op = Object.prototype,
            ostring = op.toString,
            hasOwn = op.hasOwnProperty,
            ap = Array.prototype,
            isBrowser = !!(typeof window !== 'undefined' && typeof navigator !== 'undefined' && window.document),
            isWebWorker = !isBrowser && typeof importScripts !== 'undefined',
        //PS3 indicates loaded and complete, but need to wait for complete
        //specifically. Sequence is 'loading', 'loaded', execution,
        // then 'complete'. The UA check is unfortunate, but not sure how
        //to feature test w/o causing perf issues.
            readyRegExp = isBrowser && navigator.platform === 'PLAYSTATION 3' ?
                /^complete$/ : /^(complete|loaded)$/,
            defContextName = '_',
        //Oh the tragedy, detecting opera. See the usage of isOpera for reason.
            isOpera = typeof opera !== 'undefined' && opera.toString() === '[object Opera]',
            contexts = {},
            cfg = {},
            globalDefQueue = [],
            useInteractive = false;

        function isFunction(it) {
            return ostring.call(it) === '[object Function]';
        }

        function isArray(it) {
            return ostring.call(it) === '[object Array]';
        }

        /**
         * Helper function for iterating over an array. If the func returns
         * a true value, it will break out of the loop.
         */
        function each(ary, func) {
            if (ary) {
                var i;
                for (i = 0; i < ary.length; i += 1) {
                    if (ary[i] && func(ary[i], i, ary)) {
                        break;
                    }
                }
            }
        }

        /**
         * Helper function for iterating over an array backwards. If the func
         * returns a true value, it will break out of the loop.
         */
        function eachReverse(ary, func) {
            if (ary) {
                var i;
                for (i = ary.length - 1; i > -1; i -= 1) {
                    if (ary[i] && func(ary[i], i, ary)) {
                        break;
                    }
                }
            }
        }

        function hasProp(obj, prop) {
            return hasOwn.call(obj, prop);
        }

        function getOwn(obj, prop) {
            return hasProp(obj, prop) && obj[prop];
        }

        /**
         * Cycles over properties in an object and calls a function for each
         * property value. If the function returns a truthy value, then the
         * iteration is stopped.
         */
        function eachProp(obj, func) {
            var prop;
            for (prop in obj) {
                if (hasProp(obj, prop)) {
                    if (func(obj[prop], prop)) {
                        break;
                    }
                }
            }
        }

        /**
         * Simple function to mix in properties from source into target,
         * but only if target does not already have a property of the same name.
         */
        function mixin(target, source, force, deepStringMixin) {
            if (source) {
                eachProp(source, function (value, prop) {
                    if (force || !hasProp(target, prop)) {
                        if (deepStringMixin && typeof value === 'object' && value &&
                            !isArray(value) && !isFunction(value) &&
                            !(value instanceof RegExp)) {

                            if (!target[prop]) {
                                target[prop] = {};
                            }
                            mixin(target[prop], value, force, deepStringMixin);
                        } else {
                            target[prop] = value;
                        }
                    }
                });
            }
            return target;
        }

        //Similar to Function.prototype.bind, but the 'this' object is specified
        //first, since it is easier to read/figure out what 'this' will be.
        function bind(obj, fn) {
            return function () {
                return fn.apply(obj, arguments);
            };
        }

        function scripts() {
            return document.getElementsByTagName('script');
        }

        function defaultOnError(err) {
            throw err;
        }

        //Allow getting a global that is expressed in
        //dot notation, like 'a.b.c'.
        function getGlobal(value) {
            if (!value) {
                return value;
            }
            var g = global;
            each(value.split('.'), function (part) {
                g = g[part];
            });
            return g;
        }

        /**
         * Constructs an error with a pointer to an URL with more information.
         * @param {String} id the error ID that maps to an ID on a web page.
         * @param {String} message human readable error.
         * @param {Error} [err] the original error, if there is one.
         *
         * @returns {Error}
         */
        function makeError(id, msg, err, requireModules) {
            var e = new Error(msg + '\nhttp://requirejs.org/docs/errors.html#' + id);
            e.requireType = id;
            e.requireModules = requireModules;
            if (err) {
                e.originalError = err;
            }
            return e;
        }

        if (typeof define !== 'undefined') {
            //If a define is already in play via another AMD loader,
            //do not overwrite.
            return;
        }

        if (typeof requirejs !== 'undefined') {
            if (isFunction(requirejs)) {
                //Do not overwrite an existing requirejs instance.
                return;
            }
            cfg = requirejs;
            requirejs = undefined;
        }

        //Allow for a require config object
        if (typeof require !== 'undefined' && !isFunction(require)) {
            //assume it is a config object.
            cfg = require;
            require = undefined;
        }

        function newContext(contextName) {
            var inCheckLoaded, Module, context, handlers,
                checkLoadedTimeoutId,
                config = {
                    //Defaults. Do not set a default for map
                    //config to speed up normalize(), which
                    //will run faster if there is no default.
                    waitSeconds: 7,
                    baseUrl: './',
                    paths: {},
                    bundles: {},
                    pkgs: {},
                    shim: {},
                    config: {}
                },
                registry = {},
            //registry of just enabled modules, to speed
            //cycle breaking code when lots of modules
            //are registered, but not activated.
                enabledRegistry = {},
                undefEvents = {},
                defQueue = [],
                defined = {},
                urlFetched = {},
                bundlesMap = {},
                requireCounter = 1,
                unnormalizedCounter = 1;

            /**
             * Trims the . and .. from an array of path segments.
             * It will keep a leading path segment if a .. will become
             * the first path segment, to help with module name lookups,
             * which act like paths, but can be remapped. But the end result,
             * all paths that use this function should look normalized.
             * NOTE: this method MODIFIES the input array.
             * @param {Array} ary the array of path segments.
             */
            function trimDots(ary) {
                var i, part;
                for (i = 0; i < ary.length; i++) {
                    part = ary[i];
                    if (part === '.') {
                        ary.splice(i, 1);
                        i -= 1;
                    } else if (part === '..') {
                        // If at the start, or previous value is still ..,
                        // keep them so that when converted to a path it may
                        // still work when converted to a path, even though
                        // as an ID it is less than ideal. In larger point
                        // releases, may be better to just kick out an error.
                        if (i === 0 || (i === 1 && ary[2] === '..') || ary[i - 1] === '..') {
                            continue;
                        } else if (i > 0) {
                            ary.splice(i - 1, 2);
                            i -= 2;
                        }
                    }
                }
            }

            /**
             * Given a relative module name, like ./something, normalize it to
             * a real name that can be mapped to a path.
             * @param {String} name the relative name
             * @param {String} baseName a real name that the name arg is relative
             * to.
             * @param {Boolean} applyMap apply the map config to the value. Should
             * only be done if this normalization is for a dependency ID.
             * @returns {String} normalized name
             */
            function normalize(name, baseName, applyMap) {
                var pkgMain, mapValue, nameParts, i, j, nameSegment, lastIndex,
                    foundMap, foundI, foundStarMap, starI, normalizedBaseParts,
                    baseParts = (baseName && baseName.split('/')),
                    map = config.map,
                    starMap = map && map['*'];

                //Adjust any relative paths.
                if (name) {
                    name = name.split('/');
                    lastIndex = name.length - 1;

                    // If wanting node ID compatibility, strip .js from end
                    // of IDs. Have to do this here, and not in nameToUrl
                    // because node allows either .js or non .js to map
                    // to same file.
                    if (config.nodeIdCompat && jsSuffixRegExp.test(name[lastIndex])) {
                        name[lastIndex] = name[lastIndex].replace(jsSuffixRegExp, '');
                    }

                    // Starts with a '.' so need the baseName
                    if (name[0].charAt(0) === '.' && baseParts) {
                        //Convert baseName to array, and lop off the last part,
                        //so that . matches that 'directory' and not name of the baseName's
                        //module. For instance, baseName of 'one/two/three', maps to
                        //'one/two/three.js', but we want the directory, 'one/two' for
                        //this normalization.
                        normalizedBaseParts = baseParts.slice(0, baseParts.length - 1);
                        name = normalizedBaseParts.concat(name);
                    }

                    trimDots(name);
                    name = name.join('/');
                }

                //Apply map config if available.
                if (applyMap && map && (baseParts || starMap)) {
                    nameParts = name.split('/');

                    outerLoop: for (i = nameParts.length; i > 0; i -= 1) {
                        nameSegment = nameParts.slice(0, i).join('/');

                        if (baseParts) {
                            //Find the longest baseName segment match in the config.
                            //So, do joins on the biggest to smallest lengths of baseParts.
                            for (j = baseParts.length; j > 0; j -= 1) {
                                mapValue = getOwn(map, baseParts.slice(0, j).join('/'));

                                //baseName segment has config, find if it has one for
                                //this name.
                                if (mapValue) {
                                    mapValue = getOwn(mapValue, nameSegment);
                                    if (mapValue) {
                                        //Match, update name to the new value.
                                        foundMap = mapValue;
                                        foundI = i;
                                        break outerLoop;
                                    }
                                }
                            }
                        }

                        //Check for a star map match, but just hold on to it,
                        //if there is a shorter segment match later in a matching
                        //config, then favor over this star map.
                        if (!foundStarMap && starMap && getOwn(starMap, nameSegment)) {
                            foundStarMap = getOwn(starMap, nameSegment);
                            starI = i;
                        }
                    }

                    if (!foundMap && foundStarMap) {
                        foundMap = foundStarMap;
                        foundI = starI;
                    }

                    if (foundMap) {
                        nameParts.splice(0, foundI, foundMap);
                        name = nameParts.join('/');
                    }
                }

                // If the name points to a package's name, use
                // the package main instead.
                pkgMain = getOwn(config.pkgs, name);

                return pkgMain ? pkgMain : name;
            }

            function removeScript(name) {
                if (isBrowser) {
                    each(scripts(), function (scriptNode) {
                        if (scriptNode.getAttribute('data-requiremodule') === name &&
                            scriptNode.getAttribute('data-requirecontext') === context.contextName) {
                            scriptNode.parentNode.removeChild(scriptNode);
                            return true;
                        }
                    });
                }
            }

            function hasPathFallback(id) {
                var pathConfig = getOwn(config.paths, id);
                if (pathConfig && isArray(pathConfig) && pathConfig.length > 1) {
                    //Pop off the first array value, since it failed, and
                    //retry
                    pathConfig.shift();
                    context.require.undef(id);

                    //Custom require that does not do map translation, since
                    //ID is "absolute", already mapped/resolved.
                    context.makeRequire(null, {
                        skipMap: true
                    })([id]);

                    return true;
                }
            }

            //Turns a plugin!resource to [plugin, resource]
            //with the plugin being undefined if the name
            //did not have a plugin prefix.
            function splitPrefix(name) {
                var prefix,
                    index = name ? name.indexOf('!') : -1;
                if (index > -1) {
                    prefix = name.substring(0, index);
                    name = name.substring(index + 1, name.length);
                }
                return [prefix, name];
            }

            /**
             * Creates a module mapping that includes plugin prefix, module
             * name, and path. If parentModuleMap is provided it will
             * also normalize the name via require.normalize()
             *
             * @param {String} name the module name
             * @param {String} [parentModuleMap] parent module map
             * for the module name, used to resolve relative names.
             * @param {Boolean} isNormalized: is the ID already normalized.
             * This is true if this call is done for a define() module ID.
             * @param {Boolean} applyMap: apply the map config to the ID.
             * Should only be true if this map is for a dependency.
             *
             * @returns {Object}
             */
            function makeModuleMap(name, parentModuleMap, isNormalized, applyMap) {
                var url, pluginModule, suffix, nameParts,
                    prefix = null,
                    parentName = parentModuleMap ? parentModuleMap.name : null,
                    originalName = name,
                    isDefine = true,
                    normalizedName = '';

                //If no name, then it means it is a require call, generate an
                //internal name.
                if (!name) {
                    isDefine = false;
                    name = '_@r' + (requireCounter += 1);
                }

                nameParts = splitPrefix(name);
                prefix = nameParts[0];
                name = nameParts[1];

                if (prefix) {
                    prefix = normalize(prefix, parentName, applyMap);
                    pluginModule = getOwn(defined, prefix);
                }

                //Account for relative paths if there is a base name.
                if (name) {
                    if (prefix) {
                        if (pluginModule && pluginModule.normalize) {
                            //Plugin is loaded, use its normalize method.
                            normalizedName = pluginModule.normalize(name, function (name) {
                                return normalize(name, parentName, applyMap);
                            });
                        } else {
                            // If nested plugin references, then do not try to
                            // normalize, as it will not normalize correctly. This
                            // places a restriction on resourceIds, and the longer
                            // term solution is not to normalize until plugins are
                            // loaded and all normalizations to allow for async
                            // loading of a loader plugin. But for now, fixes the
                            // common uses. Details in #1131
                            normalizedName = name.indexOf('!') === -1 ?
                                normalize(name, parentName, applyMap) :
                                name;
                        }
                    } else {
                        //A regular module.
                        normalizedName = normalize(name, parentName, applyMap);

                        //Normalized name may be a plugin ID due to map config
                        //application in normalize. The map config values must
                        //already be normalized, so do not need to redo that part.
                        nameParts = splitPrefix(normalizedName);
                        prefix = nameParts[0];
                        normalizedName = nameParts[1];
                        isNormalized = true;

                        url = context.nameToUrl(normalizedName);
                    }
                }

                //If the id is a plugin id that cannot be determined if it needs
                //normalization, stamp it with a unique ID so two matching relative
                //ids that may conflict can be separate.
                suffix = prefix && !pluginModule && !isNormalized ?
                '_unnormalized' + (unnormalizedCounter += 1) :
                    '';

                return {
                    prefix: prefix,
                    name: normalizedName,
                    parentMap: parentModuleMap,
                    unnormalized: !!suffix,
                    url: url,
                    originalName: originalName,
                    isDefine: isDefine,
                    id: (prefix ?
                    prefix + '!' + normalizedName :
                        normalizedName) + suffix
                };
            }

            function getModule(depMap) {
                var id = depMap.id,
                    mod = getOwn(registry, id);

                if (!mod) {
                    mod = registry[id] = new context.Module(depMap);
                }

                return mod;
            }

            function on(depMap, name, fn) {
                var id = depMap.id,
                    mod = getOwn(registry, id);

                if (hasProp(defined, id) &&
                    (!mod || mod.defineEmitComplete)) {
                    if (name === 'defined') {
                        fn(defined[id]);
                    }
                } else {
                    mod = getModule(depMap);
                    if (mod.error && name === 'error') {
                        fn(mod.error);
                    } else {
                        mod.on(name, fn);
                    }
                }
            }

            function onError(err, errback) {
                var ids = err.requireModules,
                    notified = false;

                if (errback) {
                    errback(err);
                } else {
                    each(ids, function (id) {
                        var mod = getOwn(registry, id);
                        if (mod) {
                            //Set error on module, so it skips timeout checks.
                            mod.error = err;
                            if (mod.events.error) {
                                notified = true;
                                mod.emit('error', err);
                            }
                        }
                    });

                    if (!notified) {
                        req.onError(err);
                    }
                }
            }

            /**
             * Internal method to transfer globalQueue items to this context's
             * defQueue.
             */
            function takeGlobalQueue() {
                //Push all the globalDefQueue items into the context's defQueue
                if (globalDefQueue.length) {
                    each(globalDefQueue, function(queueItem) {
                        var id = queueItem[0];
                        if (typeof id === 'string') {
                            context.defQueueMap[id] = true;
                        }
                        defQueue.push(queueItem);
                    });
                    globalDefQueue = [];
                }
            }

            handlers = {
                'require': function (mod) {
                    if (mod.require) {
                        return mod.require;
                    } else {
                        return (mod.require = context.makeRequire(mod.map));
                    }
                },
                'exports': function (mod) {
                    mod.usingExports = true;
                    if (mod.map.isDefine) {
                        if (mod.exports) {
                            return (defined[mod.map.id] = mod.exports);
                        } else {
                            return (mod.exports = defined[mod.map.id] = {});
                        }
                    }
                },
                'module': function (mod) {
                    if (mod.module) {
                        return mod.module;
                    } else {
                        return (mod.module = {
                            id: mod.map.id,
                            uri: mod.map.url,
                            config: function () {
                                return getOwn(config.config, mod.map.id) || {};
                            },
                            exports: mod.exports || (mod.exports = {})
                        });
                    }
                }
            };

            function cleanRegistry(id) {
                //Clean up machinery used for waiting modules.
                delete registry[id];
                delete enabledRegistry[id];
            }

            function breakCycle(mod, traced, processed) {
                var id = mod.map.id;

                if (mod.error) {
                    mod.emit('error', mod.error);
                } else {
                    traced[id] = true;
                    each(mod.depMaps, function (depMap, i) {
                        var depId = depMap.id,
                            dep = getOwn(registry, depId);

                        //Only force things that have not completed
                        //being defined, so still in the registry,
                        //and only if it has not been matched up
                        //in the module already.
                        if (dep && !mod.depMatched[i] && !processed[depId]) {
                            if (getOwn(traced, depId)) {
                                mod.defineDep(i, defined[depId]);
                                mod.check(); //pass false?
                            } else {
                                breakCycle(dep, traced, processed);
                            }
                        }
                    });
                    processed[id] = true;
                }
            }

            function checkLoaded() {
                var err, usingPathFallback,
                    waitInterval = config.waitSeconds * 1000,
                //It is possible to disable the wait interval by using waitSeconds of 0.
                    expired = waitInterval && (context.startTime + waitInterval) < new Date().getTime(),
                    noLoads = [],
                    reqCalls = [],
                    stillLoading = false,
                    needCycleCheck = true;

                //Do not bother if this call was a result of a cycle break.
                if (inCheckLoaded) {
                    return;
                }

                inCheckLoaded = true;

                //Figure out the state of all the modules.
                eachProp(enabledRegistry, function (mod) {
                    var map = mod.map,
                        modId = map.id;

                    //Skip things that are not enabled or in error state.
                    if (!mod.enabled) {
                        return;
                    }

                    if (!map.isDefine) {
                        reqCalls.push(mod);
                    }

                    if (!mod.error) {
                        //If the module should be executed, and it has not
                        //been inited and time is up, remember it.
                        if (!mod.inited && expired) {
                            if (hasPathFallback(modId)) {
                                usingPathFallback = true;
                                stillLoading = true;
                            } else {
                                noLoads.push(modId);
                                removeScript(modId);
                            }
                        } else if (!mod.inited && mod.fetched && map.isDefine) {
                            stillLoading = true;
                            if (!map.prefix) {
                                //No reason to keep looking for unfinished
                                //loading. If the only stillLoading is a
                                //plugin resource though, keep going,
                                //because it may be that a plugin resource
                                //is waiting on a non-plugin cycle.
                                return (needCycleCheck = false);
                            }
                        }
                    }
                });

                if (expired && noLoads.length) {
                    //If wait time expired, throw error of unloaded modules.
                    err = makeError('timeout', 'Load timeout for modules: ' + noLoads, null, noLoads);
                    err.contextName = context.contextName;
                    return onError(err);
                }

                //Not expired, check for a cycle.
                if (needCycleCheck) {
                    each(reqCalls, function (mod) {
                        breakCycle(mod, {}, {});
                    });
                }

                //If still waiting on loads, and the waiting load is something
                //other than a plugin resource, or there are still outstanding
                //scripts, then just try back later.
                if ((!expired || usingPathFallback) && stillLoading) {
                    //Something is still waiting to load. Wait for it, but only
                    //if a timeout is not already in effect.
                    if ((isBrowser || isWebWorker) && !checkLoadedTimeoutId) {
                        checkLoadedTimeoutId = setTimeout(function () {
                            checkLoadedTimeoutId = 0;
                            checkLoaded();
                        }, 50);
                    }
                }

                inCheckLoaded = false;
            }

            Module = function (map) {
                this.events = getOwn(undefEvents, map.id) || {};
                this.map = map;
                this.shim = getOwn(config.shim, map.id);
                this.depExports = [];
                this.depMaps = [];
                this.depMatched = [];
                this.pluginMaps = {};
                this.depCount = 0;

                /* this.exports this.factory
                 this.depMaps = [],
                 this.enabled, this.fetched
                 */
            };

            Module.prototype = {
                init: function (depMaps, factory, errback, options) {
                    options = options || {};

                    //Do not do more inits if already done. Can happen if there
                    //are multiple define calls for the same module. That is not
                    //a normal, common case, but it is also not unexpected.
                    if (this.inited) {
                        return;
                    }

                    this.factory = factory;

                    if (errback) {
                        //Register for errors on this module.
                        this.on('error', errback);
                    } else if (this.events.error) {
                        //If no errback already, but there are error listeners
                        //on this module, set up an errback to pass to the deps.
                        errback = bind(this, function (err) {
                            this.emit('error', err);
                        });
                    }

                    //Do a copy of the dependency array, so that
                    //source inputs are not modified. For example
                    //"shim" deps are passed in here directly, and
                    //doing a direct modification of the depMaps array
                    //would affect that config.
                    this.depMaps = depMaps && depMaps.slice(0);

                    this.errback = errback;

                    //Indicate this module has be initialized
                    this.inited = true;

                    this.ignore = options.ignore;

                    //Could have option to init this module in enabled mode,
                    //or could have been previously marked as enabled. However,
                    //the dependencies are not known until init is called. So
                    //if enabled previously, now trigger dependencies as enabled.
                    if (options.enabled || this.enabled) {
                        //Enable this module and dependencies.
                        //Will call this.check()
                        this.enable();
                    } else {
                        this.check();
                    }
                },

                defineDep: function (i, depExports) {
                    //Because of cycles, defined callback for a given
                    //export can be called more than once.
                    if (!this.depMatched[i]) {
                        this.depMatched[i] = true;
                        this.depCount -= 1;
                        this.depExports[i] = depExports;
                    }
                },

                fetch: function () {
                    if (this.fetched) {
                        return;
                    }
                    this.fetched = true;

                    context.startTime = (new Date()).getTime();

                    var map = this.map;

                    //If the manager is for a plugin managed resource,
                    //ask the plugin to load it now.
                    if (this.shim) {
                        context.makeRequire(this.map, {
                            enableBuildCallback: true
                        })(this.shim.deps || [], bind(this, function () {
                            return map.prefix ? this.callPlugin() : this.load();
                        }));
                    } else {
                        //Regular dependency.
                        return map.prefix ? this.callPlugin() : this.load();
                    }
                },

                load: function () {
                    var url = this.map.url;

                    //Regular dependency.
                    if (!urlFetched[url]) {
                        urlFetched[url] = true;
                        context.load(this.map.id, url);
                    }
                },

                /**
                 * Checks if the module is ready to define itself, and if so,
                 * define it.
                 */
                check: function () {
                    if (!this.enabled || this.enabling) {
                        return;
                    }

                    var err, cjsModule,
                        id = this.map.id,
                        depExports = this.depExports,
                        exports = this.exports,
                        factory = this.factory;

                    if (!this.inited) {
                        // Only fetch if not already in the defQueue.
                        if (!hasProp(context.defQueueMap, id)) {
                            this.fetch();
                        }
                    } else if (this.error) {
                        this.emit('error', this.error);
                    } else if (!this.defining) {
                        //The factory could trigger another require call
                        //that would result in checking this module to
                        //define itself again. If already in the process
                        //of doing that, skip this work.
                        this.defining = true;

                        if (this.depCount < 1 && !this.defined) {
                            if (isFunction(factory)) {
                                //If there is an error listener, favor passing
                                //to that instead of throwing an error. However,
                                //only do it for define()'d  modules. require
                                //errbacks should not be called for failures in
                                //their callbacks (#699). However if a global
                                //onError is set, use that.
                                if ((this.events.error && this.map.isDefine) ||
                                    req.onError !== defaultOnError) {
                                    try {
                                        exports = context.execCb(id, factory, depExports, exports);
                                    } catch (e) {
                                        err = e;
                                    }
                                } else {
                                    exports = context.execCb(id, factory, depExports, exports);
                                }

                                // Favor return value over exports. If node/cjs in play,
                                // then will not have a return value anyway. Favor
                                // module.exports assignment over exports object.
                                if (this.map.isDefine && exports === undefined) {
                                    cjsModule = this.module;
                                    if (cjsModule) {
                                        exports = cjsModule.exports;
                                    } else if (this.usingExports) {
                                        //exports already set the defined value.
                                        exports = this.exports;
                                    }
                                }

                                if (err) {
                                    err.requireMap = this.map;
                                    err.requireModules = this.map.isDefine ? [this.map.id] : null;
                                    err.requireType = this.map.isDefine ? 'define' : 'require';
                                    return onError((this.error = err));
                                }

                            } else {
                                //Just a literal value
                                exports = factory;
                            }

                            this.exports = exports;

                            if (this.map.isDefine && !this.ignore) {
                                defined[id] = exports;

                                if (req.onResourceLoad) {
                                    req.onResourceLoad(context, this.map, this.depMaps);
                                }
                            }

                            //Clean up
                            cleanRegistry(id);

                            this.defined = true;
                        }

                        //Finished the define stage. Allow calling check again
                        //to allow define notifications below in the case of a
                        //cycle.
                        this.defining = false;

                        if (this.defined && !this.defineEmitted) {
                            this.defineEmitted = true;
                            this.emit('defined', this.exports);
                            this.defineEmitComplete = true;
                        }

                    }
                },

                callPlugin: function () {
                    var map = this.map,
                        id = map.id,
                    //Map already normalized the prefix.
                        pluginMap = makeModuleMap(map.prefix);

                    //Mark this as a dependency for this plugin, so it
                    //can be traced for cycles.
                    this.depMaps.push(pluginMap);

                    on(pluginMap, 'defined', bind(this, function (plugin) {
                        var load, normalizedMap, normalizedMod,
                            bundleId = getOwn(bundlesMap, this.map.id),
                            name = this.map.name,
                            parentName = this.map.parentMap ? this.map.parentMap.name : null,
                            localRequire = context.makeRequire(map.parentMap, {
                                enableBuildCallback: true
                            });

                        //If current map is not normalized, wait for that
                        //normalized name to load instead of continuing.
                        if (this.map.unnormalized) {
                            //Normalize the ID if the plugin allows it.
                            if (plugin.normalize) {
                                name = plugin.normalize(name, function (name) {
                                        return normalize(name, parentName, true);
                                    }) || '';
                            }

                            //prefix and name should already be normalized, no need
                            //for applying map config again either.
                            normalizedMap = makeModuleMap(map.prefix + '!' + name,
                                this.map.parentMap);
                            on(normalizedMap,
                                'defined', bind(this, function (value) {
                                    this.init([], function () { return value; }, null, {
                                        enabled: true,
                                        ignore: true
                                    });
                                }));

                            normalizedMod = getOwn(registry, normalizedMap.id);
                            if (normalizedMod) {
                                //Mark this as a dependency for this plugin, so it
                                //can be traced for cycles.
                                this.depMaps.push(normalizedMap);

                                if (this.events.error) {
                                    normalizedMod.on('error', bind(this, function (err) {
                                        this.emit('error', err);
                                    }));
                                }
                                normalizedMod.enable();
                            }

                            return;
                        }

                        //If a paths config, then just load that file instead to
                        //resolve the plugin, as it is built into that paths layer.
                        if (bundleId) {
                            this.map.url = context.nameToUrl(bundleId);
                            this.load();
                            return;
                        }

                        load = bind(this, function (value) {
                            this.init([], function () { return value; }, null, {
                                enabled: true
                            });
                        });

                        load.error = bind(this, function (err) {
                            this.inited = true;
                            this.error = err;
                            err.requireModules = [id];

                            //Remove temp unnormalized modules for this module,
                            //since they will never be resolved otherwise now.
                            eachProp(registry, function (mod) {
                                if (mod.map.id.indexOf(id + '_unnormalized') === 0) {
                                    cleanRegistry(mod.map.id);
                                }
                            });

                            onError(err);
                        });

                        //Allow plugins to load other code without having to know the
                        //context or how to 'complete' the load.
                        load.fromText = bind(this, function (text, textAlt) {
                            /*jslint evil: true */
                            var moduleName = map.name,
                                moduleMap = makeModuleMap(moduleName),
                                hasInteractive = useInteractive;

                            //As of 2.1.0, support just passing the text, to reinforce
                            //fromText only being called once per resource. Still
                            //support old style of passing moduleName but discard
                            //that moduleName in favor of the internal ref.
                            if (textAlt) {
                                text = textAlt;
                            }

                            //Turn off interactive script matching for IE for any define
                            //calls in the text, then turn it back on at the end.
                            if (hasInteractive) {
                                useInteractive = false;
                            }

                            //Prime the system by creating a module instance for
                            //it.
                            getModule(moduleMap);

                            //Transfer any config to this other module.
                            if (hasProp(config.config, id)) {
                                config.config[moduleName] = config.config[id];
                            }

                            try {
                                req.exec(text);
                            } catch (e) {
                                return onError(makeError('fromtexteval',
                                    'fromText eval for ' + id +
                                    ' failed: ' + e,
                                    e,
                                    [id]));
                            }

                            if (hasInteractive) {
                                useInteractive = true;
                            }

                            //Mark this as a dependency for the plugin
                            //resource
                            this.depMaps.push(moduleMap);

                            //Support anonymous modules.
                            context.completeLoad(moduleName);

                            //Bind the value of that module to the value for this
                            //resource ID.
                            localRequire([moduleName], load);
                        });

                        //Use parentName here since the plugin's name is not reliable,
                        //could be some weird string with no path that actually wants to
                        //reference the parentName's path.
                        plugin.load(map.name, localRequire, load, config);
                    }));

                    context.enable(pluginMap, this);
                    this.pluginMaps[pluginMap.id] = pluginMap;
                },

                enable: function () {
                    enabledRegistry[this.map.id] = this;
                    this.enabled = true;

                    //Set flag mentioning that the module is enabling,
                    //so that immediate calls to the defined callbacks
                    //for dependencies do not trigger inadvertent load
                    //with the depCount still being zero.
                    this.enabling = true;

                    //Enable each dependency
                    each(this.depMaps, bind(this, function (depMap, i) {
                        var id, mod, handler;

                        if (typeof depMap === 'string') {
                            //Dependency needs to be converted to a depMap
                            //and wired up to this module.
                            depMap = makeModuleMap(depMap,
                                (this.map.isDefine ? this.map : this.map.parentMap),
                                false,
                                !this.skipMap);
                            this.depMaps[i] = depMap;

                            handler = getOwn(handlers, depMap.id);

                            if (handler) {
                                this.depExports[i] = handler(this);
                                return;
                            }

                            this.depCount += 1;

                            on(depMap, 'defined', bind(this, function (depExports) {
                                if (this.undefed) {
                                    return;
                                }
                                this.defineDep(i, depExports);
                                this.check();
                            }));

                            if (this.errback) {
                                on(depMap, 'error', bind(this, this.errback));
                            } else if (this.events.error) {
                                // No direct errback on this module, but something
                                // else is listening for errors, so be sure to
                                // propagate the error correctly.
                                on(depMap, 'error', bind(this, function(err) {
                                    this.emit('error', err);
                                }));
                            }
                        }

                        id = depMap.id;
                        mod = registry[id];

                        //Skip special modules like 'require', 'exports', 'module'
                        //Also, don't call enable if it is already enabled,
                        //important in circular dependency cases.
                        if (!hasProp(handlers, id) && mod && !mod.enabled) {
                            context.enable(depMap, this);
                        }
                    }));

                    //Enable each plugin that is used in
                    //a dependency
                    eachProp(this.pluginMaps, bind(this, function (pluginMap) {
                        var mod = getOwn(registry, pluginMap.id);
                        if (mod && !mod.enabled) {
                            context.enable(pluginMap, this);
                        }
                    }));

                    this.enabling = false;

                    this.check();
                },

                on: function (name, cb) {
                    var cbs = this.events[name];
                    if (!cbs) {
                        cbs = this.events[name] = [];
                    }
                    cbs.push(cb);
                },

                emit: function (name, evt) {
                    each(this.events[name], function (cb) {
                        cb(evt);
                    });
                    if (name === 'error') {
                        //Now that the error handler was triggered, remove
                        //the listeners, since this broken Module instance
                        //can stay around for a while in the registry.
                        delete this.events[name];
                    }
                }
            };

            function callGetModule(args) {
                //Skip modules already defined.
                if (!hasProp(defined, args[0])) {
                    getModule(makeModuleMap(args[0], null, true)).init(args[1], args[2]);
                }
            }

            function removeListener(node, func, name, ieName) {
                //Favor detachEvent because of IE9
                //issue, see attachEvent/addEventListener comment elsewhere
                //in this file.
                if (node.detachEvent && !isOpera) {
                    //Probably IE. If not it will throw an error, which will be
                    //useful to know.
                    if (ieName) {
                        node.detachEvent(ieName, func);
                    }
                } else {
                    node.removeEventListener(name, func, false);
                }
            }

            /**
             * Given an event from a script node, get the requirejs info from it,
             * and then removes the event listeners on the node.
             * @param {Event} evt
             * @returns {Object}
             */
            function getScriptData(evt) {
                //Using currentTarget instead of target for Firefox 2.0's sake. Not
                //all old browsers will be supported, but this one was easy enough
                //to support and still makes sense.
                var node = evt.currentTarget || evt.srcElement;

                //Remove the listeners once here.
                removeListener(node, context.onScriptLoad, 'load', 'onreadystatechange');
                removeListener(node, context.onScriptError, 'error');

                return {
                    node: node,
                    id: node && node.getAttribute('data-requiremodule')
                };
            }

            function intakeDefines() {
                var args;

                //Any defined modules in the global queue, intake them now.
                takeGlobalQueue();

                //Make sure any remaining defQueue items get properly processed.
                while (defQueue.length) {
                    args = defQueue.shift();
                    if (args[0] === null) {
                        return onError(makeError('mismatch', 'Mismatched anonymous define() module: ' +
                            args[args.length - 1]));
                    } else {
                        //args are id, deps, factory. Should be normalized by the
                        //define() function.
                        callGetModule(args);
                    }
                }
                context.defQueueMap = {};
            }

            context = {
                config: config,
                contextName: contextName,
                registry: registry,
                defined: defined,
                urlFetched: urlFetched,
                defQueue: defQueue,
                defQueueMap: {},
                Module: Module,
                makeModuleMap: makeModuleMap,
                nextTick: req.nextTick,
                onError: onError,

                /**
                 * Set a configuration for the context.
                 * @param {Object} cfg config object to integrate.
                 */
                configure: function (cfg) {
                    //Make sure the baseUrl ends in a slash.
                    if (cfg.baseUrl) {
                        if (cfg.baseUrl.charAt(cfg.baseUrl.length - 1) !== '/') {
                            cfg.baseUrl += '/';
                        }
                    }

                    //Save off the paths since they require special processing,
                    //they are additive.
                    var shim = config.shim,
                        objs = {
                            paths: true,
                            bundles: true,
                            config: true,
                            map: true
                        };

                    eachProp(cfg, function (value, prop) {
                        if (objs[prop]) {
                            if (!config[prop]) {
                                config[prop] = {};
                            }
                            mixin(config[prop], value, true, true);
                        } else {
                            config[prop] = value;
                        }
                    });

                    //Reverse map the bundles
                    if (cfg.bundles) {
                        eachProp(cfg.bundles, function (value, prop) {
                            each(value, function (v) {
                                if (v !== prop) {
                                    bundlesMap[v] = prop;
                                }
                            });
                        });
                    }

                    //Merge shim
                    if (cfg.shim) {
                        eachProp(cfg.shim, function (value, id) {
                            //Normalize the structure
                            if (isArray(value)) {
                                value = {
                                    deps: value
                                };
                            }
                            if ((value.exports || value.init) && !value.exportsFn) {
                                value.exportsFn = context.makeShimExports(value);
                            }
                            shim[id] = value;
                        });
                        config.shim = shim;
                    }

                    //Adjust packages if necessary.
                    if (cfg.packages) {
                        each(cfg.packages, function (pkgObj) {
                            var location, name;

                            pkgObj = typeof pkgObj === 'string' ? {name: pkgObj} : pkgObj;

                            name = pkgObj.name;
                            location = pkgObj.location;
                            if (location) {
                                config.paths[name] = pkgObj.location;
                            }

                            //Save pointer to main module ID for pkg name.
                            //Remove leading dot in main, so main paths are normalized,
                            //and remove any trailing .js, since different package
                            //envs have different conventions: some use a module name,
                            //some use a file name.
                            config.pkgs[name] = pkgObj.name + '/' + (pkgObj.main || 'main')
                                    .replace(currDirRegExp, '')
                                    .replace(jsSuffixRegExp, '');
                        });
                    }

                    //If there are any "waiting to execute" modules in the registry,
                    //update the maps for them, since their info, like URLs to load,
                    //may have changed.
                    eachProp(registry, function (mod, id) {
                        //If module already has init called, since it is too
                        //late to modify them, and ignore unnormalized ones
                        //since they are transient.
                        if (!mod.inited && !mod.map.unnormalized) {
                            mod.map = makeModuleMap(id, null, true);
                        }
                    });

                    //If a deps array or a config callback is specified, then call
                    //require with those args. This is useful when require is defined as a
                    //config object before require.js is loaded.
                    if (cfg.deps || cfg.callback) {
                        context.require(cfg.deps || [], cfg.callback);
                    }
                },

                makeShimExports: function (value) {
                    function fn() {
                        var ret;
                        if (value.init) {
                            ret = value.init.apply(global, arguments);
                        }
                        return ret || (value.exports && getGlobal(value.exports));
                    }
                    return fn;
                },

                makeRequire: function (relMap, options) {
                    options = options || {};

                    function localRequire(deps, callback, errback) {
                        var id, map, requireMod;

                        if (options.enableBuildCallback && callback && isFunction(callback)) {
                            callback.__requireJsBuild = true;
                        }

                        if (typeof deps === 'string') {
                            if (isFunction(callback)) {
                                //Invalid call
                                return onError(makeError('requireargs', 'Invalid require call'), errback);
                            }

                            //If require|exports|module are requested, get the
                            //value for them from the special handlers. Caveat:
                            //this only works while module is being defined.
                            if (relMap && hasProp(handlers, deps)) {
                                return handlers[deps](registry[relMap.id]);
                            }

                            //Synchronous access to one module. If require.get is
                            //available (as in the Node adapter), prefer that.
                            if (req.get) {
                                return req.get(context, deps, relMap, localRequire);
                            }

                            //Normalize module name, if it contains . or ..
                            map = makeModuleMap(deps, relMap, false, true);
                            id = map.id;

                            if (!hasProp(defined, id)) {
                                return onError(makeError('notloaded', 'Module name "' +
                                    id +
                                    '" has not been loaded yet for context: ' +
                                    contextName +
                                    (relMap ? '' : '. Use require([])')));
                            }
                            return defined[id];
                        }

                        //Grab defines waiting in the global queue.
                        intakeDefines();

                        //Mark all the dependencies as needing to be loaded.
                        context.nextTick(function () {
                            //Some defines could have been added since the
                            //require call, collect them.
                            intakeDefines();

                            requireMod = getModule(makeModuleMap(null, relMap));

                            //Store if map config should be applied to this require
                            //call for dependencies.
                            requireMod.skipMap = options.skipMap;

                            requireMod.init(deps, callback, errback, {
                                enabled: true
                            });

                            checkLoaded();
                        });

                        return localRequire;
                    }

                    mixin(localRequire, {
                        isBrowser: isBrowser,

                        /**
                         * Converts a module name + .extension into an URL path.
                         * *Requires* the use of a module name. It does not support using
                         * plain URLs like nameToUrl.
                         */
                        toUrl: function (moduleNamePlusExt) {
                            var ext,
                                index = moduleNamePlusExt.lastIndexOf('.'),
                                segment = moduleNamePlusExt.split('/')[0],
                                isRelative = segment === '.' || segment === '..';

                            //Have a file extension alias, and it is not the
                            //dots from a relative path.
                            if (index !== -1 && (!isRelative || index > 1)) {
                                ext = moduleNamePlusExt.substring(index, moduleNamePlusExt.length);
                                moduleNamePlusExt = moduleNamePlusExt.substring(0, index);
                            }

                            return context.nameToUrl(normalize(moduleNamePlusExt,
                                relMap && relMap.id, true), ext,  true);
                        },

                        defined: function (id) {
                            return hasProp(defined, makeModuleMap(id, relMap, false, true).id);
                        },

                        specified: function (id) {
                            id = makeModuleMap(id, relMap, false, true).id;
                            return hasProp(defined, id) || hasProp(registry, id);
                        }
                    });

                    //Only allow undef on top level require calls
                    if (!relMap) {
                        localRequire.undef = function (id) {
                            //Bind any waiting define() calls to this context,
                            //fix for #408
                            takeGlobalQueue();

                            var map = makeModuleMap(id, relMap, true),
                                mod = getOwn(registry, id);

                            mod.undefed = true;
                            removeScript(id);

                            delete defined[id];
                            delete urlFetched[map.url];
                            delete undefEvents[id];

                            //Clean queued defines too. Go backwards
                            //in array so that the splices do not
                            //mess up the iteration.
                            eachReverse(defQueue, function(args, i) {
                                if (args[0] === id) {
                                    defQueue.splice(i, 1);
                                }
                            });
                            delete context.defQueueMap[id];

                            if (mod) {
                                //Hold on to listeners in case the
                                //module will be attempted to be reloaded
                                //using a different config.
                                if (mod.events.defined) {
                                    undefEvents[id] = mod.events;
                                }

                                cleanRegistry(id);
                            }
                        };
                    }

                    return localRequire;
                },

                /**
                 * Called to enable a module if it is still in the registry
                 * awaiting enablement. A second arg, parent, the parent module,
                 * is passed in for context, when this method is overridden by
                 * the optimizer. Not shown here to keep code compact.
                 */
                enable: function (depMap) {
                    var mod = getOwn(registry, depMap.id);
                    if (mod) {
                        getModule(depMap).enable();
                    }
                },

                /**
                 * Internal method used by environment adapters to complete a load event.
                 * A load event could be a script load or just a load pass from a synchronous
                 * load call.
                 * @param {String} moduleName the name of the module to potentially complete.
                 */
                completeLoad: function (moduleName) {
                    var found, args, mod,
                        shim = getOwn(config.shim, moduleName) || {},
                        shExports = shim.exports;

                    takeGlobalQueue();

                    while (defQueue.length) {
                        args = defQueue.shift();
                        if (args[0] === null) {
                            args[0] = moduleName;
                            //If already found an anonymous module and bound it
                            //to this name, then this is some other anon module
                            //waiting for its completeLoad to fire.
                            if (found) {
                                break;
                            }
                            found = true;
                        } else if (args[0] === moduleName) {
                            //Found matching define call for this script!
                            found = true;
                        }

                        callGetModule(args);
                    }
                    context.defQueueMap = {};

                    //Do this after the cycle of callGetModule in case the result
                    //of those calls/init calls changes the registry.
                    mod = getOwn(registry, moduleName);

                    if (!found && !hasProp(defined, moduleName) && mod && !mod.inited) {
                        if (config.enforceDefine && (!shExports || !getGlobal(shExports))) {
                            if (hasPathFallback(moduleName)) {
                                return;
                            } else {
                                return onError(makeError('nodefine',
                                    'No define call for ' + moduleName,
                                    null,
                                    [moduleName]));
                            }
                        } else {
                            //A script that does not call define(), so just simulate
                            //the call for it.
                            callGetModule([moduleName, (shim.deps || []), shim.exportsFn]);
                        }
                    }

                    checkLoaded();
                },

                /**
                 * Converts a module name to a file path. Supports cases where
                 * moduleName may actually be just an URL.
                 * Note that it **does not** call normalize on the moduleName,
                 * it is assumed to have already been normalized. This is an
                 * internal API, not a public one. Use toUrl for the public API.
                 */
                nameToUrl: function (moduleName, ext, skipExt) {
                    var paths, syms, i, parentModule, url,
                        parentPath, bundleId,
                        pkgMain = getOwn(config.pkgs, moduleName);

                    if (pkgMain) {
                        moduleName = pkgMain;
                    }

                    bundleId = getOwn(bundlesMap, moduleName);

                    if (bundleId) {
                        return context.nameToUrl(bundleId, ext, skipExt);
                    }

                    //If a colon is in the URL, it indicates a protocol is used and it is just
                    //an URL to a file, or if it starts with a slash, contains a query arg (i.e. ?)
                    //or ends with .js, then assume the user meant to use an url and not a module id.
                    //The slash is important for protocol-less URLs as well as full paths.
                    if (req.jsExtRegExp.test(moduleName)) {
                        //Just a plain path, not module name lookup, so just return it.
                        //Add extension if it is included. This is a bit wonky, only non-.js things pass
                        //an extension, this method probably needs to be reworked.
                        url = moduleName + (ext || '');
                    } else {
                        //A module that needs to be converted to a path.
                        paths = config.paths;

                        syms = moduleName.split('/');
                        //For each module name segment, see if there is a path
                        //registered for it. Start with most specific name
                        //and work up from it.
                        for (i = syms.length; i > 0; i -= 1) {
                            parentModule = syms.slice(0, i).join('/');

                            parentPath = getOwn(paths, parentModule);
                            if (parentPath) {
                                //If an array, it means there are a few choices,
                                //Choose the one that is desired
                                if (isArray(parentPath)) {
                                    parentPath = parentPath[0];
                                }
                                syms.splice(0, i, parentPath);
                                break;
                            }
                        }

                        //Join the path parts together, then figure out if baseUrl is needed.
                        url = syms.join('/');
                        url += (ext || (/^data\:|\?/.test(url) || skipExt ? '' : '.js'));
                        url = (url.charAt(0) === '/' || url.match(/^[\w\+\.\-]+:/) ? '' : config.baseUrl) + url;
                    }

                    return config.urlArgs ? url +
                    ((url.indexOf('?') === -1 ? '?' : '&') +
                    config.urlArgs) : url;
                },

                //Delegates to req.load. Broken out as a separate function to
                //allow overriding in the optimizer.
                load: function (id, url) {
                    req.load(context, id, url);
                },

                /**
                 * Executes a module callback function. Broken out as a separate function
                 * solely to allow the build system to sequence the files in the built
                 * layer in the right sequence.
                 *
                 * @private
                 */
                execCb: function (name, callback, args, exports) {
                    return callback.apply(exports, args);
                },

                /**
                 * callback for script loads, used to check status of loading.
                 *
                 * @param {Event} evt the event from the browser for the script
                 * that was loaded.
                 */
                onScriptLoad: function (evt) {
                    //Using currentTarget instead of target for Firefox 2.0's sake. Not
                    //all old browsers will be supported, but this one was easy enough
                    //to support and still makes sense.
                    if (evt.type === 'load' ||
                        (readyRegExp.test((evt.currentTarget || evt.srcElement).readyState))) {
                        //Reset interactive script so a script node is not held onto for
                        //to long.
                        interactiveScript = null;

                        //Pull out the name of the module and the context.
                        var data = getScriptData(evt);
                        context.completeLoad(data.id);
                    }
                },

                /**
                 * Callback for script errors.
                 */
                onScriptError: function (evt) {
                    var data = getScriptData(evt);
                    if (!hasPathFallback(data.id)) {
                        return onError(makeError('scripterror', 'Script error for: ' + data.id, evt, [data.id]));
                    }
                }
            };

            context.require = context.makeRequire();
            return context;
        }

        /**
         * Main entry point.
         *
         * If the only argument to require is a string, then the module that
         * is represented by that string is fetched for the appropriate context.
         *
         * If the first argument is an array, then it will be treated as an array
         * of dependency string names to fetch. An optional function callback can
         * be specified to execute when all of those dependencies are available.
         *
         * Make a local req variable to help Caja compliance (it assumes things
         * on a require that are not standardized), and to give a short
         * name for minification/local scope use.
         */
        req = requirejs = function (deps, callback, errback, optional) {

            //Find the right context, use default
            var context, config,
                contextName = defContextName;

            // Determine if have config object in the call.
            if (!isArray(deps) && typeof deps !== 'string') {
                // deps is a config object
                config = deps;
                if (isArray(callback)) {
                    // Adjust args if there are dependencies
                    deps = callback;
                    callback = errback;
                    errback = optional;
                } else {
                    deps = [];
                }
            }

            if (config && config.context) {
                contextName = config.context;
            }

            context = getOwn(contexts, contextName);
            if (!context) {
                context = contexts[contextName] = req.s.newContext(contextName);
            }

            if (config) {
                context.configure(config);
            }

            return context.require(deps, callback, errback);
        };

        /**
         * Support require.config() to make it easier to cooperate with other
         * AMD loaders on globally agreed names.
         */
        req.config = function (config) {
            return req(config);
        };

        /**
         * Execute something after the current tick
         * of the event loop. Override for other envs
         * that have a better solution than setTimeout.
         * @param  {Function} fn function to execute later.
         */
        req.nextTick = typeof setTimeout !== 'undefined' ? function (fn) {
            setTimeout(fn, 4);
        } : function (fn) { fn(); };

        /**
         * Export require as a global, but only if it does not already exist.
         */
        if (!require) {
            require = req;
        }

        req.version = version;

        //Used to filter out dependencies that are already paths.
        req.jsExtRegExp = /^\/|:|\?|\.js$/;
        req.isBrowser = isBrowser;
        s = req.s = {
            contexts: contexts,
            newContext: newContext
        };

        //Create default context.
        req({});

        //Exports some context-sensitive methods on global require.
        each([
            'toUrl',
            'undef',
            'defined',
            'specified'
        ], function (prop) {
            //Reference from contexts instead of early binding to default context,
            //so that during builds, the latest instance of the default context
            //with its config gets used.
            req[prop] = function () {
                var ctx = contexts[defContextName];
                return ctx.require[prop].apply(ctx, arguments);
            };
        });

        if (isBrowser) {
            head = s.head = document.getElementsByTagName('head')[0];
            //If BASE tag is in play, using appendChild is a problem for IE6.
            //When that browser dies, this can be removed. Details in this jQuery bug:
            //http://dev.jquery.com/ticket/2709
            baseElement = document.getElementsByTagName('base')[0];
            if (baseElement) {
                head = s.head = baseElement.parentNode;
            }
        }

        /**
         * Any errors that require explicitly generates will be passed to this
         * function. Intercept/override it if you want custom error handling.
         * @param {Error} err the error object.
         */
        req.onError = defaultOnError;

        /**
         * Creates the node for the load command. Only used in browser envs.
         */
        req.createNode = function (config, moduleName, url) {
            var node = config.xhtml ?
                document.createElementNS('http://www.w3.org/1999/xhtml', 'html:script') :
                document.createElement('script');
            node.type = config.scriptType || 'text/javascript';
            node.charset = 'utf-8';
            node.async = true;
            return node;
        };

        /**
         * Does the request to load a module for the browser case.
         * Make this a separate function to allow other environments
         * to override it.
         *
         * @param {Object} context the require context to find state.
         * @param {String} moduleName the name of the module.
         * @param {Object} url the URL to the module.
         */
        req.load = function (context, moduleName, url) {
            var config = (context && context.config) || {},
                node;
            if (isBrowser) {
                //In the browser so use a script tag
                node = req.createNode(config, moduleName, url);
                if (config.onNodeCreated) {
                    config.onNodeCreated(node, config, moduleName, url);
                }

                node.setAttribute('data-requirecontext', context.contextName);
                node.setAttribute('data-requiremodule', moduleName);

                //Set up load listener. Test attachEvent first because IE9 has
                //a subtle issue in its addEventListener and script onload firings
                //that do not match the behavior of all other browsers with
                //addEventListener support, which fire the onload event for a
                //script right after the script execution. See:
                //https://connect.microsoft.com/IE/feedback/details/648057/script-onload-event-is-not-fired-immediately-after-script-execution
                //UNFORTUNATELY Opera implements attachEvent but does not follow the script
                //script execution mode.
                if (node.attachEvent &&
                        //Check if node.attachEvent is artificially added by custom script or
                        //natively supported by browser
                        //read https://github.com/jrburke/requirejs/issues/187
                        //if we can NOT find [native code] then it must NOT natively supported.
                        //in IE8, node.attachEvent does not have toString()
                        //Note the test for "[native code" with no closing brace, see:
                        //https://github.com/jrburke/requirejs/issues/273
                    !(node.attachEvent.toString && node.attachEvent.toString().indexOf('[native code') < 0) &&
                    !isOpera) {
                    //Probably IE. IE (at least 6-8) do not fire
                    //script onload right after executing the script, so
                    //we cannot tie the anonymous define call to a name.
                    //However, IE reports the script as being in 'interactive'
                    //readyState at the time of the define call.
                    useInteractive = true;

                    node.attachEvent('onreadystatechange', context.onScriptLoad);
                    //It would be great to add an error handler here to catch
                    //404s in IE9+. However, onreadystatechange will fire before
                    //the error handler, so that does not help. If addEventListener
                    //is used, then IE will fire error before load, but we cannot
                    //use that pathway given the connect.microsoft.com issue
                    //mentioned above about not doing the 'script execute,
                    //then fire the script load event listener before execute
                    //next script' that other browsers do.
                    //Best hope: IE10 fixes the issues,
                    //and then destroys all installs of IE 6-9.
                    //node.attachEvent('onerror', context.onScriptError);
                } else {
                    node.addEventListener('load', context.onScriptLoad, false);
                    node.addEventListener('error', context.onScriptError, false);
                }
                node.src = url;

                //For some cache cases in IE 6-8, the script executes before the end
                //of the appendChild execution, so to tie an anonymous define
                //call to the module name (which is stored on the node), hold on
                //to a reference to this node, but clear after the DOM insertion.
                currentlyAddingScript = node;
                if (baseElement) {
                    head.insertBefore(node, baseElement);
                } else {
                    head.appendChild(node);
                }
                currentlyAddingScript = null;

                return node;
            } else if (isWebWorker) {
                try {
                    //In a web worker, use importScripts. This is not a very
                    //efficient use of importScripts, importScripts will block until
                    //its script is downloaded and evaluated. However, if web workers
                    //are in play, the expectation that a build has been done so that
                    //only one script needs to be loaded anyway. This may need to be
                    //reevaluated if other use cases become common.
                    importScripts(url);

                    //Account for anonymous modules
                    context.completeLoad(moduleName);
                } catch (e) {
                    context.onError(makeError('importscripts',
                        'importScripts failed for ' +
                        moduleName + ' at ' + url,
                        e,
                        [moduleName]));
                }
            }
        };

        function getInteractiveScript() {
            if (interactiveScript && interactiveScript.readyState === 'interactive') {
                return interactiveScript;
            }

            eachReverse(scripts(), function (script) {
                if (script.readyState === 'interactive') {
                    return (interactiveScript = script);
                }
            });
            return interactiveScript;
        }

        //Look for a data-main script attribute, which could also adjust the baseUrl.
        if (isBrowser && !cfg.skipDataMain) {
            //Figure out baseUrl. Get it from the script tag with require.js in it.
            eachReverse(scripts(), function (script) {
                //Set the 'head' where we can append children by
                //using the script's parent.
                if (!head) {
                    head = script.parentNode;
                }

                //Look for a data-main attribute to set main script for the page
                //to load. If it is there, the path to data main becomes the
                //baseUrl, if it is not already set.
                dataMain = script.getAttribute('data-main');
                if (dataMain) {
                    //Preserve dataMain in case it is a path (i.e. contains '?')
                    mainScript = dataMain;

                    //Set final baseUrl if there is not already an explicit one.
                    if (!cfg.baseUrl) {
                        //Pull off the directory of data-main for use as the
                        //baseUrl.
                        src = mainScript.split('/');
                        mainScript = src.pop();
                        subPath = src.length ? src.join('/')  + '/' : './';

                        cfg.baseUrl = subPath;
                    }

                    //Strip off any trailing .js since mainScript is now
                    //like a module name.
                    mainScript = mainScript.replace(jsSuffixRegExp, '');

                    //If mainScript is still a path, fall back to dataMain
                    if (req.jsExtRegExp.test(mainScript)) {
                        mainScript = dataMain;
                    }

                    //Put the data-main script in the files to load.
                    cfg.deps = cfg.deps ? cfg.deps.concat(mainScript) : [mainScript];

                    return true;
                }
            });
        }

        /**
         * The function that handles definitions of modules. Differs from
         * require() in that a string for the module should be the first argument,
         * and the function to execute after dependencies are loaded should
         * return a value to define the module corresponding to the first argument's
         * name.
         */
        define = function (name, deps, callback) {
            var node, context;

            //Allow for anonymous modules
            if (typeof name !== 'string') {
                //Adjust args appropriately
                callback = deps;
                deps = name;
                name = null;
            }

            //This module may not have dependencies
            if (!isArray(deps)) {
                callback = deps;
                deps = null;
            }

            //If no name, and callback is a function, then figure out if it a
            //CommonJS thing with dependencies.
            if (!deps && isFunction(callback)) {
                deps = [];
                //Remove comments from the callback string,
                //look for require calls, and pull them into the dependencies,
                //but only if there are function args.
                if (callback.length) {
                    callback
                        .toString()
                        .replace(commentRegExp, '')
                        .replace(cjsRequireRegExp, function (match, dep) {
                            deps.push(dep);
                        });

                    //May be a CommonJS thing even without require calls, but still
                    //could use exports, and module. Avoid doing exports and module
                    //work though if it just needs require.
                    //REQUIRES the function to expect the CommonJS variables in the
                    //order listed below.
                    deps = (callback.length === 1 ? ['require'] : ['require', 'exports', 'module']).concat(deps);
                }
            }

            //If in IE 6-8 and hit an anonymous define() call, do the interactive
            //work.
            if (useInteractive) {
                node = currentlyAddingScript || getInteractiveScript();
                if (node) {
                    if (!name) {
                        name = node.getAttribute('data-requiremodule');
                    }
                    context = contexts[node.getAttribute('data-requirecontext')];
                }
            }

            //Always save off evaluating the def call until the script onload handler.
            //This allows multiple modules to be in a file without prematurely
            //tracing dependencies, and allows for anonymous module support,
            //where the module name is not known until the script onload event
            //occurs. If no context, use the global queue, and get it processed
            //in the onscript load callback.
            if (context) {
                context.defQueue.push([name, deps, callback]);
                context.defQueueMap[name] = true;
            } else {
                globalDefQueue.push([name, deps, callback]);
            }
        };

        define.amd = {
            jQuery: true
        };

        /**
         * Executes the text. Normally just uses eval, but can be modified
         * to use a better, environment-specific call. Only used for transpiling
         * loader plugins, not for plain JS modules.
         * @param {String} text the text to execute/evaluate.
         */
        req.exec = function (text) {
            /*jslint evil: true */
            return eval(text);
        };

        //Set up with config info.
        req(cfg);
    }(this));



    this.requirejsVars = {
        require: require,
        requirejs: require,
        define: define
    };

    if (env === 'browser') {
        /**
         * @license RequireJS rhino Copyright (c) 2012-2014, The Dojo Foundation All Rights Reserved.
         * Available via the MIT or new BSD license.
         * see: http://github.com/jrburke/requirejs for details
         */

//sloppy since eval enclosed with use strict causes problems if the source
//text is not strict-compliant.
        /*jslint sloppy: true, evil: true */
        /*global require, XMLHttpRequest */

        (function () {
            // Separate function to avoid eval pollution, same with arguments use.
            function exec() {
                eval(arguments[0]);
            }

            require.load = function (context, moduleName, url) {
                var xhr = new XMLHttpRequest();

                xhr.open('GET', url, true);
                xhr.send();

                xhr.onreadystatechange = function () {
                    if (xhr.readyState === 4) {
                        exec(xhr.responseText);

                        //Support anonymous modules.
                        context.completeLoad(moduleName);
                    }
                };
            };
        }());
    } else if (env === 'rhino') {
        /**
         * @license RequireJS rhino Copyright (c) 2010-2014, The Dojo Foundation All Rights Reserved.
         * Available via the MIT or new BSD license.
         * see: http://github.com/jrburke/requirejs for details
         */

        /*jslint */
        /*global require: false, java: false, load: false */

        (function () {
            'use strict';
            require.load = function (context, moduleName, url) {

                load(url);

                //Support anonymous modules.
                context.completeLoad(moduleName);
            };

        }());
    } else if (env === 'node') {
        this.requirejsVars.nodeRequire = nodeRequire;
        require.nodeRequire = nodeRequire;

        /**
         * @license RequireJS node Copyright (c) 2010-2014, The Dojo Foundation All Rights Reserved.
         * Available via the MIT or new BSD license.
         * see: http://github.com/jrburke/requirejs for details
         */

//Explicity not strict since this file contains an eval call, and do not want
//to enforce strict on code evaluated that way. See
//https://github.com/jrburke/r.js/issues/774
        /*jslint regexp: false, sloppy: true*/
        /*global require: false, define: false, requirejsVars: false, process: false */

        /**
         * This adapter assumes that x.js has loaded it and set up
         * some variables. This adapter just allows limited RequireJS
         * usage from within the requirejs directory. The general
         * node adapater is r.js.
         */

        (function () {
            var nodeReq = requirejsVars.nodeRequire,
                req = requirejsVars.require,
                def = requirejsVars.define,
                fs = nodeReq('fs'),
                path = nodeReq('path'),
                vm = nodeReq('vm'),
            //In Node 0.7+ existsSync is on fs.
                exists = fs.existsSync || path.existsSync,
                hasOwn = Object.prototype.hasOwnProperty;

            function hasProp(obj, prop) {
                return hasOwn.call(obj, prop);
            }

            function syncTick(fn) {
                fn();
            }

            function makeError(message, moduleName) {
                var err = new Error(message);
                err.requireModules = [moduleName];
                return err;
            }

            //Supply an implementation that allows synchronous get of a module.
            req.get = function (context, moduleName, relModuleMap, localRequire) {
                if (moduleName === "require" || moduleName === "exports" || moduleName === "module") {
                    context.onError(makeError("Explicit require of " + moduleName + " is not allowed.", moduleName));
                }

                var ret, oldTick,
                    moduleMap = context.makeModuleMap(moduleName, relModuleMap, false, true);

                //Normalize module name, if it contains . or ..
                moduleName = moduleMap.id;

                if (hasProp(context.defined, moduleName)) {
                    ret = context.defined[moduleName];
                } else {
                    if (ret === undefined) {
                        //Make sure nextTick for this type of call is sync-based.
                        oldTick = context.nextTick;
                        context.nextTick = syncTick;
                        try {
                            if (moduleMap.prefix) {
                                //A plugin, call requirejs to handle it. Now that
                                //nextTick is syncTick, the require will complete
                                //synchronously.
                                localRequire([moduleMap.originalName]);

                                //Now that plugin is loaded, can regenerate the moduleMap
                                //to get the final, normalized ID.
                                moduleMap = context.makeModuleMap(moduleMap.originalName, relModuleMap, false, true);
                                moduleName = moduleMap.id;
                            } else {
                                //Try to dynamically fetch it.
                                req.load(context, moduleName, moduleMap.url);

                                //Enable the module
                                context.enable(moduleMap, relModuleMap);
                            }

                            //Break any cycles by requiring it normally, but this will
                            //finish synchronously
                            context.require([moduleName]);

                            //The above calls are sync, so can do the next thing safely.
                            ret = context.defined[moduleName];
                        } finally {
                            context.nextTick = oldTick;
                        }
                    }
                }

                return ret;
            };

            req.nextTick = function (fn) {
                process.nextTick(fn);
            };

            //Add wrapper around the code so that it gets the requirejs
            //API instead of the Node API, and it is done lexically so
            //that it survives later execution.
            req.makeNodeWrapper = function (contents) {
                return '(function (require, requirejs, define) { ' +
                    contents +
                    '\n}(requirejsVars.require, requirejsVars.requirejs, requirejsVars.define));';
            };

            req.load = function (context, moduleName, url) {
                var contents, err,
                    config = context.config;

                if (config.shim[moduleName] && (!config.suppress || !config.suppress.nodeShim)) {
                    console.warn('Shim config not supported in Node, may or may not work. Detected ' +
                        'for module: ' + moduleName);
                }

                if (exists(url)) {
                    contents = fs.readFileSync(url, 'utf8');

                    contents = req.makeNodeWrapper(contents);
                    try {
                        vm.runInThisContext(contents, fs.realpathSync(url));
                    } catch (e) {
                        err = new Error('Evaluating ' + url + ' as module "' +
                            moduleName + '" failed with error: ' + e);
                        err.originalError = e;
                        err.moduleName = moduleName;
                        err.requireModules = [moduleName];
                        err.fileName = url;
                        return context.onError(err);
                    }
                } else {
                    def(moduleName, function () {
                        //Get the original name, since relative requires may be
                        //resolved differently in node (issue #202). Also, if relative,
                        //make it relative to the URL of the item requesting it
                        //(issue #393)
                        var dirName,
                            map = hasProp(context.registry, moduleName) &&
                                context.registry[moduleName].map,
                            parentMap = map && map.parentMap,
                            originalName = map && map.originalName;

                        if (originalName.charAt(0) === '.' && parentMap) {
                            dirName = parentMap.url.split('/');
                            dirName.pop();
                            originalName = dirName.join('/') + '/' + originalName;
                        }

                        try {
                            return (context.config.nodeRequire || req.nodeRequire)(originalName);
                        } catch (e) {
                            err = new Error('Tried loading "' + moduleName + '" at ' +
                                url + ' then tried node\'s require("' +
                                originalName + '") and it failed ' +
                                'with error: ' + e);
                            err.originalError = e;
                            err.moduleName = originalName;
                            err.requireModules = [moduleName];
                            throw err;
                        }
                    });
                }

                //Support anonymous modules.
                context.completeLoad(moduleName);
            };

            //Override to provide the function wrapper for define/require.
            req.exec = function (text) {
                /*jslint evil: true */
                text = req.makeNodeWrapper(text);
                return eval(text);
            };
        }());

    } else if (env === 'xpconnect') {
        /**
         * @license RequireJS xpconnect Copyright (c) 2013-2014, The Dojo Foundation All Rights Reserved.
         * Available via the MIT or new BSD license.
         * see: http://github.com/jrburke/requirejs for details
         */

        /*jslint */
        /*global require, load */

        (function () {
            'use strict';
            require.load = function (context, moduleName, url) {

                load(url);

                //Support anonymous modules.
                context.completeLoad(moduleName);
            };

        }());

    }

    //Support a default file name to execute. Useful for hosted envs
    //like Joyent where it defaults to a server.js as the only executed
    //script. But only do it if this is not an optimization run.
    if (commandOption !== 'o' && (!fileName || !jsSuffixRegExp.test(fileName))) {
        fileName = 'main.js';
    }

    /**
     * Loads the library files that can be used for the optimizer, or for other
     * tasks.
     */
    function loadLib() {
        /**
         * @license Copyright (c) 2010-2014, The Dojo Foundation All Rights Reserved.
         * Available via the MIT or new BSD license.
         * see: http://github.com/jrburke/requirejs for details
         */

        /*jslint strict: false */
        /*global Packages: false, process: false, window: false, navigator: false,
         document: false, define: false */

        /**
         * A plugin that modifies any /env/ path to be the right path based on
         * the host environment. Right now only works for Node, Rhino and browser.
         */
        (function () {
            var pathRegExp = /(\/|^)env\/|\{env\}/,
                env = 'unknown';

            if (typeof process !== 'undefined' && process.versions && !!process.versions.node) {
                env = 'node';
            } else if (typeof Packages !== 'undefined') {
                env = 'rhino';
            } else if ((typeof navigator !== 'undefined' && typeof document !== 'undefined') ||
                (typeof importScripts !== 'undefined' && typeof self !== 'undefined')) {
                env = 'browser';
            } else if (typeof Components !== 'undefined' && Components.classes && Components.interfaces) {
                env = 'xpconnect';
            }

            define('env', {
                get: function () {
                    return env;
                },

                load: function (name, req, load, config) {
                    //Allow override in the config.
                    if (config.env) {
                        env = config.env;
                    }

                    name = name.replace(pathRegExp, function (match, prefix) {
                        if (match.indexOf('{') === -1) {
                            return prefix + env + '/';
                        } else {
                            return env;
                        }
                    });

                    req([name], function (mod) {
                        load(mod);
                    });
                }
            });
        }());
        /**
         * @license Copyright (c) 2010-2014, The Dojo Foundation All Rights Reserved.
         * Available via the MIT or new BSD license.
         * see: http://github.com/jrburke/requirejs for details
         */

        /*jslint plusplus: true */
        /*global define, java */

        define('lang', function () {
            'use strict';

            var lang, isJavaObj,
                hasOwn = Object.prototype.hasOwnProperty;

            function hasProp(obj, prop) {
                return hasOwn.call(obj, prop);
            }

            isJavaObj = function () {
                return false;
            };

            //Rhino, but not Nashorn (detected by importPackage not existing)
            //Can have some strange foreign objects.
            if (typeof java !== 'undefined' && java.lang && java.lang.Object && typeof importPackage !== 'undefined') {
                isJavaObj = function (obj) {
                    return obj instanceof java.lang.Object;
                };
            }

            lang = {
                backSlashRegExp: /\\/g,
                ostring: Object.prototype.toString,

                isArray: Array.isArray || function (it) {
                    return lang.ostring.call(it) === "[object Array]";
                },

                isFunction: function(it) {
                    return lang.ostring.call(it) === "[object Function]";
                },

                isRegExp: function(it) {
                    return it && it instanceof RegExp;
                },

                hasProp: hasProp,

                //returns true if the object does not have an own property prop,
                //or if it does, it is a falsy value.
                falseProp: function (obj, prop) {
                    return !hasProp(obj, prop) || !obj[prop];
                },

                //gets own property value for given prop on object
                getOwn: function (obj, prop) {
                    return hasProp(obj, prop) && obj[prop];
                },

                _mixin: function(dest, source, override){
                    var name;
                    for (name in source) {
                        if(source.hasOwnProperty(name) &&
                            (override || !dest.hasOwnProperty(name))) {
                            dest[name] = source[name];
                        }
                    }

                    return dest; // Object
                },

                /**
                 * mixin({}, obj1, obj2) is allowed. If the last argument is a boolean,
                 * then the source objects properties are force copied over to dest.
                 */
                mixin: function(dest){
                    var parameters = Array.prototype.slice.call(arguments),
                        override, i, l;

                    if (!dest) { dest = {}; }

                    if (parameters.length > 2 && typeof arguments[parameters.length-1] === 'boolean') {
                        override = parameters.pop();
                    }

                    for (i = 1, l = parameters.length; i < l; i++) {
                        lang._mixin(dest, parameters[i], override);
                    }
                    return dest; // Object
                },

                /**
                 * Does a deep mix of source into dest, where source values override
                 * dest values if a winner is needed.
                 * @param  {Object} dest destination object that receives the mixed
                 * values.
                 * @param  {Object} source source object contributing properties to mix
                 * in.
                 * @return {[Object]} returns dest object with the modification.
                 */
                deepMix: function(dest, source) {
                    lang.eachProp(source, function (value, prop) {
                        if (typeof value === 'object' && value &&
                            !lang.isArray(value) && !lang.isFunction(value) &&
                            !(value instanceof RegExp)) {

                            if (!dest[prop]) {
                                dest[prop] = {};
                            }
                            lang.deepMix(dest[prop], value);
                        } else {
                            dest[prop] = value;
                        }
                    });
                    return dest;
                },

                /**
                 * Does a type of deep copy. Do not give it anything fancy, best
                 * for basic object copies of objects that also work well as
                 * JSON-serialized things, or has properties pointing to functions.
                 * For non-array/object values, just returns the same object.
                 * @param  {Object} obj      copy properties from this object
                 * @param  {Object} [result] optional result object to use
                 * @return {Object}
                 */
                deeplikeCopy: function (obj) {
                    var type, result;

                    if (lang.isArray(obj)) {
                        result = [];
                        obj.forEach(function(value) {
                            result.push(lang.deeplikeCopy(value));
                        });
                        return result;
                    }

                    type = typeof obj;
                    if (obj === null || obj === undefined || type === 'boolean' ||
                        type === 'string' || type === 'number' || lang.isFunction(obj) ||
                        lang.isRegExp(obj)|| isJavaObj(obj)) {
                        return obj;
                    }

                    //Anything else is an object, hopefully.
                    result = {};
                    lang.eachProp(obj, function(value, key) {
                        result[key] = lang.deeplikeCopy(value);
                    });
                    return result;
                },

                delegate: (function () {
                    // boodman/crockford delegation w/ cornford optimization
                    function TMP() {}
                    return function (obj, props) {
                        TMP.prototype = obj;
                        var tmp = new TMP();
                        TMP.prototype = null;
                        if (props) {
                            lang.mixin(tmp, props);
                        }
                        return tmp; // Object
                    };
                }()),

                /**
                 * Helper function for iterating over an array. If the func returns
                 * a true value, it will break out of the loop.
                 */
                each: function each(ary, func) {
                    if (ary) {
                        var i;
                        for (i = 0; i < ary.length; i += 1) {
                            if (func(ary[i], i, ary)) {
                                break;
                            }
                        }
                    }
                },

                /**
                 * Cycles over properties in an object and calls a function for each
                 * property value. If the function returns a truthy value, then the
                 * iteration is stopped.
                 */
                eachProp: function eachProp(obj, func) {
                    var prop;
                    for (prop in obj) {
                        if (hasProp(obj, prop)) {
                            if (func(obj[prop], prop)) {
                                break;
                            }
                        }
                    }
                },

                //Similar to Function.prototype.bind, but the "this" object is specified
                //first, since it is easier to read/figure out what "this" will be.
                bind: function bind(obj, fn) {
                    return function () {
                        return fn.apply(obj, arguments);
                    };
                },

                //Escapes a content string to be be a string that has characters escaped
                //for inclusion as part of a JS string.
                jsEscape: function (content) {
                    return content.replace(/(["'\\])/g, '\\$1')
                        .replace(/[\f]/g, "\\f")
                        .replace(/[\b]/g, "\\b")
                        .replace(/[\n]/g, "\\n")
                        .replace(/[\t]/g, "\\t")
                        .replace(/[\r]/g, "\\r");
                }
            };
            return lang;
        });
        /**
         * prim 0.0.1 Copyright (c) 2012-2014, The Dojo Foundation All Rights Reserved.
         * Available via the MIT or new BSD license.
         * see: http://github.com/requirejs/prim for details
         */

        /*global setImmediate, process, setTimeout, define, module */

//Set prime.hideResolutionConflict = true to allow "resolution-races"
//in promise-tests to pass.
//Since the goal of prim is to be a small impl for trusted code, it is
//more important to normally throw in this case so that we can find
//logic errors quicker.

        var prim;
        (function () {
            'use strict';
            var op = Object.prototype,
                hasOwn = op.hasOwnProperty;

            function hasProp(obj, prop) {
                return hasOwn.call(obj, prop);
            }

            /**
             * Helper function for iterating over an array. If the func returns
             * a true value, it will break out of the loop.
             */
            function each(ary, func) {
                if (ary) {
                    var i;
                    for (i = 0; i < ary.length; i += 1) {
                        if (ary[i]) {
                            func(ary[i], i, ary);
                        }
                    }
                }
            }

            function check(p) {
                if (hasProp(p, 'e') || hasProp(p, 'v')) {
                    if (!prim.hideResolutionConflict) {
                        throw new Error('Prim promise already resolved: ' +
                            JSON.stringify(p));
                    }
                    return false;
                }
                return true;
            }

            function notify(ary, value) {
                prim.nextTick(function () {
                    each(ary, function (item) {
                        item(value);
                    });
                });
            }

            prim = function prim() {
                var p,
                    ok = [],
                    fail = [];

                return (p = {
                    callback: function (yes, no) {
                        if (no) {
                            p.errback(no);
                        }

                        if (hasProp(p, 'v')) {
                            prim.nextTick(function () {
                                yes(p.v);
                            });
                        } else {
                            ok.push(yes);
                        }
                    },

                    errback: function (no) {
                        if (hasProp(p, 'e')) {
                            prim.nextTick(function () {
                                no(p.e);
                            });
                        } else {
                            fail.push(no);
                        }
                    },

                    finished: function () {
                        return hasProp(p, 'e') || hasProp(p, 'v');
                    },

                    rejected: function () {
                        return hasProp(p, 'e');
                    },

                    resolve: function (v) {
                        if (check(p)) {
                            p.v = v;
                            notify(ok, v);
                        }
                        return p;
                    },
                    reject: function (e) {
                        if (check(p)) {
                            p.e = e;
                            notify(fail, e);
                        }
                        return p;
                    },

                    start: function (fn) {
                        p.resolve();
                        return p.promise.then(fn);
                    },

                    promise: {
                        then: function (yes, no) {
                            var next = prim();

                            p.callback(function (v) {
                                try {
                                    if (yes && typeof yes === 'function') {
                                        v = yes(v);
                                    }

                                    if (v && v.then) {
                                        v.then(next.resolve, next.reject);
                                    } else {
                                        next.resolve(v);
                                    }
                                } catch (e) {
                                    next.reject(e);
                                }
                            }, function (e) {
                                var err;

                                try {
                                    if (!no || typeof no !== 'function') {
                                        next.reject(e);
                                    } else {
                                        err = no(e);

                                        if (err && err.then) {
                                            err.then(next.resolve, next.reject);
                                        } else {
                                            next.resolve(err);
                                        }
                                    }
                                } catch (e2) {
                                    next.reject(e2);
                                }
                            });

                            return next.promise;
                        },

                        fail: function (no) {
                            return p.promise.then(null, no);
                        },

                        end: function () {
                            p.errback(function (e) {
                                throw e;
                            });
                        }
                    }
                });
            };

            prim.serial = function (ary) {
                var result = prim().resolve().promise;
                each(ary, function (item) {
                    result = result.then(function () {
                        return item();
                    });
                });
                return result;
            };

            prim.nextTick = typeof setImmediate === 'function' ? setImmediate :
                (typeof process !== 'undefined' && process.nextTick ?
                    process.nextTick : (typeof setTimeout !== 'undefined' ?
                    function (fn) {
                        setTimeout(fn, 0);
                    } : function (fn) {
                    fn();
                }));

            if (typeof define === 'function' && define.amd) {
                define('prim', function () { return prim; });
            } else if (typeof module !== 'undefined' && module.exports) {
                module.exports = prim;
            }
        }());
        if(env === 'browser') {
            /**
             * @license RequireJS Copyright (c) 2012-2014, The Dojo Foundation All Rights Reserved.
             * Available via the MIT or new BSD license.
             * see: http://github.com/jrburke/requirejs for details
             */

            /*jslint strict: false */
            /*global define: false, load: false */

//Just a stub for use with uglify's consolidator.js
            define('browser/assert', function () {
                return {};
            });

        }

        if(env === 'node') {
            /**
             * @license RequireJS Copyright (c) 2012-2014, The Dojo Foundation All Rights Reserved.
             * Available via the MIT or new BSD license.
             * see: http://github.com/jrburke/requirejs for details
             */

            /*jslint strict: false */
            /*global define: false, load: false */

//Needed so that rhino/assert can return a stub for uglify's consolidator.js
            define('node/assert', ['assert'], function (assert) {
                return assert;
            });

        }

        if(env === 'rhino') {
            /**
             * @license RequireJS Copyright (c) 2013-2014, The Dojo Foundation All Rights Reserved.
             * Available via the MIT or new BSD license.
             * see: http://github.com/jrburke/requirejs for details
             */

            /*jslint strict: false */
            /*global define: false, load: false */

//Just a stub for use with uglify's consolidator.js
            define('rhino/assert', function () {
                return {};
            });

        }

        if(env === 'xpconnect') {
            /**
             * @license RequireJS Copyright (c) 2013-2014, The Dojo Foundation All Rights Reserved.
             * Available via the MIT or new BSD license.
             * see: http://github.com/jrburke/requirejs for details
             */

            /*jslint strict: false */
            /*global define: false, load: false */

//Just a stub for use with uglify's consolidator.js
            define('xpconnect/assert', function () {
                return {};
            });

        }

        if(env === 'browser') {
            /**
             * @license Copyright (c) 2010-2014, The Dojo Foundation All Rights Reserved.
             * Available via the MIT or new BSD license.
             * see: http://github.com/jrburke/requirejs for details
             */

            /*jslint strict: false */
            /*global define: false, process: false */

            define('browser/args', function () {
                //Always expect config via an API call
                return [];
            });

        }

        if(env === 'node') {
            /**
             * @license Copyright (c) 2010-2014, The Dojo Foundation All Rights Reserved.
             * Available via the MIT or new BSD license.
             * see: http://github.com/jrburke/requirejs for details
             */

            /*jslint strict: false */
            /*global define: false, process: false */

            define('node/args', function () {
                //Do not return the "node" or "r.js" arguments
                var args = process.argv.slice(2);

                //Ignore any command option used for main x.js branching
                if (args[0] && args[0].indexOf('-') === 0) {
                    args = args.slice(1);
                }

                return args;
            });

        }

        if(env === 'rhino') {
            /**
             * @license Copyright (c) 2010-2014, The Dojo Foundation All Rights Reserved.
             * Available via the MIT or new BSD license.
             * see: http://github.com/jrburke/requirejs for details
             */

            /*jslint strict: false */
            /*global define: false, process: false */

            var jsLibRhinoArgs = (typeof rhinoArgs !== 'undefined' && rhinoArgs) || [].concat(Array.prototype.slice.call(arguments, 0));

            define('rhino/args', function () {
                var args = jsLibRhinoArgs;

                //Ignore any command option used for main x.js branching
                if (args[0] && args[0].indexOf('-') === 0) {
                    args = args.slice(1);
                }

                return args;
            });

        }

        if(env === 'xpconnect') {
            /**
             * @license Copyright (c) 2013-2014, The Dojo Foundation All Rights Reserved.
             * Available via the MIT or new BSD license.
             * see: http://github.com/jrburke/requirejs for details
             */

            /*jslint strict: false */
            /*global define, xpconnectArgs */

            var jsLibXpConnectArgs = (typeof xpconnectArgs !== 'undefined' && xpconnectArgs) || [].concat(Array.prototype.slice.call(arguments, 0));

            define('xpconnect/args', function () {
                var args = jsLibXpConnectArgs;

                //Ignore any command option used for main x.js branching
                if (args[0] && args[0].indexOf('-') === 0) {
                    args = args.slice(1);
                }

                return args;
            });

        }

        if(env === 'browser') {
            /**
             * @license RequireJS Copyright (c) 2010-2014, The Dojo Foundation All Rights Reserved.
             * Available via the MIT or new BSD license.
             * see: http://github.com/jrburke/requirejs for details
             */

            /*jslint strict: false */
            /*global define: false, console: false */

            define('browser/load', ['./file'], function (file) {
                function load(fileName) {
                    eval(file.readFile(fileName));
                }

                return load;
            });

        }

        if(env === 'node') {
            /**
             * @license RequireJS Copyright (c) 2010-2014, The Dojo Foundation All Rights Reserved.
             * Available via the MIT or new BSD license.
             * see: http://github.com/jrburke/requirejs for details
             */

            /*jslint strict: false */
            /*global define: false, console: false */

            define('node/load', ['fs'], function (fs) {
                function load(fileName) {
                    var contents = fs.readFileSync(fileName, 'utf8');
                    process.compile(contents, fileName);
                }

                return load;
            });

        }

        if(env === 'rhino') {
            /**
             * @license RequireJS Copyright (c) 2010-2014, The Dojo Foundation All Rights Reserved.
             * Available via the MIT or new BSD license.
             * see: http://github.com/jrburke/requirejs for details
             */

            /*jslint strict: false */
            /*global define: false, load: false */

            define('rhino/load', function () {
                return load;
            });

        }

        if(env === 'xpconnect') {
            /**
             * @license RequireJS Copyright (c) 2013-2014, The Dojo Foundation All Rights Reserved.
             * Available via the MIT or new BSD license.
             * see: http://github.com/jrburke/requirejs for details
             */

            /*jslint strict: false */
            /*global define: false, load: false */

            define('xpconnect/load', function () {
                return load;
            });

        }

        if(env === 'browser') {
            /**
             * @license Copyright (c) 2012-2014, The Dojo Foundation All Rights Reserved.
             * Available via the MIT or new BSD license.
             * see: http://github.com/jrburke/requirejs for details
             */

            /*jslint sloppy: true, nomen: true */
            /*global require, define, console, XMLHttpRequest, requirejs, location */

            define('browser/file', ['prim'], function (prim) {

                var file,
                    currDirRegExp = /^\.(\/|$)/;

                function frontSlash(path) {
                    return path.replace(/\\/g, '/');
                }

                function exists(path) {
                    var status, xhr = new XMLHttpRequest();

                    //Oh yeah, that is right SYNC IO. Behold its glory
                    //and horrible blocking behavior.
                    xhr.open('HEAD', path, false);
                    xhr.send();
                    status = xhr.status;

                    return status === 200 || status === 304;
                }

                function mkDir(dir) {
                    console.log('mkDir is no-op in browser');
                }

                function mkFullDir(dir) {
                    console.log('mkFullDir is no-op in browser');
                }

                file = {
                    backSlashRegExp: /\\/g,
                    exclusionRegExp: /^\./,
                    getLineSeparator: function () {
                        return '/';
                    },

                    exists: function (fileName) {
                        return exists(fileName);
                    },

                    parent: function (fileName) {
                        var parts = fileName.split('/');
                        parts.pop();
                        return parts.join('/');
                    },

                    /**
                     * Gets the absolute file path as a string, normalized
                     * to using front slashes for path separators.
                     * @param {String} fileName
                     */
                    absPath: function (fileName) {
                        var dir;
                        if (currDirRegExp.test(fileName)) {
                            dir = frontSlash(location.href);
                            if (dir.indexOf('/') !== -1) {
                                dir = dir.split('/');

                                //Pull off protocol and host, just want
                                //to allow paths (other build parts, like
                                //require._isSupportedBuildUrl do not support
                                //full URLs), but a full path from
                                //the root.
                                dir.splice(0, 3);

                                dir.pop();
                                dir = '/' + dir.join('/');
                            }

                            fileName = dir + fileName.substring(1);
                        }

                        return fileName;
                    },

                    normalize: function (fileName) {
                        return fileName;
                    },

                    isFile: function (path) {
                        return true;
                    },

                    isDirectory: function (path) {
                        return false;
                    },

                    getFilteredFileList: function (startDir, regExpFilters, makeUnixPaths) {
                        console.log('file.getFilteredFileList is no-op in browser');
                    },

                    copyDir: function (srcDir, destDir, regExpFilter, onlyCopyNew) {
                        console.log('file.copyDir is no-op in browser');

                    },

                    copyFile: function (srcFileName, destFileName, onlyCopyNew) {
                        console.log('file.copyFile is no-op in browser');
                    },

                    /**
                     * Renames a file. May fail if "to" already exists or is on another drive.
                     */
                    renameFile: function (from, to) {
                        console.log('file.renameFile is no-op in browser');
                    },

                    /**
                     * Reads a *text* file.
                     */
                    readFile: function (path, encoding) {
                        var xhr = new XMLHttpRequest();

                        //Oh yeah, that is right SYNC IO. Behold its glory
                        //and horrible blocking behavior.
                        xhr.open('GET', path, false);
                        xhr.send();

                        return xhr.responseText;
                    },

                    readFileAsync: function (path, encoding) {
                        var xhr = new XMLHttpRequest(),
                            d = prim();

                        xhr.open('GET', path, true);
                        xhr.send();

                        xhr.onreadystatechange = function () {
                            if (xhr.readyState === 4) {
                                if (xhr.status > 400) {
                                    d.reject(new Error('Status: ' + xhr.status + ': ' + xhr.statusText));
                                } else {
                                    d.resolve(xhr.responseText);
                                }
                            }
                        };

                        return d.promise;
                    },

                    saveUtf8File: function (fileName, fileContents) {
                        //summary: saves a *text* file using UTF-8 encoding.
                        file.saveFile(fileName, fileContents, "utf8");
                    },

                    saveFile: function (fileName, fileContents, encoding) {
                        requirejs.browser.saveFile(fileName, fileContents, encoding);
                    },

                    deleteFile: function (fileName) {
                        console.log('file.deleteFile is no-op in browser');
                    },

                    /**
                     * Deletes any empty directories under the given directory.
                     */
                    deleteEmptyDirs: function (startDir) {
                        console.log('file.deleteEmptyDirs is no-op in browser');
                    }
                };

                return file;

            });

        }

        if(env === 'node') {
            /**
             * @license Copyright (c) 2010-2014, The Dojo Foundation All Rights Reserved.
             * Available via the MIT or new BSD license.
             * see: http://github.com/jrburke/requirejs for details
             */

            /*jslint plusplus: false, octal:false, strict: false */
            /*global define: false, process: false */

            define('node/file', ['fs', 'path', 'prim'], function (fs, path, prim) {

                var isWindows = process.platform === 'win32',
                    windowsDriveRegExp = /^[a-zA-Z]\:\/$/,
                    file;

                function frontSlash(path) {
                    return path.replace(/\\/g, '/');
                }

                function exists(path) {
                    if (isWindows && path.charAt(path.length - 1) === '/' &&
                        path.charAt(path.length - 2) !== ':') {
                        path = path.substring(0, path.length - 1);
                    }

                    try {
                        fs.statSync(path);
                        return true;
                    } catch (e) {
                        return false;
                    }
                }

                function mkDir(dir) {
                    if (!exists(dir) && (!isWindows || !windowsDriveRegExp.test(dir))) {
                        fs.mkdirSync(dir, 511);
                    }
                }

                function mkFullDir(dir) {
                    var parts = dir.split('/'),
                        currDir = '',
                        first = true;

                    parts.forEach(function (part) {
                        //First part may be empty string if path starts with a slash.
                        currDir += part + '/';
                        first = false;

                        if (part) {
                            mkDir(currDir);
                        }
                    });
                }

                file = {
                    backSlashRegExp: /\\/g,
                    exclusionRegExp: /^\./,
                    getLineSeparator: function () {
                        return '/';
                    },

                    exists: function (fileName) {
                        return exists(fileName);
                    },

                    parent: function (fileName) {
                        var parts = fileName.split('/');
                        parts.pop();
                        return parts.join('/');
                    },

                    /**
                     * Gets the absolute file path as a string, normalized
                     * to using front slashes for path separators.
                     * @param {String} fileName
                     */
                    absPath: function (fileName) {
                        return frontSlash(path.normalize(frontSlash(fs.realpathSync(fileName))));
                    },

                    normalize: function (fileName) {
                        return frontSlash(path.normalize(fileName));
                    },

                    isFile: function (path) {
                        return fs.statSync(path).isFile();
                    },

                    isDirectory: function (path) {
                        return fs.statSync(path).isDirectory();
                    },

                    getFilteredFileList: function (/*String*/startDir, /*RegExp*/regExpFilters, /*boolean?*/makeUnixPaths) {
                        //summary: Recurses startDir and finds matches to the files that match regExpFilters.include
                        //and do not match regExpFilters.exclude. Or just one regexp can be passed in for regExpFilters,
                        //and it will be treated as the "include" case.
                        //Ignores files/directories that start with a period (.) unless exclusionRegExp
                        //is set to another value.
                        var files = [], topDir, regExpInclude, regExpExclude, dirFileArray,
                            i, stat, filePath, ok, dirFiles, fileName;

                        topDir = startDir;

                        regExpInclude = regExpFilters.include || regExpFilters;
                        regExpExclude = regExpFilters.exclude || null;

                        if (file.exists(topDir)) {
                            dirFileArray = fs.readdirSync(topDir);
                            for (i = 0; i < dirFileArray.length; i++) {
                                fileName = dirFileArray[i];
                                filePath = path.join(topDir, fileName);
                                stat = fs.statSync(filePath);
                                if (stat.isFile()) {
                                    if (makeUnixPaths) {
                                        //Make sure we have a JS string.
                                        if (filePath.indexOf("/") === -1) {
                                            filePath = frontSlash(filePath);
                                        }
                                    }

                                    ok = true;
                                    if (regExpInclude) {
                                        ok = filePath.match(regExpInclude);
                                    }
                                    if (ok && regExpExclude) {
                                        ok = !filePath.match(regExpExclude);
                                    }

                                    if (ok && (!file.exclusionRegExp ||
                                        !file.exclusionRegExp.test(fileName))) {
                                        files.push(filePath);
                                    }
                                } else if (stat.isDirectory() &&
                                    (!file.exclusionRegExp || !file.exclusionRegExp.test(fileName))) {
                                    dirFiles = this.getFilteredFileList(filePath, regExpFilters, makeUnixPaths);
                                    files.push.apply(files, dirFiles);
                                }
                            }
                        }

                        return files; //Array
                    },

                    copyDir: function (/*String*/srcDir, /*String*/destDir, /*RegExp?*/regExpFilter, /*boolean?*/onlyCopyNew) {
                        //summary: copies files from srcDir to destDir using the regExpFilter to determine if the
                        //file should be copied. Returns a list file name strings of the destinations that were copied.
                        regExpFilter = regExpFilter || /\w/;

                        //Normalize th directory names, but keep front slashes.
                        //path module on windows now returns backslashed paths.
                        srcDir = frontSlash(path.normalize(srcDir));
                        destDir = frontSlash(path.normalize(destDir));

                        var fileNames = file.getFilteredFileList(srcDir, regExpFilter, true),
                            copiedFiles = [], i, srcFileName, destFileName;

                        for (i = 0; i < fileNames.length; i++) {
                            srcFileName = fileNames[i];
                            destFileName = srcFileName.replace(srcDir, destDir);

                            if (file.copyFile(srcFileName, destFileName, onlyCopyNew)) {
                                copiedFiles.push(destFileName);
                            }
                        }

                        return copiedFiles.length ? copiedFiles : null; //Array or null
                    },

                    copyFile: function (/*String*/srcFileName, /*String*/destFileName, /*boolean?*/onlyCopyNew) {
                        //summary: copies srcFileName to destFileName. If onlyCopyNew is set, it only copies the file if
                        //srcFileName is newer than destFileName. Returns a boolean indicating if the copy occurred.
                        var parentDir;

                        //logger.trace("Src filename: " + srcFileName);
                        //logger.trace("Dest filename: " + destFileName);

                        //If onlyCopyNew is true, then compare dates and only copy if the src is newer
                        //than dest.
                        if (onlyCopyNew) {
                            if (file.exists(destFileName) && fs.statSync(destFileName).mtime.getTime() >= fs.statSync(srcFileName).mtime.getTime()) {
                                return false; //Boolean
                            }
                        }

                        //Make sure destination dir exists.
                        parentDir = path.dirname(destFileName);
                        if (!file.exists(parentDir)) {
                            mkFullDir(parentDir);
                        }

                        fs.writeFileSync(destFileName, fs.readFileSync(srcFileName, 'binary'), 'binary');

                        return true; //Boolean
                    },

                    /**
                     * Renames a file. May fail if "to" already exists or is on another drive.
                     */
                    renameFile: function (from, to) {
                        return fs.renameSync(from, to);
                    },

                    /**
                     * Reads a *text* file.
                     */
                    readFile: function (/*String*/path, /*String?*/encoding) {
                        if (encoding === 'utf-8') {
                            encoding = 'utf8';
                        }
                        if (!encoding) {
                            encoding = 'utf8';
                        }

                        var text = fs.readFileSync(path, encoding);

                        //Hmm, would not expect to get A BOM, but it seems to happen,
                        //remove it just in case.
                        if (text.indexOf('\uFEFF') === 0) {
                            text = text.substring(1, text.length);
                        }

                        return text;
                    },

                    readFileAsync: function (path, encoding) {
                        var d = prim();
                        try {
                            d.resolve(file.readFile(path, encoding));
                        } catch (e) {
                            d.reject(e);
                        }
                        return d.promise;
                    },

                    saveUtf8File: function (/*String*/fileName, /*String*/fileContents) {
                        //summary: saves a *text* file using UTF-8 encoding.
                        file.saveFile(fileName, fileContents, "utf8");
                    },

                    saveFile: function (/*String*/fileName, /*String*/fileContents, /*String?*/encoding) {
                        //summary: saves a *text* file.
                        var parentDir;

                        if (encoding === 'utf-8') {
                            encoding = 'utf8';
                        }
                        if (!encoding) {
                            encoding = 'utf8';
                        }

                        //Make sure destination directories exist.
                        parentDir = path.dirname(fileName);
                        if (!file.exists(parentDir)) {
                            mkFullDir(parentDir);
                        }

                        fs.writeFileSync(fileName, fileContents, encoding);
                    },

                    deleteFile: function (/*String*/fileName) {
                        //summary: deletes a file or directory if it exists.
                        var files, i, stat;
                        if (file.exists(fileName)) {
                            stat = fs.lstatSync(fileName);
                            if (stat.isDirectory()) {
                                files = fs.readdirSync(fileName);
                                for (i = 0; i < files.length; i++) {
                                    this.deleteFile(path.join(fileName, files[i]));
                                }
                                fs.rmdirSync(fileName);
                            } else {
                                fs.unlinkSync(fileName);
                            }
                        }
                    },


                    /**
                     * Deletes any empty directories under the given directory.
                     */
                    deleteEmptyDirs: function (startDir) {
                        var dirFileArray, i, fileName, filePath, stat;

                        if (file.exists(startDir)) {
                            dirFileArray = fs.readdirSync(startDir);
                            for (i = 0; i < dirFileArray.length; i++) {
                                fileName = dirFileArray[i];
                                filePath = path.join(startDir, fileName);
                                stat = fs.lstatSync(filePath);
                                if (stat.isDirectory()) {
                                    file.deleteEmptyDirs(filePath);
                                }
                            }

                            //If directory is now empty, remove it.
                            if (fs.readdirSync(startDir).length ===  0) {
                                file.deleteFile(startDir);
                            }
                        }
                    }
                };

                return file;

            });

        }

        if(env === 'rhino') {
            /**
             * @license RequireJS Copyright (c) 2010-2014, The Dojo Foundation All Rights Reserved.
             * Available via the MIT or new BSD license.
             * see: http://github.com/jrburke/requirejs for details
             */
//Helper functions to deal with file I/O.

            /*jslint plusplus: false */
            /*global java: false, define: false */

            define('rhino/file', ['prim'], function (prim) {
                var file = {
                    backSlashRegExp: /\\/g,

                    exclusionRegExp: /^\./,

                    getLineSeparator: function () {
                        return file.lineSeparator;
                    },

                    lineSeparator: java.lang.System.getProperty("line.separator"), //Java String

                    exists: function (fileName) {
                        return (new java.io.File(fileName)).exists();
                    },

                    parent: function (fileName) {
                        return file.absPath((new java.io.File(fileName)).getParentFile());
                    },

                    normalize: function (fileName) {
                        return file.absPath(fileName);
                    },

                    isFile: function (path) {
                        return (new java.io.File(path)).isFile();
                    },

                    isDirectory: function (path) {
                        return (new java.io.File(path)).isDirectory();
                    },

                    /**
                     * Gets the absolute file path as a string, normalized
                     * to using front slashes for path separators.
                     * @param {java.io.File||String} file
                     */
                    absPath: function (fileObj) {
                        if (typeof fileObj === "string") {
                            fileObj = new java.io.File(fileObj);
                        }
                        return (fileObj.getCanonicalPath() + "").replace(file.backSlashRegExp, "/");
                    },

                    getFilteredFileList: function (/*String*/startDir, /*RegExp*/regExpFilters, /*boolean?*/makeUnixPaths, /*boolean?*/startDirIsJavaObject) {
                        //summary: Recurses startDir and finds matches to the files that match regExpFilters.include
                        //and do not match regExpFilters.exclude. Or just one regexp can be passed in for regExpFilters,
                        //and it will be treated as the "include" case.
                        //Ignores files/directories that start with a period (.) unless exclusionRegExp
                        //is set to another value.
                        var files = [], topDir, regExpInclude, regExpExclude, dirFileArray,
                            i, fileObj, filePath, ok, dirFiles;

                        topDir = startDir;
                        if (!startDirIsJavaObject) {
                            topDir = new java.io.File(startDir);
                        }

                        regExpInclude = regExpFilters.include || regExpFilters;
                        regExpExclude = regExpFilters.exclude || null;

                        if (topDir.exists()) {
                            dirFileArray = topDir.listFiles();
                            for (i = 0; i < dirFileArray.length; i++) {
                                fileObj = dirFileArray[i];
                                if (fileObj.isFile()) {
                                    filePath = fileObj.getPath();
                                    if (makeUnixPaths) {
                                        //Make sure we have a JS string.
                                        filePath = String(filePath);
                                        if (filePath.indexOf("/") === -1) {
                                            filePath = filePath.replace(/\\/g, "/");
                                        }
                                    }

                                    ok = true;
                                    if (regExpInclude) {
                                        ok = filePath.match(regExpInclude);
                                    }
                                    if (ok && regExpExclude) {
                                        ok = !filePath.match(regExpExclude);
                                    }

                                    if (ok && (!file.exclusionRegExp ||
                                        !file.exclusionRegExp.test(fileObj.getName()))) {
                                        files.push(filePath);
                                    }
                                } else if (fileObj.isDirectory() &&
                                    (!file.exclusionRegExp || !file.exclusionRegExp.test(fileObj.getName()))) {
                                    dirFiles = this.getFilteredFileList(fileObj, regExpFilters, makeUnixPaths, true);
                                    files.push.apply(files, dirFiles);
                                }
                            }
                        }

                        return files; //Array
                    },

                    copyDir: function (/*String*/srcDir, /*String*/destDir, /*RegExp?*/regExpFilter, /*boolean?*/onlyCopyNew) {
                        //summary: copies files from srcDir to destDir using the regExpFilter to determine if the
                        //file should be copied. Returns a list file name strings of the destinations that were copied.
                        regExpFilter = regExpFilter || /\w/;

                        var fileNames = file.getFilteredFileList(srcDir, regExpFilter, true),
                            copiedFiles = [], i, srcFileName, destFileName;

                        for (i = 0; i < fileNames.length; i++) {
                            srcFileName = fileNames[i];
                            destFileName = srcFileName.replace(srcDir, destDir);

                            if (file.copyFile(srcFileName, destFileName, onlyCopyNew)) {
                                copiedFiles.push(destFileName);
                            }
                        }

                        return copiedFiles.length ? copiedFiles : null; //Array or null
                    },

                    copyFile: function (/*String*/srcFileName, /*String*/destFileName, /*boolean?*/onlyCopyNew) {
                        //summary: copies srcFileName to destFileName. If onlyCopyNew is set, it only copies the file if
                        //srcFileName is newer than destFileName. Returns a boolean indicating if the copy occurred.
                        var destFile = new java.io.File(destFileName), srcFile, parentDir,
                            srcChannel, destChannel;

                        //logger.trace("Src filename: " + srcFileName);
                        //logger.trace("Dest filename: " + destFileName);

                        //If onlyCopyNew is true, then compare dates and only copy if the src is newer
                        //than dest.
                        if (onlyCopyNew) {
                            srcFile = new java.io.File(srcFileName);
                            if (destFile.exists() && destFile.lastModified() >= srcFile.lastModified()) {
                                return false; //Boolean
                            }
                        }

                        //Make sure destination dir exists.
                        parentDir = destFile.getParentFile();
                        if (!parentDir.exists()) {
                            if (!parentDir.mkdirs()) {
                                throw "Could not create directory: " + parentDir.getCanonicalPath();
                            }
                        }

                        //Java's version of copy file.
                        srcChannel = new java.io.FileInputStream(srcFileName).getChannel();
                        destChannel = new java.io.FileOutputStream(destFileName).getChannel();
                        destChannel.transferFrom(srcChannel, 0, srcChannel.size());
                        srcChannel.close();
                        destChannel.close();

                        return true; //Boolean
                    },

                    /**
                     * Renames a file. May fail if "to" already exists or is on another drive.
                     */
                    renameFile: function (from, to) {
                        return (new java.io.File(from)).renameTo((new java.io.File(to)));
                    },

                    readFile: function (/*String*/path, /*String?*/encoding) {
                        //A file read function that can deal with BOMs
                        encoding = encoding || "utf-8";
                        var fileObj = new java.io.File(path),
                            input = new java.io.BufferedReader(new java.io.InputStreamReader(new java.io.FileInputStream(fileObj), encoding)),
                            stringBuffer, line;
                        try {
                            stringBuffer = new java.lang.StringBuffer();
                            line = input.readLine();

                            // Byte Order Mark (BOM) - The Unicode Standard, version 3.0, page 324
                            // http://www.unicode.org/faq/utf_bom.html

                            // Note that when we use utf-8, the BOM should appear as "EF BB BF", but it doesn't due to this bug in the JDK:
                            // http://bugs.sun.com/bugdatabase/view_bug.do?bug_id=4508058
                            if (line && line.length() && line.charAt(0) === 0xfeff) {
                                // Eat the BOM, since we've already found the encoding on this file,
                                // and we plan to concatenating this buffer with others; the BOM should
                                // only appear at the top of a file.
                                line = line.substring(1);
                            }
                            while (line !== null) {
                                stringBuffer.append(line);
                                stringBuffer.append(file.lineSeparator);
                                line = input.readLine();
                            }
                            //Make sure we return a JavaScript string and not a Java string.
                            return String(stringBuffer.toString()); //String
                        } finally {
                            input.close();
                        }
                    },

                    readFileAsync: function (path, encoding) {
                        var d = prim();
                        try {
                            d.resolve(file.readFile(path, encoding));
                        } catch (e) {
                            d.reject(e);
                        }
                        return d.promise;
                    },

                    saveUtf8File: function (/*String*/fileName, /*String*/fileContents) {
                        //summary: saves a file using UTF-8 encoding.
                        file.saveFile(fileName, fileContents, "utf-8");
                    },

                    saveFile: function (/*String*/fileName, /*String*/fileContents, /*String?*/encoding) {
                        //summary: saves a file.
                        var outFile = new java.io.File(fileName), outWriter, parentDir, os;

                        parentDir = outFile.getAbsoluteFile().getParentFile();
                        if (!parentDir.exists()) {
                            if (!parentDir.mkdirs()) {
                                throw "Could not create directory: " + parentDir.getAbsolutePath();
                            }
                        }

                        if (encoding) {
                            outWriter = new java.io.OutputStreamWriter(new java.io.FileOutputStream(outFile), encoding);
                        } else {
                            outWriter = new java.io.OutputStreamWriter(new java.io.FileOutputStream(outFile));
                        }

                        os = new java.io.BufferedWriter(outWriter);
                        try {
                            //If in Nashorn, need to coerce the JS string to a Java string so that
                            //writer.write method dispatch correctly detects the type.
                            if (typeof importPackage !== 'undefined') {
                                os.write(fileContents);
                            } else {
                                os.write(new java.lang.String(fileContents));
                            }
                        } finally {
                            os.close();
                        }
                    },

                    deleteFile: function (/*String*/fileName) {
                        //summary: deletes a file or directory if it exists.
                        var fileObj = new java.io.File(fileName), files, i;
                        if (fileObj.exists()) {
                            if (fileObj.isDirectory()) {
                                files = fileObj.listFiles();
                                for (i = 0; i < files.length; i++) {
                                    this.deleteFile(files[i]);
                                }
                            }
                            fileObj["delete"]();
                        }
                    },

                    /**
                     * Deletes any empty directories under the given directory.
                     * The startDirIsJavaObject is private to this implementation's
                     * recursion needs.
                     */
                    deleteEmptyDirs: function (startDir, startDirIsJavaObject) {
                        var topDir = startDir,
                            dirFileArray, i, fileObj;

                        if (!startDirIsJavaObject) {
                            topDir = new java.io.File(startDir);
                        }

                        if (topDir.exists()) {
                            dirFileArray = topDir.listFiles();
                            for (i = 0; i < dirFileArray.length; i++) {
                                fileObj = dirFileArray[i];
                                if (fileObj.isDirectory()) {
                                    file.deleteEmptyDirs(fileObj, true);
                                }
                            }

                            //If the directory is empty now, delete it.
                            if (topDir.listFiles().length === 0) {
                                file.deleteFile(String(topDir.getPath()));
                            }
                        }
                    }
                };

                return file;
            });

        }

        if(env === 'xpconnect') {
            /**
             * @license RequireJS Copyright (c) 2013-2014, The Dojo Foundation All Rights Reserved.
             * Available via the MIT or new BSD license.
             * see: http://github.com/jrburke/requirejs for details
             */
//Helper functions to deal with file I/O.

            /*jslint plusplus: false */
            /*global define, Components, xpcUtil */

            define('xpconnect/file', ['prim'], function (prim) {
                var file,
                    Cc = Components.classes,
                    Ci = Components.interfaces,
                //Depends on xpcUtil which is set up in x.js
                    xpfile = xpcUtil.xpfile;

                function mkFullDir(dirObj) {
                    //1 is DIRECTORY_TYPE, 511 is 0777 permissions
                    if (!dirObj.exists()) {
                        dirObj.create(1, 511);
                    }
                }

                file = {
                    backSlashRegExp: /\\/g,

                    exclusionRegExp: /^\./,

                    getLineSeparator: function () {
                        return file.lineSeparator;
                    },

                    lineSeparator: ('@mozilla.org/windows-registry-key;1' in Cc) ?
                        '\r\n' : '\n',

                    exists: function (fileName) {
                        return xpfile(fileName).exists();
                    },

                    parent: function (fileName) {
                        return xpfile(fileName).parent;
                    },

                    normalize: function (fileName) {
                        return file.absPath(fileName);
                    },

                    isFile: function (path) {
                        return xpfile(path).isFile();
                    },

                    isDirectory: function (path) {
                        return xpfile(path).isDirectory();
                    },

                    /**
                     * Gets the absolute file path as a string, normalized
                     * to using front slashes for path separators.
                     * @param {java.io.File||String} file
                     */
                    absPath: function (fileObj) {
                        if (typeof fileObj === "string") {
                            fileObj = xpfile(fileObj);
                        }
                        return fileObj.path;
                    },

                    getFilteredFileList: function (/*String*/startDir, /*RegExp*/regExpFilters, /*boolean?*/makeUnixPaths, /*boolean?*/startDirIsObject) {
                        //summary: Recurses startDir and finds matches to the files that match regExpFilters.include
                        //and do not match regExpFilters.exclude. Or just one regexp can be passed in for regExpFilters,
                        //and it will be treated as the "include" case.
                        //Ignores files/directories that start with a period (.) unless exclusionRegExp
                        //is set to another value.
                        var files = [], topDir, regExpInclude, regExpExclude, dirFileArray,
                            fileObj, filePath, ok, dirFiles;

                        topDir = startDir;
                        if (!startDirIsObject) {
                            topDir = xpfile(startDir);
                        }

                        regExpInclude = regExpFilters.include || regExpFilters;
                        regExpExclude = regExpFilters.exclude || null;

                        if (topDir.exists()) {
                            dirFileArray = topDir.directoryEntries;
                            while (dirFileArray.hasMoreElements()) {
                                fileObj = dirFileArray.getNext().QueryInterface(Ci.nsILocalFile);
                                if (fileObj.isFile()) {
                                    filePath = fileObj.path;
                                    if (makeUnixPaths) {
                                        if (filePath.indexOf("/") === -1) {
                                            filePath = filePath.replace(/\\/g, "/");
                                        }
                                    }

                                    ok = true;
                                    if (regExpInclude) {
                                        ok = filePath.match(regExpInclude);
                                    }
                                    if (ok && regExpExclude) {
                                        ok = !filePath.match(regExpExclude);
                                    }

                                    if (ok && (!file.exclusionRegExp ||
                                        !file.exclusionRegExp.test(fileObj.leafName))) {
                                        files.push(filePath);
                                    }
                                } else if (fileObj.isDirectory() &&
                                    (!file.exclusionRegExp || !file.exclusionRegExp.test(fileObj.leafName))) {
                                    dirFiles = this.getFilteredFileList(fileObj, regExpFilters, makeUnixPaths, true);
                                    files.push.apply(files, dirFiles);
                                }
                            }
                        }

                        return files; //Array
                    },

                    copyDir: function (/*String*/srcDir, /*String*/destDir, /*RegExp?*/regExpFilter, /*boolean?*/onlyCopyNew) {
                        //summary: copies files from srcDir to destDir using the regExpFilter to determine if the
                        //file should be copied. Returns a list file name strings of the destinations that were copied.
                        regExpFilter = regExpFilter || /\w/;

                        var fileNames = file.getFilteredFileList(srcDir, regExpFilter, true),
                            copiedFiles = [], i, srcFileName, destFileName;

                        for (i = 0; i < fileNames.length; i += 1) {
                            srcFileName = fileNames[i];
                            destFileName = srcFileName.replace(srcDir, destDir);

                            if (file.copyFile(srcFileName, destFileName, onlyCopyNew)) {
                                copiedFiles.push(destFileName);
                            }
                        }

                        return copiedFiles.length ? copiedFiles : null; //Array or null
                    },

                    copyFile: function (/*String*/srcFileName, /*String*/destFileName, /*boolean?*/onlyCopyNew) {
                        //summary: copies srcFileName to destFileName. If onlyCopyNew is set, it only copies the file if
                        //srcFileName is newer than destFileName. Returns a boolean indicating if the copy occurred.
                        var destFile = xpfile(destFileName),
                            srcFile = xpfile(srcFileName);

                        //logger.trace("Src filename: " + srcFileName);
                        //logger.trace("Dest filename: " + destFileName);

                        //If onlyCopyNew is true, then compare dates and only copy if the src is newer
                        //than dest.
                        if (onlyCopyNew) {
                            if (destFile.exists() && destFile.lastModifiedTime >= srcFile.lastModifiedTime) {
                                return false; //Boolean
                            }
                        }

                        srcFile.copyTo(destFile.parent, destFile.leafName);

                        return true; //Boolean
                    },

                    /**
                     * Renames a file. May fail if "to" already exists or is on another drive.
                     */
                    renameFile: function (from, to) {
                        var toFile = xpfile(to);
                        return xpfile(from).moveTo(toFile.parent, toFile.leafName);
                    },

                    readFile: xpcUtil.readFile,

                    readFileAsync: function (path, encoding) {
                        var d = prim();
                        try {
                            d.resolve(file.readFile(path, encoding));
                        } catch (e) {
                            d.reject(e);
                        }
                        return d.promise;
                    },

                    saveUtf8File: function (/*String*/fileName, /*String*/fileContents) {
                        //summary: saves a file using UTF-8 encoding.
                        file.saveFile(fileName, fileContents, "utf-8");
                    },

                    saveFile: function (/*String*/fileName, /*String*/fileContents, /*String?*/encoding) {
                        var outStream, convertStream,
                            fileObj = xpfile(fileName);

                        mkFullDir(fileObj.parent);

                        try {
                            outStream = Cc['@mozilla.org/network/file-output-stream;1']
                                .createInstance(Ci.nsIFileOutputStream);
                            //438 is decimal for 0777
                            outStream.init(fileObj, 0x02 | 0x08 | 0x20, 511, 0);

                            convertStream = Cc['@mozilla.org/intl/converter-output-stream;1']
                                .createInstance(Ci.nsIConverterOutputStream);

                            convertStream.init(outStream, encoding, 0, 0);
                            convertStream.writeString(fileContents);
                        } catch (e) {
                            throw new Error((fileObj && fileObj.path || '') + ': ' + e);
                        } finally {
                            if (convertStream) {
                                convertStream.close();
                            }
                            if (outStream) {
                                outStream.close();
                            }
                        }
                    },

                    deleteFile: function (/*String*/fileName) {
                        //summary: deletes a file or directory if it exists.
                        var fileObj = xpfile(fileName);
                        if (fileObj.exists()) {
                            fileObj.remove(true);
                        }
                    },

                    /**
                     * Deletes any empty directories under the given directory.
                     * The startDirIsJavaObject is private to this implementation's
                     * recursion needs.
                     */
                    deleteEmptyDirs: function (startDir, startDirIsObject) {
                        var topDir = startDir,
                            dirFileArray, fileObj;

                        if (!startDirIsObject) {
                            topDir = xpfile(startDir);
                        }

                        if (topDir.exists()) {
                            dirFileArray = topDir.directoryEntries;
                            while (dirFileArray.hasMoreElements()) {
                                fileObj = dirFileArray.getNext().QueryInterface(Ci.nsILocalFile);

                                if (fileObj.isDirectory()) {
                                    file.deleteEmptyDirs(fileObj, true);
                                }
                            }

                            //If the directory is empty now, delete it.
                            dirFileArray = topDir.directoryEntries;
                            if (!dirFileArray.hasMoreElements()) {
                                file.deleteFile(topDir.path);
                            }
                        }
                    }
                };

                return file;
            });

        }

        if(env === 'browser') {
            /*global process */
            define('browser/quit', function () {
                'use strict';
                return function (code) {
                };
            });
        }

        if(env === 'node') {
            /*global process */
            define('node/quit', function () {
                'use strict';
                return function (code) {
                    var draining = 0;
                    var exit = function () {
                        if (draining === 0) {
                            process.exit(code);
                        } else {
                            draining -= 1;
                        }
                    };
                    if (process.stdout.bufferSize) {
                        draining += 1;
                        process.stdout.once('drain', exit);
                    }
                    if (process.stderr.bufferSize) {
                        draining += 1;
                        process.stderr.once('drain', exit);
                    }
                    exit();
                };
            });

        }

        if(env === 'rhino') {
            /*global quit */
            define('rhino/quit', function () {
                'use strict';
                return function (code) {
                    return quit(code);
                };
            });

        }

        if(env === 'xpconnect') {
            /*global quit */
            define('xpconnect/quit', function () {
                'use strict';
                return function (code) {
                    return quit(code);
                };
            });

        }

        if(env === 'browser') {
            /**
             * @license RequireJS Copyright (c) 2010-2014, The Dojo Foundation All Rights Reserved.
             * Available via the MIT or new BSD license.
             * see: http://github.com/jrburke/requirejs for details
             */

            /*jslint strict: false */
            /*global define: false, console: false */

            define('browser/print', function () {
                function print(msg) {
                    console.log(msg);
                }

                return print;
            });

        }

        if(env === 'node') {
            /**
             * @license RequireJS Copyright (c) 2010-2014, The Dojo Foundation All Rights Reserved.
             * Available via the MIT or new BSD license.
             * see: http://github.com/jrburke/requirejs for details
             */

            /*jslint strict: false */
            /*global define: false, console: false */

            define('node/print', function () {
                function print(msg) {
                    console.log(msg);
                }

                return print;
            });

        }

        if(env === 'rhino') {
            /**
             * @license RequireJS Copyright (c) 2010-2014, The Dojo Foundation All Rights Reserved.
             * Available via the MIT or new BSD license.
             * see: http://github.com/jrburke/requirejs for details
             */

            /*jslint strict: false */
            /*global define: false, print: false */

            define('rhino/print', function () {
                return print;
            });

        }

        if(env === 'xpconnect') {
            /**
             * @license RequireJS Copyright (c) 2013-2014, The Dojo Foundation All Rights Reserved.
             * Available via the MIT or new BSD license.
             * see: http://github.com/jrburke/requirejs for details
             */

            /*jslint strict: false */
            /*global define: false, print: false */

            define('xpconnect/print', function () {
                return print;
            });

        }
        /**
         * @license RequireJS Copyright (c) 2010-2014, The Dojo Foundation All Rights Reserved.
         * Available via the MIT or new BSD license.
         * see: http://github.com/jrburke/requirejs for details
         */

        /*jslint nomen: false, strict: false */
        /*global define: false */

        define('logger', ['env!env/print'], function (print) {
            var logger = {
                TRACE: 0,
                INFO: 1,
                WARN: 2,
                ERROR: 3,
                SILENT: 4,
                level: 0,
                logPrefix: "",

                logLevel: function( level ) {
                    this.level = level;
                },

                trace: function (message) {
                    if (this.level <= this.TRACE) {
                        this._print(message);
                    }
                },

                info: function (message) {
                    if (this.level <= this.INFO) {
                        this._print(message);
                    }
                },

                warn: function (message) {
                    if (this.level <= this.WARN) {
                        this._print(message);
                    }
                },

                error: function (message) {
                    if (this.level <= this.ERROR) {
                        this._print(message);
                    }
                },

                _print: function (message) {
                    this._sysPrint((this.logPrefix ? (this.logPrefix + " ") : "") + message);
                },

                _sysPrint: function (message) {
                    print(message);
                }
            };

            return logger;
        });
//Just a blank file to use when building the optimizer with the optimizer,
//so that the build does not attempt to inline some env modules,
//like Node's fs and path.

        /*
         Copyright (c) jQuery Foundation, Inc. and Contributors, All Rights Reserved.

         Redistribution and use in source and binary forms, with or without
         modification, are permitted provided that the following conditions are met:

         * Redistributions of source code must retain the above copyright
         notice, this list of conditions and the following disclaimer.
         * Redistributions in binary form must reproduce the above copyright
         notice, this list of conditions and the following disclaimer in the
         documentation and/or other materials provided with the distribution.

         THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
         AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
         IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
         ARE DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
         DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
         (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
         LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
         ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
         (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
         THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
         */

        (function (root, factory) {
            'use strict';

            // Universal Module Definition (UMD) to support AMD, CommonJS/Node.js,
            // Rhino, and plain browser loading.

            /* istanbul ignore next */
            if (typeof define === 'function' && define.amd) {
                define('esprima', ['exports'], factory);
            } else if (typeof exports !== 'undefined') {
                factory(exports);
            } else {
                factory((root.esprima = {}));
            }
        }(this, function (exports) {
            'use strict';

            var Token,
                TokenName,
                FnExprTokens,
                Syntax,
                PlaceHolders,
                Messages,
                Regex,
                source,
                strict,
                sourceType,
                index,
                lineNumber,
                lineStart,
                hasLineTerminator,
                lastIndex,
                lastLineNumber,
                lastLineStart,
                startIndex,
                startLineNumber,
                startLineStart,
                scanning,
                length,
                lookahead,
                state,
                extra,
                isBindingElement,
                isAssignmentTarget,
                firstCoverInitializedNameError;

            Token = {
                BooleanLiteral: 1,
                EOF: 2,
                Identifier: 3,
                Keyword: 4,
                NullLiteral: 5,
                NumericLiteral: 6,
                Punctuator: 7,
                StringLiteral: 8,
                RegularExpression: 9,
                Template: 10
            };

            TokenName = {};
            TokenName[Token.BooleanLiteral] = 'Boolean';
            TokenName[Token.EOF] = '<end>';
            TokenName[Token.Identifier] = 'Identifier';
            TokenName[Token.Keyword] = 'Keyword';
            TokenName[Token.NullLiteral] = 'Null';
            TokenName[Token.NumericLiteral] = 'Numeric';
            TokenName[Token.Punctuator] = 'Punctuator';
            TokenName[Token.StringLiteral] = 'String';
            TokenName[Token.RegularExpression] = 'RegularExpression';
            TokenName[Token.Template] = 'Template';

            // A function following one of those tokens is an expression.
            FnExprTokens = ['(', '{', '[', 'in', 'typeof', 'instanceof', 'new',
                'return', 'case', 'delete', 'throw', 'void',
                // assignment operators
                '=', '+=', '-=', '*=', '/=', '%=', '<<=', '>>=', '>>>=',
                '&=', '|=', '^=', ',',
                // binary/unary operators
                '+', '-', '*', '/', '%', '++', '--', '<<', '>>', '>>>', '&',
                '|', '^', '!', '~', '&&', '||', '?', ':', '===', '==', '>=',
                '<=', '<', '>', '!=', '!=='];

            Syntax = {
                AssignmentExpression: 'AssignmentExpression',
                AssignmentPattern: 'AssignmentPattern',
                ArrayExpression: 'ArrayExpression',
                ArrayPattern: 'ArrayPattern',
                ArrowFunctionExpression: 'ArrowFunctionExpression',
                BlockStatement: 'BlockStatement',
                BinaryExpression: 'BinaryExpression',
                BreakStatement: 'BreakStatement',
                CallExpression: 'CallExpression',
                CatchClause: 'CatchClause',
                ClassBody: 'ClassBody',
                ClassDeclaration: 'ClassDeclaration',
                ClassExpression: 'ClassExpression',
                ConditionalExpression: 'ConditionalExpression',
                ContinueStatement: 'ContinueStatement',
                DoWhileStatement: 'DoWhileStatement',
                DebuggerStatement: 'DebuggerStatement',
                EmptyStatement: 'EmptyStatement',
                ExportAllDeclaration: 'ExportAllDeclaration',
                ExportDefaultDeclaration: 'ExportDefaultDeclaration',
                ExportNamedDeclaration: 'ExportNamedDeclaration',
                ExportSpecifier: 'ExportSpecifier',
                ExpressionStatement: 'ExpressionStatement',
                ForStatement: 'ForStatement',
                ForOfStatement: 'ForOfStatement',
                ForInStatement: 'ForInStatement',
                FunctionDeclaration: 'FunctionDeclaration',
                FunctionExpression: 'FunctionExpression',
                Identifier: 'Identifier',
                IfStatement: 'IfStatement',
                ImportDeclaration: 'ImportDeclaration',
                ImportDefaultSpecifier: 'ImportDefaultSpecifier',
                ImportNamespaceSpecifier: 'ImportNamespaceSpecifier',
                ImportSpecifier: 'ImportSpecifier',
                Literal: 'Literal',
                LabeledStatement: 'LabeledStatement',
                LogicalExpression: 'LogicalExpression',
                MemberExpression: 'MemberExpression',
                MethodDefinition: 'MethodDefinition',
                NewExpression: 'NewExpression',
                ObjectExpression: 'ObjectExpression',
                ObjectPattern: 'ObjectPattern',
                Program: 'Program',
                Property: 'Property',
                RestElement: 'RestElement',
                ReturnStatement: 'ReturnStatement',
                SequenceExpression: 'SequenceExpression',
                SpreadElement: 'SpreadElement',
                Super: 'Super',
                SwitchCase: 'SwitchCase',
                SwitchStatement: 'SwitchStatement',
                TaggedTemplateExpression: 'TaggedTemplateExpression',
                TemplateElement: 'TemplateElement',
                TemplateLiteral: 'TemplateLiteral',
                ThisExpression: 'ThisExpression',
                ThrowStatement: 'ThrowStatement',
                TryStatement: 'TryStatement',
                UnaryExpression: 'UnaryExpression',
                UpdateExpression: 'UpdateExpression',
                VariableDeclaration: 'VariableDeclaration',
                VariableDeclarator: 'VariableDeclarator',
                WhileStatement: 'WhileStatement',
                WithStatement: 'WithStatement',
                YieldExpression: 'YieldExpression'
            };

            PlaceHolders = {
                ArrowParameterPlaceHolder: 'ArrowParameterPlaceHolder'
            };

            // Error messages should be identical to V8.
            Messages = {
                UnexpectedToken: 'Unexpected token %0',
                UnexpectedNumber: 'Unexpected number',
                UnexpectedString: 'Unexpected string',
                UnexpectedIdentifier: 'Unexpected identifier',
                UnexpectedReserved: 'Unexpected reserved word',
                UnexpectedTemplate: 'Unexpected quasi %0',
                UnexpectedEOS: 'Unexpected end of input',
                NewlineAfterThrow: 'Illegal newline after throw',
                InvalidRegExp: 'Invalid regular expression',
                UnterminatedRegExp: 'Invalid regular expression: missing /',
                InvalidLHSInAssignment: 'Invalid left-hand side in assignment',
                InvalidLHSInForIn: 'Invalid left-hand side in for-in',
                InvalidLHSInForLoop: 'Invalid left-hand side in for-loop',
                MultipleDefaultsInSwitch: 'More than one default clause in switch statement',
                NoCatchOrFinally: 'Missing catch or finally after try',
                UnknownLabel: 'Undefined label \'%0\'',
                Redeclaration: '%0 \'%1\' has already been declared',
                IllegalContinue: 'Illegal continue statement',
                IllegalBreak: 'Illegal break statement',
                IllegalReturn: 'Illegal return statement',
                IllegalYield: 'Unexpected token yield',
                StrictModeWith: 'Strict mode code may not include a with statement',
                StrictCatchVariable: 'Catch variable may not be eval or arguments in strict mode',
                StrictVarName: 'Variable name may not be eval or arguments in strict mode',
                StrictParamName: 'Parameter name eval or arguments is not allowed in strict mode',
                StrictParamDupe: 'Strict mode function may not have duplicate parameter names',
                StrictFunctionName: 'Function name may not be eval or arguments in strict mode',
                StrictOctalLiteral: 'Octal literals are not allowed in strict mode.',
                StrictDelete: 'Delete of an unqualified identifier in strict mode.',
                StrictLHSAssignment: 'Assignment to eval or arguments is not allowed in strict mode',
                StrictLHSPostfix: 'Postfix increment/decrement may not have eval or arguments operand in strict mode',
                StrictLHSPrefix: 'Prefix increment/decrement may not have eval or arguments operand in strict mode',
                StrictReservedWord: 'Use of future reserved word in strict mode',
                TemplateOctalLiteral: 'Octal literals are not allowed in template strings.',
                ParameterAfterRestParameter: 'Rest parameter must be last formal parameter',
                DefaultRestParameter: 'Unexpected token =',
                ObjectPatternAsRestParameter: 'Unexpected token {',
                DuplicateProtoProperty: 'Duplicate __proto__ fields are not allowed in object literals',
                ConstructorSpecialMethod: 'Class constructor may not be an accessor',
                DuplicateConstructor: 'A class may only have one constructor',
                StaticPrototype: 'Classes may not have static property named prototype',
                MissingFromClause: 'Unexpected token',
                NoAsAfterImportNamespace: 'Unexpected token',
                InvalidModuleSpecifier: 'Unexpected token',
                IllegalImportDeclaration: 'Unexpected token',
                IllegalExportDeclaration: 'Unexpected token',
                DuplicateBinding: 'Duplicate binding %0'
            };

            // See also tools/generate-unicode-regex.py.
            Regex = {
                NonAsciiIdentifierStart: new RegExp('[\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u052F\u0531-\u0556\u0559\u0561-\u0587\u05D0-\u05EA\u05F0-\u05F2\u0620-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA\u07F4\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u08A0-\u08B2\u0904-\u0939\u093D\u0950\u0958-\u0961\u0971-\u0980\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09F0\u09F1\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D\u0C58\u0C59\u0C60\u0C61\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDE\u0CE0\u0CE1\u0CF1\u0CF2\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D60\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0EDC-\u0EDF\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F4\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F8\u1700-\u170C\u170E-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u1820-\u1877\u1880-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191E\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19C1-\u19C7\u1A00-\u1A16\u1A20-\u1A54\u1AA7\u1B05-\u1B33\u1B45-\u1B4B\u1B83-\u1BA0\u1BAE\u1BAF\u1BBA-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C7D\u1CE9-\u1CEC\u1CEE-\u1CF1\u1CF5\u1CF6\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2071\u207F\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2160-\u2188\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2E2F\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303C\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FCC\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA61F\uA62A\uA62B\uA640-\uA66E\uA67F-\uA69D\uA6A0-\uA6EF\uA717-\uA71F\uA722-\uA788\uA78B-\uA78E\uA790-\uA7AD\uA7B0\uA7B1\uA7F7-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF\uA9E0-\uA9E4\uA9E6-\uA9EF\uA9FA-\uA9FE\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA76\uAA7A\uAA7E-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB5F\uAB64\uAB65\uABC0-\uABE2\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]'),
                NonAsciiIdentifierPart: new RegExp('[\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0300-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u0483-\u0487\u048A-\u052F\u0531-\u0556\u0559\u0561-\u0587\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u05D0-\u05EA\u05F0-\u05F2\u0610-\u061A\u0620-\u0669\u066E-\u06D3\u06D5-\u06DC\u06DF-\u06E8\u06EA-\u06FC\u06FF\u0710-\u074A\u074D-\u07B1\u07C0-\u07F5\u07FA\u0800-\u082D\u0840-\u085B\u08A0-\u08B2\u08E4-\u0963\u0966-\u096F\u0971-\u0983\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BC-\u09C4\u09C7\u09C8\u09CB-\u09CE\u09D7\u09DC\u09DD\u09DF-\u09E3\u09E6-\u09F1\u0A01-\u0A03\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A3C\u0A3E-\u0A42\u0A47\u0A48\u0A4B-\u0A4D\u0A51\u0A59-\u0A5C\u0A5E\u0A66-\u0A75\u0A81-\u0A83\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABC-\u0AC5\u0AC7-\u0AC9\u0ACB-\u0ACD\u0AD0\u0AE0-\u0AE3\u0AE6-\u0AEF\u0B01-\u0B03\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3C-\u0B44\u0B47\u0B48\u0B4B-\u0B4D\u0B56\u0B57\u0B5C\u0B5D\u0B5F-\u0B63\u0B66-\u0B6F\u0B71\u0B82\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BBE-\u0BC2\u0BC6-\u0BC8\u0BCA-\u0BCD\u0BD0\u0BD7\u0BE6-\u0BEF\u0C00-\u0C03\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D-\u0C44\u0C46-\u0C48\u0C4A-\u0C4D\u0C55\u0C56\u0C58\u0C59\u0C60-\u0C63\u0C66-\u0C6F\u0C81-\u0C83\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBC-\u0CC4\u0CC6-\u0CC8\u0CCA-\u0CCD\u0CD5\u0CD6\u0CDE\u0CE0-\u0CE3\u0CE6-\u0CEF\u0CF1\u0CF2\u0D01-\u0D03\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D-\u0D44\u0D46-\u0D48\u0D4A-\u0D4E\u0D57\u0D60-\u0D63\u0D66-\u0D6F\u0D7A-\u0D7F\u0D82\u0D83\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0DCA\u0DCF-\u0DD4\u0DD6\u0DD8-\u0DDF\u0DE6-\u0DEF\u0DF2\u0DF3\u0E01-\u0E3A\u0E40-\u0E4E\u0E50-\u0E59\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB9\u0EBB-\u0EBD\u0EC0-\u0EC4\u0EC6\u0EC8-\u0ECD\u0ED0-\u0ED9\u0EDC-\u0EDF\u0F00\u0F18\u0F19\u0F20-\u0F29\u0F35\u0F37\u0F39\u0F3E-\u0F47\u0F49-\u0F6C\u0F71-\u0F84\u0F86-\u0F97\u0F99-\u0FBC\u0FC6\u1000-\u1049\u1050-\u109D\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u135D-\u135F\u1380-\u138F\u13A0-\u13F4\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F8\u1700-\u170C\u170E-\u1714\u1720-\u1734\u1740-\u1753\u1760-\u176C\u176E-\u1770\u1772\u1773\u1780-\u17D3\u17D7\u17DC\u17DD\u17E0-\u17E9\u180B-\u180D\u1810-\u1819\u1820-\u1877\u1880-\u18AA\u18B0-\u18F5\u1900-\u191E\u1920-\u192B\u1930-\u193B\u1946-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u19D0-\u19D9\u1A00-\u1A1B\u1A20-\u1A5E\u1A60-\u1A7C\u1A7F-\u1A89\u1A90-\u1A99\u1AA7\u1AB0-\u1ABD\u1B00-\u1B4B\u1B50-\u1B59\u1B6B-\u1B73\u1B80-\u1BF3\u1C00-\u1C37\u1C40-\u1C49\u1C4D-\u1C7D\u1CD0-\u1CD2\u1CD4-\u1CF6\u1CF8\u1CF9\u1D00-\u1DF5\u1DFC-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u200C\u200D\u203F\u2040\u2054\u2071\u207F\u2090-\u209C\u20D0-\u20DC\u20E1\u20E5-\u20F0\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2160-\u2188\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D7F-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2DE0-\u2DFF\u2E2F\u3005-\u3007\u3021-\u302F\u3031-\u3035\u3038-\u303C\u3041-\u3096\u3099\u309A\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FCC\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA62B\uA640-\uA66F\uA674-\uA67D\uA67F-\uA69D\uA69F-\uA6F1\uA717-\uA71F\uA722-\uA788\uA78B-\uA78E\uA790-\uA7AD\uA7B0\uA7B1\uA7F7-\uA827\uA840-\uA873\uA880-\uA8C4\uA8D0-\uA8D9\uA8E0-\uA8F7\uA8FB\uA900-\uA92D\uA930-\uA953\uA960-\uA97C\uA980-\uA9C0\uA9CF-\uA9D9\uA9E0-\uA9FE\uAA00-\uAA36\uAA40-\uAA4D\uAA50-\uAA59\uAA60-\uAA76\uAA7A-\uAAC2\uAADB-\uAADD\uAAE0-\uAAEF\uAAF2-\uAAF6\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB5F\uAB64\uAB65\uABC0-\uABEA\uABEC\uABED\uABF0-\uABF9\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE00-\uFE0F\uFE20-\uFE2D\uFE33\uFE34\uFE4D-\uFE4F\uFE70-\uFE74\uFE76-\uFEFC\uFF10-\uFF19\uFF21-\uFF3A\uFF3F\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]')
            };

            // Ensure the condition is true, otherwise throw an error.
            // This is only to have a better contract semantic, i.e. another safety net
            // to catch a logic error. The condition shall be fulfilled in normal case.
            // Do NOT use this to enforce a certain condition on any user input.

            function assert(condition, message) {
                /* istanbul ignore if */
                if (!condition) {
                    throw new Error('ASSERT: ' + message);
                }
            }

            function isDecimalDigit(ch) {
                return (ch >= 0x30 && ch <= 0x39);   // 0..9
            }

            function isHexDigit(ch) {
                return '0123456789abcdefABCDEF'.indexOf(ch) >= 0;
            }

            function isOctalDigit(ch) {
                return '01234567'.indexOf(ch) >= 0;
            }

            function octalToDecimal(ch) {
                // \0 is not octal escape sequence
                var octal = (ch !== '0'), code = '01234567'.indexOf(ch);

                if (index < length && isOctalDigit(source[index])) {
                    octal = true;
                    code = code * 8 + '01234567'.indexOf(source[index++]);

                    // 3 digits are only allowed when string starts
                    // with 0, 1, 2, 3
                    if ('0123'.indexOf(ch) >= 0 &&
                        index < length &&
                        isOctalDigit(source[index])) {
                        code = code * 8 + '01234567'.indexOf(source[index++]);
                    }
                }

                return {
                    code: code,
                    octal: octal
                };
            }

            // 7.2 White Space

            function isWhiteSpace(ch) {
                return (ch === 0x20) || (ch === 0x09) || (ch === 0x0B) || (ch === 0x0C) || (ch === 0xA0) ||
                    (ch >= 0x1680 && [0x1680, 0x180E, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200A, 0x202F, 0x205F, 0x3000, 0xFEFF].indexOf(ch) >= 0);
            }

            // 7.3 Line Terminators

            function isLineTerminator(ch) {
                return (ch === 0x0A) || (ch === 0x0D) || (ch === 0x2028) || (ch === 0x2029);
            }

            // 7.6 Identifier Names and Identifiers

            function isIdentifierStart(ch) {
                return (ch === 0x24) || (ch === 0x5F) ||  // $ (dollar) and _ (underscore)
                    (ch >= 0x41 && ch <= 0x5A) ||         // A..Z
                    (ch >= 0x61 && ch <= 0x7A) ||         // a..z
                    (ch === 0x5C) ||                      // \ (backslash)
                    ((ch >= 0x80) && Regex.NonAsciiIdentifierStart.test(String.fromCharCode(ch)));
            }

            function isIdentifierPart(ch) {
                return (ch === 0x24) || (ch === 0x5F) ||  // $ (dollar) and _ (underscore)
                    (ch >= 0x41 && ch <= 0x5A) ||         // A..Z
                    (ch >= 0x61 && ch <= 0x7A) ||         // a..z
                    (ch >= 0x30 && ch <= 0x39) ||         // 0..9
                    (ch === 0x5C) ||                      // \ (backslash)
                    ((ch >= 0x80) && Regex.NonAsciiIdentifierPart.test(String.fromCharCode(ch)));
            }

            // 7.6.1.2 Future Reserved Words

            function isFutureReservedWord(id) {
                switch (id) {
                    case 'enum':
                    case 'export':
                    case 'import':
                    case 'super':
                        return true;
                    default:
                        return false;
                }
            }

            // 11.6.2.2 Future Reserved Words

            function isStrictModeReservedWord(id) {
                switch (id) {
                    case 'implements':
                    case 'interface':
                    case 'package':
                    case 'private':
                    case 'protected':
                    case 'public':
                    case 'static':
                    case 'yield':
                    case 'let':
                        return true;
                    default:
                        return false;
                }
            }

            function isRestrictedWord(id) {
                return id === 'eval' || id === 'arguments';
            }

            // 7.6.1.1 Keywords

            function isKeyword(id) {

                // 'const' is specialized as Keyword in V8.
                // 'yield' and 'let' are for compatibility with SpiderMonkey and ES.next.
                // Some others are from future reserved words.

                switch (id.length) {
                    case 2:
                        return (id === 'if') || (id === 'in') || (id === 'do');
                    case 3:
                        return (id === 'var') || (id === 'for') || (id === 'new') ||
                            (id === 'try') || (id === 'let');
                    case 4:
                        return (id === 'this') || (id === 'else') || (id === 'case') ||
                            (id === 'void') || (id === 'with') || (id === 'enum');
                    case 5:
                        return (id === 'while') || (id === 'break') || (id === 'catch') ||
                            (id === 'throw') || (id === 'const') || (id === 'yield') ||
                            (id === 'class') || (id === 'super');
                    case 6:
                        return (id === 'return') || (id === 'typeof') || (id === 'delete') ||
                            (id === 'switch') || (id === 'export') || (id === 'import');
                    case 7:
                        return (id === 'default') || (id === 'finally') || (id === 'extends');
                    case 8:
                        return (id === 'function') || (id === 'continue') || (id === 'debugger');
                    case 10:
                        return (id === 'instanceof');
                    default:
                        return false;
                }
            }

            // 7.4 Comments

            function addComment(type, value, start, end, loc) {
                var comment;

                assert(typeof start === 'number', 'Comment must have valid position');

                state.lastCommentStart = start;

                comment = {
                    type: type,
                    value: value
                };
                if (extra.range) {
                    comment.range = [start, end];
                }
                if (extra.loc) {
                    comment.loc = loc;
                }
                extra.comments.push(comment);
                if (extra.attachComment) {
                    extra.leadingComments.push(comment);
                    extra.trailingComments.push(comment);
                }
            }

            function skipSingleLineComment(offset) {
                var start, loc, ch, comment;

                start = index - offset;
                loc = {
                    start: {
                        line: lineNumber,
                        column: index - lineStart - offset
                    }
                };

                while (index < length) {
                    ch = source.charCodeAt(index);
                    ++index;
                    if (isLineTerminator(ch)) {
                        hasLineTerminator = true;
                        if (extra.comments) {
                            comment = source.slice(start + offset, index - 1);
                            loc.end = {
                                line: lineNumber,
                                column: index - lineStart - 1
                            };
                            addComment('Line', comment, start, index - 1, loc);
                        }
                        if (ch === 13 && source.charCodeAt(index) === 10) {
                            ++index;
                        }
                        ++lineNumber;
                        lineStart = index;
                        return;
                    }
                }

                if (extra.comments) {
                    comment = source.slice(start + offset, index);
                    loc.end = {
                        line: lineNumber,
                        column: index - lineStart
                    };
                    addComment('Line', comment, start, index, loc);
                }
            }

            function skipMultiLineComment() {
                var start, loc, ch, comment;

                if (extra.comments) {
                    start = index - 2;
                    loc = {
                        start: {
                            line: lineNumber,
                            column: index - lineStart - 2
                        }
                    };
                }

                while (index < length) {
                    ch = source.charCodeAt(index);
                    if (isLineTerminator(ch)) {
                        if (ch === 0x0D && source.charCodeAt(index + 1) === 0x0A) {
                            ++index;
                        }
                        hasLineTerminator = true;
                        ++lineNumber;
                        ++index;
                        lineStart = index;
                    } else if (ch === 0x2A) {
                        // Block comment ends with '*/'.
                        if (source.charCodeAt(index + 1) === 0x2F) {
                            ++index;
                            ++index;
                            if (extra.comments) {
                                comment = source.slice(start + 2, index - 2);
                                loc.end = {
                                    line: lineNumber,
                                    column: index - lineStart
                                };
                                addComment('Block', comment, start, index, loc);
                            }
                            return;
                        }
                        ++index;
                    } else {
                        ++index;
                    }
                }

                // Ran off the end of the file - the whole thing is a comment
                if (extra.comments) {
                    loc.end = {
                        line: lineNumber,
                        column: index - lineStart
                    };
                    comment = source.slice(start + 2, index);
                    addComment('Block', comment, start, index, loc);
                }
                tolerateUnexpectedToken();
            }

            function skipComment() {
                var ch, start;
                hasLineTerminator = false;

                start = (index === 0);
                while (index < length) {
                    ch = source.charCodeAt(index);

                    if (isWhiteSpace(ch)) {
                        ++index;
                    } else if (isLineTerminator(ch)) {
                        hasLineTerminator = true;
                        ++index;
                        if (ch === 0x0D && source.charCodeAt(index) === 0x0A) {
                            ++index;
                        }
                        ++lineNumber;
                        lineStart = index;
                        start = true;
                    } else if (ch === 0x2F) { // U+002F is '/'
                        ch = source.charCodeAt(index + 1);
                        if (ch === 0x2F) {
                            ++index;
                            ++index;
                            skipSingleLineComment(2);
                            start = true;
                        } else if (ch === 0x2A) {  // U+002A is '*'
                            ++index;
                            ++index;
                            skipMultiLineComment();
                        } else {
                            break;
                        }
                    } else if (start && ch === 0x2D) { // U+002D is '-'
                        // U+003E is '>'
                        if ((source.charCodeAt(index + 1) === 0x2D) && (source.charCodeAt(index + 2) === 0x3E)) {
                            // '-->' is a single-line comment
                            index += 3;
                            skipSingleLineComment(3);
                        } else {
                            break;
                        }
                    } else if (ch === 0x3C) { // U+003C is '<'
                        if (source.slice(index + 1, index + 4) === '!--') {
                            ++index; // `<`
                            ++index; // `!`
                            ++index; // `-`
                            ++index; // `-`
                            skipSingleLineComment(4);
                        } else {
                            break;
                        }
                    } else {
                        break;
                    }
                }
            }

            function scanHexEscape(prefix) {
                var i, len, ch, code = 0;

                len = (prefix === 'u') ? 4 : 2;
                for (i = 0; i < len; ++i) {
                    if (index < length && isHexDigit(source[index])) {
                        ch = source[index++];
                        code = code * 16 + '0123456789abcdef'.indexOf(ch.toLowerCase());
                    } else {
                        return '';
                    }
                }
                return String.fromCharCode(code);
            }

            function scanUnicodeCodePointEscape() {
                var ch, code, cu1, cu2;

                ch = source[index];
                code = 0;

                // At least, one hex digit is required.
                if (ch === '}') {
                    throwUnexpectedToken();
                }

                while (index < length) {
                    ch = source[index++];
                    if (!isHexDigit(ch)) {
                        break;
                    }
                    code = code * 16 + '0123456789abcdef'.indexOf(ch.toLowerCase());
                }

                if (code > 0x10FFFF || ch !== '}') {
                    throwUnexpectedToken();
                }

                // UTF-16 Encoding
                if (code <= 0xFFFF) {
                    return String.fromCharCode(code);
                }
                cu1 = ((code - 0x10000) >> 10) + 0xD800;
                cu2 = ((code - 0x10000) & 1023) + 0xDC00;
                return String.fromCharCode(cu1, cu2);
            }

            function getEscapedIdentifier() {
                var ch, id;

                ch = source.charCodeAt(index++);
                id = String.fromCharCode(ch);

                // '\u' (U+005C, U+0075) denotes an escaped character.
                if (ch === 0x5C) {
                    if (source.charCodeAt(index) !== 0x75) {
                        throwUnexpectedToken();
                    }
                    ++index;
                    ch = scanHexEscape('u');
                    if (!ch || ch === '\\' || !isIdentifierStart(ch.charCodeAt(0))) {
                        throwUnexpectedToken();
                    }
                    id = ch;
                }

                while (index < length) {
                    ch = source.charCodeAt(index);
                    if (!isIdentifierPart(ch)) {
                        break;
                    }
                    ++index;
                    id += String.fromCharCode(ch);

                    // '\u' (U+005C, U+0075) denotes an escaped character.
                    if (ch === 0x5C) {
                        id = id.substr(0, id.length - 1);
                        if (source.charCodeAt(index) !== 0x75) {
                            throwUnexpectedToken();
                        }
                        ++index;
                        ch = scanHexEscape('u');
                        if (!ch || ch === '\\' || !isIdentifierPart(ch.charCodeAt(0))) {
                            throwUnexpectedToken();
                        }
                        id += ch;
                    }
                }

                return id;
            }

            function getIdentifier() {
                var start, ch;

                start = index++;
                while (index < length) {
                    ch = source.charCodeAt(index);
                    if (ch === 0x5C) {
                        // Blackslash (U+005C) marks Unicode escape sequence.
                        index = start;
                        return getEscapedIdentifier();
                    }
                    if (isIdentifierPart(ch)) {
                        ++index;
                    } else {
                        break;
                    }
                }

                return source.slice(start, index);
            }

            function scanIdentifier() {
                var start, id, type;

                start = index;

                // Backslash (U+005C) starts an escaped character.
                id = (source.charCodeAt(index) === 0x5C) ? getEscapedIdentifier() : getIdentifier();

                // There is no keyword or literal with only one character.
                // Thus, it must be an identifier.
                if (id.length === 1) {
                    type = Token.Identifier;
                } else if (isKeyword(id)) {
                    type = Token.Keyword;
                } else if (id === 'null') {
                    type = Token.NullLiteral;
                } else if (id === 'true' || id === 'false') {
                    type = Token.BooleanLiteral;
                } else {
                    type = Token.Identifier;
                }

                return {
                    type: type,
                    value: id,
                    lineNumber: lineNumber,
                    lineStart: lineStart,
                    start: start,
                    end: index
                };
            }


            // 7.7 Punctuators

            function scanPunctuator() {
                var token, str;

                token = {
                    type: Token.Punctuator,
                    value: '',
                    lineNumber: lineNumber,
                    lineStart: lineStart,
                    start: index,
                    end: index
                };

                // Check for most common single-character punctuators.
                str = source[index];
                switch (str) {

                    case '(':
                        if (extra.tokenize) {
                            extra.openParenToken = extra.tokens.length;
                        }
                        ++index;
                        break;

                    case '{':
                        if (extra.tokenize) {
                            extra.openCurlyToken = extra.tokens.length;
                        }
                        state.curlyStack.push('{');
                        ++index;
                        break;

                    case '.':
                        ++index;
                        if (source[index] === '.' && source[index + 1] === '.') {
                            // Spread operator: ...
                            index += 2;
                            str = '...';
                        }
                        break;

                    case '}':
                        ++index;
                        state.curlyStack.pop();
                        break;
                    case ')':
                    case ';':
                    case ',':
                    case '[':
                    case ']':
                    case ':':
                    case '?':
                    case '~':
                        ++index;
                        break;

                    default:
                        // 4-character punctuator.
                        str = source.substr(index, 4);
                        if (str === '>>>=') {
                            index += 4;
                        } else {

                            // 3-character punctuators.
                            str = str.substr(0, 3);
                            if (str === '===' || str === '!==' || str === '>>>' ||
                                str === '<<=' || str === '>>=') {
                                index += 3;
                            } else {

                                // 2-character punctuators.
                                str = str.substr(0, 2);
                                if (str === '&&' || str === '||' || str === '==' || str === '!=' ||
                                    str === '+=' || str === '-=' || str === '*=' || str === '/=' ||
                                    str === '++' || str === '--' || str === '<<' || str === '>>' ||
                                    str === '&=' || str === '|=' || str === '^=' || str === '%=' ||
                                    str === '<=' || str === '>=' || str === '=>') {
                                    index += 2;
                                } else {

                                    // 1-character punctuators.
                                    str = source[index];
                                    if ('<>=!+-*%&|^/'.indexOf(str) >= 0) {
                                        ++index;
                                    }
                                }
                            }
                        }
                }

                if (index === token.start) {
                    throwUnexpectedToken();
                }

                token.end = index;
                token.value = str;
                return token;
            }

            // 7.8.3 Numeric Literals

            function scanHexLiteral(start) {
                var number = '';

                while (index < length) {
                    if (!isHexDigit(source[index])) {
                        break;
                    }
                    number += source[index++];
                }

                if (number.length === 0) {
                    throwUnexpectedToken();
                }

                if (isIdentifierStart(source.charCodeAt(index))) {
                    throwUnexpectedToken();
                }

                return {
                    type: Token.NumericLiteral,
                    value: parseInt('0x' + number, 16),
                    lineNumber: lineNumber,
                    lineStart: lineStart,
                    start: start,
                    end: index
                };
            }

            function scanBinaryLiteral(start) {
                var ch, number;

                number = '';

                while (index < length) {
                    ch = source[index];
                    if (ch !== '0' && ch !== '1') {
                        break;
                    }
                    number += source[index++];
                }

                if (number.length === 0) {
                    // only 0b or 0B
                    throwUnexpectedToken();
                }

                if (index < length) {
                    ch = source.charCodeAt(index);
                    /* istanbul ignore else */
                    if (isIdentifierStart(ch) || isDecimalDigit(ch)) {
                        throwUnexpectedToken();
                    }
                }

                return {
                    type: Token.NumericLiteral,
                    value: parseInt(number, 2),
                    lineNumber: lineNumber,
                    lineStart: lineStart,
                    start: start,
                    end: index
                };
            }

            function scanOctalLiteral(prefix, start) {
                var number, octal;

                if (isOctalDigit(prefix)) {
                    octal = true;
                    number = '0' + source[index++];
                } else {
                    octal = false;
                    ++index;
                    number = '';
                }

                while (index < length) {
                    if (!isOctalDigit(source[index])) {
                        break;
                    }
                    number += source[index++];
                }

                if (!octal && number.length === 0) {
                    // only 0o or 0O
                    throwUnexpectedToken();
                }

                if (isIdentifierStart(source.charCodeAt(index)) || isDecimalDigit(source.charCodeAt(index))) {
                    throwUnexpectedToken();
                }

                return {
                    type: Token.NumericLiteral,
                    value: parseInt(number, 8),
                    octal: octal,
                    lineNumber: lineNumber,
                    lineStart: lineStart,
                    start: start,
                    end: index
                };
            }

            function isImplicitOctalLiteral() {
                var i, ch;

                // Implicit octal, unless there is a non-octal digit.
                // (Annex B.1.1 on Numeric Literals)
                for (i = index + 1; i < length; ++i) {
                    ch = source[i];
                    if (ch === '8' || ch === '9') {
                        return false;
                    }
                    if (!isOctalDigit(ch)) {
                        return true;
                    }
                }

                return true;
            }

            function scanNumericLiteral() {
                var number, start, ch;

                ch = source[index];
                assert(isDecimalDigit(ch.charCodeAt(0)) || (ch === '.'),
                    'Numeric literal must start with a decimal digit or a decimal point');

                start = index;
                number = '';
                if (ch !== '.') {
                    number = source[index++];
                    ch = source[index];

                    // Hex number starts with '0x'.
                    // Octal number starts with '0'.
                    // Octal number in ES6 starts with '0o'.
                    // Binary number in ES6 starts with '0b'.
                    if (number === '0') {
                        if (ch === 'x' || ch === 'X') {
                            ++index;
                            return scanHexLiteral(start);
                        }
                        if (ch === 'b' || ch === 'B') {
                            ++index;
                            return scanBinaryLiteral(start);
                        }
                        if (ch === 'o' || ch === 'O') {
                            return scanOctalLiteral(ch, start);
                        }

                        if (isOctalDigit(ch)) {
                            if (isImplicitOctalLiteral()) {
                                return scanOctalLiteral(ch, start);
                            }
                        }
                    }

                    while (isDecimalDigit(source.charCodeAt(index))) {
                        number += source[index++];
                    }
                    ch = source[index];
                }

                if (ch === '.') {
                    number += source[index++];
                    while (isDecimalDigit(source.charCodeAt(index))) {
                        number += source[index++];
                    }
                    ch = source[index];
                }

                if (ch === 'e' || ch === 'E') {
                    number += source[index++];

                    ch = source[index];
                    if (ch === '+' || ch === '-') {
                        number += source[index++];
                    }
                    if (isDecimalDigit(source.charCodeAt(index))) {
                        while (isDecimalDigit(source.charCodeAt(index))) {
                            number += source[index++];
                        }
                    } else {
                        throwUnexpectedToken();
                    }
                }

                if (isIdentifierStart(source.charCodeAt(index))) {
                    throwUnexpectedToken();
                }

                return {
                    type: Token.NumericLiteral,
                    value: parseFloat(number),
                    lineNumber: lineNumber,
                    lineStart: lineStart,
                    start: start,
                    end: index
                };
            }

            // 7.8.4 String Literals

            function scanStringLiteral() {
                var str = '', quote, start, ch, unescaped, octToDec, octal = false;

                quote = source[index];
                assert((quote === '\'' || quote === '"'),
                    'String literal must starts with a quote');

                start = index;
                ++index;

                while (index < length) {
                    ch = source[index++];

                    if (ch === quote) {
                        quote = '';
                        break;
                    } else if (ch === '\\') {
                        ch = source[index++];
                        if (!ch || !isLineTerminator(ch.charCodeAt(0))) {
                            switch (ch) {
                                case 'u':
                                case 'x':
                                    if (source[index] === '{') {
                                        ++index;
                                        str += scanUnicodeCodePointEscape();
                                    } else {
                                        unescaped = scanHexEscape(ch);
                                        if (!unescaped) {
                                            throw throwUnexpectedToken();
                                        }
                                        str += unescaped;
                                    }
                                    break;
                                case 'n':
                                    str += '\n';
                                    break;
                                case 'r':
                                    str += '\r';
                                    break;
                                case 't':
                                    str += '\t';
                                    break;
                                case 'b':
                                    str += '\b';
                                    break;
                                case 'f':
                                    str += '\f';
                                    break;
                                case 'v':
                                    str += '\x0B';
                                    break;
                                case '8':
                                case '9':
                                    throw throwUnexpectedToken();

                                default:
                                    if (isOctalDigit(ch)) {
                                        octToDec = octalToDecimal(ch);

                                        octal = octToDec.octal || octal;
                                        str += String.fromCharCode(octToDec.code);
                                    } else {
                                        str += ch;
                                    }
                                    break;
                            }
                        } else {
                            ++lineNumber;
                            if (ch === '\r' && source[index] === '\n') {
                                ++index;
                            }
                            lineStart = index;
                        }
                    } else if (isLineTerminator(ch.charCodeAt(0))) {
                        break;
                    } else {
                        str += ch;
                    }
                }

                if (quote !== '') {
                    throwUnexpectedToken();
                }

                return {
                    type: Token.StringLiteral,
                    value: str,
                    octal: octal,
                    lineNumber: startLineNumber,
                    lineStart: startLineStart,
                    start: start,
                    end: index
                };
            }

            function scanTemplate() {
                var cooked = '', ch, start, rawOffset, terminated, head, tail, restore, unescaped;

                terminated = false;
                tail = false;
                start = index;
                head = (source[index] === '`');
                rawOffset = 2;

                ++index;

                while (index < length) {
                    ch = source[index++];
                    if (ch === '`') {
                        rawOffset = 1;
                        tail = true;
                        terminated = true;
                        break;
                    } else if (ch === '$') {
                        if (source[index] === '{') {
                            state.curlyStack.push('${');
                            ++index;
                            terminated = true;
                            break;
                        }
                        cooked += ch;
                    } else if (ch === '\\') {
                        ch = source[index++];
                        if (!isLineTerminator(ch.charCodeAt(0))) {
                            switch (ch) {
                                case 'n':
                                    cooked += '\n';
                                    break;
                                case 'r':
                                    cooked += '\r';
                                    break;
                                case 't':
                                    cooked += '\t';
                                    break;
                                case 'u':
                                case 'x':
                                    if (source[index] === '{') {
                                        ++index;
                                        cooked += scanUnicodeCodePointEscape();
                                    } else {
                                        restore = index;
                                        unescaped = scanHexEscape(ch);
                                        if (unescaped) {
                                            cooked += unescaped;
                                        } else {
                                            index = restore;
                                            cooked += ch;
                                        }
                                    }
                                    break;
                                case 'b':
                                    cooked += '\b';
                                    break;
                                case 'f':
                                    cooked += '\f';
                                    break;
                                case 'v':
                                    cooked += '\v';
                                    break;

                                default:
                                    if (ch === '0') {
                                        if (isDecimalDigit(source.charCodeAt(index))) {
                                            // Illegal: \01 \02 and so on
                                            throwError(Messages.TemplateOctalLiteral);
                                        }
                                        cooked += '\0';
                                    } else if (isOctalDigit(ch)) {
                                        // Illegal: \1 \2
                                        throwError(Messages.TemplateOctalLiteral);
                                    } else {
                                        cooked += ch;
                                    }
                                    break;
                            }
                        } else {
                            ++lineNumber;
                            if (ch === '\r' && source[index] === '\n') {
                                ++index;
                            }
                            lineStart = index;
                        }
                    } else if (isLineTerminator(ch.charCodeAt(0))) {
                        ++lineNumber;
                        if (ch === '\r' && source[index] === '\n') {
                            ++index;
                        }
                        lineStart = index;
                        cooked += '\n';
                    } else {
                        cooked += ch;
                    }
                }

                if (!terminated) {
                    throwUnexpectedToken();
                }

                if (!head) {
                    state.curlyStack.pop();
                }

                return {
                    type: Token.Template,
                    value: {
                        cooked: cooked,
                        raw: source.slice(start + 1, index - rawOffset)
                    },
                    head: head,
                    tail: tail,
                    lineNumber: lineNumber,
                    lineStart: lineStart,
                    start: start,
                    end: index
                };
            }

            function testRegExp(pattern, flags) {
                // The BMP character to use as a replacement for astral symbols when
                // translating an ES6 "u"-flagged pattern to an ES5-compatible
                // approximation.
                // Note: replacing with '\uFFFF' enables false positives in unlikely
                // scenarios. For example, `[\u{1044f}-\u{10440}]` is an invalid
                // pattern that would not be detected by this substitution.
                var astralSubstitute = '\uFFFF',
                    tmp = pattern;

                if (flags.indexOf('u') >= 0) {
                    tmp = tmp
                        // Replace every Unicode escape sequence with the equivalent
                        // BMP character or a constant ASCII code point in the case of
                        // astral symbols. (See the above note on `astralSubstitute`
                        // for more information.)
                        .replace(/\\u\{([0-9a-fA-F]+)\}|\\u([a-fA-F0-9]{4})/g, function ($0, $1, $2) {
                            var codePoint = parseInt($1 || $2, 16);
                            if (codePoint > 0x10FFFF) {
                                throwUnexpectedToken(null, Messages.InvalidRegExp);
                            }
                            if (codePoint <= 0xFFFF) {
                                return String.fromCharCode(codePoint);
                            }
                            return astralSubstitute;
                        })
                        // Replace each paired surrogate with a single ASCII symbol to
                        // avoid throwing on regular expressions that are only valid in
                        // combination with the "u" flag.
                        .replace(
                        /[\uD800-\uDBFF][\uDC00-\uDFFF]/g,
                        astralSubstitute
                    );
                }

                // First, detect invalid regular expressions.
                try {
                    RegExp(tmp);
                } catch (e) {
                    throwUnexpectedToken(null, Messages.InvalidRegExp);
                }

                // Return a regular expression object for this pattern-flag pair, or
                // `null` in case the current environment doesn't support the flags it
                // uses.
                try {
                    return new RegExp(pattern, flags);
                } catch (exception) {
                    return null;
                }
            }

            function scanRegExpBody() {
                var ch, str, classMarker, terminated, body;

                ch = source[index];
                assert(ch === '/', 'Regular expression literal must start with a slash');
                str = source[index++];

                classMarker = false;
                terminated = false;
                while (index < length) {
                    ch = source[index++];
                    str += ch;
                    if (ch === '\\') {
                        ch = source[index++];
                        // ECMA-262 7.8.5
                        if (isLineTerminator(ch.charCodeAt(0))) {
                            throwUnexpectedToken(null, Messages.UnterminatedRegExp);
                        }
                        str += ch;
                    } else if (isLineTerminator(ch.charCodeAt(0))) {
                        throwUnexpectedToken(null, Messages.UnterminatedRegExp);
                    } else if (classMarker) {
                        if (ch === ']') {
                            classMarker = false;
                        }
                    } else {
                        if (ch === '/') {
                            terminated = true;
                            break;
                        } else if (ch === '[') {
                            classMarker = true;
                        }
                    }
                }

                if (!terminated) {
                    throwUnexpectedToken(null, Messages.UnterminatedRegExp);
                }

                // Exclude leading and trailing slash.
                body = str.substr(1, str.length - 2);
                return {
                    value: body,
                    literal: str
                };
            }

            function scanRegExpFlags() {
                var ch, str, flags, restore;

                str = '';
                flags = '';
                while (index < length) {
                    ch = source[index];
                    if (!isIdentifierPart(ch.charCodeAt(0))) {
                        break;
                    }

                    ++index;
                    if (ch === '\\' && index < length) {
                        ch = source[index];
                        if (ch === 'u') {
                            ++index;
                            restore = index;
                            ch = scanHexEscape('u');
                            if (ch) {
                                flags += ch;
                                for (str += '\\u'; restore < index; ++restore) {
                                    str += source[restore];
                                }
                            } else {
                                index = restore;
                                flags += 'u';
                                str += '\\u';
                            }
                            tolerateUnexpectedToken();
                        } else {
                            str += '\\';
                            tolerateUnexpectedToken();
                        }
                    } else {
                        flags += ch;
                        str += ch;
                    }
                }

                return {
                    value: flags,
                    literal: str
                };
            }

            function scanRegExp() {
                scanning = true;
                var start, body, flags, value;

                lookahead = null;
                skipComment();
                start = index;

                body = scanRegExpBody();
                flags = scanRegExpFlags();
                value = testRegExp(body.value, flags.value);
                scanning = false;
                if (extra.tokenize) {
                    return {
                        type: Token.RegularExpression,
                        value: value,
                        regex: {
                            pattern: body.value,
                            flags: flags.value
                        },
                        lineNumber: lineNumber,
                        lineStart: lineStart,
                        start: start,
                        end: index
                    };
                }

                return {
                    literal: body.literal + flags.literal,
                    value: value,
                    regex: {
                        pattern: body.value,
                        flags: flags.value
                    },
                    start: start,
                    end: index
                };
            }

            function collectRegex() {
                var pos, loc, regex, token;

                skipComment();

                pos = index;
                loc = {
                    start: {
                        line: lineNumber,
                        column: index - lineStart
                    }
                };

                regex = scanRegExp();

                loc.end = {
                    line: lineNumber,
                    column: index - lineStart
                };

                /* istanbul ignore next */
                if (!extra.tokenize) {
                    // Pop the previous token, which is likely '/' or '/='
                    if (extra.tokens.length > 0) {
                        token = extra.tokens[extra.tokens.length - 1];
                        if (token.range[0] === pos && token.type === 'Punctuator') {
                            if (token.value === '/' || token.value === '/=') {
                                extra.tokens.pop();
                            }
                        }
                    }

                    extra.tokens.push({
                        type: 'RegularExpression',
                        value: regex.literal,
                        regex: regex.regex,
                        range: [pos, index],
                        loc: loc
                    });
                }

                return regex;
            }

            function isIdentifierName(token) {
                return token.type === Token.Identifier ||
                    token.type === Token.Keyword ||
                    token.type === Token.BooleanLiteral ||
                    token.type === Token.NullLiteral;
            }

            function advanceSlash() {
                var prevToken,
                    checkToken;
                // Using the following algorithm:
                // https://github.com/mozilla/sweet.js/wiki/design
                prevToken = extra.tokens[extra.tokens.length - 1];
                if (!prevToken) {
                    // Nothing before that: it cannot be a division.
                    return collectRegex();
                }
                if (prevToken.type === 'Punctuator') {
                    if (prevToken.value === ']') {
                        return scanPunctuator();
                    }
                    if (prevToken.value === ')') {
                        checkToken = extra.tokens[extra.openParenToken - 1];
                        if (checkToken &&
                            checkToken.type === 'Keyword' &&
                            (checkToken.value === 'if' ||
                            checkToken.value === 'while' ||
                            checkToken.value === 'for' ||
                            checkToken.value === 'with')) {
                            return collectRegex();
                        }
                        return scanPunctuator();
                    }
                    if (prevToken.value === '}') {
                        // Dividing a function by anything makes little sense,
                        // but we have to check for that.
                        if (extra.tokens[extra.openCurlyToken - 3] &&
                            extra.tokens[extra.openCurlyToken - 3].type === 'Keyword') {
                            // Anonymous function.
                            checkToken = extra.tokens[extra.openCurlyToken - 4];
                            if (!checkToken) {
                                return scanPunctuator();
                            }
                        } else if (extra.tokens[extra.openCurlyToken - 4] &&
                            extra.tokens[extra.openCurlyToken - 4].type === 'Keyword') {
                            // Named function.
                            checkToken = extra.tokens[extra.openCurlyToken - 5];
                            if (!checkToken) {
                                return collectRegex();
                            }
                        } else {
                            return scanPunctuator();
                        }
                        // checkToken determines whether the function is
                        // a declaration or an expression.
                        if (FnExprTokens.indexOf(checkToken.value) >= 0) {
                            // It is an expression.
                            return scanPunctuator();
                        }
                        // It is a declaration.
                        return collectRegex();
                    }
                    return collectRegex();
                }
                if (prevToken.type === 'Keyword' && prevToken.value !== 'this') {
                    return collectRegex();
                }
                return scanPunctuator();
            }

            function advance() {
                var ch, token;

                if (index >= length) {
                    return {
                        type: Token.EOF,
                        lineNumber: lineNumber,
                        lineStart: lineStart,
                        start: index,
                        end: index
                    };
                }

                ch = source.charCodeAt(index);

                if (isIdentifierStart(ch)) {
                    token = scanIdentifier();
                    if (strict && isStrictModeReservedWord(token.value)) {
                        token.type = Token.Keyword;
                    }
                    return token;
                }

                // Very common: ( and ) and ;
                if (ch === 0x28 || ch === 0x29 || ch === 0x3B) {
                    return scanPunctuator();
                }

                // String literal starts with single quote (U+0027) or double quote (U+0022).
                if (ch === 0x27 || ch === 0x22) {
                    return scanStringLiteral();
                }

                // Dot (.) U+002E can also start a floating-point number, hence the need
                // to check the next character.
                if (ch === 0x2E) {
                    if (isDecimalDigit(source.charCodeAt(index + 1))) {
                        return scanNumericLiteral();
                    }
                    return scanPunctuator();
                }

                if (isDecimalDigit(ch)) {
                    return scanNumericLiteral();
                }

                // Slash (/) U+002F can also start a regex.
                if (extra.tokenize && ch === 0x2F) {
                    return advanceSlash();
                }

                // Template literals start with ` (U+0060) for template head
                // or } (U+007D) for template middle or template tail.
                if (ch === 0x60 || (ch === 0x7D && state.curlyStack[state.curlyStack.length - 1] === '${')) {
                    return scanTemplate();
                }

                return scanPunctuator();
            }

            function collectToken() {
                var loc, token, value, entry;

                loc = {
                    start: {
                        line: lineNumber,
                        column: index - lineStart
                    }
                };

                token = advance();
                loc.end = {
                    line: lineNumber,
                    column: index - lineStart
                };

                if (token.type !== Token.EOF) {
                    value = source.slice(token.start, token.end);
                    entry = {
                        type: TokenName[token.type],
                        value: value,
                        range: [token.start, token.end],
                        loc: loc
                    };
                    if (token.regex) {
                        entry.regex = {
                            pattern: token.regex.pattern,
                            flags: token.regex.flags
                        };
                    }
                    extra.tokens.push(entry);
                }

                return token;
            }

            function lex() {
                var token;
                scanning = true;

                lastIndex = index;
                lastLineNumber = lineNumber;
                lastLineStart = lineStart;

                skipComment();

                token = lookahead;

                startIndex = index;
                startLineNumber = lineNumber;
                startLineStart = lineStart;

                lookahead = (typeof extra.tokens !== 'undefined') ? collectToken() : advance();
                scanning = false;
                return token;
            }

            function peek() {
                scanning = true;

                skipComment();

                lastIndex = index;
                lastLineNumber = lineNumber;
                lastLineStart = lineStart;

                startIndex = index;
                startLineNumber = lineNumber;
                startLineStart = lineStart;

                lookahead = (typeof extra.tokens !== 'undefined') ? collectToken() : advance();
                scanning = false;
            }

            function Position() {
                this.line = startLineNumber;
                this.column = startIndex - startLineStart;
            }

            function SourceLocation() {
                this.start = new Position();
                this.end = null;
            }

            function WrappingSourceLocation(startToken) {
                this.start = {
                    line: startToken.lineNumber,
                    column: startToken.start - startToken.lineStart
                };
                this.end = null;
            }

            function Node() {
                if (extra.range) {
                    this.range = [startIndex, 0];
                }
                if (extra.loc) {
                    this.loc = new SourceLocation();
                }
            }

            function WrappingNode(startToken) {
                if (extra.range) {
                    this.range = [startToken.start, 0];
                }
                if (extra.loc) {
                    this.loc = new WrappingSourceLocation(startToken);
                }
            }

            WrappingNode.prototype = Node.prototype = {

                processComment: function () {
                    var lastChild,
                        leadingComments,
                        trailingComments,
                        bottomRight = extra.bottomRightStack,
                        i,
                        comment,
                        last = bottomRight[bottomRight.length - 1];

                    if (this.type === Syntax.Program) {
                        if (this.body.length > 0) {
                            return;
                        }
                    }

                    if (extra.trailingComments.length > 0) {
                        trailingComments = [];
                        for (i = extra.trailingComments.length - 1; i >= 0; --i) {
                            comment = extra.trailingComments[i];
                            if (comment.range[0] >= this.range[1]) {
                                trailingComments.unshift(comment);
                                extra.trailingComments.splice(i, 1);
                            }
                        }
                        extra.trailingComments = [];
                    } else {
                        if (last && last.trailingComments && last.trailingComments[0].range[0] >= this.range[1]) {
                            trailingComments = last.trailingComments;
                            delete last.trailingComments;
                        }
                    }

                    // Eating the stack.
                    while (last && last.range[0] >= this.range[0]) {
                        lastChild = bottomRight.pop();
                        last = bottomRight[bottomRight.length - 1];
                    }

                    if (lastChild) {
                        if (lastChild.leadingComments) {
                            leadingComments = [];
                            for (i = lastChild.leadingComments.length - 1; i >= 0; --i) {
                                comment = lastChild.leadingComments[i];
                                if (comment.range[1] <= this.range[0]) {
                                    leadingComments.unshift(comment);
                                    lastChild.leadingComments.splice(i, 1);
                                }
                            }

                            if (!lastChild.leadingComments.length) {
                                lastChild.leadingComments = undefined;
                            }
                        }
                    } else if (extra.leadingComments.length > 0) {
                        leadingComments = [];
                        for (i = extra.leadingComments.length - 1; i >= 0; --i) {
                            comment = extra.leadingComments[i];
                            if (comment.range[1] <= this.range[0]) {
                                leadingComments.unshift(comment);
                                extra.leadingComments.splice(i, 1);
                            }
                        }
                    }


                    if (leadingComments && leadingComments.length > 0) {
                        this.leadingComments = leadingComments;
                    }
                    if (trailingComments && trailingComments.length > 0) {
                        this.trailingComments = trailingComments;
                    }

                    bottomRight.push(this);
                },

                finish: function () {
                    if (extra.range) {
                        this.range[1] = lastIndex;
                    }
                    if (extra.loc) {
                        this.loc.end = {
                            line: lastLineNumber,
                            column: lastIndex - lastLineStart
                        };
                        if (extra.source) {
                            this.loc.source = extra.source;
                        }
                    }

                    if (extra.attachComment) {
                        this.processComment();
                    }
                },

                finishArrayExpression: function (elements) {
                    this.type = Syntax.ArrayExpression;
                    this.elements = elements;
                    this.finish();
                    return this;
                },

                finishArrayPattern: function (elements) {
                    this.type = Syntax.ArrayPattern;
                    this.elements = elements;
                    this.finish();
                    return this;
                },

                finishArrowFunctionExpression: function (params, defaults, body, expression) {
                    this.type = Syntax.ArrowFunctionExpression;
                    this.id = null;
                    this.params = params;
                    this.defaults = defaults;
                    this.body = body;
                    this.generator = false;
                    this.expression = expression;
                    this.finish();
                    return this;
                },

                finishAssignmentExpression: function (operator, left, right) {
                    this.type = Syntax.AssignmentExpression;
                    this.operator = operator;
                    this.left = left;
                    this.right = right;
                    this.finish();
                    return this;
                },

                finishAssignmentPattern: function (left, right) {
                    this.type = Syntax.AssignmentPattern;
                    this.left = left;
                    this.right = right;
                    this.finish();
                    return this;
                },

                finishBinaryExpression: function (operator, left, right) {
                    this.type = (operator === '||' || operator === '&&') ? Syntax.LogicalExpression : Syntax.BinaryExpression;
                    this.operator = operator;
                    this.left = left;
                    this.right = right;
                    this.finish();
                    return this;
                },

                finishBlockStatement: function (body) {
                    this.type = Syntax.BlockStatement;
                    this.body = body;
                    this.finish();
                    return this;
                },

                finishBreakStatement: function (label) {
                    this.type = Syntax.BreakStatement;
                    this.label = label;
                    this.finish();
                    return this;
                },

                finishCallExpression: function (callee, args) {
                    this.type = Syntax.CallExpression;
                    this.callee = callee;
                    this.arguments = args;
                    this.finish();
                    return this;
                },

                finishCatchClause: function (param, body) {
                    this.type = Syntax.CatchClause;
                    this.param = param;
                    this.body = body;
                    this.finish();
                    return this;
                },

                finishClassBody: function (body) {
                    this.type = Syntax.ClassBody;
                    this.body = body;
                    this.finish();
                    return this;
                },

                finishClassDeclaration: function (id, superClass, body) {
                    this.type = Syntax.ClassDeclaration;
                    this.id = id;
                    this.superClass = superClass;
                    this.body = body;
                    this.finish();
                    return this;
                },

                finishClassExpression: function (id, superClass, body) {
                    this.type = Syntax.ClassExpression;
                    this.id = id;
                    this.superClass = superClass;
                    this.body = body;
                    this.finish();
                    return this;
                },

                finishConditionalExpression: function (test, consequent, alternate) {
                    this.type = Syntax.ConditionalExpression;
                    this.test = test;
                    this.consequent = consequent;
                    this.alternate = alternate;
                    this.finish();
                    return this;
                },

                finishContinueStatement: function (label) {
                    this.type = Syntax.ContinueStatement;
                    this.label = label;
                    this.finish();
                    return this;
                },

                finishDebuggerStatement: function () {
                    this.type = Syntax.DebuggerStatement;
                    this.finish();
                    return this;
                },

                finishDoWhileStatement: function (body, test) {
                    this.type = Syntax.DoWhileStatement;
                    this.body = body;
                    this.test = test;
                    this.finish();
                    return this;
                },

                finishEmptyStatement: function () {
                    this.type = Syntax.EmptyStatement;
                    this.finish();
                    return this;
                },

                finishExpressionStatement: function (expression) {
                    this.type = Syntax.ExpressionStatement;
                    this.expression = expression;
                    this.finish();
                    return this;
                },

                finishForStatement: function (init, test, update, body) {
                    this.type = Syntax.ForStatement;
                    this.init = init;
                    this.test = test;
                    this.update = update;
                    this.body = body;
                    this.finish();
                    return this;
                },

                finishForOfStatement: function (left, right, body) {
                    this.type = Syntax.ForOfStatement;
                    this.left = left;
                    this.right = right;
                    this.body = body;
                    this.finish();
                    return this;
                },

                finishForInStatement: function (left, right, body) {
                    this.type = Syntax.ForInStatement;
                    this.left = left;
                    this.right = right;
                    this.body = body;
                    this.each = false;
                    this.finish();
                    return this;
                },

                finishFunctionDeclaration: function (id, params, defaults, body, generator) {
                    this.type = Syntax.FunctionDeclaration;
                    this.id = id;
                    this.params = params;
                    this.defaults = defaults;
                    this.body = body;
                    this.generator = generator;
                    this.expression = false;
                    this.finish();
                    return this;
                },

                finishFunctionExpression: function (id, params, defaults, body, generator) {
                    this.type = Syntax.FunctionExpression;
                    this.id = id;
                    this.params = params;
                    this.defaults = defaults;
                    this.body = body;
                    this.generator = generator;
                    this.expression = false;
                    this.finish();
                    return this;
                },

                finishIdentifier: function (name) {
                    this.type = Syntax.Identifier;
                    this.name = name;
                    this.finish();
                    return this;
                },

                finishIfStatement: function (test, consequent, alternate) {
                    this.type = Syntax.IfStatement;
                    this.test = test;
                    this.consequent = consequent;
                    this.alternate = alternate;
                    this.finish();
                    return this;
                },

                finishLabeledStatement: function (label, body) {
                    this.type = Syntax.LabeledStatement;
                    this.label = label;
                    this.body = body;
                    this.finish();
                    return this;
                },

                finishLiteral: function (token) {
                    this.type = Syntax.Literal;
                    this.value = token.value;
                    this.raw = source.slice(token.start, token.end);
                    if (token.regex) {
                        this.regex = token.regex;
                    }
                    this.finish();
                    return this;
                },

                finishMemberExpression: function (accessor, object, property) {
                    this.type = Syntax.MemberExpression;
                    this.computed = accessor === '[';
                    this.object = object;
                    this.property = property;
                    this.finish();
                    return this;
                },

                finishNewExpression: function (callee, args) {
                    this.type = Syntax.NewExpression;
                    this.callee = callee;
                    this.arguments = args;
                    this.finish();
                    return this;
                },

                finishObjectExpression: function (properties) {
                    this.type = Syntax.ObjectExpression;
                    this.properties = properties;
                    this.finish();
                    return this;
                },

                finishObjectPattern: function (properties) {
                    this.type = Syntax.ObjectPattern;
                    this.properties = properties;
                    this.finish();
                    return this;
                },

                finishPostfixExpression: function (operator, argument) {
                    this.type = Syntax.UpdateExpression;
                    this.operator = operator;
                    this.argument = argument;
                    this.prefix = false;
                    this.finish();
                    return this;
                },

                finishProgram: function (body) {
                    this.type = Syntax.Program;
                    this.body = body;
                    if (sourceType === 'module') {
                        // very restrictive for now
                        this.sourceType = sourceType;
                    }
                    this.finish();
                    return this;
                },

                finishProperty: function (kind, key, computed, value, method, shorthand) {
                    this.type = Syntax.Property;
                    this.key = key;
                    this.computed = computed;
                    this.value = value;
                    this.kind = kind;
                    this.method = method;
                    this.shorthand = shorthand;
                    this.finish();
                    return this;
                },

                finishRestElement: function (argument) {
                    this.type = Syntax.RestElement;
                    this.argument = argument;
                    this.finish();
                    return this;
                },

                finishReturnStatement: function (argument) {
                    this.type = Syntax.ReturnStatement;
                    this.argument = argument;
                    this.finish();
                    return this;
                },

                finishSequenceExpression: function (expressions) {
                    this.type = Syntax.SequenceExpression;
                    this.expressions = expressions;
                    this.finish();
                    return this;
                },

                finishSpreadElement: function (argument) {
                    this.type = Syntax.SpreadElement;
                    this.argument = argument;
                    this.finish();
                    return this;
                },

                finishSwitchCase: function (test, consequent) {
                    this.type = Syntax.SwitchCase;
                    this.test = test;
                    this.consequent = consequent;
                    this.finish();
                    return this;
                },

                finishSuper: function () {
                    this.type = Syntax.Super;
                    this.finish();
                    return this;
                },

                finishSwitchStatement: function (discriminant, cases) {
                    this.type = Syntax.SwitchStatement;
                    this.discriminant = discriminant;
                    this.cases = cases;
                    this.finish();
                    return this;
                },

                finishTaggedTemplateExpression: function (tag, quasi) {
                    this.type = Syntax.TaggedTemplateExpression;
                    this.tag = tag;
                    this.quasi = quasi;
                    this.finish();
                    return this;
                },

                finishTemplateElement: function (value, tail) {
                    this.type = Syntax.TemplateElement;
                    this.value = value;
                    this.tail = tail;
                    this.finish();
                    return this;
                },

                finishTemplateLiteral: function (quasis, expressions) {
                    this.type = Syntax.TemplateLiteral;
                    this.quasis = quasis;
                    this.expressions = expressions;
                    this.finish();
                    return this;
                },

                finishThisExpression: function () {
                    this.type = Syntax.ThisExpression;
                    this.finish();
                    return this;
                },

                finishThrowStatement: function (argument) {
                    this.type = Syntax.ThrowStatement;
                    this.argument = argument;
                    this.finish();
                    return this;
                },

                finishTryStatement: function (block, handler, finalizer) {
                    this.type = Syntax.TryStatement;
                    this.block = block;
                    this.guardedHandlers = [];
                    this.handlers = handler ? [ handler ] : [];
                    this.handler = handler;
                    this.finalizer = finalizer;
                    this.finish();
                    return this;
                },

                finishUnaryExpression: function (operator, argument) {
                    this.type = (operator === '++' || operator === '--') ? Syntax.UpdateExpression : Syntax.UnaryExpression;
                    this.operator = operator;
                    this.argument = argument;
                    this.prefix = true;
                    this.finish();
                    return this;
                },

                finishVariableDeclaration: function (declarations) {
                    this.type = Syntax.VariableDeclaration;
                    this.declarations = declarations;
                    this.kind = 'var';
                    this.finish();
                    return this;
                },

                finishLexicalDeclaration: function (declarations, kind) {
                    this.type = Syntax.VariableDeclaration;
                    this.declarations = declarations;
                    this.kind = kind;
                    this.finish();
                    return this;
                },

                finishVariableDeclarator: function (id, init) {
                    this.type = Syntax.VariableDeclarator;
                    this.id = id;
                    this.init = init;
                    this.finish();
                    return this;
                },

                finishWhileStatement: function (test, body) {
                    this.type = Syntax.WhileStatement;
                    this.test = test;
                    this.body = body;
                    this.finish();
                    return this;
                },

                finishWithStatement: function (object, body) {
                    this.type = Syntax.WithStatement;
                    this.object = object;
                    this.body = body;
                    this.finish();
                    return this;
                },

                finishExportSpecifier: function (local, exported) {
                    this.type = Syntax.ExportSpecifier;
                    this.exported = exported || local;
                    this.local = local;
                    this.finish();
                    return this;
                },

                finishImportDefaultSpecifier: function (local) {
                    this.type = Syntax.ImportDefaultSpecifier;
                    this.local = local;
                    this.finish();
                    return this;
                },

                finishImportNamespaceSpecifier: function (local) {
                    this.type = Syntax.ImportNamespaceSpecifier;
                    this.local = local;
                    this.finish();
                    return this;
                },

                finishExportNamedDeclaration: function (declaration, specifiers, src) {
                    this.type = Syntax.ExportNamedDeclaration;
                    this.declaration = declaration;
                    this.specifiers = specifiers;
                    this.source = src;
                    this.finish();
                    return this;
                },

                finishExportDefaultDeclaration: function (declaration) {
                    this.type = Syntax.ExportDefaultDeclaration;
                    this.declaration = declaration;
                    this.finish();
                    return this;
                },

                finishExportAllDeclaration: function (src) {
                    this.type = Syntax.ExportAllDeclaration;
                    this.source = src;
                    this.finish();
                    return this;
                },

                finishImportSpecifier: function (local, imported) {
                    this.type = Syntax.ImportSpecifier;
                    this.local = local || imported;
                    this.imported = imported;
                    this.finish();
                    return this;
                },

                finishImportDeclaration: function (specifiers, src) {
                    this.type = Syntax.ImportDeclaration;
                    this.specifiers = specifiers;
                    this.source = src;
                    this.finish();
                    return this;
                },

                finishYieldExpression: function (argument, delegate) {
                    this.type = Syntax.YieldExpression;
                    this.argument = argument;
                    this.delegate = delegate;
                    this.finish();
                    return this;
                }
            };


            function recordError(error) {
                var e, existing;

                for (e = 0; e < extra.errors.length; e++) {
                    existing = extra.errors[e];
                    // Prevent duplicated error.
                    /* istanbul ignore next */
                    if (existing.index === error.index && existing.message === error.message) {
                        return;
                    }
                }

                extra.errors.push(error);
            }

            function createError(line, pos, description) {
                var error = new Error('Line ' + line + ': ' + description);
                error.index = pos;
                error.lineNumber = line;
                error.column = pos - (scanning ? lineStart : lastLineStart) + 1;
                error.description = description;
                return error;
            }

            // Throw an exception

            function throwError(messageFormat) {
                var args, msg;

                args = Array.prototype.slice.call(arguments, 1);
                msg = messageFormat.replace(/%(\d)/g,
                    function (whole, idx) {
                        assert(idx < args.length, 'Message reference must be in range');
                        return args[idx];
                    }
                );

                throw createError(lastLineNumber, lastIndex, msg);
            }

            function tolerateError(messageFormat) {
                var args, msg, error;

                args = Array.prototype.slice.call(arguments, 1);
                /* istanbul ignore next */
                msg = messageFormat.replace(/%(\d)/g,
                    function (whole, idx) {
                        assert(idx < args.length, 'Message reference must be in range');
                        return args[idx];
                    }
                );

                error = createError(lineNumber, lastIndex, msg);
                if (extra.errors) {
                    recordError(error);
                } else {
                    throw error;
                }
            }

            // Throw an exception because of the token.

            function unexpectedTokenError(token, message) {
                var value, msg = message || Messages.UnexpectedToken;

                if (token) {
                    if (!message) {
                        msg = (token.type === Token.EOF) ? Messages.UnexpectedEOS :
                            (token.type === Token.Identifier) ? Messages.UnexpectedIdentifier :
                                (token.type === Token.NumericLiteral) ? Messages.UnexpectedNumber :
                                    (token.type === Token.StringLiteral) ? Messages.UnexpectedString :
                                        (token.type === Token.Template) ? Messages.UnexpectedTemplate :
                                            Messages.UnexpectedToken;

                        if (token.type === Token.Keyword) {
                            if (isFutureReservedWord(token.value)) {
                                msg = Messages.UnexpectedReserved;
                            } else if (strict && isStrictModeReservedWord(token.value)) {
                                msg = Messages.StrictReservedWord;
                            }
                        }
                    }

                    value = (token.type === Token.Template) ? token.value.raw : token.value;
                } else {
                    value = 'ILLEGAL';
                }

                msg = msg.replace('%0', value);

                return (token && typeof token.lineNumber === 'number') ?
                    createError(token.lineNumber, token.start, msg) :
                    createError(scanning ? lineNumber : lastLineNumber, scanning ? index : lastIndex, msg);
            }

            function throwUnexpectedToken(token, message) {
                throw unexpectedTokenError(token, message);
            }

            function tolerateUnexpectedToken(token, message) {
                var error = unexpectedTokenError(token, message);
                if (extra.errors) {
                    recordError(error);
                } else {
                    throw error;
                }
            }

            // Expect the next token to match the specified punctuator.
            // If not, an exception will be thrown.

            function expect(value) {
                var token = lex();
                if (token.type !== Token.Punctuator || token.value !== value) {
                    throwUnexpectedToken(token);
                }
            }

            /**
             * @name expectCommaSeparator
             * @description Quietly expect a comma when in tolerant mode, otherwise delegates
             * to <code>expect(value)</code>
             * @since 2.0
             */
            function expectCommaSeparator() {
                var token;

                if (extra.errors) {
                    token = lookahead;
                    if (token.type === Token.Punctuator && token.value === ',') {
                        lex();
                    } else if (token.type === Token.Punctuator && token.value === ';') {
                        lex();
                        tolerateUnexpectedToken(token);
                    } else {
                        tolerateUnexpectedToken(token, Messages.UnexpectedToken);
                    }
                } else {
                    expect(',');
                }
            }

            // Expect the next token to match the specified keyword.
            // If not, an exception will be thrown.

            function expectKeyword(keyword) {
                var token = lex();
                if (token.type !== Token.Keyword || token.value !== keyword) {
                    throwUnexpectedToken(token);
                }
            }

            // Return true if the next token matches the specified punctuator.

            function match(value) {
                return lookahead.type === Token.Punctuator && lookahead.value === value;
            }

            // Return true if the next token matches the specified keyword

            function matchKeyword(keyword) {
                return lookahead.type === Token.Keyword && lookahead.value === keyword;
            }

            // Return true if the next token matches the specified contextual keyword
            // (where an identifier is sometimes a keyword depending on the context)

            function matchContextualKeyword(keyword) {
                return lookahead.type === Token.Identifier && lookahead.value === keyword;
            }

            // Return true if the next token is an assignment operator

            function matchAssign() {
                var op;

                if (lookahead.type !== Token.Punctuator) {
                    return false;
                }
                op = lookahead.value;
                return op === '=' ||
                    op === '*=' ||
                    op === '/=' ||
                    op === '%=' ||
                    op === '+=' ||
                    op === '-=' ||
                    op === '<<=' ||
                    op === '>>=' ||
                    op === '>>>=' ||
                    op === '&=' ||
                    op === '^=' ||
                    op === '|=';
            }

            function consumeSemicolon() {
                // Catch the very common case first: immediately a semicolon (U+003B).
                if (source.charCodeAt(startIndex) === 0x3B || match(';')) {
                    lex();
                    return;
                }

                if (hasLineTerminator) {
                    return;
                }

                // FIXME(ikarienator): this is seemingly an issue in the previous location info convention.
                lastIndex = startIndex;
                lastLineNumber = startLineNumber;
                lastLineStart = startLineStart;

                if (lookahead.type !== Token.EOF && !match('}')) {
                    throwUnexpectedToken(lookahead);
                }
            }

            // Cover grammar support.
            //
            // When an assignment expression position starts with an left parenthesis, the determination of the type
            // of the syntax is to be deferred arbitrarily long until the end of the parentheses pair (plus a lookahead)
            // or the first comma. This situation also defers the determination of all the expressions nested in the pair.
            //
            // There are three productions that can be parsed in a parentheses pair that needs to be determined
            // after the outermost pair is closed. They are:
            //
            //   1. AssignmentExpression
            //   2. BindingElements
            //   3. AssignmentTargets
            //
            // In order to avoid exponential backtracking, we use two flags to denote if the production can be
            // binding element or assignment target.
            //
            // The three productions have the relationship:
            //
            //   BindingElements âŠ† AssignmentTargets âŠ† AssignmentExpression
            //
            // with a single exception that CoverInitializedName when used directly in an Expression, generates
            // an early error. Therefore, we need the third state, firstCoverInitializedNameError, to track the
            // first usage of CoverInitializedName and report it when we reached the end of the parentheses pair.
            //
            // isolateCoverGrammar function runs the given parser function with a new cover grammar context, and it does not
            // effect the current flags. This means the production the parser parses is only used as an expression. Therefore
            // the CoverInitializedName check is conducted.
            //
            // inheritCoverGrammar function runs the given parse function with a new cover grammar context, and it propagates
            // the flags outside of the parser. This means the production the parser parses is used as a part of a potential
            // pattern. The CoverInitializedName check is deferred.
            function isolateCoverGrammar(parser) {
                var oldIsBindingElement = isBindingElement,
                    oldIsAssignmentTarget = isAssignmentTarget,
                    oldFirstCoverInitializedNameError = firstCoverInitializedNameError,
                    result;
                isBindingElement = true;
                isAssignmentTarget = true;
                firstCoverInitializedNameError = null;
                result = parser();
                if (firstCoverInitializedNameError !== null) {
                    throwUnexpectedToken(firstCoverInitializedNameError);
                }
                isBindingElement = oldIsBindingElement;
                isAssignmentTarget = oldIsAssignmentTarget;
                firstCoverInitializedNameError = oldFirstCoverInitializedNameError;
                return result;
            }

            function inheritCoverGrammar(parser) {
                var oldIsBindingElement = isBindingElement,
                    oldIsAssignmentTarget = isAssignmentTarget,
                    oldFirstCoverInitializedNameError = firstCoverInitializedNameError,
                    result;
                isBindingElement = true;
                isAssignmentTarget = true;
                firstCoverInitializedNameError = null;
                result = parser();
                isBindingElement = isBindingElement && oldIsBindingElement;
                isAssignmentTarget = isAssignmentTarget && oldIsAssignmentTarget;
                firstCoverInitializedNameError = oldFirstCoverInitializedNameError || firstCoverInitializedNameError;
                return result;
            }

            function parseArrayPattern(params) {
                var node = new Node(), elements = [], rest, restNode;
                expect('[');

                while (!match(']')) {
                    if (match(',')) {
                        lex();
                        elements.push(null);
                    } else {
                        if (match('...')) {
                            restNode = new Node();
                            lex();
                            params.push(lookahead);
                            rest = parseVariableIdentifier(params);
                            elements.push(restNode.finishRestElement(rest));
                            break;
                        } else {
                            elements.push(parsePatternWithDefault(params));
                        }
                        if (!match(']')) {
                            expect(',');
                        }
                    }

                }

                expect(']');

                return node.finishArrayPattern(elements);
            }

            function parsePropertyPattern(params) {
                var node = new Node(), key, keyToken, computed = match('['), init;
                if (lookahead.type === Token.Identifier) {
                    keyToken = lookahead;
                    key = parseVariableIdentifier();
                    if (match('=')) {
                        params.push(keyToken);
                        lex();
                        init = parseAssignmentExpression();

                        return node.finishProperty(
                            'init', key, false,
                            new WrappingNode(keyToken).finishAssignmentPattern(key, init), false, false);
                    } else if (!match(':')) {
                        params.push(keyToken);
                        return node.finishProperty('init', key, false, key, false, true);
                    }
                } else {
                    key = parseObjectPropertyKey(params);
                }
                expect(':');
                init = parsePatternWithDefault(params);
                return node.finishProperty('init', key, computed, init, false, false);
            }

            function parseObjectPattern(params) {
                var node = new Node(), properties = [];

                expect('{');

                while (!match('}')) {
                    properties.push(parsePropertyPattern(params));
                    if (!match('}')) {
                        expect(',');
                    }
                }

                lex();

                return node.finishObjectPattern(properties);
            }

            function parsePattern(params) {
                var identifier;
                if (lookahead.type === Token.Identifier) {
                    params.push(lookahead);
                    identifier = parseVariableIdentifier();
                    return identifier;
                } else if (match('[')) {
                    return parseArrayPattern(params);
                } else if (match('{')) {
                    return parseObjectPattern(params);
                }
                throwUnexpectedToken(lookahead);
            }

            function parsePatternWithDefault(params) {
                var startToken = lookahead, pattern, right;
                pattern = parsePattern(params);
                if (match('=')) {
                    lex();
                    right = isolateCoverGrammar(parseAssignmentExpression);
                    pattern = new WrappingNode(startToken).finishAssignmentPattern(pattern, right);
                }
                return pattern;
            }

            // 11.1.4 Array Initialiser

            function parseArrayInitialiser() {
                var elements = [], node = new Node(), restSpread;

                expect('[');

                while (!match(']')) {
                    if (match(',')) {
                        lex();
                        elements.push(null);
                    } else if (match('...')) {
                        restSpread = new Node();
                        lex();
                        restSpread.finishSpreadElement(inheritCoverGrammar(parseAssignmentExpression));

                        if (!match(']')) {
                            isAssignmentTarget = isBindingElement = false;
                            expect(',');
                        }
                        elements.push(restSpread);
                    } else {
                        elements.push(inheritCoverGrammar(parseAssignmentExpression));

                        if (!match(']')) {
                            expect(',');
                        }
                    }
                }

                lex();

                return node.finishArrayExpression(elements);
            }

            // 11.1.5 Object Initialiser

            function parsePropertyFunction(node, paramInfo, isGenerator) {
                var previousStrict, body;

                isAssignmentTarget = isBindingElement = false;

                previousStrict = strict;
                body = isolateCoverGrammar(parseFunctionSourceElements);

                if (strict && paramInfo.firstRestricted) {
                    tolerateUnexpectedToken(paramInfo.firstRestricted, paramInfo.message);
                }
                if (strict && paramInfo.stricted) {
                    tolerateUnexpectedToken(paramInfo.stricted, paramInfo.message);
                }

                strict = previousStrict;
                return node.finishFunctionExpression(null, paramInfo.params, paramInfo.defaults, body, isGenerator);
            }

            function parsePropertyMethodFunction() {
                var params, method, node = new Node(),
                    previousAllowYield = state.allowYield;

                state.allowYield = false;
                params = parseParams();
                state.allowYield = previousAllowYield;

                state.allowYield = false;
                method = parsePropertyFunction(node, params, false);
                state.allowYield = previousAllowYield;

                return method;
            }

            function parseObjectPropertyKey() {
                var token, node = new Node(), expr;

                token = lex();

                // Note: This function is called only from parseObjectProperty(), where
                // EOF and Punctuator tokens are already filtered out.

                switch (token.type) {
                    case Token.StringLiteral:
                    case Token.NumericLiteral:
                        if (strict && token.octal) {
                            tolerateUnexpectedToken(token, Messages.StrictOctalLiteral);
                        }
                        return node.finishLiteral(token);
                    case Token.Identifier:
                    case Token.BooleanLiteral:
                    case Token.NullLiteral:
                    case Token.Keyword:
                        return node.finishIdentifier(token.value);
                    case Token.Punctuator:
                        if (token.value === '[') {
                            expr = isolateCoverGrammar(parseAssignmentExpression);
                            expect(']');
                            return expr;
                        }
                        break;
                }
                throwUnexpectedToken(token);
            }

            function lookaheadPropertyName() {
                switch (lookahead.type) {
                    case Token.Identifier:
                    case Token.StringLiteral:
                    case Token.BooleanLiteral:
                    case Token.NullLiteral:
                    case Token.NumericLiteral:
                    case Token.Keyword:
                        return true;
                    case Token.Punctuator:
                        return lookahead.value === '[';
                }
                return false;
            }

            // This function is to try to parse a MethodDefinition as defined in 14.3. But in the case of object literals,
            // it might be called at a position where there is in fact a short hand identifier pattern or a data property.
            // This can only be determined after we consumed up to the left parentheses.
            //
            // In order to avoid back tracking, it returns `null` if the position is not a MethodDefinition and the caller
            // is responsible to visit other options.
            function tryParseMethodDefinition(token, key, computed, node) {
                var value, options, methodNode, params,
                    previousAllowYield = state.allowYield;

                if (token.type === Token.Identifier) {
                    // check for `get` and `set`;

                    if (token.value === 'get' && lookaheadPropertyName()) {
                        computed = match('[');
                        key = parseObjectPropertyKey();
                        methodNode = new Node();
                        expect('(');
                        expect(')');

                        state.allowYield = false;
                        value = parsePropertyFunction(methodNode, {
                            params: [],
                            defaults: [],
                            stricted: null,
                            firstRestricted: null,
                            message: null
                        }, false);
                        state.allowYield = previousAllowYield;

                        return node.finishProperty('get', key, computed, value, false, false);
                    } else if (token.value === 'set' && lookaheadPropertyName()) {
                        computed = match('[');
                        key = parseObjectPropertyKey();
                        methodNode = new Node();
                        expect('(');

                        options = {
                            params: [],
                            defaultCount: 0,
                            defaults: [],
                            firstRestricted: null,
                            paramSet: {}
                        };
                        if (match(')')) {
                            tolerateUnexpectedToken(lookahead);
                        } else {
                            state.allowYield = false;
                            parseParam(options);
                            state.allowYield = previousAllowYield;
                            if (options.defaultCount === 0) {
                                options.defaults = [];
                            }
                        }
                        expect(')');

                        state.allowYield = false;
                        value = parsePropertyFunction(methodNode, options, false);
                        state.allowYield = previousAllowYield;

                        return node.finishProperty('set', key, computed, value, false, false);
                    }
                } else if (token.type === Token.Punctuator && token.value === '*' && lookaheadPropertyName()) {
                    computed = match('[');
                    key = parseObjectPropertyKey();
                    methodNode = new Node();

                    state.allowYield = false;
                    params = parseParams();
                    state.allowYield = previousAllowYield;

                    state.allowYield = true;
                    value = parsePropertyFunction(methodNode, params, true);
                    state.allowYield = previousAllowYield;

                    return node.finishProperty('init', key, computed, value, true, false);
                }

                if (key && match('(')) {
                    value = parsePropertyMethodFunction();
                    return node.finishProperty('init', key, computed, value, true, false);
                }

                // Not a MethodDefinition.
                return null;
            }

            function checkProto(key, computed, hasProto) {
                if (computed === false && (key.type === Syntax.Identifier && key.name === '__proto__' ||
                    key.type === Syntax.Literal && key.value === '__proto__')) {
                    if (hasProto.value) {
                        tolerateError(Messages.DuplicateProtoProperty);
                    } else {
                        hasProto.value = true;
                    }
                }
            }

            function parseObjectProperty(hasProto) {
                var token = lookahead, node = new Node(), computed, key, maybeMethod, value;

                computed = match('[');
                if (match('*')) {
                    lex();
                } else {
                    key = parseObjectPropertyKey();
                }
                maybeMethod = tryParseMethodDefinition(token, key, computed, node);

                if (maybeMethod) {
                    checkProto(maybeMethod.key, maybeMethod.computed, hasProto);
                    // finished
                    return maybeMethod;
                }

                if (!key) {
                    throwUnexpectedToken(lookahead);
                }

                // init property or short hand property.
                checkProto(key, computed, hasProto);

                if (match(':')) {
                    lex();
                    value = inheritCoverGrammar(parseAssignmentExpression);
                    return node.finishProperty('init', key, computed, value, false, false);
                }

                if (token.type === Token.Identifier) {
                    if (match('=')) {
                        firstCoverInitializedNameError = lookahead;
                        lex();
                        value = isolateCoverGrammar(parseAssignmentExpression);
                        return node.finishProperty('init', key, computed,
                            new WrappingNode(token).finishAssignmentPattern(key, value), false, true);
                    }
                    return node.finishProperty('init', key, computed, key, false, true);
                }

                throwUnexpectedToken(lookahead);
            }

            function parseObjectInitialiser() {
                var properties = [], hasProto = {value: false}, node = new Node();

                expect('{');

                while (!match('}')) {
                    properties.push(parseObjectProperty(hasProto));

                    if (!match('}')) {
                        expectCommaSeparator();
                    }
                }

                expect('}');

                return node.finishObjectExpression(properties);
            }

            function reinterpretExpressionAsPattern(expr) {
                var i;
                switch (expr.type) {
                    case Syntax.Identifier:
                    case Syntax.MemberExpression:
                    case Syntax.RestElement:
                    case Syntax.AssignmentPattern:
                        break;
                    case Syntax.SpreadElement:
                        expr.type = Syntax.RestElement;
                        reinterpretExpressionAsPattern(expr.argument);
                        break;
                    case Syntax.ArrayExpression:
                        expr.type = Syntax.ArrayPattern;
                        for (i = 0; i < expr.elements.length; i++) {
                            if (expr.elements[i] !== null) {
                                reinterpretExpressionAsPattern(expr.elements[i]);
                            }
                        }
                        break;
                    case Syntax.ObjectExpression:
                        expr.type = Syntax.ObjectPattern;
                        for (i = 0; i < expr.properties.length; i++) {
                            reinterpretExpressionAsPattern(expr.properties[i].value);
                        }
                        break;
                    case Syntax.AssignmentExpression:
                        expr.type = Syntax.AssignmentPattern;
                        reinterpretExpressionAsPattern(expr.left);
                        break;
                    default:
                        // Allow other node type for tolerant parsing.
                        break;
                }
            }

            function parseTemplateElement(option) {
                var node, token;

                if (lookahead.type !== Token.Template || (option.head && !lookahead.head)) {
                    throwUnexpectedToken();
                }

                node = new Node();
                token = lex();

                return node.finishTemplateElement({ raw: token.value.raw, cooked: token.value.cooked }, token.tail);
            }

            function parseTemplateLiteral() {
                var quasi, quasis, expressions, node = new Node();

                quasi = parseTemplateElement({ head: true });
                quasis = [ quasi ];
                expressions = [];

                while (!quasi.tail) {
                    expressions.push(parseExpression());
                    quasi = parseTemplateElement({ head: false });
                    quasis.push(quasi);
                }

                return node.finishTemplateLiteral(quasis, expressions);
            }

            // 11.1.6 The Grouping Operator

            function parseGroupExpression() {
                var expr, expressions, startToken, i, params = [];

                expect('(');

                if (match(')')) {
                    lex();
                    if (!match('=>')) {
                        expect('=>');
                    }
                    return {
                        type: PlaceHolders.ArrowParameterPlaceHolder,
                        params: [],
                        rawParams: []
                    };
                }

                startToken = lookahead;
                if (match('...')) {
                    expr = parseRestElement(params);
                    expect(')');
                    if (!match('=>')) {
                        expect('=>');
                    }
                    return {
                        type: PlaceHolders.ArrowParameterPlaceHolder,
                        params: [expr]
                    };
                }

                isBindingElement = true;
                expr = inheritCoverGrammar(parseAssignmentExpression);

                if (match(',')) {
                    isAssignmentTarget = false;
                    expressions = [expr];

                    while (startIndex < length) {
                        if (!match(',')) {
                            break;
                        }
                        lex();

                        if (match('...')) {
                            if (!isBindingElement) {
                                throwUnexpectedToken(lookahead);
                            }
                            expressions.push(parseRestElement(params));
                            expect(')');
                            if (!match('=>')) {
                                expect('=>');
                            }
                            isBindingElement = false;
                            for (i = 0; i < expressions.length; i++) {
                                reinterpretExpressionAsPattern(expressions[i]);
                            }
                            return {
                                type: PlaceHolders.ArrowParameterPlaceHolder,
                                params: expressions
                            };
                        }

                        expressions.push(inheritCoverGrammar(parseAssignmentExpression));
                    }

                    expr = new WrappingNode(startToken).finishSequenceExpression(expressions);
                }


                expect(')');

                if (match('=>')) {
                    if (!isBindingElement) {
                        throwUnexpectedToken(lookahead);
                    }

                    if (expr.type === Syntax.SequenceExpression) {
                        for (i = 0; i < expr.expressions.length; i++) {
                            reinterpretExpressionAsPattern(expr.expressions[i]);
                        }
                    } else {
                        reinterpretExpressionAsPattern(expr);
                    }

                    expr = {
                        type: PlaceHolders.ArrowParameterPlaceHolder,
                        params: expr.type === Syntax.SequenceExpression ? expr.expressions : [expr]
                    };
                }
                isBindingElement = false;
                return expr;
            }


            // 11.1 Primary Expressions

            function parsePrimaryExpression() {
                var type, token, expr, node;

                if (match('(')) {
                    isBindingElement = false;
                    return inheritCoverGrammar(parseGroupExpression);
                }

                if (match('[')) {
                    return inheritCoverGrammar(parseArrayInitialiser);
                }

                if (match('{')) {
                    return inheritCoverGrammar(parseObjectInitialiser);
                }

                type = lookahead.type;
                node = new Node();

                if (type === Token.Identifier) {
                    expr = node.finishIdentifier(lex().value);
                } else if (type === Token.StringLiteral || type === Token.NumericLiteral) {
                    isAssignmentTarget = isBindingElement = false;
                    if (strict && lookahead.octal) {
                        tolerateUnexpectedToken(lookahead, Messages.StrictOctalLiteral);
                    }
                    expr = node.finishLiteral(lex());
                } else if (type === Token.Keyword) {
                    isAssignmentTarget = isBindingElement = false;
                    if (matchKeyword('function')) {
                        return parseFunctionExpression();
                    }
                    if (matchKeyword('this')) {
                        lex();
                        return node.finishThisExpression();
                    }
                    if (matchKeyword('class')) {
                        return parseClassExpression();
                    }
                    throwUnexpectedToken(lex());
                } else if (type === Token.BooleanLiteral) {
                    isAssignmentTarget = isBindingElement = false;
                    token = lex();
                    token.value = (token.value === 'true');
                    expr = node.finishLiteral(token);
                } else if (type === Token.NullLiteral) {
                    isAssignmentTarget = isBindingElement = false;
                    token = lex();
                    token.value = null;
                    expr = node.finishLiteral(token);
                } else if (match('/') || match('/=')) {
                    isAssignmentTarget = isBindingElement = false;
                    index = startIndex;

                    if (typeof extra.tokens !== 'undefined') {
                        token = collectRegex();
                    } else {
                        token = scanRegExp();
                    }
                    lex();
                    expr = node.finishLiteral(token);
                } else if (type === Token.Template) {
                    expr = parseTemplateLiteral();
                } else {
                    throwUnexpectedToken(lex());
                }

                return expr;
            }

            // 11.2 Left-Hand-Side Expressions

            function parseArguments() {
                var args = [], expr;

                expect('(');

                if (!match(')')) {
                    while (startIndex < length) {
                        if (match('...')) {
                            expr = new Node();
                            lex();
                            expr.finishSpreadElement(isolateCoverGrammar(parseAssignmentExpression));
                        } else {
                            expr = isolateCoverGrammar(parseAssignmentExpression);
                        }
                        args.push(expr);
                        if (match(')')) {
                            break;
                        }
                        expectCommaSeparator();
                    }
                }

                expect(')');

                return args;
            }

            function parseNonComputedProperty() {
                var token, node = new Node();

                token = lex();

                if (!isIdentifierName(token)) {
                    throwUnexpectedToken(token);
                }

                return node.finishIdentifier(token.value);
            }

            function parseNonComputedMember() {
                expect('.');

                return parseNonComputedProperty();
            }

            function parseComputedMember() {
                var expr;

                expect('[');

                expr = isolateCoverGrammar(parseExpression);

                expect(']');

                return expr;
            }

            function parseNewExpression() {
                var callee, args, node = new Node();

                expectKeyword('new');
                callee = isolateCoverGrammar(parseLeftHandSideExpression);
                args = match('(') ? parseArguments() : [];

                isAssignmentTarget = isBindingElement = false;

                return node.finishNewExpression(callee, args);
            }

            function parseLeftHandSideExpressionAllowCall() {
                var quasi, expr, args, property, startToken, previousAllowIn = state.allowIn;

                startToken = lookahead;
                state.allowIn = true;

                if (matchKeyword('super') && state.inFunctionBody) {
                    expr = new Node();
                    lex();
                    expr = expr.finishSuper();
                    if (!match('(') && !match('.') && !match('[')) {
                        throwUnexpectedToken(lookahead);
                    }
                } else {
                    expr = inheritCoverGrammar(matchKeyword('new') ? parseNewExpression : parsePrimaryExpression);
                }

                for (;;) {
                    if (match('.')) {
                        isBindingElement = false;
                        isAssignmentTarget = true;
                        property = parseNonComputedMember();
                        expr = new WrappingNode(startToken).finishMemberExpression('.', expr, property);
                    } else if (match('(')) {
                        isBindingElement = false;
                        isAssignmentTarget = false;
                        args = parseArguments();
                        expr = new WrappingNode(startToken).finishCallExpression(expr, args);
                    } else if (match('[')) {
                        isBindingElement = false;
                        isAssignmentTarget = true;
                        property = parseComputedMember();
                        expr = new WrappingNode(startToken).finishMemberExpression('[', expr, property);
                    } else if (lookahead.type === Token.Template && lookahead.head) {
                        quasi = parseTemplateLiteral();
                        expr = new WrappingNode(startToken).finishTaggedTemplateExpression(expr, quasi);
                    } else {
                        break;
                    }
                }
                state.allowIn = previousAllowIn;

                return expr;
            }

            function parseLeftHandSideExpression() {
                var quasi, expr, property, startToken;
                assert(state.allowIn, 'callee of new expression always allow in keyword.');

                startToken = lookahead;

                if (matchKeyword('super') && state.inFunctionBody) {
                    expr = new Node();
                    lex();
                    expr = expr.finishSuper();
                    if (!match('[') && !match('.')) {
                        throwUnexpectedToken(lookahead);
                    }
                } else {
                    expr = inheritCoverGrammar(matchKeyword('new') ? parseNewExpression : parsePrimaryExpression);
                }

                for (;;) {
                    if (match('[')) {
                        isBindingElement = false;
                        isAssignmentTarget = true;
                        property = parseComputedMember();
                        expr = new WrappingNode(startToken).finishMemberExpression('[', expr, property);
                    } else if (match('.')) {
                        isBindingElement = false;
                        isAssignmentTarget = true;
                        property = parseNonComputedMember();
                        expr = new WrappingNode(startToken).finishMemberExpression('.', expr, property);
                    } else if (lookahead.type === Token.Template && lookahead.head) {
                        quasi = parseTemplateLiteral();
                        expr = new WrappingNode(startToken).finishTaggedTemplateExpression(expr, quasi);
                    } else {
                        break;
                    }
                }
                return expr;
            }

            // 11.3 Postfix Expressions

            function parsePostfixExpression() {
                var expr, token, startToken = lookahead;

                expr = inheritCoverGrammar(parseLeftHandSideExpressionAllowCall);

                if (!hasLineTerminator && lookahead.type === Token.Punctuator) {
                    if (match('++') || match('--')) {
                        // 11.3.1, 11.3.2
                        if (strict && expr.type === Syntax.Identifier && isRestrictedWord(expr.name)) {
                            tolerateError(Messages.StrictLHSPostfix);
                        }

                        if (!isAssignmentTarget) {
                            tolerateError(Messages.InvalidLHSInAssignment);
                        }

                        isAssignmentTarget = isBindingElement = false;

                        token = lex();
                        expr = new WrappingNode(startToken).finishPostfixExpression(token.value, expr);
                    }
                }

                return expr;
            }

            // 11.4 Unary Operators

            function parseUnaryExpression() {
                var token, expr, startToken;

                if (lookahead.type !== Token.Punctuator && lookahead.type !== Token.Keyword) {
                    expr = parsePostfixExpression();
                } else if (match('++') || match('--')) {
                    startToken = lookahead;
                    token = lex();
                    expr = inheritCoverGrammar(parseUnaryExpression);
                    // 11.4.4, 11.4.5
                    if (strict && expr.type === Syntax.Identifier && isRestrictedWord(expr.name)) {
                        tolerateError(Messages.StrictLHSPrefix);
                    }

                    if (!isAssignmentTarget) {
                        tolerateError(Messages.InvalidLHSInAssignment);
                    }
                    expr = new WrappingNode(startToken).finishUnaryExpression(token.value, expr);
                    isAssignmentTarget = isBindingElement = false;
                } else if (match('+') || match('-') || match('~') || match('!')) {
                    startToken = lookahead;
                    token = lex();
                    expr = inheritCoverGrammar(parseUnaryExpression);
                    expr = new WrappingNode(startToken).finishUnaryExpression(token.value, expr);
                    isAssignmentTarget = isBindingElement = false;
                } else if (matchKeyword('delete') || matchKeyword('void') || matchKeyword('typeof')) {
                    startToken = lookahead;
                    token = lex();
                    expr = inheritCoverGrammar(parseUnaryExpression);
                    expr = new WrappingNode(startToken).finishUnaryExpression(token.value, expr);
                    if (strict && expr.operator === 'delete' && expr.argument.type === Syntax.Identifier) {
                        tolerateError(Messages.StrictDelete);
                    }
                    isAssignmentTarget = isBindingElement = false;
                } else {
                    expr = parsePostfixExpression();
                }

                return expr;
            }

            function binaryPrecedence(token, allowIn) {
                var prec = 0;

                if (token.type !== Token.Punctuator && token.type !== Token.Keyword) {
                    return 0;
                }

                switch (token.value) {
                    case '||':
                        prec = 1;
                        break;

                    case '&&':
                        prec = 2;
                        break;

                    case '|':
                        prec = 3;
                        break;

                    case '^':
                        prec = 4;
                        break;

                    case '&':
                        prec = 5;
                        break;

                    case '==':
                    case '!=':
                    case '===':
                    case '!==':
                        prec = 6;
                        break;

                    case '<':
                    case '>':
                    case '<=':
                    case '>=':
                    case 'instanceof':
                        prec = 7;
                        break;

                    case 'in':
                        prec = allowIn ? 7 : 0;
                        break;

                    case '<<':
                    case '>>':
                    case '>>>':
                        prec = 8;
                        break;

                    case '+':
                    case '-':
                        prec = 9;
                        break;

                    case '*':
                    case '/':
                    case '%':
                        prec = 11;
                        break;

                    default:
                        break;
                }

                return prec;
            }

            // 11.5 Multiplicative Operators
            // 11.6 Additive Operators
            // 11.7 Bitwise Shift Operators
            // 11.8 Relational Operators
            // 11.9 Equality Operators
            // 11.10 Binary Bitwise Operators
            // 11.11 Binary Logical Operators

            function parseBinaryExpression() {
                var marker, markers, expr, token, prec, stack, right, operator, left, i;

                marker = lookahead;
                left = inheritCoverGrammar(parseUnaryExpression);

                token = lookahead;
                prec = binaryPrecedence(token, state.allowIn);
                if (prec === 0) {
                    return left;
                }
                isAssignmentTarget = isBindingElement = false;
                token.prec = prec;
                lex();

                markers = [marker, lookahead];
                right = isolateCoverGrammar(parseUnaryExpression);

                stack = [left, token, right];

                while ((prec = binaryPrecedence(lookahead, state.allowIn)) > 0) {

                    // Reduce: make a binary expression from the three topmost entries.
                    while ((stack.length > 2) && (prec <= stack[stack.length - 2].prec)) {
                        right = stack.pop();
                        operator = stack.pop().value;
                        left = stack.pop();
                        markers.pop();
                        expr = new WrappingNode(markers[markers.length - 1]).finishBinaryExpression(operator, left, right);
                        stack.push(expr);
                    }

                    // Shift.
                    token = lex();
                    token.prec = prec;
                    stack.push(token);
                    markers.push(lookahead);
                    expr = isolateCoverGrammar(parseUnaryExpression);
                    stack.push(expr);
                }

                // Final reduce to clean-up the stack.
                i = stack.length - 1;
                expr = stack[i];
                markers.pop();
                while (i > 1) {
                    expr = new WrappingNode(markers.pop()).finishBinaryExpression(stack[i - 1].value, stack[i - 2], expr);
                    i -= 2;
                }

                return expr;
            }


            // 11.12 Conditional Operator

            function parseConditionalExpression() {
                var expr, previousAllowIn, consequent, alternate, startToken;

                startToken = lookahead;

                expr = inheritCoverGrammar(parseBinaryExpression);
                if (match('?')) {
                    lex();
                    previousAllowIn = state.allowIn;
                    state.allowIn = true;
                    consequent = isolateCoverGrammar(parseAssignmentExpression);
                    state.allowIn = previousAllowIn;
                    expect(':');
                    alternate = isolateCoverGrammar(parseAssignmentExpression);

                    expr = new WrappingNode(startToken).finishConditionalExpression(expr, consequent, alternate);
                    isAssignmentTarget = isBindingElement = false;
                }

                return expr;
            }

            // [ES6] 14.2 Arrow Function

            function parseConciseBody() {
                if (match('{')) {
                    return parseFunctionSourceElements();
                }
                return isolateCoverGrammar(parseAssignmentExpression);
            }

            function checkPatternParam(options, param) {
                var i;
                switch (param.type) {
                    case Syntax.Identifier:
                        validateParam(options, param, param.name);
                        break;
                    case Syntax.RestElement:
                        checkPatternParam(options, param.argument);
                        break;
                    case Syntax.AssignmentPattern:
                        checkPatternParam(options, param.left);
                        break;
                    case Syntax.ArrayPattern:
                        for (i = 0; i < param.elements.length; i++) {
                            if (param.elements[i] !== null) {
                                checkPatternParam(options, param.elements[i]);
                            }
                        }
                        break;
                    default:
                        assert(param.type === Syntax.ObjectPattern, 'Invalid type');
                        for (i = 0; i < param.properties.length; i++) {
                            checkPatternParam(options, param.properties[i].value);
                        }
                        break;
                }
            }
            function reinterpretAsCoverFormalsList(expr) {
                var i, len, param, params, defaults, defaultCount, options, token;

                defaults = [];
                defaultCount = 0;
                params = [expr];

                switch (expr.type) {
                    case Syntax.Identifier:
                        break;
                    case PlaceHolders.ArrowParameterPlaceHolder:
                        params = expr.params;
                        break;
                    default:
                        return null;
                }

                options = {
                    paramSet: {}
                };

                for (i = 0, len = params.length; i < len; i += 1) {
                    param = params[i];
                    switch (param.type) {
                        case Syntax.AssignmentPattern:
                            params[i] = param.left;
                            defaults.push(param.right);
                            ++defaultCount;
                            checkPatternParam(options, param.left);
                            break;
                        default:
                            checkPatternParam(options, param);
                            params[i] = param;
                            defaults.push(null);
                            break;
                    }
                }

                if (options.message === Messages.StrictParamDupe) {
                    token = strict ? options.stricted : options.firstRestricted;
                    throwUnexpectedToken(token, options.message);
                }

                if (defaultCount === 0) {
                    defaults = [];
                }

                return {
                    params: params,
                    defaults: defaults,
                    stricted: options.stricted,
                    firstRestricted: options.firstRestricted,
                    message: options.message
                };
            }

            function parseArrowFunctionExpression(options, node) {
                var previousStrict, body;

                if (hasLineTerminator) {
                    tolerateUnexpectedToken(lookahead);
                }
                expect('=>');
                previousStrict = strict;

                body = parseConciseBody();

                if (strict && options.firstRestricted) {
                    throwUnexpectedToken(options.firstRestricted, options.message);
                }
                if (strict && options.stricted) {
                    tolerateUnexpectedToken(options.stricted, options.message);
                }

                strict = previousStrict;

                return node.finishArrowFunctionExpression(options.params, options.defaults, body, body.type !== Syntax.BlockStatement);
            }

            // [ES6] 14.4 Yield expression

            function parseYieldExpression() {
                var argument, expr, delegate;

                expr = new Node();

                if (!state.allowYield) {
                    tolerateUnexpectedToken(lookahead, Messages.IllegalYield);
                }

                expectKeyword('yield');

                if (!hasLineTerminator) {
                    delegate = match('*');
                    if (delegate) {
                        lex();
                        argument = parseExpression();
                    } else {
                        if (!match(';') && !match('}') && lookahead.type !== Token.EOF) {
                            argument = parseExpression();
                        }
                    }
                }

                return expr.finishYieldExpression(argument, delegate);
            }

            // 11.13 Assignment Operators

            function parseAssignmentExpression() {
                var token, expr, right, list, startToken;

                startToken = lookahead;
                token = lookahead;

                if (matchKeyword('yield')) {
                    return parseYieldExpression();
                }

                expr = parseConditionalExpression();

                if (expr.type === PlaceHolders.ArrowParameterPlaceHolder || match('=>')) {
                    isAssignmentTarget = isBindingElement = false;
                    list = reinterpretAsCoverFormalsList(expr);

                    if (list) {
                        firstCoverInitializedNameError = null;
                        return parseArrowFunctionExpression(list, new WrappingNode(startToken));
                    }

                    return expr;
                }

                if (matchAssign()) {
                    if (!isAssignmentTarget) {
                        tolerateError(Messages.InvalidLHSInAssignment);
                    }

                    // 11.13.1
                    if (strict && expr.type === Syntax.Identifier && isRestrictedWord(expr.name)) {
                        tolerateUnexpectedToken(token, Messages.StrictLHSAssignment);
                    }

                    if (!match('=')) {
                        isAssignmentTarget = isBindingElement = false;
                    } else {
                        reinterpretExpressionAsPattern(expr);
                    }

                    token = lex();
                    right = isolateCoverGrammar(parseAssignmentExpression);
                    expr = new WrappingNode(startToken).finishAssignmentExpression(token.value, expr, right);
                    firstCoverInitializedNameError = null;
                }

                return expr;
            }

            // 11.14 Comma Operator

            function parseExpression() {
                var expr, startToken = lookahead, expressions;

                expr = isolateCoverGrammar(parseAssignmentExpression);

                if (match(',')) {
                    expressions = [expr];

                    while (startIndex < length) {
                        if (!match(',')) {
                            break;
                        }
                        lex();
                        expressions.push(isolateCoverGrammar(parseAssignmentExpression));
                    }

                    expr = new WrappingNode(startToken).finishSequenceExpression(expressions);
                }

                return expr;
            }

            // 12.1 Block

            function parseStatementListItem() {
                if (lookahead.type === Token.Keyword) {
                    switch (lookahead.value) {
                        case 'export':
                            if (sourceType !== 'module') {
                                tolerateUnexpectedToken(lookahead, Messages.IllegalExportDeclaration);
                            }
                            return parseExportDeclaration();
                        case 'import':
                            if (sourceType !== 'module') {
                                tolerateUnexpectedToken(lookahead, Messages.IllegalImportDeclaration);
                            }
                            return parseImportDeclaration();
                        case 'const':
                        case 'let':
                            return parseLexicalDeclaration({inFor: false});
                        case 'function':
                            return parseFunctionDeclaration(new Node());
                        case 'class':
                            return parseClassDeclaration();
                    }
                }

                return parseStatement();
            }

            function parseStatementList() {
                var list = [];
                while (startIndex < length) {
                    if (match('}')) {
                        break;
                    }
                    list.push(parseStatementListItem());
                }

                return list;
            }

            function parseBlock() {
                var block, node = new Node();

                expect('{');

                block = parseStatementList();

                expect('}');

                return node.finishBlockStatement(block);
            }

            // 12.2 Variable Statement

            function parseVariableIdentifier() {
                var token, node = new Node();

                token = lex();

                if (token.type !== Token.Identifier) {
                    if (strict && token.type === Token.Keyword && isStrictModeReservedWord(token.value)) {
                        tolerateUnexpectedToken(token, Messages.StrictReservedWord);
                    } else {
                        throwUnexpectedToken(token);
                    }
                }

                return node.finishIdentifier(token.value);
            }

            function parseVariableDeclaration() {
                var init = null, id, node = new Node(), params = [];

                id = parsePattern(params);

                // 12.2.1
                if (strict && isRestrictedWord(id.name)) {
                    tolerateError(Messages.StrictVarName);
                }

                if (match('=')) {
                    lex();
                    init = isolateCoverGrammar(parseAssignmentExpression);
                } else if (id.type !== Syntax.Identifier) {
                    expect('=');
                }

                return node.finishVariableDeclarator(id, init);
            }

            function parseVariableDeclarationList() {
                var list = [];

                do {
                    list.push(parseVariableDeclaration());
                    if (!match(',')) {
                        break;
                    }
                    lex();
                } while (startIndex < length);

                return list;
            }

            function parseVariableStatement(node) {
                var declarations;

                expectKeyword('var');

                declarations = parseVariableDeclarationList();

                consumeSemicolon();

                return node.finishVariableDeclaration(declarations);
            }

            function parseLexicalBinding(kind, options) {
                var init = null, id, node = new Node(), params = [];

                id = parsePattern(params);

                // 12.2.1
                if (strict && id.type === Syntax.Identifier && isRestrictedWord(id.name)) {
                    tolerateError(Messages.StrictVarName);
                }

                if (kind === 'const') {
                    if (!matchKeyword('in') && !matchContextualKeyword('of')) {
                        expect('=');
                        init = isolateCoverGrammar(parseAssignmentExpression);
                    }
                } else if ((!options.inFor && id.type !== Syntax.Identifier) || match('=')) {
                    expect('=');
                    init = isolateCoverGrammar(parseAssignmentExpression);
                }

                return node.finishVariableDeclarator(id, init);
            }

            function parseBindingList(kind, options) {
                var list = [];

                do {
                    list.push(parseLexicalBinding(kind, options));
                    if (!match(',')) {
                        break;
                    }
                    lex();
                } while (startIndex < length);

                return list;
            }

            function parseLexicalDeclaration(options) {
                var kind, declarations, node = new Node();

                kind = lex().value;
                assert(kind === 'let' || kind === 'const', 'Lexical declaration must be either let or const');

                declarations = parseBindingList(kind, options);

                consumeSemicolon();

                return node.finishLexicalDeclaration(declarations, kind);
            }

            function parseRestElement(params) {
                var param, node = new Node();

                lex();

                if (match('{')) {
                    throwError(Messages.ObjectPatternAsRestParameter);
                }

                params.push(lookahead);

                param = parseVariableIdentifier();

                if (match('=')) {
                    throwError(Messages.DefaultRestParameter);
                }

                if (!match(')')) {
                    throwError(Messages.ParameterAfterRestParameter);
                }

                return node.finishRestElement(param);
            }

            // 12.3 Empty Statement

            function parseEmptyStatement(node) {
                expect(';');
                return node.finishEmptyStatement();
            }

            // 12.4 Expression Statement

            function parseExpressionStatement(node) {
                var expr = parseExpression();
                consumeSemicolon();
                return node.finishExpressionStatement(expr);
            }

            // 12.5 If statement

            function parseIfStatement(node) {
                var test, consequent, alternate;

                expectKeyword('if');

                expect('(');

                test = parseExpression();

                expect(')');

                consequent = parseStatement();

                if (matchKeyword('else')) {
                    lex();
                    alternate = parseStatement();
                } else {
                    alternate = null;
                }

                return node.finishIfStatement(test, consequent, alternate);
            }

            // 12.6 Iteration Statements

            function parseDoWhileStatement(node) {
                var body, test, oldInIteration;

                expectKeyword('do');

                oldInIteration = state.inIteration;
                state.inIteration = true;

                body = parseStatement();

                state.inIteration = oldInIteration;

                expectKeyword('while');

                expect('(');

                test = parseExpression();

                expect(')');

                if (match(';')) {
                    lex();
                }

                return node.finishDoWhileStatement(body, test);
            }

            function parseWhileStatement(node) {
                var test, body, oldInIteration;

                expectKeyword('while');

                expect('(');

                test = parseExpression();

                expect(')');

                oldInIteration = state.inIteration;
                state.inIteration = true;

                body = parseStatement();

                state.inIteration = oldInIteration;

                return node.finishWhileStatement(test, body);
            }

            function parseForStatement(node) {
                var init, forIn, initSeq, initStartToken, test, update, left, right, kind, declarations,
                    body, oldInIteration, previousAllowIn = state.allowIn;

                init = test = update = null;
                forIn = true;

                expectKeyword('for');

                expect('(');

                if (match(';')) {
                    lex();
                } else {
                    if (matchKeyword('var')) {
                        init = new Node();
                        lex();

                        state.allowIn = false;
                        init = init.finishVariableDeclaration(parseVariableDeclarationList());
                        state.allowIn = previousAllowIn;

                        if (init.declarations.length === 1 && matchKeyword('in')) {
                            lex();
                            left = init;
                            right = parseExpression();
                            init = null;
                        } else if (init.declarations.length === 1 && init.declarations[0].init === null && matchContextualKeyword('of')) {
                            lex();
                            left = init;
                            right = parseAssignmentExpression();
                            init = null;
                            forIn = false;
                        } else {
                            expect(';');
                        }
                    } else if (matchKeyword('const') || matchKeyword('let')) {
                        init = new Node();
                        kind = lex().value;

                        state.allowIn = false;
                        declarations = parseBindingList(kind, {inFor: true});
                        state.allowIn = previousAllowIn;

                        if (declarations.length === 1 && declarations[0].init === null && matchKeyword('in')) {
                            init = init.finishLexicalDeclaration(declarations, kind);
                            lex();
                            left = init;
                            right = parseExpression();
                            init = null;
                        } else if (declarations.length === 1 && declarations[0].init === null && matchContextualKeyword('of')) {
                            init = init.finishLexicalDeclaration(declarations, kind);
                            lex();
                            left = init;
                            right = parseAssignmentExpression();
                            init = null;
                            forIn = false;
                        } else {
                            consumeSemicolon();
                            init = init.finishLexicalDeclaration(declarations, kind);
                        }
                    } else {
                        initStartToken = lookahead;
                        state.allowIn = false;
                        init = inheritCoverGrammar(parseAssignmentExpression);
                        state.allowIn = previousAllowIn;

                        if (matchKeyword('in')) {
                            if (!isAssignmentTarget) {
                                tolerateError(Messages.InvalidLHSInForIn);
                            }

                            lex();
                            reinterpretExpressionAsPattern(init);
                            left = init;
                            right = parseExpression();
                            init = null;
                        } else if (matchContextualKeyword('of')) {
                            if (!isAssignmentTarget) {
                                tolerateError(Messages.InvalidLHSInForLoop);
                            }

                            lex();
                            reinterpretExpressionAsPattern(init);
                            left = init;
                            right = parseAssignmentExpression();
                            init = null;
                            forIn = false;
                        } else {
                            if (match(',')) {
                                initSeq = [init];
                                while (match(',')) {
                                    lex();
                                    initSeq.push(isolateCoverGrammar(parseAssignmentExpression));
                                }
                                init = new WrappingNode(initStartToken).finishSequenceExpression(initSeq);
                            }
                            expect(';');
                        }
                    }
                }

                if (typeof left === 'undefined') {

                    if (!match(';')) {
                        test = parseExpression();
                    }
                    expect(';');

                    if (!match(')')) {
                        update = parseExpression();
                    }
                }

                expect(')');

                oldInIteration = state.inIteration;
                state.inIteration = true;

                body = isolateCoverGrammar(parseStatement);

                state.inIteration = oldInIteration;

                return (typeof left === 'undefined') ?
                    node.finishForStatement(init, test, update, body) :
                    forIn ? node.finishForInStatement(left, right, body) :
                        node.finishForOfStatement(left, right, body);
            }

            // 12.7 The continue statement

            function parseContinueStatement(node) {
                var label = null, key;

                expectKeyword('continue');

                // Optimize the most common form: 'continue;'.
                if (source.charCodeAt(startIndex) === 0x3B) {
                    lex();

                    if (!state.inIteration) {
                        throwError(Messages.IllegalContinue);
                    }

                    return node.finishContinueStatement(null);
                }

                if (hasLineTerminator) {
                    if (!state.inIteration) {
                        throwError(Messages.IllegalContinue);
                    }

                    return node.finishContinueStatement(null);
                }

                if (lookahead.type === Token.Identifier) {
                    label = parseVariableIdentifier();

                    key = '$' + label.name;
                    if (!Object.prototype.hasOwnProperty.call(state.labelSet, key)) {
                        throwError(Messages.UnknownLabel, label.name);
                    }
                }

                consumeSemicolon();

                if (label === null && !state.inIteration) {
                    throwError(Messages.IllegalContinue);
                }

                return node.finishContinueStatement(label);
            }

            // 12.8 The break statement

            function parseBreakStatement(node) {
                var label = null, key;

                expectKeyword('break');

                // Catch the very common case first: immediately a semicolon (U+003B).
                if (source.charCodeAt(lastIndex) === 0x3B) {
                    lex();

                    if (!(state.inIteration || state.inSwitch)) {
                        throwError(Messages.IllegalBreak);
                    }

                    return node.finishBreakStatement(null);
                }

                if (hasLineTerminator) {
                    if (!(state.inIteration || state.inSwitch)) {
                        throwError(Messages.IllegalBreak);
                    }

                    return node.finishBreakStatement(null);
                }

                if (lookahead.type === Token.Identifier) {
                    label = parseVariableIdentifier();

                    key = '$' + label.name;
                    if (!Object.prototype.hasOwnProperty.call(state.labelSet, key)) {
                        throwError(Messages.UnknownLabel, label.name);
                    }
                }

                consumeSemicolon();

                if (label === null && !(state.inIteration || state.inSwitch)) {
                    throwError(Messages.IllegalBreak);
                }

                return node.finishBreakStatement(label);
            }

            // 12.9 The return statement

            function parseReturnStatement(node) {
                var argument = null;

                expectKeyword('return');

                if (!state.inFunctionBody) {
                    tolerateError(Messages.IllegalReturn);
                }

                // 'return' followed by a space and an identifier is very common.
                if (source.charCodeAt(lastIndex) === 0x20) {
                    if (isIdentifierStart(source.charCodeAt(lastIndex + 1))) {
                        argument = parseExpression();
                        consumeSemicolon();
                        return node.finishReturnStatement(argument);
                    }
                }

                if (hasLineTerminator) {
                    // HACK
                    return node.finishReturnStatement(null);
                }

                if (!match(';')) {
                    if (!match('}') && lookahead.type !== Token.EOF) {
                        argument = parseExpression();
                    }
                }

                consumeSemicolon();

                return node.finishReturnStatement(argument);
            }

            // 12.10 The with statement

            function parseWithStatement(node) {
                var object, body;

                if (strict) {
                    tolerateError(Messages.StrictModeWith);
                }

                expectKeyword('with');

                expect('(');

                object = parseExpression();

                expect(')');

                body = parseStatement();

                return node.finishWithStatement(object, body);
            }

            // 12.10 The swith statement

            function parseSwitchCase() {
                var test, consequent = [], statement, node = new Node();

                if (matchKeyword('default')) {
                    lex();
                    test = null;
                } else {
                    expectKeyword('case');
                    test = parseExpression();
                }
                expect(':');

                while (startIndex < length) {
                    if (match('}') || matchKeyword('default') || matchKeyword('case')) {
                        break;
                    }
                    statement = parseStatementListItem();
                    consequent.push(statement);
                }

                return node.finishSwitchCase(test, consequent);
            }

            function parseSwitchStatement(node) {
                var discriminant, cases, clause, oldInSwitch, defaultFound;

                expectKeyword('switch');

                expect('(');

                discriminant = parseExpression();

                expect(')');

                expect('{');

                cases = [];

                if (match('}')) {
                    lex();
                    return node.finishSwitchStatement(discriminant, cases);
                }

                oldInSwitch = state.inSwitch;
                state.inSwitch = true;
                defaultFound = false;

                while (startIndex < length) {
                    if (match('}')) {
                        break;
                    }
                    clause = parseSwitchCase();
                    if (clause.test === null) {
                        if (defaultFound) {
                            throwError(Messages.MultipleDefaultsInSwitch);
                        }
                        defaultFound = true;
                    }
                    cases.push(clause);
                }

                state.inSwitch = oldInSwitch;

                expect('}');

                return node.finishSwitchStatement(discriminant, cases);
            }

            // 12.13 The throw statement

            function parseThrowStatement(node) {
                var argument;

                expectKeyword('throw');

                if (hasLineTerminator) {
                    throwError(Messages.NewlineAfterThrow);
                }

                argument = parseExpression();

                consumeSemicolon();

                return node.finishThrowStatement(argument);
            }

            // 12.14 The try statement

            function parseCatchClause() {
                var param, params = [], paramMap = {}, key, i, body, node = new Node();

                expectKeyword('catch');

                expect('(');
                if (match(')')) {
                    throwUnexpectedToken(lookahead);
                }

                param = parsePattern(params);
                for (i = 0; i < params.length; i++) {
                    key = '$' + params[i].value;
                    if (Object.prototype.hasOwnProperty.call(paramMap, key)) {
                        tolerateError(Messages.DuplicateBinding, params[i].value);
                    }
                    paramMap[key] = true;
                }

                // 12.14.1
                if (strict && isRestrictedWord(param.name)) {
                    tolerateError(Messages.StrictCatchVariable);
                }

                expect(')');
                body = parseBlock();
                return node.finishCatchClause(param, body);
            }

            function parseTryStatement(node) {
                var block, handler = null, finalizer = null;

                expectKeyword('try');

                block = parseBlock();

                if (matchKeyword('catch')) {
                    handler = parseCatchClause();
                }

                if (matchKeyword('finally')) {
                    lex();
                    finalizer = parseBlock();
                }

                if (!handler && !finalizer) {
                    throwError(Messages.NoCatchOrFinally);
                }

                return node.finishTryStatement(block, handler, finalizer);
            }

            // 12.15 The debugger statement

            function parseDebuggerStatement(node) {
                expectKeyword('debugger');

                consumeSemicolon();

                return node.finishDebuggerStatement();
            }

            // 12 Statements

            function parseStatement() {
                var type = lookahead.type,
                    expr,
                    labeledBody,
                    key,
                    node;

                if (type === Token.EOF) {
                    throwUnexpectedToken(lookahead);
                }

                if (type === Token.Punctuator && lookahead.value === '{') {
                    return parseBlock();
                }
                isAssignmentTarget = isBindingElement = true;
                node = new Node();

                if (type === Token.Punctuator) {
                    switch (lookahead.value) {
                        case ';':
                            return parseEmptyStatement(node);
                        case '(':
                            return parseExpressionStatement(node);
                        default:
                            break;
                    }
                } else if (type === Token.Keyword) {
                    switch (lookahead.value) {
                        case 'break':
                            return parseBreakStatement(node);
                        case 'continue':
                            return parseContinueStatement(node);
                        case 'debugger':
                            return parseDebuggerStatement(node);
                        case 'do':
                            return parseDoWhileStatement(node);
                        case 'for':
                            return parseForStatement(node);
                        case 'function':
                            return parseFunctionDeclaration(node);
                        case 'if':
                            return parseIfStatement(node);
                        case 'return':
                            return parseReturnStatement(node);
                        case 'switch':
                            return parseSwitchStatement(node);
                        case 'throw':
                            return parseThrowStatement(node);
                        case 'try':
                            return parseTryStatement(node);
                        case 'var':
                            return parseVariableStatement(node);
                        case 'while':
                            return parseWhileStatement(node);
                        case 'with':
                            return parseWithStatement(node);
                        default:
                            break;
                    }
                }

                expr = parseExpression();

                // 12.12 Labelled Statements
                if ((expr.type === Syntax.Identifier) && match(':')) {
                    lex();

                    key = '$' + expr.name;
                    if (Object.prototype.hasOwnProperty.call(state.labelSet, key)) {
                        throwError(Messages.Redeclaration, 'Label', expr.name);
                    }

                    state.labelSet[key] = true;
                    labeledBody = parseStatement();
                    delete state.labelSet[key];
                    return node.finishLabeledStatement(expr, labeledBody);
                }

                consumeSemicolon();

                return node.finishExpressionStatement(expr);
            }

            // 13 Function Definition

            function parseFunctionSourceElements() {
                var statement, body = [], token, directive, firstRestricted,
                    oldLabelSet, oldInIteration, oldInSwitch, oldInFunctionBody, oldParenthesisCount,
                    node = new Node();

                expect('{');

                while (startIndex < length) {
                    if (lookahead.type !== Token.StringLiteral) {
                        break;
                    }
                    token = lookahead;

                    statement = parseStatementListItem();
                    body.push(statement);
                    if (statement.expression.type !== Syntax.Literal) {
                        // this is not directive
                        break;
                    }
                    directive = source.slice(token.start + 1, token.end - 1);
                    if (directive === 'use strict') {
                        strict = true;
                        if (firstRestricted) {
                            tolerateUnexpectedToken(firstRestricted, Messages.StrictOctalLiteral);
                        }
                    } else {
                        if (!firstRestricted && token.octal) {
                            firstRestricted = token;
                        }
                    }
                }

                oldLabelSet = state.labelSet;
                oldInIteration = state.inIteration;
                oldInSwitch = state.inSwitch;
                oldInFunctionBody = state.inFunctionBody;
                oldParenthesisCount = state.parenthesizedCount;

                state.labelSet = {};
                state.inIteration = false;
                state.inSwitch = false;
                state.inFunctionBody = true;
                state.parenthesizedCount = 0;

                while (startIndex < length) {
                    if (match('}')) {
                        break;
                    }
                    body.push(parseStatementListItem());
                }

                expect('}');

                state.labelSet = oldLabelSet;
                state.inIteration = oldInIteration;
                state.inSwitch = oldInSwitch;
                state.inFunctionBody = oldInFunctionBody;
                state.parenthesizedCount = oldParenthesisCount;

                return node.finishBlockStatement(body);
            }

            function validateParam(options, param, name) {
                var key = '$' + name;
                if (strict) {
                    if (isRestrictedWord(name)) {
                        options.stricted = param;
                        options.message = Messages.StrictParamName;
                    }
                    if (Object.prototype.hasOwnProperty.call(options.paramSet, key)) {
                        options.stricted = param;
                        options.message = Messages.StrictParamDupe;
                    }
                } else if (!options.firstRestricted) {
                    if (isRestrictedWord(name)) {
                        options.firstRestricted = param;
                        options.message = Messages.StrictParamName;
                    } else if (isStrictModeReservedWord(name)) {
                        options.firstRestricted = param;
                        options.message = Messages.StrictReservedWord;
                    } else if (Object.prototype.hasOwnProperty.call(options.paramSet, key)) {
                        options.stricted = param;
                        options.message = Messages.StrictParamDupe;
                    }
                }
                options.paramSet[key] = true;
            }

            function parseParam(options) {
                var token, param, params = [], i, def;

                token = lookahead;
                if (token.value === '...') {
                    param = parseRestElement(params);
                    validateParam(options, param.argument, param.argument.name);
                    options.params.push(param);
                    options.defaults.push(null);
                    return false;
                }

                param = parsePatternWithDefault(params);
                for (i = 0; i < params.length; i++) {
                    validateParam(options, params[i], params[i].value);
                }

                if (param.type === Syntax.AssignmentPattern) {
                    def = param.right;
                    param = param.left;
                    ++options.defaultCount;
                }

                options.params.push(param);
                options.defaults.push(def);

                return !match(')');
            }

            function parseParams(firstRestricted) {
                var options;

                options = {
                    params: [],
                    defaultCount: 0,
                    defaults: [],
                    firstRestricted: firstRestricted
                };

                expect('(');

                if (!match(')')) {
                    options.paramSet = {};
                    while (startIndex < length) {
                        if (!parseParam(options)) {
                            break;
                        }
                        expect(',');
                    }
                }

                expect(')');

                if (options.defaultCount === 0) {
                    options.defaults = [];
                }

                return {
                    params: options.params,
                    defaults: options.defaults,
                    stricted: options.stricted,
                    firstRestricted: options.firstRestricted,
                    message: options.message
                };
            }

            function parseFunctionDeclaration(node, identifierIsOptional) {
                var id = null, params = [], defaults = [], body, token, stricted, tmp, firstRestricted, message, previousStrict,
                    isGenerator, previousAllowYield;

                expectKeyword('function');

                isGenerator = match('*');
                if (isGenerator) {
                    lex();
                }

                if (!identifierIsOptional || !match('(')) {
                    token = lookahead;
                    id = parseVariableIdentifier();
                    if (strict) {
                        if (isRestrictedWord(token.value)) {
                            tolerateUnexpectedToken(token, Messages.StrictFunctionName);
                        }
                    } else {
                        if (isRestrictedWord(token.value)) {
                            firstRestricted = token;
                            message = Messages.StrictFunctionName;
                        } else if (isStrictModeReservedWord(token.value)) {
                            firstRestricted = token;
                            message = Messages.StrictReservedWord;
                        }
                    }
                }

                previousAllowYield = state.allowYield;
                state.allowYield = false;
                tmp = parseParams(firstRestricted);
                state.allowYield = previousAllowYield;

                params = tmp.params;
                defaults = tmp.defaults;
                stricted = tmp.stricted;
                firstRestricted = tmp.firstRestricted;
                if (tmp.message) {
                    message = tmp.message;
                }

                previousAllowYield = state.allowYield;
                previousStrict = strict;
                state.allowYield = isGenerator;
                body = parseFunctionSourceElements();
                if (strict && firstRestricted) {
                    throwUnexpectedToken(firstRestricted, message);
                }
                if (strict && stricted) {
                    tolerateUnexpectedToken(stricted, message);
                }
                strict = previousStrict;
                state.allowYield = previousAllowYield;

                return node.finishFunctionDeclaration(id, params, defaults, body, isGenerator);
            }

            function parseFunctionExpression() {
                var token, id = null, stricted, firstRestricted, message, tmp,
                    params = [], defaults = [], body, previousStrict, node = new Node(),
                    isGenerator, previousAllowYield;

                expectKeyword('function');

                isGenerator = match('*');
                if (isGenerator) {
                    lex();
                }

                if (!match('(')) {
                    token = lookahead;
                    id = parseVariableIdentifier();
                    if (strict) {
                        if (isRestrictedWord(token.value)) {
                            tolerateUnexpectedToken(token, Messages.StrictFunctionName);
                        }
                    } else {
                        if (isRestrictedWord(token.value)) {
                            firstRestricted = token;
                            message = Messages.StrictFunctionName;
                        } else if (isStrictModeReservedWord(token.value)) {
                            firstRestricted = token;
                            message = Messages.StrictReservedWord;
                        }
                    }
                }

                previousAllowYield = state.allowYield;
                state.allowYield = false;
                tmp = parseParams(firstRestricted);
                state.allowYield = previousAllowYield;

                params = tmp.params;
                defaults = tmp.defaults;
                stricted = tmp.stricted;
                firstRestricted = tmp.firstRestricted;
                if (tmp.message) {
                    message = tmp.message;
                }

                previousStrict = strict;
                previousAllowYield = state.allowYield;
                state.allowYield = isGenerator;
                body = parseFunctionSourceElements();

                if (strict && firstRestricted) {
                    throwUnexpectedToken(firstRestricted, message);
                }
                if (strict && stricted) {
                    tolerateUnexpectedToken(stricted, message);
                }
                strict = previousStrict;
                state.allowYield = previousAllowYield;

                return node.finishFunctionExpression(id, params, defaults, body, isGenerator);
            }


            function parseClassBody() {
                var classBody, token, isStatic, hasConstructor = false, body, method, computed, key;

                classBody = new Node();

                expect('{');
                body = [];
                while (!match('}')) {
                    if (match(';')) {
                        lex();
                    } else {
                        method = new Node();
                        token = lookahead;
                        isStatic = false;
                        computed = match('[');
                        if (match('*')) {
                            lex();
                        } else {
                            key = parseObjectPropertyKey();
                            if (key.name === 'static' && (lookaheadPropertyName() || match('*'))) {
                                token = lookahead;
                                isStatic = true;
                                computed = match('[');
                                if (match('*')) {
                                    lex();
                                } else {
                                    key = parseObjectPropertyKey();
                                }
                            }
                        }
                        method = tryParseMethodDefinition(token, key, computed, method);
                        if (method) {
                            method['static'] = isStatic;
                            if (method.kind === 'init') {
                                method.kind = 'method';
                            }
                            if (!isStatic) {
                                if (!method.computed && (method.key.name || method.key.value.toString()) === 'constructor') {
                                    if (method.kind !== 'method' || !method.method || method.value.generator) {
                                        throwUnexpectedToken(token, Messages.ConstructorSpecialMethod);
                                    }
                                    if (hasConstructor) {
                                        throwUnexpectedToken(token, Messages.DuplicateConstructor);
                                    } else {
                                        hasConstructor = true;
                                    }
                                    method.kind = 'constructor';
                                }
                            } else {
                                if (!method.computed && (method.key.name || method.key.value.toString()) === 'prototype') {
                                    throwUnexpectedToken(token, Messages.StaticPrototype);
                                }
                            }
                            method.type = Syntax.MethodDefinition;
                            delete method.method;
                            delete method.shorthand;
                            body.push(method);
                        } else {
                            throwUnexpectedToken(lookahead);
                        }
                    }
                }
                lex();
                return classBody.finishClassBody(body);
            }

            function parseClassDeclaration(identifierIsOptional) {
                var id = null, superClass = null, classNode = new Node(), classBody, previousStrict = strict;
                strict = true;

                expectKeyword('class');

                if (!identifierIsOptional || lookahead.type === Token.Identifier) {
                    id = parseVariableIdentifier();
                }

                if (matchKeyword('extends')) {
                    lex();
                    superClass = isolateCoverGrammar(parseLeftHandSideExpressionAllowCall);
                }
                classBody = parseClassBody();
                strict = previousStrict;

                return classNode.finishClassDeclaration(id, superClass, classBody);
            }

            function parseClassExpression() {
                var id = null, superClass = null, classNode = new Node(), classBody, previousStrict = strict;
                strict = true;

                expectKeyword('class');

                if (lookahead.type === Token.Identifier) {
                    id = parseVariableIdentifier();
                }

                if (matchKeyword('extends')) {
                    lex();
                    superClass = isolateCoverGrammar(parseLeftHandSideExpressionAllowCall);
                }
                classBody = parseClassBody();
                strict = previousStrict;

                return classNode.finishClassExpression(id, superClass, classBody);
            }

            // Modules grammar from:
            // people.mozilla.org/~jorendorff/es6-draft.html

            function parseModuleSpecifier() {
                var node = new Node();

                if (lookahead.type !== Token.StringLiteral) {
                    throwError(Messages.InvalidModuleSpecifier);
                }
                return node.finishLiteral(lex());
            }

            function parseExportSpecifier() {
                var exported, local, node = new Node(), def;
                if (matchKeyword('default')) {
                    // export {default} from 'something';
                    def = new Node();
                    lex();
                    local = def.finishIdentifier('default');
                } else {
                    local = parseVariableIdentifier();
                }
                if (matchContextualKeyword('as')) {
                    lex();
                    exported = parseNonComputedProperty();
                }
                return node.finishExportSpecifier(local, exported);
            }

            function parseExportNamedDeclaration(node) {
                var declaration = null,
                    isExportFromIdentifier,
                    src = null, specifiers = [];

                // non-default export
                if (lookahead.type === Token.Keyword) {
                    // covers:
                    // export var f = 1;
                    switch (lookahead.value) {
                        case 'let':
                        case 'const':
                        case 'var':
                        case 'class':
                        case 'function':
                            declaration = parseStatementListItem();
                            return node.finishExportNamedDeclaration(declaration, specifiers, null);
                    }
                }

                expect('{');
                if (!match('}')) {
                    do {
                        isExportFromIdentifier = isExportFromIdentifier || matchKeyword('default');
                        specifiers.push(parseExportSpecifier());
                    } while (match(',') && lex());
                }
                expect('}');

                if (matchContextualKeyword('from')) {
                    // covering:
                    // export {default} from 'foo';
                    // export {foo} from 'foo';
                    lex();
                    src = parseModuleSpecifier();
                    consumeSemicolon();
                } else if (isExportFromIdentifier) {
                    // covering:
                    // export {default}; // missing fromClause
                    throwError(lookahead.value ?
                        Messages.UnexpectedToken : Messages.MissingFromClause, lookahead.value);
                } else {
                    // cover
                    // export {foo};
                    consumeSemicolon();
                }
                return node.finishExportNamedDeclaration(declaration, specifiers, src);
            }

            function parseExportDefaultDeclaration(node) {
                var declaration = null,
                    expression = null;

                // covers:
                // export default ...
                expectKeyword('default');

                if (matchKeyword('function')) {
                    // covers:
                    // export default function foo () {}
                    // export default function () {}
                    declaration = parseFunctionDeclaration(new Node(), true);
                    return node.finishExportDefaultDeclaration(declaration);
                }
                if (matchKeyword('class')) {
                    declaration = parseClassDeclaration(true);
                    return node.finishExportDefaultDeclaration(declaration);
                }

                if (matchContextualKeyword('from')) {
                    throwError(Messages.UnexpectedToken, lookahead.value);
                }

                // covers:
                // export default {};
                // export default [];
                // export default (1 + 2);
                if (match('{')) {
                    expression = parseObjectInitialiser();
                } else if (match('[')) {
                    expression = parseArrayInitialiser();
                } else {
                    expression = parseAssignmentExpression();
                }
                consumeSemicolon();
                return node.finishExportDefaultDeclaration(expression);
            }

            function parseExportAllDeclaration(node) {
                var src;

                // covers:
                // export * from 'foo';
                expect('*');
                if (!matchContextualKeyword('from')) {
                    throwError(lookahead.value ?
                        Messages.UnexpectedToken : Messages.MissingFromClause, lookahead.value);
                }
                lex();
                src = parseModuleSpecifier();
                consumeSemicolon();

                return node.finishExportAllDeclaration(src);
            }

            function parseExportDeclaration() {
                var node = new Node();
                if (state.inFunctionBody) {
                    throwError(Messages.IllegalExportDeclaration);
                }

                expectKeyword('export');

                if (matchKeyword('default')) {
                    return parseExportDefaultDeclaration(node);
                }
                if (match('*')) {
                    return parseExportAllDeclaration(node);
                }
                return parseExportNamedDeclaration(node);
            }

            function parseImportSpecifier() {
                // import {<foo as bar>} ...;
                var local, imported, node = new Node();

                imported = parseNonComputedProperty();
                if (matchContextualKeyword('as')) {
                    lex();
                    local = parseVariableIdentifier();
                }

                return node.finishImportSpecifier(local, imported);
            }

            function parseNamedImports() {
                var specifiers = [];
                // {foo, bar as bas}
                expect('{');
                if (!match('}')) {
                    do {
                        specifiers.push(parseImportSpecifier());
                    } while (match(',') && lex());
                }
                expect('}');
                return specifiers;
            }

            function parseImportDefaultSpecifier() {
                // import <foo> ...;
                var local, node = new Node();

                local = parseNonComputedProperty();

                return node.finishImportDefaultSpecifier(local);
            }

            function parseImportNamespaceSpecifier() {
                // import <* as foo> ...;
                var local, node = new Node();

                expect('*');
                if (!matchContextualKeyword('as')) {
                    throwError(Messages.NoAsAfterImportNamespace);
                }
                lex();
                local = parseNonComputedProperty();

                return node.finishImportNamespaceSpecifier(local);
            }

            function parseImportDeclaration() {
                var specifiers, src, node = new Node();

                if (state.inFunctionBody) {
                    throwError(Messages.IllegalImportDeclaration);
                }

                expectKeyword('import');
                specifiers = [];

                if (lookahead.type === Token.StringLiteral) {
                    // covers:
                    // import 'foo';
                    src = parseModuleSpecifier();
                    consumeSemicolon();
                    return node.finishImportDeclaration(specifiers, src);
                }

                if (!matchKeyword('default') && isIdentifierName(lookahead)) {
                    // covers:
                    // import foo
                    // import foo, ...
                    specifiers.push(parseImportDefaultSpecifier());
                    if (match(',')) {
                        lex();
                    }
                }
                if (match('*')) {
                    // covers:
                    // import foo, * as foo
                    // import * as foo
                    specifiers.push(parseImportNamespaceSpecifier());
                } else if (match('{')) {
                    // covers:
                    // import foo, {bar}
                    // import {bar}
                    specifiers = specifiers.concat(parseNamedImports());
                }

                if (!matchContextualKeyword('from')) {
                    throwError(lookahead.value ?
                        Messages.UnexpectedToken : Messages.MissingFromClause, lookahead.value);
                }
                lex();
                src = parseModuleSpecifier();
                consumeSemicolon();

                return node.finishImportDeclaration(specifiers, src);
            }

            // 14 Program

            function parseScriptBody() {
                var statement, body = [], token, directive, firstRestricted;

                while (startIndex < length) {
                    token = lookahead;
                    if (token.type !== Token.StringLiteral) {
                        break;
                    }

                    statement = parseStatementListItem();
                    body.push(statement);
                    if (statement.expression.type !== Syntax.Literal) {
                        // this is not directive
                        break;
                    }
                    directive = source.slice(token.start + 1, token.end - 1);
                    if (directive === 'use strict') {
                        strict = true;
                        if (firstRestricted) {
                            tolerateUnexpectedToken(firstRestricted, Messages.StrictOctalLiteral);
                        }
                    } else {
                        if (!firstRestricted && token.octal) {
                            firstRestricted = token;
                        }
                    }
                }

                while (startIndex < length) {
                    statement = parseStatementListItem();
                    /* istanbul ignore if */
                    if (typeof statement === 'undefined') {
                        break;
                    }
                    body.push(statement);
                }
                return body;
            }

            function parseProgram() {
                var body, node;

                peek();
                node = new Node();

                body = parseScriptBody();
                return node.finishProgram(body);
            }

            function filterTokenLocation() {
                var i, entry, token, tokens = [];

                for (i = 0; i < extra.tokens.length; ++i) {
                    entry = extra.tokens[i];
                    token = {
                        type: entry.type,
                        value: entry.value
                    };
                    if (entry.regex) {
                        token.regex = {
                            pattern: entry.regex.pattern,
                            flags: entry.regex.flags
                        };
                    }
                    if (extra.range) {
                        token.range = entry.range;
                    }
                    if (extra.loc) {
                        token.loc = entry.loc;
                    }
                    tokens.push(token);
                }

                extra.tokens = tokens;
            }

            function tokenize(code, options) {
                var toString,
                    tokens;

                toString = String;
                if (typeof code !== 'string' && !(code instanceof String)) {
                    code = toString(code);
                }

                source = code;
                index = 0;
                lineNumber = (source.length > 0) ? 1 : 0;
                lineStart = 0;
                startIndex = index;
                startLineNumber = lineNumber;
                startLineStart = lineStart;
                length = source.length;
                lookahead = null;
                state = {
                    allowIn: true,
                    allowYield: false,
                    labelSet: {},
                    inFunctionBody: false,
                    inIteration: false,
                    inSwitch: false,
                    lastCommentStart: -1,
                    curlyStack: []
                };

                extra = {};

                // Options matching.
                options = options || {};

                // Of course we collect tokens here.
                options.tokens = true;
                extra.tokens = [];
                extra.tokenize = true;
                // The following two fields are necessary to compute the Regex tokens.
                extra.openParenToken = -1;
                extra.openCurlyToken = -1;

                extra.range = (typeof options.range === 'boolean') && options.range;
                extra.loc = (typeof options.loc === 'boolean') && options.loc;

                if (typeof options.comment === 'boolean' && options.comment) {
                    extra.comments = [];
                }
                if (typeof options.tolerant === 'boolean' && options.tolerant) {
                    extra.errors = [];
                }

                try {
                    peek();
                    if (lookahead.type === Token.EOF) {
                        return extra.tokens;
                    }

                    lex();
                    while (lookahead.type !== Token.EOF) {
                        try {
                            lex();
                        } catch (lexError) {
                            if (extra.errors) {
                                recordError(lexError);
                                // We have to break on the first error
                                // to avoid infinite loops.
                                break;
                            } else {
                                throw lexError;
                            }
                        }
                    }

                    filterTokenLocation();
                    tokens = extra.tokens;
                    if (typeof extra.comments !== 'undefined') {
                        tokens.comments = extra.comments;
                    }
                    if (typeof extra.errors !== 'undefined') {
                        tokens.errors = extra.errors;
                    }
                } catch (e) {
                    throw e;
                } finally {
                    extra = {};
                }
                return tokens;
            }

            function parse(code, options) {
                var program, toString;

                toString = String;
                if (typeof code !== 'string' && !(code instanceof String)) {
                    code = toString(code);
                }

                source = code;
                index = 0;
                lineNumber = (source.length > 0) ? 1 : 0;
                lineStart = 0;
                startIndex = index;
                startLineNumber = lineNumber;
                startLineStart = lineStart;
                length = source.length;
                lookahead = null;
                state = {
                    allowIn: true,
                    allowYield: false,
                    labelSet: {},
                    inFunctionBody: false,
                    inIteration: false,
                    inSwitch: false,
                    lastCommentStart: -1,
                    curlyStack: []
                };
                sourceType = 'script';
                strict = false;

                extra = {};
                if (typeof options !== 'undefined') {
                    extra.range = (typeof options.range === 'boolean') && options.range;
                    extra.loc = (typeof options.loc === 'boolean') && options.loc;
                    extra.attachComment = (typeof options.attachComment === 'boolean') && options.attachComment;

                    if (extra.loc && options.source !== null && options.source !== undefined) {
                        extra.source = toString(options.source);
                    }

                    if (typeof options.tokens === 'boolean' && options.tokens) {
                        extra.tokens = [];
                    }
                    if (typeof options.comment === 'boolean' && options.comment) {
                        extra.comments = [];
                    }
                    if (typeof options.tolerant === 'boolean' && options.tolerant) {
                        extra.errors = [];
                    }
                    if (extra.attachComment) {
                        extra.range = true;
                        extra.comments = [];
                        extra.bottomRightStack = [];
                        extra.trailingComments = [];
                        extra.leadingComments = [];
                    }
                    if (options.sourceType === 'module') {
                        // very restrictive condition for now
                        sourceType = options.sourceType;
                        strict = true;
                    }
                }

                try {
                    program = parseProgram();
                    if (typeof extra.comments !== 'undefined') {
                        program.comments = extra.comments;
                    }
                    if (typeof extra.tokens !== 'undefined') {
                        filterTokenLocation();
                        program.tokens = extra.tokens;
                    }
                    if (typeof extra.errors !== 'undefined') {
                        program.errors = extra.errors;
                    }
                } catch (e) {
                    throw e;
                } finally {
                    extra = {};
                }

                return program;
            }

            // Sync with *.json manifests.
            exports.version = '2.4.1';

            exports.tokenize = tokenize;

            exports.parse = parse;

            // Deep copy.
            /* istanbul ignore next */
            exports.Syntax = (function () {
                var name, types = {};

                if (typeof Object.create === 'function') {
                    types = Object.create(null);
                }

                for (name in Syntax) {
                    if (Syntax.hasOwnProperty(name)) {
                        types[name] = Syntax[name];
                    }
                }

                if (typeof Object.freeze === 'function') {
                    Object.freeze(types);
                }

                return types;
            }());

        }));
        /* vim: set sw=4 ts=4 et tw=80 : */
        /**
         * @license Copyright (c) 2012-2014, The Dojo Foundation All Rights Reserved.
         * Available via the MIT or new BSD license.
         * see: http://github.com/jrburke/requirejs for details
         */

        /*global define, Reflect */

        /*
         * xpcshell has a smaller stack on linux and windows (1MB vs 9MB on mac),
         * and the recursive nature of esprima can cause it to overflow pretty
         * quickly. So favor it built in Reflect parser:
         * https://developer.mozilla.org/en-US/docs/SpiderMonkey/Parser_API
         */
        define('esprimaAdapter', ['./esprima', 'env'], function (esprima, env) {
            if (env.get() === 'xpconnect' && typeof Reflect !== 'undefined') {
                return Reflect;
            } else {
                return esprima;
            }
        });
        define('uglifyjs/consolidator', ["require", "exports", "module", "./parse-js", "./process"], function(require, exports, module) {
            /**
             * @preserve Copyright 2012 Robert Gust-Bardon <http://robert.gust-bardon.org/>.
             * All rights reserved.
             *
             * Redistribution and use in source and binary forms, with or without
             * modification, are permitted provided that the following conditions
             * are met:
             *
             *     * Redistributions of source code must retain the above
             *       copyright notice, this list of conditions and the following
             *       disclaimer.
             *
             *     * Redistributions in binary form must reproduce the above
             *       copyright notice, this list of conditions and the following
             *       disclaimer in the documentation and/or other materials
             *       provided with the distribution.
             *
             * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDER "AS IS" AND ANY
             * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
             * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
             * PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE
             * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY,
             * OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
             * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
             * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
             * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
             * TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF
             * THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
             * SUCH DAMAGE.
             */

            /**
             * @fileoverview Enhances <a href="https://github.com/mishoo/UglifyJS/"
             * >UglifyJS</a> with consolidation of null, Boolean, and String values.
             * <p>Also known as aliasing, this feature has been deprecated in <a href=
             * "http://closure-compiler.googlecode.com/">the Closure Compiler</a> since its
             * initial release, where it is unavailable from the <abbr title=
             * "command line interface">CLI</a>. The Closure Compiler allows one to log and
             * influence this process. In contrast, this implementation does not introduce
             * any variable declarations in global code and derives String values from
             * identifier names used as property accessors.</p>
             * <p>Consolidating literals may worsen the data compression ratio when an <a
             * href="http://tools.ietf.org/html/rfc2616#section-3.5">encoding
             * transformation</a> is applied. For instance, <a href=
             * "http://code.jquery.com/jquery-1.7.1.js">jQuery 1.7.1</a> takes 248235 bytes.
             * Building it with <a href="https://github.com/mishoo/UglifyJS/tarball/v1.2.5">
             * UglifyJS v1.2.5</a> results in 93647 bytes (37.73% of the original) which are
             * then compressed to 33154 bytes (13.36% of the original) using <a href=
             * "http://linux.die.net/man/1/gzip">gzip(1)</a>. Building it with the same
             * version of UglifyJS 1.2.5 patched with the implementation of consolidation
             * results in 80784 bytes (a decrease of 12863 bytes, i.e. 13.74%, in comparison
             * to the aforementioned 93647 bytes) which are then compressed to 34013 bytes
             * (an increase of 859 bytes, i.e. 2.59%, in comparison to the aforementioned
             * 33154 bytes).</p>
             * <p>Written in <a href="http://es5.github.com/#x4.2.2">the strict variant</a>
             * of <a href="http://es5.github.com/">ECMA-262 5.1 Edition</a>. Encoded in <a
             * href="http://tools.ietf.org/html/rfc3629">UTF-8</a>. Follows <a href=
             * "http://google-styleguide.googlecode.com/svn-history/r76/trunk/javascriptguide.xml"
             * >Revision 2.28 of the Google JavaScript Style Guide</a> (except for the
             * discouraged use of the {@code function} tag and the {@code namespace} tag).
             * 100% typed for the <a href=
             * "http://closure-compiler.googlecode.com/files/compiler-20120123.tar.gz"
             * >Closure Compiler Version 1741</a>.</p>
             * <p>Should you find this software useful, please consider <a href=
             * "https://paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=JZLW72X8FD4WG"
             * >a donation</a>.</p>
             * @author follow.me@RGustBardon (Robert Gust-Bardon)
             * @supported Tested with:
             *     <ul>
             *     <li><a href="http://nodejs.org/dist/v0.6.10/">Node v0.6.10</a>,</li>
             *     <li><a href="https://github.com/mishoo/UglifyJS/tarball/v1.2.5">UglifyJS
             *       v1.2.5</a>.</li>
             *     </ul>
             */

            /*global console:false, exports:true, module:false, require:false */
            /*jshint sub:true */
            /**
             * Consolidates null, Boolean, and String values found inside an <abbr title=
             * "abstract syntax tree">AST</abbr>.
             * @param {!TSyntacticCodeUnit} oAbstractSyntaxTree An array-like object
             *     representing an <abbr title="abstract syntax tree">AST</abbr>.
             * @return {!TSyntacticCodeUnit} An array-like object representing an <abbr
             *     title="abstract syntax tree">AST</abbr> with its null, Boolean, and
             *     String values consolidated.
             */
// TODO(user) Consolidation of mathematical values found in numeric literals.
// TODO(user) Unconsolidation.
// TODO(user) Consolidation of ECMA-262 6th Edition programs.
// TODO(user) Rewrite in ECMA-262 6th Edition.
            exports['ast_consolidate'] = function(oAbstractSyntaxTree) {
                'use strict';
                /*jshint bitwise:true, curly:true, eqeqeq:true, forin:true, immed:true,
                 latedef:true, newcap:true, noarge:true, noempty:true, nonew:true,
                 onevar:true, plusplus:true, regexp:true, undef:true, strict:true,
                 sub:false, trailing:true */

                var _,
                    /**
                     * A record consisting of data about one or more source elements.
                     * @constructor
                     * @nosideeffects
                     */
                    TSourceElementsData = function() {
                        /**
                         * The category of the elements.
                         * @type {number}
                         * @see ESourceElementCategories
                         */
                        this.nCategory = ESourceElementCategories.N_OTHER;
                        /**
                         * The number of occurrences (within the elements) of each primitive
                         * value that could be consolidated.
                         * @type {!Array.<!Object.<string, number>>}
                         */
                        this.aCount = [];
                        this.aCount[EPrimaryExpressionCategories.N_IDENTIFIER_NAMES] = {};
                        this.aCount[EPrimaryExpressionCategories.N_STRING_LITERALS] = {};
                        this.aCount[EPrimaryExpressionCategories.N_NULL_AND_BOOLEAN_LITERALS] =
                        {};
                        /**
                         * Identifier names found within the elements.
                         * @type {!Array.<string>}
                         */
                        this.aIdentifiers = [];
                        /**
                         * Prefixed representation Strings of each primitive value that could be
                         * consolidated within the elements.
                         * @type {!Array.<string>}
                         */
                        this.aPrimitiveValues = [];
                    },
                    /**
                     * A record consisting of data about a primitive value that could be
                     * consolidated.
                     * @constructor
                     * @nosideeffects
                     */
                    TPrimitiveValue = function() {
                        /**
                         * The difference in the number of terminal symbols between the original
                         * source text and the one with the primitive value consolidated. If the
                         * difference is positive, the primitive value is considered worthwhile.
                         * @type {number}
                         */
                        this.nSaving = 0;
                        /**
                         * An identifier name of the variable that will be declared and assigned
                         * the primitive value if the primitive value is consolidated.
                         * @type {string}
                         */
                        this.sName = '';
                    },
                    /**
                     * A record consisting of data on what to consolidate within the range of
                     * source elements that is currently being considered.
                     * @constructor
                     * @nosideeffects
                     */
                    TSolution = function() {
                        /**
                         * An object whose keys are prefixed representation Strings of each
                         * primitive value that could be consolidated within the elements and
                         * whose values are corresponding data about those primitive values.
                         * @type {!Object.<string, {nSaving: number, sName: string}>}
                         * @see TPrimitiveValue
                         */
                        this.oPrimitiveValues = {};
                        /**
                         * The difference in the number of terminal symbols between the original
                         * source text and the one with all the worthwhile primitive values
                         * consolidated.
                         * @type {number}
                         * @see TPrimitiveValue#nSaving
                         */
                        this.nSavings = 0;
                    },
                    /**
                     * The processor of <abbr title="abstract syntax tree">AST</abbr>s found
                     * in UglifyJS.
                     * @namespace
                     * @type {!TProcessor}
                     */
                    oProcessor = (/** @type {!TProcessor} */ require('./process')),
                    /**
                     * A record consisting of a number of constants that represent the
                     * difference in the number of terminal symbols between a source text with
                     * a modified syntactic code unit and the original one.
                     * @namespace
                     * @type {!Object.<string, number>}
                     */
                    oWeights = {
                        /**
                         * The difference in the number of punctuators required by the bracket
                         * notation and the dot notation.
                         * <p><code>'[]'.length - '.'.length</code></p>
                         * @const
                         * @type {number}
                         */
                        N_PROPERTY_ACCESSOR: 1,
                        /**
                         * The number of punctuators required by a variable declaration with an
                         * initialiser.
                         * <p><code>':'.length + ';'.length</code></p>
                         * @const
                         * @type {number}
                         */
                        N_VARIABLE_DECLARATION: 2,
                        /**
                         * The number of terminal symbols required to introduce a variable
                         * statement (excluding its variable declaration list).
                         * <p><code>'var '.length</code></p>
                         * @const
                         * @type {number}
                         */
                        N_VARIABLE_STATEMENT_AFFIXATION: 4,
                        /**
                         * The number of terminal symbols needed to enclose source elements
                         * within a function call with no argument values to a function with an
                         * empty parameter list.
                         * <p><code>'(function(){}());'.length</code></p>
                         * @const
                         * @type {number}
                         */
                        N_CLOSURE: 17
                    },
                    /**
                     * Categories of primary expressions from which primitive values that
                     * could be consolidated are derivable.
                     * @namespace
                     * @enum {number}
                     */
                    EPrimaryExpressionCategories = {
                        /**
                         * Identifier names used as property accessors.
                         * @type {number}
                         */
                        N_IDENTIFIER_NAMES: 0,
                        /**
                         * String literals.
                         * @type {number}
                         */
                        N_STRING_LITERALS: 1,
                        /**
                         * Null and Boolean literals.
                         * @type {number}
                         */
                        N_NULL_AND_BOOLEAN_LITERALS: 2
                    },
                    /**
                     * Prefixes of primitive values that could be consolidated.
                     * The String values of the prefixes must have same number of characters.
                     * The prefixes must not be used in any properties defined in any version
                     * of <a href=
                     * "http://www.ecma-international.org/publications/standards/Ecma-262.htm"
                     * >ECMA-262</a>.
                     * @namespace
                     * @enum {string}
                     */
                    EValuePrefixes = {
                        /**
                         * Identifies String values.
                         * @type {string}
                         */
                        S_STRING: '#S',
                        /**
                         * Identifies null and Boolean values.
                         * @type {string}
                         */
                        S_SYMBOLIC: '#O'
                    },
                    /**
                     * Categories of source elements in terms of their appropriateness of
                     * having their primitive values consolidated.
                     * @namespace
                     * @enum {number}
                     */
                    ESourceElementCategories = {
                        /**
                         * Identifies a source element that includes the <a href=
                         * "http://es5.github.com/#x12.10">{@code with}</a> statement.
                         * @type {number}
                         */
                        N_WITH: 0,
                        /**
                         * Identifies a source element that includes the <a href=
                         * "http://es5.github.com/#x15.1.2.1">{@code eval}</a> identifier name.
                         * @type {number}
                         */
                        N_EVAL: 1,
                        /**
                         * Identifies a source element that must be excluded from the process
                         * unless its whole scope is examined.
                         * @type {number}
                         */
                        N_EXCLUDABLE: 2,
                        /**
                         * Identifies source elements not posing any problems.
                         * @type {number}
                         */
                        N_OTHER: 3
                    },
                    /**
                     * The list of literals (other than the String ones) whose primitive
                     * values can be consolidated.
                     * @const
                     * @type {!Array.<string>}
                     */
                    A_OTHER_SUBSTITUTABLE_LITERALS = [
                        'null',   // The null literal.
                        'false',  // The Boolean literal {@code false}.
                        'true'    // The Boolean literal {@code true}.
                    ];

                (/**
                 * Consolidates all worthwhile primitive values in a syntactic code unit.
                 * @param {!TSyntacticCodeUnit} oSyntacticCodeUnit An array-like object
                 *     representing the branch of the abstract syntax tree representing the
                 *     syntactic code unit along with its scope.
                 * @see TPrimitiveValue#nSaving
                 */
                    function fExamineSyntacticCodeUnit(oSyntacticCodeUnit) {
                        var _,
                            /**
                             * Indicates whether the syntactic code unit represents global code.
                             * @type {boolean}
                             */
                            bIsGlobal = 'toplevel' === oSyntacticCodeUnit[0],
                            /**
                             * Indicates whether the whole scope is being examined.
                             * @type {boolean}
                             */
                            bIsWhollyExaminable = !bIsGlobal,
                            /**
                             * An array-like object representing source elements that constitute a
                             * syntactic code unit.
                             * @type {!TSyntacticCodeUnit}
                             */
                            oSourceElements,
                            /**
                             * A record consisting of data about the source element that is
                             * currently being examined.
                             * @type {!TSourceElementsData}
                             */
                            oSourceElementData,
                            /**
                             * The scope of the syntactic code unit.
                             * @type {!TScope}
                             */
                            oScope,
                            /**
                             * An instance of an object that allows the traversal of an <abbr
                             * title="abstract syntax tree">AST</abbr>.
                             * @type {!TWalker}
                             */
                            oWalker,
                            /**
                             * An object encompassing collections of functions used during the
                             * traversal of an <abbr title="abstract syntax tree">AST</abbr>.
                             * @namespace
                             * @type {!Object.<string, !Object.<string, function(...[*])>>}
                             */
                            oWalkers = {
                                /**
                                 * A collection of functions used during the surveyance of source
                                 * elements.
                                 * @namespace
                                 * @type {!Object.<string, function(...[*])>}
                                 */
                                oSurveySourceElement: {
                                    /**#nocode+*/  // JsDoc Toolkit 2.4.0 hides some of the keys.
                                    /**
                                     * Classifies the source element as excludable if it does not
                                     * contain a {@code with} statement or the {@code eval} identifier
                                     * name. Adds the identifier of the function and its formal
                                     * parameters to the list of identifier names found.
                                     * @param {string} sIdentifier The identifier of the function.
                                     * @param {!Array.<string>} aFormalParameterList Formal parameters.
                                     * @param {!TSyntacticCodeUnit} oFunctionBody Function code.
                                     */
                                    'defun': function(
                                        sIdentifier,
                                        aFormalParameterList,
                                        oFunctionBody) {
                                        fClassifyAsExcludable();
                                        fAddIdentifier(sIdentifier);
                                        aFormalParameterList.forEach(fAddIdentifier);
                                    },
                                    /**
                                     * Increments the count of the number of occurrences of the String
                                     * value that is equivalent to the sequence of terminal symbols
                                     * that constitute the encountered identifier name.
                                     * @param {!TSyntacticCodeUnit} oExpression The nonterminal
                                     *     MemberExpression.
                                     * @param {string} sIdentifierName The identifier name used as the
                                     *     property accessor.
                                     * @return {!Array} The encountered branch of an <abbr title=
                                     *     "abstract syntax tree">AST</abbr> with its nonterminal
                                     *     MemberExpression traversed.
                                     */
                                    'dot': function(oExpression, sIdentifierName) {
                                        fCountPrimaryExpression(
                                            EPrimaryExpressionCategories.N_IDENTIFIER_NAMES,
                                            EValuePrefixes.S_STRING + sIdentifierName);
                                        return ['dot', oWalker.walk(oExpression), sIdentifierName];
                                    },
                                    /**
                                     * Adds the optional identifier of the function and its formal
                                     * parameters to the list of identifier names found.
                                     * @param {?string} sIdentifier The optional identifier of the
                                     *     function.
                                     * @param {!Array.<string>} aFormalParameterList Formal parameters.
                                     * @param {!TSyntacticCodeUnit} oFunctionBody Function code.
                                     */
                                    'function': function(
                                        sIdentifier,
                                        aFormalParameterList,
                                        oFunctionBody) {
                                        if ('string' === typeof sIdentifier) {
                                            fAddIdentifier(sIdentifier);
                                        }
                                        aFormalParameterList.forEach(fAddIdentifier);
                                    },
                                    /**
                                     * Either increments the count of the number of occurrences of the
                                     * encountered null or Boolean value or classifies a source element
                                     * as containing the {@code eval} identifier name.
                                     * @param {string} sIdentifier The identifier encountered.
                                     */
                                    'name': function(sIdentifier) {
                                        if (-1 !== A_OTHER_SUBSTITUTABLE_LITERALS.indexOf(sIdentifier)) {
                                            fCountPrimaryExpression(
                                                EPrimaryExpressionCategories.N_NULL_AND_BOOLEAN_LITERALS,
                                                EValuePrefixes.S_SYMBOLIC + sIdentifier);
                                        } else {
                                            if ('eval' === sIdentifier) {
                                                oSourceElementData.nCategory =
                                                    ESourceElementCategories.N_EVAL;
                                            }
                                            fAddIdentifier(sIdentifier);
                                        }
                                    },
                                    /**
                                     * Classifies the source element as excludable if it does not
                                     * contain a {@code with} statement or the {@code eval} identifier
                                     * name.
                                     * @param {TSyntacticCodeUnit} oExpression The expression whose
                                     *     value is to be returned.
                                     */
                                    'return': function(oExpression) {
                                        fClassifyAsExcludable();
                                    },
                                    /**
                                     * Increments the count of the number of occurrences of the
                                     * encountered String value.
                                     * @param {string} sStringValue The String value of the string
                                     *     literal encountered.
                                     */
                                    'string': function(sStringValue) {
                                        if (sStringValue.length > 0) {
                                            fCountPrimaryExpression(
                                                EPrimaryExpressionCategories.N_STRING_LITERALS,
                                                EValuePrefixes.S_STRING + sStringValue);
                                        }
                                    },
                                    /**
                                     * Adds the identifier reserved for an exception to the list of
                                     * identifier names found.
                                     * @param {!TSyntacticCodeUnit} oTry A block of code in which an
                                     *     exception can occur.
                                     * @param {Array} aCatch The identifier reserved for an exception
                                     *     and a block of code to handle the exception.
                                     * @param {TSyntacticCodeUnit} oFinally An optional block of code
                                     *     to be evaluated regardless of whether an exception occurs.
                                     */
                                    'try': function(oTry, aCatch, oFinally) {
                                        if (Array.isArray(aCatch)) {
                                            fAddIdentifier(aCatch[0]);
                                        }
                                    },
                                    /**
                                     * Classifies the source element as excludable if it does not
                                     * contain a {@code with} statement or the {@code eval} identifier
                                     * name. Adds the identifier of each declared variable to the list
                                     * of identifier names found.
                                     * @param {!Array.<!Array>} aVariableDeclarationList Variable
                                     *     declarations.
                                     */
                                    'var': function(aVariableDeclarationList) {
                                        fClassifyAsExcludable();
                                        aVariableDeclarationList.forEach(fAddVariable);
                                    },
                                    /**
                                     * Classifies a source element as containing the {@code with}
                                     * statement.
                                     * @param {!TSyntacticCodeUnit} oExpression An expression whose
                                     *     value is to be converted to a value of type Object and
                                     *     become the binding object of a new object environment
                                     *     record of a new lexical environment in which the statement
                                     *     is to be executed.
                                     * @param {!TSyntacticCodeUnit} oStatement The statement to be
                                     *     executed in the augmented lexical environment.
                                     * @return {!Array} An empty array to stop the traversal.
                                     */
                                    'with': function(oExpression, oStatement) {
                                        oSourceElementData.nCategory = ESourceElementCategories.N_WITH;
                                        return [];
                                    }
                                    /**#nocode-*/  // JsDoc Toolkit 2.4.0 hides some of the keys.
                                },
                                /**
                                 * A collection of functions used while looking for nested functions.
                                 * @namespace
                                 * @type {!Object.<string, function(...[*])>}
                                 */
                                oExamineFunctions: {
                                    /**#nocode+*/  // JsDoc Toolkit 2.4.0 hides some of the keys.
                                    /**
                                     * Orders an examination of a nested function declaration.
                                     * @this {!TSyntacticCodeUnit} An array-like object representing
                                     *     the branch of an <abbr title="abstract syntax tree"
                                     *     >AST</abbr> representing the syntactic code unit along with
                                     *     its scope.
                                     * @return {!Array} An empty array to stop the traversal.
                                     */
                                    'defun': function() {
                                        fExamineSyntacticCodeUnit(this);
                                        return [];
                                    },
                                    /**
                                     * Orders an examination of a nested function expression.
                                     * @this {!TSyntacticCodeUnit} An array-like object representing
                                     *     the branch of an <abbr title="abstract syntax tree"
                                     *     >AST</abbr> representing the syntactic code unit along with
                                     *     its scope.
                                     * @return {!Array} An empty array to stop the traversal.
                                     */
                                    'function': function() {
                                        fExamineSyntacticCodeUnit(this);
                                        return [];
                                    }
                                    /**#nocode-*/  // JsDoc Toolkit 2.4.0 hides some of the keys.
                                }
                            },
                            /**
                             * Records containing data about source elements.
                             * @type {Array.<TSourceElementsData>}
                             */
                            aSourceElementsData = [],
                            /**
                             * The index (in the source text order) of the source element
                             * immediately following a <a href="http://es5.github.com/#x14.1"
                             * >Directive Prologue</a>.
                             * @type {number}
                             */
                            nAfterDirectivePrologue = 0,
                            /**
                             * The index (in the source text order) of the source element that is
                             * currently being considered.
                             * @type {number}
                             */
                            nPosition,
                            /**
                             * The index (in the source text order) of the source element that is
                             * the last element of the range of source elements that is currently
                             * being considered.
                             * @type {(undefined|number)}
                             */
                            nTo,
                            /**
                             * Initiates the traversal of a source element.
                             * @param {!TWalker} oWalker An instance of an object that allows the
                             *     traversal of an abstract syntax tree.
                             * @param {!TSyntacticCodeUnit} oSourceElement A source element from
                             *     which the traversal should commence.
                             * @return {function(): !TSyntacticCodeUnit} A function that is able to
                             *     initiate the traversal from a given source element.
                             */
                            cContext = function(oWalker, oSourceElement) {
                                /**
                                 * @return {!TSyntacticCodeUnit} A function that is able to
                                 *     initiate the traversal from a given source element.
                                 */
                                var fLambda = function() {
                                    return oWalker.walk(oSourceElement);
                                };

                                return fLambda;
                            },
                            /**
                             * Classifies the source element as excludable if it does not
                             * contain a {@code with} statement or the {@code eval} identifier
                             * name.
                             */
                            fClassifyAsExcludable = function() {
                                if (oSourceElementData.nCategory ===
                                    ESourceElementCategories.N_OTHER) {
                                    oSourceElementData.nCategory =
                                        ESourceElementCategories.N_EXCLUDABLE;
                                }
                            },
                            /**
                             * Adds an identifier to the list of identifier names found.
                             * @param {string} sIdentifier The identifier to be added.
                             */
                            fAddIdentifier = function(sIdentifier) {
                                if (-1 === oSourceElementData.aIdentifiers.indexOf(sIdentifier)) {
                                    oSourceElementData.aIdentifiers.push(sIdentifier);
                                }
                            },
                            /**
                             * Adds the identifier of a variable to the list of identifier names
                             * found.
                             * @param {!Array} aVariableDeclaration A variable declaration.
                             */
                            fAddVariable = function(aVariableDeclaration) {
                                fAddIdentifier(/** @type {string} */ aVariableDeclaration[0]);
                            },
                            /**
                             * Increments the count of the number of occurrences of the prefixed
                             * String representation attributed to the primary expression.
                             * @param {number} nCategory The category of the primary expression.
                             * @param {string} sName The prefixed String representation attributed
                             *     to the primary expression.
                             */
                            fCountPrimaryExpression = function(nCategory, sName) {
                                if (!oSourceElementData.aCount[nCategory].hasOwnProperty(sName)) {
                                    oSourceElementData.aCount[nCategory][sName] = 0;
                                    if (-1 === oSourceElementData.aPrimitiveValues.indexOf(sName)) {
                                        oSourceElementData.aPrimitiveValues.push(sName);
                                    }
                                }
                                oSourceElementData.aCount[nCategory][sName] += 1;
                            },
                            /**
                             * Consolidates all worthwhile primitive values in a range of source
                             *     elements.
                             * @param {number} nFrom The index (in the source text order) of the
                             *     source element that is the first element of the range.
                             * @param {number} nTo The index (in the source text order) of the
                             *     source element that is the last element of the range.
                             * @param {boolean} bEnclose Indicates whether the range should be
                             *     enclosed within a function call with no argument values to a
                             *     function with an empty parameter list if any primitive values
                             *     are consolidated.
                             * @see TPrimitiveValue#nSaving
                             */
                            fExamineSourceElements = function(nFrom, nTo, bEnclose) {
                                var _,
                                    /**
                                     * The index of the last mangled name.
                                     * @type {number}
                                     */
                                    nIndex = oScope.cname,
                                    /**
                                     * The index of the source element that is currently being
                                     * considered.
                                     * @type {number}
                                     */
                                    nPosition,
                                    /**
                                     * A collection of functions used during the consolidation of
                                     * primitive values and identifier names used as property
                                     * accessors.
                                     * @namespace
                                     * @type {!Object.<string, function(...[*])>}
                                     */
                                    oWalkersTransformers = {
                                        /**
                                         * If the String value that is equivalent to the sequence of
                                         * terminal symbols that constitute the encountered identifier
                                         * name is worthwhile, a syntactic conversion from the dot
                                         * notation to the bracket notation ensues with that sequence
                                         * being substituted by an identifier name to which the value
                                         * is assigned.
                                         * Applies to property accessors that use the dot notation.
                                         * @param {!TSyntacticCodeUnit} oExpression The nonterminal
                                         *     MemberExpression.
                                         * @param {string} sIdentifierName The identifier name used as
                                         *     the property accessor.
                                         * @return {!Array} A syntactic code unit that is equivalent to
                                         *     the one encountered.
                                         * @see TPrimitiveValue#nSaving
                                         */
                                        'dot': function(oExpression, sIdentifierName) {
                                            /**
                                             * The prefixed String value that is equivalent to the
                                             * sequence of terminal symbols that constitute the
                                             * encountered identifier name.
                                             * @type {string}
                                             */
                                            var sPrefixed = EValuePrefixes.S_STRING + sIdentifierName;

                                            return oSolutionBest.oPrimitiveValues.hasOwnProperty(
                                                sPrefixed) &&
                                            oSolutionBest.oPrimitiveValues[sPrefixed].nSaving > 0 ?
                                                ['sub',
                                                    oWalker.walk(oExpression),
                                                    ['name',
                                                        oSolutionBest.oPrimitiveValues[sPrefixed].sName]] :
                                                ['dot', oWalker.walk(oExpression), sIdentifierName];
                                        },
                                        /**
                                         * If the encountered identifier is a null or Boolean literal
                                         * and its value is worthwhile, the identifier is substituted
                                         * by an identifier name to which that value is assigned.
                                         * Applies to identifier names.
                                         * @param {string} sIdentifier The identifier encountered.
                                         * @return {!Array} A syntactic code unit that is equivalent to
                                         *     the one encountered.
                                         * @see TPrimitiveValue#nSaving
                                         */
                                        'name': function(sIdentifier) {
                                            /**
                                             * The prefixed representation String of the identifier.
                                             * @type {string}
                                             */
                                            var sPrefixed = EValuePrefixes.S_SYMBOLIC + sIdentifier;

                                            return [
                                                'name',
                                                oSolutionBest.oPrimitiveValues.hasOwnProperty(sPrefixed) &&
                                                oSolutionBest.oPrimitiveValues[sPrefixed].nSaving > 0 ?
                                                    oSolutionBest.oPrimitiveValues[sPrefixed].sName :
                                                    sIdentifier
                                            ];
                                        },
                                        /**
                                         * If the encountered String value is worthwhile, it is
                                         * substituted by an identifier name to which that value is
                                         * assigned.
                                         * Applies to String values.
                                         * @param {string} sStringValue The String value of the string
                                         *     literal encountered.
                                         * @return {!Array} A syntactic code unit that is equivalent to
                                         *     the one encountered.
                                         * @see TPrimitiveValue#nSaving
                                         */
                                        'string': function(sStringValue) {
                                            /**
                                             * The prefixed representation String of the primitive value
                                             * of the literal.
                                             * @type {string}
                                             */
                                            var sPrefixed =
                                                EValuePrefixes.S_STRING + sStringValue;

                                            return oSolutionBest.oPrimitiveValues.hasOwnProperty(
                                                sPrefixed) &&
                                            oSolutionBest.oPrimitiveValues[sPrefixed].nSaving > 0 ?
                                                ['name',
                                                    oSolutionBest.oPrimitiveValues[sPrefixed].sName] :
                                                ['string', sStringValue];
                                        }
                                    },
                                    /**
                                     * Such data on what to consolidate within the range of source
                                     * elements that is currently being considered that lead to the
                                     * greatest known reduction of the number of the terminal symbols
                                     * in comparison to the original source text.
                                     * @type {!TSolution}
                                     */
                                    oSolutionBest = new TSolution(),
                                    /**
                                     * Data representing an ongoing attempt to find a better
                                     * reduction of the number of the terminal symbols in comparison
                                     * to the original source text than the best one that is
                                     * currently known.
                                     * @type {!TSolution}
                                     * @see oSolutionBest
                                     */
                                    oSolutionCandidate = new TSolution(),
                                    /**
                                     * A record consisting of data about the range of source elements
                                     * that is currently being examined.
                                     * @type {!TSourceElementsData}
                                     */
                                    oSourceElementsData = new TSourceElementsData(),
                                    /**
                                     * Variable declarations for each primitive value that is to be
                                     * consolidated within the elements.
                                     * @type {!Array.<!Array>}
                                     */
                                    aVariableDeclarations = [],
                                    /**
                                     * Augments a list with a prefixed representation String.
                                     * @param {!Array.<string>} aList A list that is to be augmented.
                                     * @return {function(string)} A function that augments a list
                                     *     with a prefixed representation String.
                                     */
                                    cAugmentList = function(aList) {
                                        /**
                                         * @param {string} sPrefixed Prefixed representation String of
                                         *     a primitive value that could be consolidated within the
                                         *     elements.
                                         */
                                        var fLambda = function(sPrefixed) {
                                            if (-1 === aList.indexOf(sPrefixed)) {
                                                aList.push(sPrefixed);
                                            }
                                        };

                                        return fLambda;
                                    },
                                    /**
                                     * Adds the number of occurrences of a primitive value of a given
                                     * category that could be consolidated in the source element with
                                     * a given index to the count of occurrences of that primitive
                                     * value within the range of source elements that is currently
                                     * being considered.
                                     * @param {number} nPosition The index (in the source text order)
                                     *     of a source element.
                                     * @param {number} nCategory The category of the primary
                                     *     expression from which the primitive value is derived.
                                     * @return {function(string)} A function that performs the
                                     *     addition.
                                     * @see cAddOccurrencesInCategory
                                     */
                                    cAddOccurrences = function(nPosition, nCategory) {
                                        /**
                                         * @param {string} sPrefixed The prefixed representation String
                                         *     of a primitive value.
                                         */
                                        var fLambda = function(sPrefixed) {
                                            if (!oSourceElementsData.aCount[nCategory].hasOwnProperty(
                                                    sPrefixed)) {
                                                oSourceElementsData.aCount[nCategory][sPrefixed] = 0;
                                            }
                                            oSourceElementsData.aCount[nCategory][sPrefixed] +=
                                                aSourceElementsData[nPosition].aCount[nCategory][
                                                    sPrefixed];
                                        };

                                        return fLambda;
                                    },
                                    /**
                                     * Adds the number of occurrences of each primitive value of a
                                     * given category that could be consolidated in the source
                                     * element with a given index to the count of occurrences of that
                                     * primitive values within the range of source elements that is
                                     * currently being considered.
                                     * @param {number} nPosition The index (in the source text order)
                                     *     of a source element.
                                     * @return {function(number)} A function that performs the
                                     *     addition.
                                     * @see fAddOccurrences
                                     */
                                    cAddOccurrencesInCategory = function(nPosition) {
                                        /**
                                         * @param {number} nCategory The category of the primary
                                         *     expression from which the primitive value is derived.
                                         */
                                        var fLambda = function(nCategory) {
                                            Object.keys(
                                                aSourceElementsData[nPosition].aCount[nCategory]
                                            ).forEach(cAddOccurrences(nPosition, nCategory));
                                        };

                                        return fLambda;
                                    },
                                    /**
                                     * Adds the number of occurrences of each primitive value that
                                     * could be consolidated in the source element with a given index
                                     * to the count of occurrences of that primitive values within
                                     * the range of source elements that is currently being
                                     * considered.
                                     * @param {number} nPosition The index (in the source text order)
                                     *     of a source element.
                                     */
                                    fAddOccurrences = function(nPosition) {
                                        Object.keys(aSourceElementsData[nPosition].aCount).forEach(
                                            cAddOccurrencesInCategory(nPosition));
                                    },
                                    /**
                                     * Creates a variable declaration for a primitive value if that
                                     * primitive value is to be consolidated within the elements.
                                     * @param {string} sPrefixed Prefixed representation String of a
                                     *     primitive value that could be consolidated within the
                                     *     elements.
                                     * @see aVariableDeclarations
                                     */
                                    cAugmentVariableDeclarations = function(sPrefixed) {
                                        if (oSolutionBest.oPrimitiveValues[sPrefixed].nSaving > 0) {
                                            aVariableDeclarations.push([
                                                oSolutionBest.oPrimitiveValues[sPrefixed].sName,
                                                [0 === sPrefixed.indexOf(EValuePrefixes.S_SYMBOLIC) ?
                                                    'name' : 'string',
                                                    sPrefixed.substring(EValuePrefixes.S_SYMBOLIC.length)]
                                            ]);
                                        }
                                    },
                                    /**
                                     * Sorts primitive values with regard to the difference in the
                                     * number of terminal symbols between the original source text
                                     * and the one with those primitive values consolidated.
                                     * @param {string} sPrefixed0 The prefixed representation String
                                     *     of the first of the two primitive values that are being
                                     *     compared.
                                     * @param {string} sPrefixed1 The prefixed representation String
                                     *     of the second of the two primitive values that are being
                                     *     compared.
                                     * @return {number}
                                     *     <dl>
                                     *         <dt>-1</dt>
                                     *         <dd>if the first primitive value must be placed before
                                     *              the other one,</dd>
                                     *         <dt>0</dt>
                                     *         <dd>if the first primitive value may be placed before
                                     *              the other one,</dd>
                                     *         <dt>1</dt>
                                     *         <dd>if the first primitive value must not be placed
                                     *              before the other one.</dd>
                                     *     </dl>
                                     * @see TSolution.oPrimitiveValues
                                     */
                                    cSortPrimitiveValues = function(sPrefixed0, sPrefixed1) {
                                        /**
                                         * The difference between:
                                         * <ol>
                                         * <li>the difference in the number of terminal symbols
                                         *     between the original source text and the one with the
                                         *     first primitive value consolidated, and</li>
                                         * <li>the difference in the number of terminal symbols
                                         *     between the original source text and the one with the
                                         *     second primitive value consolidated.</li>
                                         * </ol>
                                         * @type {number}
                                         */
                                        var nDifference =
                                            oSolutionCandidate.oPrimitiveValues[sPrefixed0].nSaving -
                                            oSolutionCandidate.oPrimitiveValues[sPrefixed1].nSaving;

                                        return nDifference > 0 ? -1 : nDifference < 0 ? 1 : 0;
                                    },
                                    /**
                                     * Assigns an identifier name to a primitive value and calculates
                                     * whether instances of that primitive value are worth
                                     * consolidating.
                                     * @param {string} sPrefixed The prefixed representation String
                                     *     of a primitive value that is being evaluated.
                                     */
                                    fEvaluatePrimitiveValue = function(sPrefixed) {
                                        var _,
                                            /**
                                             * The index of the last mangled name.
                                             * @type {number}
                                             */
                                            nIndex,
                                            /**
                                             * The representation String of the primitive value that is
                                             * being evaluated.
                                             * @type {string}
                                             */
                                            sName =
                                                sPrefixed.substring(EValuePrefixes.S_SYMBOLIC.length),
                                            /**
                                             * The number of source characters taken up by the
                                             * representation String of the primitive value that is
                                             * being evaluated.
                                             * @type {number}
                                             */
                                            nLengthOriginal = sName.length,
                                            /**
                                             * The number of source characters taken up by the
                                             * identifier name that could substitute the primitive
                                             * value that is being evaluated.
                                             * substituted.
                                             * @type {number}
                                             */
                                            nLengthSubstitution,
                                            /**
                                             * The number of source characters taken up by by the
                                             * representation String of the primitive value that is
                                             * being evaluated when it is represented by a string
                                             * literal.
                                             * @type {number}
                                             */
                                            nLengthString = oProcessor.make_string(sName).length;

                                        oSolutionCandidate.oPrimitiveValues[sPrefixed] =
                                            new TPrimitiveValue();
                                        do {  // Find an identifier unused in this or any nested scope.
                                            nIndex = oScope.cname;
                                            oSolutionCandidate.oPrimitiveValues[sPrefixed].sName =
                                                oScope.next_mangled();
                                        } while (-1 !== oSourceElementsData.aIdentifiers.indexOf(
                                            oSolutionCandidate.oPrimitiveValues[sPrefixed].sName));
                                        nLengthSubstitution = oSolutionCandidate.oPrimitiveValues[
                                            sPrefixed].sName.length;
                                        if (0 === sPrefixed.indexOf(EValuePrefixes.S_SYMBOLIC)) {
                                            // foo:null, or foo:null;
                                            oSolutionCandidate.oPrimitiveValues[sPrefixed].nSaving -=
                                                nLengthSubstitution + nLengthOriginal +
                                                oWeights.N_VARIABLE_DECLARATION;
                                            // null vs foo
                                            oSolutionCandidate.oPrimitiveValues[sPrefixed].nSaving +=
                                                oSourceElementsData.aCount[
                                                    EPrimaryExpressionCategories.
                                                        N_NULL_AND_BOOLEAN_LITERALS][sPrefixed] *
                                                (nLengthOriginal - nLengthSubstitution);
                                        } else {
                                            // foo:'fromCharCode';
                                            oSolutionCandidate.oPrimitiveValues[sPrefixed].nSaving -=
                                                nLengthSubstitution + nLengthString +
                                                oWeights.N_VARIABLE_DECLARATION;
                                            // .fromCharCode vs [foo]
                                            if (oSourceElementsData.aCount[
                                                    EPrimaryExpressionCategories.N_IDENTIFIER_NAMES
                                                    ].hasOwnProperty(sPrefixed)) {
                                                oSolutionCandidate.oPrimitiveValues[sPrefixed].nSaving +=
                                                    oSourceElementsData.aCount[
                                                        EPrimaryExpressionCategories.N_IDENTIFIER_NAMES
                                                        ][sPrefixed] *
                                                    (nLengthOriginal - nLengthSubstitution -
                                                    oWeights.N_PROPERTY_ACCESSOR);
                                            }
                                            // 'fromCharCode' vs foo
                                            if (oSourceElementsData.aCount[
                                                    EPrimaryExpressionCategories.N_STRING_LITERALS
                                                    ].hasOwnProperty(sPrefixed)) {
                                                oSolutionCandidate.oPrimitiveValues[sPrefixed].nSaving +=
                                                    oSourceElementsData.aCount[
                                                        EPrimaryExpressionCategories.N_STRING_LITERALS
                                                        ][sPrefixed] *
                                                    (nLengthString - nLengthSubstitution);
                                            }
                                        }
                                        if (oSolutionCandidate.oPrimitiveValues[sPrefixed].nSaving >
                                            0) {
                                            oSolutionCandidate.nSavings +=
                                                oSolutionCandidate.oPrimitiveValues[sPrefixed].nSaving;
                                        } else {
                                            oScope.cname = nIndex; // Free the identifier name.
                                        }
                                    },
                                    /**
                                     * Adds a variable declaration to an existing variable statement.
                                     * @param {!Array} aVariableDeclaration A variable declaration
                                     *     with an initialiser.
                                     */
                                    cAddVariableDeclaration = function(aVariableDeclaration) {
                                        (/** @type {!Array} */ oSourceElements[nFrom][1]).unshift(
                                            aVariableDeclaration);
                                    };

                                if (nFrom > nTo) {
                                    return;
                                }
                                // If the range is a closure, reuse the closure.
                                if (nFrom === nTo &&
                                    'stat' === oSourceElements[nFrom][0] &&
                                    'call' === oSourceElements[nFrom][1][0] &&
                                    'function' === oSourceElements[nFrom][1][1][0]) {
                                    fExamineSyntacticCodeUnit(oSourceElements[nFrom][1][1]);
                                    return;
                                }
                                // Create a list of all derived primitive values within the range.
                                for (nPosition = nFrom; nPosition <= nTo; nPosition += 1) {
                                    aSourceElementsData[nPosition].aPrimitiveValues.forEach(
                                        cAugmentList(oSourceElementsData.aPrimitiveValues));
                                }
                                if (0 === oSourceElementsData.aPrimitiveValues.length) {
                                    return;
                                }
                                for (nPosition = nFrom; nPosition <= nTo; nPosition += 1) {
                                    // Add the number of occurrences to the total count.
                                    fAddOccurrences(nPosition);
                                    // Add identifiers of this or any nested scope to the list.
                                    aSourceElementsData[nPosition].aIdentifiers.forEach(
                                        cAugmentList(oSourceElementsData.aIdentifiers));
                                }
                                // Distribute identifier names among derived primitive values.
                                do {  // If there was any progress, find a better distribution.
                                    oSolutionBest = oSolutionCandidate;
                                    if (Object.keys(oSolutionCandidate.oPrimitiveValues).length > 0) {
                                        // Sort primitive values descending by their worthwhileness.
                                        oSourceElementsData.aPrimitiveValues.sort(cSortPrimitiveValues);
                                    }
                                    oSolutionCandidate = new TSolution();
                                    oSourceElementsData.aPrimitiveValues.forEach(
                                        fEvaluatePrimitiveValue);
                                    oScope.cname = nIndex;
                                } while (oSolutionCandidate.nSavings > oSolutionBest.nSavings);
                                // Take the necessity of adding a variable statement into account.
                                if ('var' !== oSourceElements[nFrom][0]) {
                                    oSolutionBest.nSavings -= oWeights.N_VARIABLE_STATEMENT_AFFIXATION;
                                }
                                if (bEnclose) {
                                    // Take the necessity of forming a closure into account.
                                    oSolutionBest.nSavings -= oWeights.N_CLOSURE;
                                }
                                if (oSolutionBest.nSavings > 0) {
                                    // Create variable declarations suitable for UglifyJS.
                                    Object.keys(oSolutionBest.oPrimitiveValues).forEach(
                                        cAugmentVariableDeclarations);
                                    // Rewrite expressions that contain worthwhile primitive values.
                                    for (nPosition = nFrom; nPosition <= nTo; nPosition += 1) {
                                        oWalker = oProcessor.ast_walker();
                                        oSourceElements[nPosition] =
                                            oWalker.with_walkers(
                                                oWalkersTransformers,
                                                cContext(oWalker, oSourceElements[nPosition]));
                                    }
                                    if ('var' === oSourceElements[nFrom][0]) {  // Reuse the statement.
                                        (/** @type {!Array.<!Array>} */ aVariableDeclarations.reverse(
                                        )).forEach(cAddVariableDeclaration);
                                    } else {  // Add a variable statement.
                                        Array.prototype.splice.call(
                                            oSourceElements,
                                            nFrom,
                                            0,
                                            ['var', aVariableDeclarations]);
                                        nTo += 1;
                                    }
                                    if (bEnclose) {
                                        // Add a closure.
                                        Array.prototype.splice.call(
                                            oSourceElements,
                                            nFrom,
                                            0,
                                            ['stat', ['call', ['function', null, [], []], []]]);
                                        // Copy source elements into the closure.
                                        for (nPosition = nTo + 1; nPosition > nFrom; nPosition -= 1) {
                                            Array.prototype.unshift.call(
                                                oSourceElements[nFrom][1][1][3],
                                                oSourceElements[nPosition]);
                                        }
                                        // Remove source elements outside the closure.
                                        Array.prototype.splice.call(
                                            oSourceElements,
                                            nFrom + 1,
                                            nTo - nFrom + 1);
                                    }
                                }
                                if (bEnclose) {
                                    // Restore the availability of identifier names.
                                    oScope.cname = nIndex;
                                }
                            };

                        oSourceElements = (/** @type {!TSyntacticCodeUnit} */
                            oSyntacticCodeUnit[bIsGlobal ? 1 : 3]);
                        if (0 === oSourceElements.length) {
                            return;
                        }
                        oScope = bIsGlobal ? oSyntacticCodeUnit.scope : oSourceElements.scope;
                        // Skip a Directive Prologue.
                        while (nAfterDirectivePrologue < oSourceElements.length &&
                        'directive' === oSourceElements[nAfterDirectivePrologue][0]) {
                            nAfterDirectivePrologue += 1;
                            aSourceElementsData.push(null);
                        }
                        if (oSourceElements.length === nAfterDirectivePrologue) {
                            return;
                        }
                        for (nPosition = nAfterDirectivePrologue;
                             nPosition < oSourceElements.length;
                             nPosition += 1) {
                            oSourceElementData = new TSourceElementsData();
                            oWalker = oProcessor.ast_walker();
                            // Classify a source element.
                            // Find its derived primitive values and count their occurrences.
                            // Find all identifiers used (including nested scopes).
                            oWalker.with_walkers(
                                oWalkers.oSurveySourceElement,
                                cContext(oWalker, oSourceElements[nPosition]));
                            // Establish whether the scope is still wholly examinable.
                            bIsWhollyExaminable = bIsWhollyExaminable &&
                                ESourceElementCategories.N_WITH !== oSourceElementData.nCategory &&
                                ESourceElementCategories.N_EVAL !== oSourceElementData.nCategory;
                            aSourceElementsData.push(oSourceElementData);
                        }
                        if (bIsWhollyExaminable) {  // Examine the whole scope.
                            fExamineSourceElements(
                                nAfterDirectivePrologue,
                                oSourceElements.length - 1,
                                false);
                        } else {  // Examine unexcluded ranges of source elements.
                            for (nPosition = oSourceElements.length - 1;
                                 nPosition >= nAfterDirectivePrologue;
                                 nPosition -= 1) {
                                oSourceElementData = (/** @type {!TSourceElementsData} */
                                    aSourceElementsData[nPosition]);
                                if (ESourceElementCategories.N_OTHER ===
                                    oSourceElementData.nCategory) {
                                    if ('undefined' === typeof nTo) {
                                        nTo = nPosition;  // Indicate the end of a range.
                                    }
                                    // Examine the range if it immediately follows a Directive Prologue.
                                    if (nPosition === nAfterDirectivePrologue) {
                                        fExamineSourceElements(nPosition, nTo, true);
                                    }
                                } else {
                                    if ('undefined' !== typeof nTo) {
                                        // Examine the range that immediately follows this source element.
                                        fExamineSourceElements(nPosition + 1, nTo, true);
                                        nTo = void 0;  // Obliterate the range.
                                    }
                                    // Examine nested functions.
                                    oWalker = oProcessor.ast_walker();
                                    oWalker.with_walkers(
                                        oWalkers.oExamineFunctions,
                                        cContext(oWalker, oSourceElements[nPosition]));
                                }
                            }
                        }
                    }(oAbstractSyntaxTree = oProcessor.ast_add_scope(oAbstractSyntaxTree)));
                return oAbstractSyntaxTree;
            };
            /*jshint sub:false */

            /* Local Variables:      */
            /* mode: js              */
            /* coding: utf-8         */
            /* indent-tabs-mode: nil */
            /* tab-width: 2          */
            /* End:                  */
            /* vim: set ft=javascript fenc=utf-8 et ts=2 sts=2 sw=2: */
            /* :mode=javascript:noTabs=true:tabSize=2:indentSize=2:deepIndent=true: */
        });
        define('uglifyjs/parse-js', ["exports"], function(exports) {
            /***********************************************************************

             A JavaScript tokenizer / parser / beautifier / compressor.

             This version is suitable for Node.js.  With minimal changes (the
             exports stuff) it should work on any JS platform.

             This file contains the tokenizer/parser.  It is a port to JavaScript
             of parse-js [1], a JavaScript parser library written in Common Lisp
             by Marijn Haverbeke.  Thank you Marijn!

             [1] http://marijn.haverbeke.nl/parse-js/

             Exported functions:

             - tokenizer(code) -- returns a function.  Call the returned
             function to fetch the next token.

             - parse(code) -- returns an AST of the given JavaScript code.

             -------------------------------- (C) ---------------------------------

             Author: Mihai Bazon
             <mihai.bazon@gmail.com>
             http://mihai.bazon.net/blog

             Distributed under the BSD license:

             Copyright 2010 (c) Mihai Bazon <mihai.bazon@gmail.com>
             Based on parse-js (http://marijn.haverbeke.nl/parse-js/).

             Redistribution and use in source and binary forms, with or without
             modification, are permitted provided that the following conditions
             are met:

             * Redistributions of source code must retain the above
             copyright notice, this list of conditions and the following
             disclaimer.

             * Redistributions in binary form must reproduce the above
             copyright notice, this list of conditions and the following
             disclaimer in the documentation and/or other materials
             provided with the distribution.

             THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDER â€œAS ISâ€ AND ANY
             EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
             IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
             PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE
             LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY,
             OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
             PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
             PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
             THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
             TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF
             THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
             SUCH DAMAGE.

             ***********************************************************************/

            /* -----[ Tokenizer (constants) ]----- */

            var KEYWORDS = array_to_hash([
                "break",
                "case",
                "catch",
                "const",
                "continue",
                "debugger",
                "default",
                "delete",
                "do",
                "else",
                "finally",
                "for",
                "function",
                "if",
                "in",
                "instanceof",
                "new",
                "return",
                "switch",
                "throw",
                "try",
                "typeof",
                "var",
                "void",
                "while",
                "with"
            ]);

            var RESERVED_WORDS = array_to_hash([
                "abstract",
                "boolean",
                "byte",
                "char",
                "class",
                "double",
                "enum",
                "export",
                "extends",
                "final",
                "float",
                "goto",
                "implements",
                "import",
                "int",
                "interface",
                "long",
                "native",
                "package",
                "private",
                "protected",
                "public",
                "short",
                "static",
                "super",
                "synchronized",
                "throws",
                "transient",
                "volatile"
            ]);

            var KEYWORDS_BEFORE_EXPRESSION = array_to_hash([
                "return",
                "new",
                "delete",
                "throw",
                "else",
                "case"
            ]);

            var KEYWORDS_ATOM = array_to_hash([
                "false",
                "null",
                "true",
                "undefined"
            ]);

            var OPERATOR_CHARS = array_to_hash(characters("+-*&%=<>!?|~^"));

            var RE_HEX_NUMBER = /^0x[0-9a-f]+$/i;
            var RE_OCT_NUMBER = /^0[0-7]+$/;
            var RE_DEC_NUMBER = /^\d*\.?\d*(?:e[+-]?\d*(?:\d\.?|\.?\d)\d*)?$/i;

            var OPERATORS = array_to_hash([
                "in",
                "instanceof",
                "typeof",
                "new",
                "void",
                "delete",
                "++",
                "--",
                "+",
                "-",
                "!",
                "~",
                "&",
                "|",
                "^",
                "*",
                "/",
                "%",
                ">>",
                "<<",
                ">>>",
                "<",
                ">",
                "<=",
                ">=",
                "==",
                "===",
                "!=",
                "!==",
                "?",
                "=",
                "+=",
                "-=",
                "/=",
                "*=",
                "%=",
                ">>=",
                "<<=",
                ">>>=",
                "|=",
                "^=",
                "&=",
                "&&",
                "||"
            ]);

            var WHITESPACE_CHARS = array_to_hash(characters(" \u00a0\n\r\t\f\u000b\u200b\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\uFEFF"));

            var PUNC_BEFORE_EXPRESSION = array_to_hash(characters("[{(,.;:"));

            var PUNC_CHARS = array_to_hash(characters("[]{}(),;:"));

            var REGEXP_MODIFIERS = array_to_hash(characters("gmsiy"));

            /* -----[ Tokenizer ]----- */

            var UNICODE = {  // Unicode 6.1
                letter: new RegExp("[\\u0041-\\u005A\\u0061-\\u007A\\u00AA\\u00B5\\u00BA\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02C1\\u02C6-\\u02D1\\u02E0-\\u02E4\\u02EC\\u02EE\\u0370-\\u0374\\u0376\\u0377\\u037A-\\u037D\\u0386\\u0388-\\u038A\\u038C\\u038E-\\u03A1\\u03A3-\\u03F5\\u03F7-\\u0481\\u048A-\\u0527\\u0531-\\u0556\\u0559\\u0561-\\u0587\\u05D0-\\u05EA\\u05F0-\\u05F2\\u0620-\\u064A\\u066E\\u066F\\u0671-\\u06D3\\u06D5\\u06E5\\u06E6\\u06EE\\u06EF\\u06FA-\\u06FC\\u06FF\\u0710\\u0712-\\u072F\\u074D-\\u07A5\\u07B1\\u07CA-\\u07EA\\u07F4\\u07F5\\u07FA\\u0800-\\u0815\\u081A\\u0824\\u0828\\u0840-\\u0858\\u08A0\\u08A2-\\u08AC\\u0904-\\u0939\\u093D\\u0950\\u0958-\\u0961\\u0971-\\u0977\\u0979-\\u097F\\u0985-\\u098C\\u098F\\u0990\\u0993-\\u09A8\\u09AA-\\u09B0\\u09B2\\u09B6-\\u09B9\\u09BD\\u09CE\\u09DC\\u09DD\\u09DF-\\u09E1\\u09F0\\u09F1\\u0A05-\\u0A0A\\u0A0F\\u0A10\\u0A13-\\u0A28\\u0A2A-\\u0A30\\u0A32\\u0A33\\u0A35\\u0A36\\u0A38\\u0A39\\u0A59-\\u0A5C\\u0A5E\\u0A72-\\u0A74\\u0A85-\\u0A8D\\u0A8F-\\u0A91\\u0A93-\\u0AA8\\u0AAA-\\u0AB0\\u0AB2\\u0AB3\\u0AB5-\\u0AB9\\u0ABD\\u0AD0\\u0AE0\\u0AE1\\u0B05-\\u0B0C\\u0B0F\\u0B10\\u0B13-\\u0B28\\u0B2A-\\u0B30\\u0B32\\u0B33\\u0B35-\\u0B39\\u0B3D\\u0B5C\\u0B5D\\u0B5F-\\u0B61\\u0B71\\u0B83\\u0B85-\\u0B8A\\u0B8E-\\u0B90\\u0B92-\\u0B95\\u0B99\\u0B9A\\u0B9C\\u0B9E\\u0B9F\\u0BA3\\u0BA4\\u0BA8-\\u0BAA\\u0BAE-\\u0BB9\\u0BD0\\u0C05-\\u0C0C\\u0C0E-\\u0C10\\u0C12-\\u0C28\\u0C2A-\\u0C33\\u0C35-\\u0C39\\u0C3D\\u0C58\\u0C59\\u0C60\\u0C61\\u0C85-\\u0C8C\\u0C8E-\\u0C90\\u0C92-\\u0CA8\\u0CAA-\\u0CB3\\u0CB5-\\u0CB9\\u0CBD\\u0CDE\\u0CE0\\u0CE1\\u0CF1\\u0CF2\\u0D05-\\u0D0C\\u0D0E-\\u0D10\\u0D12-\\u0D3A\\u0D3D\\u0D4E\\u0D60\\u0D61\\u0D7A-\\u0D7F\\u0D85-\\u0D96\\u0D9A-\\u0DB1\\u0DB3-\\u0DBB\\u0DBD\\u0DC0-\\u0DC6\\u0E01-\\u0E30\\u0E32\\u0E33\\u0E40-\\u0E46\\u0E81\\u0E82\\u0E84\\u0E87\\u0E88\\u0E8A\\u0E8D\\u0E94-\\u0E97\\u0E99-\\u0E9F\\u0EA1-\\u0EA3\\u0EA5\\u0EA7\\u0EAA\\u0EAB\\u0EAD-\\u0EB0\\u0EB2\\u0EB3\\u0EBD\\u0EC0-\\u0EC4\\u0EC6\\u0EDC-\\u0EDF\\u0F00\\u0F40-\\u0F47\\u0F49-\\u0F6C\\u0F88-\\u0F8C\\u1000-\\u102A\\u103F\\u1050-\\u1055\\u105A-\\u105D\\u1061\\u1065\\u1066\\u106E-\\u1070\\u1075-\\u1081\\u108E\\u10A0-\\u10C5\\u10C7\\u10CD\\u10D0-\\u10FA\\u10FC-\\u1248\\u124A-\\u124D\\u1250-\\u1256\\u1258\\u125A-\\u125D\\u1260-\\u1288\\u128A-\\u128D\\u1290-\\u12B0\\u12B2-\\u12B5\\u12B8-\\u12BE\\u12C0\\u12C2-\\u12C5\\u12C8-\\u12D6\\u12D8-\\u1310\\u1312-\\u1315\\u1318-\\u135A\\u1380-\\u138F\\u13A0-\\u13F4\\u1401-\\u166C\\u166F-\\u167F\\u1681-\\u169A\\u16A0-\\u16EA\\u16EE-\\u16F0\\u1700-\\u170C\\u170E-\\u1711\\u1720-\\u1731\\u1740-\\u1751\\u1760-\\u176C\\u176E-\\u1770\\u1780-\\u17B3\\u17D7\\u17DC\\u1820-\\u1877\\u1880-\\u18A8\\u18AA\\u18B0-\\u18F5\\u1900-\\u191C\\u1950-\\u196D\\u1970-\\u1974\\u1980-\\u19AB\\u19C1-\\u19C7\\u1A00-\\u1A16\\u1A20-\\u1A54\\u1AA7\\u1B05-\\u1B33\\u1B45-\\u1B4B\\u1B83-\\u1BA0\\u1BAE\\u1BAF\\u1BBA-\\u1BE5\\u1C00-\\u1C23\\u1C4D-\\u1C4F\\u1C5A-\\u1C7D\\u1CE9-\\u1CEC\\u1CEE-\\u1CF1\\u1CF5\\u1CF6\\u1D00-\\u1DBF\\u1E00-\\u1F15\\u1F18-\\u1F1D\\u1F20-\\u1F45\\u1F48-\\u1F4D\\u1F50-\\u1F57\\u1F59\\u1F5B\\u1F5D\\u1F5F-\\u1F7D\\u1F80-\\u1FB4\\u1FB6-\\u1FBC\\u1FBE\\u1FC2-\\u1FC4\\u1FC6-\\u1FCC\\u1FD0-\\u1FD3\\u1FD6-\\u1FDB\\u1FE0-\\u1FEC\\u1FF2-\\u1FF4\\u1FF6-\\u1FFC\\u2071\\u207F\\u2090-\\u209C\\u2102\\u2107\\u210A-\\u2113\\u2115\\u2119-\\u211D\\u2124\\u2126\\u2128\\u212A-\\u212D\\u212F-\\u2139\\u213C-\\u213F\\u2145-\\u2149\\u214E\\u2160-\\u2188\\u2C00-\\u2C2E\\u2C30-\\u2C5E\\u2C60-\\u2CE4\\u2CEB-\\u2CEE\\u2CF2\\u2CF3\\u2D00-\\u2D25\\u2D27\\u2D2D\\u2D30-\\u2D67\\u2D6F\\u2D80-\\u2D96\\u2DA0-\\u2DA6\\u2DA8-\\u2DAE\\u2DB0-\\u2DB6\\u2DB8-\\u2DBE\\u2DC0-\\u2DC6\\u2DC8-\\u2DCE\\u2DD0-\\u2DD6\\u2DD8-\\u2DDE\\u2E2F\\u3005-\\u3007\\u3021-\\u3029\\u3031-\\u3035\\u3038-\\u303C\\u3041-\\u3096\\u309D-\\u309F\\u30A1-\\u30FA\\u30FC-\\u30FF\\u3105-\\u312D\\u3131-\\u318E\\u31A0-\\u31BA\\u31F0-\\u31FF\\u3400-\\u4DB5\\u4E00-\\u9FCC\\uA000-\\uA48C\\uA4D0-\\uA4FD\\uA500-\\uA60C\\uA610-\\uA61F\\uA62A\\uA62B\\uA640-\\uA66E\\uA67F-\\uA697\\uA6A0-\\uA6EF\\uA717-\\uA71F\\uA722-\\uA788\\uA78B-\\uA78E\\uA790-\\uA793\\uA7A0-\\uA7AA\\uA7F8-\\uA801\\uA803-\\uA805\\uA807-\\uA80A\\uA80C-\\uA822\\uA840-\\uA873\\uA882-\\uA8B3\\uA8F2-\\uA8F7\\uA8FB\\uA90A-\\uA925\\uA930-\\uA946\\uA960-\\uA97C\\uA984-\\uA9B2\\uA9CF\\uAA00-\\uAA28\\uAA40-\\uAA42\\uAA44-\\uAA4B\\uAA60-\\uAA76\\uAA7A\\uAA80-\\uAAAF\\uAAB1\\uAAB5\\uAAB6\\uAAB9-\\uAABD\\uAAC0\\uAAC2\\uAADB-\\uAADD\\uAAE0-\\uAAEA\\uAAF2-\\uAAF4\\uAB01-\\uAB06\\uAB09-\\uAB0E\\uAB11-\\uAB16\\uAB20-\\uAB26\\uAB28-\\uAB2E\\uABC0-\\uABE2\\uAC00-\\uD7A3\\uD7B0-\\uD7C6\\uD7CB-\\uD7FB\\uF900-\\uFA6D\\uFA70-\\uFAD9\\uFB00-\\uFB06\\uFB13-\\uFB17\\uFB1D\\uFB1F-\\uFB28\\uFB2A-\\uFB36\\uFB38-\\uFB3C\\uFB3E\\uFB40\\uFB41\\uFB43\\uFB44\\uFB46-\\uFBB1\\uFBD3-\\uFD3D\\uFD50-\\uFD8F\\uFD92-\\uFDC7\\uFDF0-\\uFDFB\\uFE70-\\uFE74\\uFE76-\\uFEFC\\uFF21-\\uFF3A\\uFF41-\\uFF5A\\uFF66-\\uFFBE\\uFFC2-\\uFFC7\\uFFCA-\\uFFCF\\uFFD2-\\uFFD7\\uFFDA-\\uFFDC]"),
                combining_mark: new RegExp("[\\u0300-\\u036F\\u0483-\\u0487\\u0591-\\u05BD\\u05BF\\u05C1\\u05C2\\u05C4\\u05C5\\u05C7\\u0610-\\u061A\\u064B-\\u065F\\u0670\\u06D6-\\u06DC\\u06DF-\\u06E4\\u06E7\\u06E8\\u06EA-\\u06ED\\u0711\\u0730-\\u074A\\u07A6-\\u07B0\\u07EB-\\u07F3\\u0816-\\u0819\\u081B-\\u0823\\u0825-\\u0827\\u0829-\\u082D\\u0859-\\u085B\\u08E4-\\u08FE\\u0900-\\u0903\\u093A-\\u093C\\u093E-\\u094F\\u0951-\\u0957\\u0962\\u0963\\u0981-\\u0983\\u09BC\\u09BE-\\u09C4\\u09C7\\u09C8\\u09CB-\\u09CD\\u09D7\\u09E2\\u09E3\\u0A01-\\u0A03\\u0A3C\\u0A3E-\\u0A42\\u0A47\\u0A48\\u0A4B-\\u0A4D\\u0A51\\u0A70\\u0A71\\u0A75\\u0A81-\\u0A83\\u0ABC\\u0ABE-\\u0AC5\\u0AC7-\\u0AC9\\u0ACB-\\u0ACD\\u0AE2\\u0AE3\\u0B01-\\u0B03\\u0B3C\\u0B3E-\\u0B44\\u0B47\\u0B48\\u0B4B-\\u0B4D\\u0B56\\u0B57\\u0B62\\u0B63\\u0B82\\u0BBE-\\u0BC2\\u0BC6-\\u0BC8\\u0BCA-\\u0BCD\\u0BD7\\u0C01-\\u0C03\\u0C3E-\\u0C44\\u0C46-\\u0C48\\u0C4A-\\u0C4D\\u0C55\\u0C56\\u0C62\\u0C63\\u0C82\\u0C83\\u0CBC\\u0CBE-\\u0CC4\\u0CC6-\\u0CC8\\u0CCA-\\u0CCD\\u0CD5\\u0CD6\\u0CE2\\u0CE3\\u0D02\\u0D03\\u0D3E-\\u0D44\\u0D46-\\u0D48\\u0D4A-\\u0D4D\\u0D57\\u0D62\\u0D63\\u0D82\\u0D83\\u0DCA\\u0DCF-\\u0DD4\\u0DD6\\u0DD8-\\u0DDF\\u0DF2\\u0DF3\\u0E31\\u0E34-\\u0E3A\\u0E47-\\u0E4E\\u0EB1\\u0EB4-\\u0EB9\\u0EBB\\u0EBC\\u0EC8-\\u0ECD\\u0F18\\u0F19\\u0F35\\u0F37\\u0F39\\u0F3E\\u0F3F\\u0F71-\\u0F84\\u0F86\\u0F87\\u0F8D-\\u0F97\\u0F99-\\u0FBC\\u0FC6\\u102B-\\u103E\\u1056-\\u1059\\u105E-\\u1060\\u1062-\\u1064\\u1067-\\u106D\\u1071-\\u1074\\u1082-\\u108D\\u108F\\u109A-\\u109D\\u135D-\\u135F\\u1712-\\u1714\\u1732-\\u1734\\u1752\\u1753\\u1772\\u1773\\u17B4-\\u17D3\\u17DD\\u180B-\\u180D\\u18A9\\u1920-\\u192B\\u1930-\\u193B\\u19B0-\\u19C0\\u19C8\\u19C9\\u1A17-\\u1A1B\\u1A55-\\u1A5E\\u1A60-\\u1A7C\\u1A7F\\u1B00-\\u1B04\\u1B34-\\u1B44\\u1B6B-\\u1B73\\u1B80-\\u1B82\\u1BA1-\\u1BAD\\u1BE6-\\u1BF3\\u1C24-\\u1C37\\u1CD0-\\u1CD2\\u1CD4-\\u1CE8\\u1CED\\u1CF2-\\u1CF4\\u1DC0-\\u1DE6\\u1DFC-\\u1DFF\\u20D0-\\u20DC\\u20E1\\u20E5-\\u20F0\\u2CEF-\\u2CF1\\u2D7F\\u2DE0-\\u2DFF\\u302A-\\u302F\\u3099\\u309A\\uA66F\\uA674-\\uA67D\\uA69F\\uA6F0\\uA6F1\\uA802\\uA806\\uA80B\\uA823-\\uA827\\uA880\\uA881\\uA8B4-\\uA8C4\\uA8E0-\\uA8F1\\uA926-\\uA92D\\uA947-\\uA953\\uA980-\\uA983\\uA9B3-\\uA9C0\\uAA29-\\uAA36\\uAA43\\uAA4C\\uAA4D\\uAA7B\\uAAB0\\uAAB2-\\uAAB4\\uAAB7\\uAAB8\\uAABE\\uAABF\\uAAC1\\uAAEB-\\uAAEF\\uAAF5\\uAAF6\\uABE3-\\uABEA\\uABEC\\uABED\\uFB1E\\uFE00-\\uFE0F\\uFE20-\\uFE26]"),
                connector_punctuation: new RegExp("[\\u005F\\u203F\\u2040\\u2054\\uFE33\\uFE34\\uFE4D-\\uFE4F\\uFF3F]"),
                digit: new RegExp("[\\u0030-\\u0039\\u0660-\\u0669\\u06F0-\\u06F9\\u07C0-\\u07C9\\u0966-\\u096F\\u09E6-\\u09EF\\u0A66-\\u0A6F\\u0AE6-\\u0AEF\\u0B66-\\u0B6F\\u0BE6-\\u0BEF\\u0C66-\\u0C6F\\u0CE6-\\u0CEF\\u0D66-\\u0D6F\\u0E50-\\u0E59\\u0ED0-\\u0ED9\\u0F20-\\u0F29\\u1040-\\u1049\\u1090-\\u1099\\u17E0-\\u17E9\\u1810-\\u1819\\u1946-\\u194F\\u19D0-\\u19D9\\u1A80-\\u1A89\\u1A90-\\u1A99\\u1B50-\\u1B59\\u1BB0-\\u1BB9\\u1C40-\\u1C49\\u1C50-\\u1C59\\uA620-\\uA629\\uA8D0-\\uA8D9\\uA900-\\uA909\\uA9D0-\\uA9D9\\uAA50-\\uAA59\\uABF0-\\uABF9\\uFF10-\\uFF19]")
            };

            function is_letter(ch) {
                return UNICODE.letter.test(ch);
            };

            function is_digit(ch) {
                ch = ch.charCodeAt(0);
                return ch >= 48 && ch <= 57;
            };

            function is_unicode_digit(ch) {
                return UNICODE.digit.test(ch);
            }

            function is_alphanumeric_char(ch) {
                return is_digit(ch) || is_letter(ch);
            };

            function is_unicode_combining_mark(ch) {
                return UNICODE.combining_mark.test(ch);
            };

            function is_unicode_connector_punctuation(ch) {
                return UNICODE.connector_punctuation.test(ch);
            };

            function is_identifier_start(ch) {
                return ch == "$" || ch == "_" || is_letter(ch);
            };

            function is_identifier_char(ch) {
                return is_identifier_start(ch)
                    || is_unicode_combining_mark(ch)
                    || is_unicode_digit(ch)
                    || is_unicode_connector_punctuation(ch)
                    || ch == "\u200c" // zero-width non-joiner <ZWNJ>
                    || ch == "\u200d" // zero-width joiner <ZWJ> (in my ECMA-262 PDF, this is also 200c)
                    ;
            };

            function parse_js_number(num) {
                if (RE_HEX_NUMBER.test(num)) {
                    return parseInt(num.substr(2), 16);
                } else if (RE_OCT_NUMBER.test(num)) {
                    return parseInt(num.substr(1), 8);
                } else if (RE_DEC_NUMBER.test(num)) {
                    return parseFloat(num);
                }
            };

            function JS_Parse_Error(message, line, col, pos) {
                this.message = message;
                this.line = line + 1;
                this.col = col + 1;
                this.pos = pos + 1;
                this.stack = new Error().stack;
            };

            JS_Parse_Error.prototype.toString = function() {
                return this.message + " (line: " + this.line + ", col: " + this.col + ", pos: " + this.pos + ")" + "\n\n" + this.stack;
            };

            function js_error(message, line, col, pos) {
                throw new JS_Parse_Error(message, line, col, pos);
            };

            function is_token(token, type, val) {
                return token.type == type && (val == null || token.value == val);
            };

            var EX_EOF = {};

            function tokenizer($TEXT) {

                var S = {
                    text            : $TEXT.replace(/\r\n?|[\n\u2028\u2029]/g, "\n").replace(/^\uFEFF/, ''),
                    pos             : 0,
                    tokpos          : 0,
                    line            : 0,
                    tokline         : 0,
                    col             : 0,
                    tokcol          : 0,
                    newline_before  : false,
                    regex_allowed   : false,
                    comments_before : []
                };

                function peek() { return S.text.charAt(S.pos); };

                function next(signal_eof, in_string) {
                    var ch = S.text.charAt(S.pos++);
                    if (signal_eof && !ch)
                        throw EX_EOF;
                    if (ch == "\n") {
                        S.newline_before = S.newline_before || !in_string;
                        ++S.line;
                        S.col = 0;
                    } else {
                        ++S.col;
                    }
                    return ch;
                };

                function eof() {
                    return !S.peek();
                };

                function find(what, signal_eof) {
                    var pos = S.text.indexOf(what, S.pos);
                    if (signal_eof && pos == -1) throw EX_EOF;
                    return pos;
                };

                function start_token() {
                    S.tokline = S.line;
                    S.tokcol = S.col;
                    S.tokpos = S.pos;
                };

                function token(type, value, is_comment) {
                    S.regex_allowed = ((type == "operator" && !HOP(UNARY_POSTFIX, value)) ||
                    (type == "keyword" && HOP(KEYWORDS_BEFORE_EXPRESSION, value)) ||
                    (type == "punc" && HOP(PUNC_BEFORE_EXPRESSION, value)));
                    var ret = {
                        type   : type,
                        value  : value,
                        line   : S.tokline,
                        col    : S.tokcol,
                        pos    : S.tokpos,
                        endpos : S.pos,
                        nlb    : S.newline_before
                    };
                    if (!is_comment) {
                        ret.comments_before = S.comments_before;
                        S.comments_before = [];
                        // make note of any newlines in the comments that came before
                        for (var i = 0, len = ret.comments_before.length; i < len; i++) {
                            ret.nlb = ret.nlb || ret.comments_before[i].nlb;
                        }
                    }
                    S.newline_before = false;
                    return ret;
                };

                function skip_whitespace() {
                    while (HOP(WHITESPACE_CHARS, peek()))
                        next();
                };

                function read_while(pred) {
                    var ret = "", ch = peek(), i = 0;
                    while (ch && pred(ch, i++)) {
                        ret += next();
                        ch = peek();
                    }
                    return ret;
                };

                function parse_error(err) {
                    js_error(err, S.tokline, S.tokcol, S.tokpos);
                };

                function read_num(prefix) {
                    var has_e = false, after_e = false, has_x = false, has_dot = prefix == ".";
                    var num = read_while(function(ch, i){
                        if (ch == "x" || ch == "X") {
                            if (has_x) return false;
                            return has_x = true;
                        }
                        if (!has_x && (ch == "E" || ch == "e")) {
                            if (has_e) return false;
                            return has_e = after_e = true;
                        }
                        if (ch == "-") {
                            if (after_e || (i == 0 && !prefix)) return true;
                            return false;
                        }
                        if (ch == "+") return after_e;
                        after_e = false;
                        if (ch == ".") {
                            if (!has_dot && !has_x && !has_e)
                                return has_dot = true;
                            return false;
                        }
                        return is_alphanumeric_char(ch);
                    });
                    if (prefix)
                        num = prefix + num;
                    var valid = parse_js_number(num);
                    if (!isNaN(valid)) {
                        return token("num", valid);
                    } else {
                        parse_error("Invalid syntax: " + num);
                    }
                };

                function read_escaped_char(in_string) {
                    var ch = next(true, in_string);
                    switch (ch) {
                        case "n" : return "\n";
                        case "r" : return "\r";
                        case "t" : return "\t";
                        case "b" : return "\b";
                        case "v" : return "\u000b";
                        case "f" : return "\f";
                        case "0" : return "\0";
                        case "x" : return String.fromCharCode(hex_bytes(2));
                        case "u" : return String.fromCharCode(hex_bytes(4));
                        case "\n": return "";
                        default  : return ch;
                    }
                };

                function hex_bytes(n) {
                    var num = 0;
                    for (; n > 0; --n) {
                        var digit = parseInt(next(true), 16);
                        if (isNaN(digit))
                            parse_error("Invalid hex-character pattern in string");
                        num = (num << 4) | digit;
                    }
                    return num;
                };

                function read_string() {
                    return with_eof_error("Unterminated string constant", function(){
                        var quote = next(), ret = "";
                        for (;;) {
                            var ch = next(true);
                            if (ch == "\\") {
                                // read OctalEscapeSequence (XXX: deprecated if "strict mode")
                                // https://github.com/mishoo/UglifyJS/issues/178
                                var octal_len = 0, first = null;
                                ch = read_while(function(ch){
                                    if (ch >= "0" && ch <= "7") {
                                        if (!first) {
                                            first = ch;
                                            return ++octal_len;
                                        }
                                        else if (first <= "3" && octal_len <= 2) return ++octal_len;
                                        else if (first >= "4" && octal_len <= 1) return ++octal_len;
                                    }
                                    return false;
                                });
                                if (octal_len > 0) ch = String.fromCharCode(parseInt(ch, 8));
                                else ch = read_escaped_char(true);
                            }
                            else if (ch == quote) break;
                            else if (ch == "\n") throw EX_EOF;
                            ret += ch;
                        }
                        return token("string", ret);
                    });
                };

                function read_line_comment() {
                    next();
                    var i = find("\n"), ret;
                    if (i == -1) {
                        ret = S.text.substr(S.pos);
                        S.pos = S.text.length;
                    } else {
                        ret = S.text.substring(S.pos, i);
                        S.pos = i;
                    }
                    return token("comment1", ret, true);
                };

                function read_multiline_comment() {
                    next();
                    return with_eof_error("Unterminated multiline comment", function(){
                        var i = find("*/", true),
                            text = S.text.substring(S.pos, i);
                        S.pos = i + 2;
                        S.line += text.split("\n").length - 1;
                        S.newline_before = S.newline_before || text.indexOf("\n") >= 0;

                        // https://github.com/mishoo/UglifyJS/issues/#issue/100
                        if (/^@cc_on/i.test(text)) {
                            warn("WARNING: at line " + S.line);
                            warn("*** Found \"conditional comment\": " + text);
                            warn("*** UglifyJS DISCARDS ALL COMMENTS.  This means your code might no longer work properly in Internet Explorer.");
                        }

                        return token("comment2", text, true);
                    });
                };

                function read_name() {
                    var backslash = false, name = "", ch, escaped = false, hex;
                    while ((ch = peek()) != null) {
                        if (!backslash) {
                            if (ch == "\\") escaped = backslash = true, next();
                            else if (is_identifier_char(ch)) name += next();
                            else break;
                        }
                        else {
                            if (ch != "u") parse_error("Expecting UnicodeEscapeSequence -- uXXXX");
                            ch = read_escaped_char();
                            if (!is_identifier_char(ch)) parse_error("Unicode char: " + ch.charCodeAt(0) + " is not valid in identifier");
                            name += ch;
                            backslash = false;
                        }
                    }
                    if (HOP(KEYWORDS, name) && escaped) {
                        hex = name.charCodeAt(0).toString(16).toUpperCase();
                        name = "\\u" + "0000".substr(hex.length) + hex + name.slice(1);
                    }
                    return name;
                };

                function read_regexp(regexp) {
                    return with_eof_error("Unterminated regular expression", function(){
                        var prev_backslash = false, ch, in_class = false;
                        while ((ch = next(true))) if (prev_backslash) {
                            regexp += "\\" + ch;
                            prev_backslash = false;
                        } else if (ch == "[") {
                            in_class = true;
                            regexp += ch;
                        } else if (ch == "]" && in_class) {
                            in_class = false;
                            regexp += ch;
                        } else if (ch == "/" && !in_class) {
                            break;
                        } else if (ch == "\\") {
                            prev_backslash = true;
                        } else {
                            regexp += ch;
                        }
                        var mods = read_name();
                        return token("regexp", [ regexp, mods ]);
                    });
                };

                function read_operator(prefix) {
                    function grow(op) {
                        if (!peek()) return op;
                        var bigger = op + peek();
                        if (HOP(OPERATORS, bigger)) {
                            next();
                            return grow(bigger);
                        } else {
                            return op;
                        }
                    };
                    return token("operator", grow(prefix || next()));
                };

                function handle_slash() {
                    next();
                    var regex_allowed = S.regex_allowed;
                    switch (peek()) {
                        case "/":
                            S.comments_before.push(read_line_comment());
                            S.regex_allowed = regex_allowed;
                            return next_token();
                        case "*":
                            S.comments_before.push(read_multiline_comment());
                            S.regex_allowed = regex_allowed;
                            return next_token();
                    }
                    return S.regex_allowed ? read_regexp("") : read_operator("/");
                };

                function handle_dot() {
                    next();
                    return is_digit(peek())
                        ? read_num(".")
                        : token("punc", ".");
                };

                function read_word() {
                    var word = read_name();
                    return !HOP(KEYWORDS, word)
                        ? token("name", word)
                        : HOP(OPERATORS, word)
                        ? token("operator", word)
                        : HOP(KEYWORDS_ATOM, word)
                        ? token("atom", word)
                        : token("keyword", word);
                };

                function with_eof_error(eof_error, cont) {
                    try {
                        return cont();
                    } catch(ex) {
                        if (ex === EX_EOF) parse_error(eof_error);
                        else throw ex;
                    }
                };

                function next_token(force_regexp) {
                    if (force_regexp != null)
                        return read_regexp(force_regexp);
                    skip_whitespace();
                    start_token();
                    var ch = peek();
                    if (!ch) return token("eof");
                    if (is_digit(ch)) return read_num();
                    if (ch == '"' || ch == "'") return read_string();
                    if (HOP(PUNC_CHARS, ch)) return token("punc", next());
                    if (ch == ".") return handle_dot();
                    if (ch == "/") return handle_slash();
                    if (HOP(OPERATOR_CHARS, ch)) return read_operator();
                    if (ch == "\\" || is_identifier_start(ch)) return read_word();
                    parse_error("Unexpected character '" + ch + "'");
                };

                next_token.context = function(nc) {
                    if (nc) S = nc;
                    return S;
                };

                return next_token;

            };

            /* -----[ Parser (constants) ]----- */

            var UNARY_PREFIX = array_to_hash([
                "typeof",
                "void",
                "delete",
                "--",
                "++",
                "!",
                "~",
                "-",
                "+"
            ]);

            var UNARY_POSTFIX = array_to_hash([ "--", "++" ]);

            var ASSIGNMENT = (function(a, ret, i){
                while (i < a.length) {
                    ret[a[i]] = a[i].substr(0, a[i].length - 1);
                    i++;
                }
                return ret;
            })(
                ["+=", "-=", "/=", "*=", "%=", ">>=", "<<=", ">>>=", "|=", "^=", "&="],
                { "=": true },
                0
            );

            var PRECEDENCE = (function(a, ret){
                for (var i = 0, n = 1; i < a.length; ++i, ++n) {
                    var b = a[i];
                    for (var j = 0; j < b.length; ++j) {
                        ret[b[j]] = n;
                    }
                }
                return ret;
            })(
                [
                    ["||"],
                    ["&&"],
                    ["|"],
                    ["^"],
                    ["&"],
                    ["==", "===", "!=", "!=="],
                    ["<", ">", "<=", ">=", "in", "instanceof"],
                    [">>", "<<", ">>>"],
                    ["+", "-"],
                    ["*", "/", "%"]
                ],
                {}
            );

            var STATEMENTS_WITH_LABELS = array_to_hash([ "for", "do", "while", "switch" ]);

            var ATOMIC_START_TOKEN = array_to_hash([ "atom", "num", "string", "regexp", "name" ]);

            /* -----[ Parser ]----- */

            function NodeWithToken(str, start, end) {
                this.name = str;
                this.start = start;
                this.end = end;
            };

            NodeWithToken.prototype.toString = function() { return this.name; };

            function parse($TEXT, exigent_mode, embed_tokens) {

                var S = {
                    input         : typeof $TEXT == "string" ? tokenizer($TEXT, true) : $TEXT,
                    token         : null,
                    prev          : null,
                    peeked        : null,
                    in_function   : 0,
                    in_directives : true,
                    in_loop       : 0,
                    labels        : []
                };

                S.token = next();

                function is(type, value) {
                    return is_token(S.token, type, value);
                };

                function peek() { return S.peeked || (S.peeked = S.input()); };

                function next() {
                    S.prev = S.token;
                    if (S.peeked) {
                        S.token = S.peeked;
                        S.peeked = null;
                    } else {
                        S.token = S.input();
                    }
                    S.in_directives = S.in_directives && (
                            S.token.type == "string" || is("punc", ";")
                        );
                    return S.token;
                };

                function prev() {
                    return S.prev;
                };

                function croak(msg, line, col, pos) {
                    var ctx = S.input.context();
                    js_error(msg,
                        line != null ? line : ctx.tokline,
                        col != null ? col : ctx.tokcol,
                        pos != null ? pos : ctx.tokpos);
                };

                function token_error(token, msg) {
                    croak(msg, token.line, token.col);
                };

                function unexpected(token) {
                    if (token == null)
                        token = S.token;
                    token_error(token, "Unexpected token: " + token.type + " (" + token.value + ")");
                };

                function expect_token(type, val) {
                    if (is(type, val)) {
                        return next();
                    }
                    token_error(S.token, "Unexpected token " + S.token.type + ", expected " + type);
                };

                function expect(punc) { return expect_token("punc", punc); };

                function can_insert_semicolon() {
                    return !exigent_mode && (
                            S.token.nlb || is("eof") || is("punc", "}")
                        );
                };

                function semicolon() {
                    if (is("punc", ";")) next();
                    else if (!can_insert_semicolon()) unexpected();
                };

                function as() {
                    return slice(arguments);
                };

                function parenthesised() {
                    expect("(");
                    var ex = expression();
                    expect(")");
                    return ex;
                };

                function add_tokens(str, start, end) {
                    return str instanceof NodeWithToken ? str : new NodeWithToken(str, start, end);
                };

                function maybe_embed_tokens(parser) {
                    if (embed_tokens) return function() {
                        var start = S.token;
                        var ast = parser.apply(this, arguments);
                        ast[0] = add_tokens(ast[0], start, prev());
                        return ast;
                    };
                    else return parser;
                };

                var statement = maybe_embed_tokens(function() {
                    if (is("operator", "/") || is("operator", "/=")) {
                        S.peeked = null;
                        S.token = S.input(S.token.value.substr(1)); // force regexp
                    }
                    switch (S.token.type) {
                        case "string":
                            var dir = S.in_directives, stat = simple_statement();
                            if (dir && stat[1][0] == "string" && !is("punc", ","))
                                return as("directive", stat[1][1]);
                            return stat;
                        case "num":
                        case "regexp":
                        case "operator":
                        case "atom":
                            return simple_statement();

                        case "name":
                            return is_token(peek(), "punc", ":")
                                ? labeled_statement(prog1(S.token.value, next, next))
                                : simple_statement();

                        case "punc":
                            switch (S.token.value) {
                                case "{":
                                    return as("block", block_());
                                case "[":
                                case "(":
                                    return simple_statement();
                                case ";":
                                    next();
                                    return as("block");
                                default:
                                    unexpected();
                            }

                        case "keyword":
                            switch (prog1(S.token.value, next)) {
                                case "break":
                                    return break_cont("break");

                                case "continue":
                                    return break_cont("continue");

                                case "debugger":
                                    semicolon();
                                    return as("debugger");

                                case "do":
                                    return (function(body){
                                        expect_token("keyword", "while");
                                        return as("do", prog1(parenthesised, semicolon), body);
                                    })(in_loop(statement));

                                case "for":
                                    return for_();

                                case "function":
                                    return function_(true);

                                case "if":
                                    return if_();

                                case "return":
                                    if (S.in_function == 0)
                                        croak("'return' outside of function");
                                    return as("return",
                                        is("punc", ";")
                                            ? (next(), null)
                                            : can_insert_semicolon()
                                            ? null
                                            : prog1(expression, semicolon));

                                case "switch":
                                    return as("switch", parenthesised(), switch_block_());

                                case "throw":
                                    if (S.token.nlb)
                                        croak("Illegal newline after 'throw'");
                                    return as("throw", prog1(expression, semicolon));

                                case "try":
                                    return try_();

                                case "var":
                                    return prog1(var_, semicolon);

                                case "const":
                                    return prog1(const_, semicolon);

                                case "while":
                                    return as("while", parenthesised(), in_loop(statement));

                                case "with":
                                    return as("with", parenthesised(), statement());

                                default:
                                    unexpected();
                            }
                    }
                });

                function labeled_statement(label) {
                    S.labels.push(label);
                    var start = S.token, stat = statement();
                    if (exigent_mode && !HOP(STATEMENTS_WITH_LABELS, stat[0]))
                        unexpected(start);
                    S.labels.pop();
                    return as("label", label, stat);
                };

                function simple_statement() {
                    return as("stat", prog1(expression, semicolon));
                };

                function break_cont(type) {
                    var name;
                    if (!can_insert_semicolon()) {
                        name = is("name") ? S.token.value : null;
                    }
                    if (name != null) {
                        next();
                        if (!member(name, S.labels))
                            croak("Label " + name + " without matching loop or statement");
                    }
                    else if (S.in_loop == 0)
                        croak(type + " not inside a loop or switch");
                    semicolon();
                    return as(type, name);
                };

                function for_() {
                    expect("(");
                    var init = null;
                    if (!is("punc", ";")) {
                        init = is("keyword", "var")
                            ? (next(), var_(true))
                            : expression(true, true);
                        if (is("operator", "in")) {
                            if (init[0] == "var" && init[1].length > 1)
                                croak("Only one variable declaration allowed in for..in loop");
                            return for_in(init);
                        }
                    }
                    return regular_for(init);
                };

                function regular_for(init) {
                    expect(";");
                    var test = is("punc", ";") ? null : expression();
                    expect(";");
                    var step = is("punc", ")") ? null : expression();
                    expect(")");
                    return as("for", init, test, step, in_loop(statement));
                };

                function for_in(init) {
                    var lhs = init[0] == "var" ? as("name", init[1][0]) : init;
                    next();
                    var obj = expression();
                    expect(")");
                    return as("for-in", init, lhs, obj, in_loop(statement));
                };

                var function_ = function(in_statement) {
                    var name = is("name") ? prog1(S.token.value, next) : null;
                    if (in_statement && !name)
                        unexpected();
                    expect("(");
                    return as(in_statement ? "defun" : "function",
                        name,
                        // arguments
                        (function(first, a){
                            while (!is("punc", ")")) {
                                if (first) first = false; else expect(",");
                                if (!is("name")) unexpected();
                                a.push(S.token.value);
                                next();
                            }
                            next();
                            return a;
                        })(true, []),
                        // body
                        (function(){
                            ++S.in_function;
                            var loop = S.in_loop;
                            S.in_directives = true;
                            S.in_loop = 0;
                            var a = block_();
                            --S.in_function;
                            S.in_loop = loop;
                            return a;
                        })());
                };

                function if_() {
                    var cond = parenthesised(), body = statement(), belse;
                    if (is("keyword", "else")) {
                        next();
                        belse = statement();
                    }
                    return as("if", cond, body, belse);
                };

                function block_() {
                    expect("{");
                    var a = [];
                    while (!is("punc", "}")) {
                        if (is("eof")) unexpected();
                        a.push(statement());
                    }
                    next();
                    return a;
                };

                var switch_block_ = curry(in_loop, function(){
                    expect("{");
                    var a = [], cur = null;
                    while (!is("punc", "}")) {
                        if (is("eof")) unexpected();
                        if (is("keyword", "case")) {
                            next();
                            cur = [];
                            a.push([ expression(), cur ]);
                            expect(":");
                        }
                        else if (is("keyword", "default")) {
                            next();
                            expect(":");
                            cur = [];
                            a.push([ null, cur ]);
                        }
                        else {
                            if (!cur) unexpected();
                            cur.push(statement());
                        }
                    }
                    next();
                    return a;
                });

                function try_() {
                    var body = block_(), bcatch, bfinally;
                    if (is("keyword", "catch")) {
                        next();
                        expect("(");
                        if (!is("name"))
                            croak("Name expected");
                        var name = S.token.value;
                        next();
                        expect(")");
                        bcatch = [ name, block_() ];
                    }
                    if (is("keyword", "finally")) {
                        next();
                        bfinally = block_();
                    }
                    if (!bcatch && !bfinally)
                        croak("Missing catch/finally blocks");
                    return as("try", body, bcatch, bfinally);
                };

                function vardefs(no_in) {
                    var a = [];
                    for (;;) {
                        if (!is("name"))
                            unexpected();
                        var name = S.token.value;
                        next();
                        if (is("operator", "=")) {
                            next();
                            a.push([ name, expression(false, no_in) ]);
                        } else {
                            a.push([ name ]);
                        }
                        if (!is("punc", ","))
                            break;
                        next();
                    }
                    return a;
                };

                function var_(no_in) {
                    return as("var", vardefs(no_in));
                };

                function const_() {
                    return as("const", vardefs());
                };

                function new_() {
                    var newexp = expr_atom(false), args;
                    if (is("punc", "(")) {
                        next();
                        args = expr_list(")");
                    } else {
                        args = [];
                    }
                    return subscripts(as("new", newexp, args), true);
                };

                var expr_atom = maybe_embed_tokens(function(allow_calls) {
                    if (is("operator", "new")) {
                        next();
                        return new_();
                    }
                    if (is("punc")) {
                        switch (S.token.value) {
                            case "(":
                                next();
                                return subscripts(prog1(expression, curry(expect, ")")), allow_calls);
                            case "[":
                                next();
                                return subscripts(array_(), allow_calls);
                            case "{":
                                next();
                                return subscripts(object_(), allow_calls);
                        }
                        unexpected();
                    }
                    if (is("keyword", "function")) {
                        next();
                        return subscripts(function_(false), allow_calls);
                    }
                    if (HOP(ATOMIC_START_TOKEN, S.token.type)) {
                        var atom = S.token.type == "regexp"
                            ? as("regexp", S.token.value[0], S.token.value[1])
                            : as(S.token.type, S.token.value);
                        return subscripts(prog1(atom, next), allow_calls);
                    }
                    unexpected();
                });

                function expr_list(closing, allow_trailing_comma, allow_empty) {
                    var first = true, a = [];
                    while (!is("punc", closing)) {
                        if (first) first = false; else expect(",");
                        if (allow_trailing_comma && is("punc", closing)) break;
                        if (is("punc", ",") && allow_empty) {
                            a.push([ "atom", "undefined" ]);
                        } else {
                            a.push(expression(false));
                        }
                    }
                    next();
                    return a;
                };

                function array_() {
                    return as("array", expr_list("]", !exigent_mode, true));
                };

                function object_() {
                    var first = true, a = [];
                    while (!is("punc", "}")) {
                        if (first) first = false; else expect(",");
                        if (!exigent_mode && is("punc", "}"))
                        // allow trailing comma
                            break;
                        var type = S.token.type;
                        var name = as_property_name();
                        if (type == "name" && (name == "get" || name == "set") && !is("punc", ":")) {
                            a.push([ as_name(), function_(false), name ]);
                        } else {
                            expect(":");
                            a.push([ name, expression(false) ]);
                        }
                    }
                    next();
                    return as("object", a);
                };

                function as_property_name() {
                    switch (S.token.type) {
                        case "num":
                        case "string":
                            return prog1(S.token.value, next);
                    }
                    return as_name();
                };

                function as_name() {
                    switch (S.token.type) {
                        case "name":
                        case "operator":
                        case "keyword":
                        case "atom":
                            return prog1(S.token.value, next);
                        default:
                            unexpected();
                    }
                };

                function subscripts(expr, allow_calls) {
                    if (is("punc", ".")) {
                        next();
                        return subscripts(as("dot", expr, as_name()), allow_calls);
                    }
                    if (is("punc", "[")) {
                        next();
                        return subscripts(as("sub", expr, prog1(expression, curry(expect, "]"))), allow_calls);
                    }
                    if (allow_calls && is("punc", "(")) {
                        next();
                        return subscripts(as("call", expr, expr_list(")")), true);
                    }
                    return expr;
                };

                function maybe_unary(allow_calls) {
                    if (is("operator") && HOP(UNARY_PREFIX, S.token.value)) {
                        return make_unary("unary-prefix",
                            prog1(S.token.value, next),
                            maybe_unary(allow_calls));
                    }
                    var val = expr_atom(allow_calls);
                    while (is("operator") && HOP(UNARY_POSTFIX, S.token.value) && !S.token.nlb) {
                        val = make_unary("unary-postfix", S.token.value, val);
                        next();
                    }
                    return val;
                };

                function make_unary(tag, op, expr) {
                    if ((op == "++" || op == "--") && !is_assignable(expr))
                        croak("Invalid use of " + op + " operator");
                    return as(tag, op, expr);
                };

                function expr_op(left, min_prec, no_in) {
                    var op = is("operator") ? S.token.value : null;
                    if (op && op == "in" && no_in) op = null;
                    var prec = op != null ? PRECEDENCE[op] : null;
                    if (prec != null && prec > min_prec) {
                        next();
                        var right = expr_op(maybe_unary(true), prec, no_in);
                        return expr_op(as("binary", op, left, right), min_prec, no_in);
                    }
                    return left;
                };

                function expr_ops(no_in) {
                    return expr_op(maybe_unary(true), 0, no_in);
                };

                function maybe_conditional(no_in) {
                    var expr = expr_ops(no_in);
                    if (is("operator", "?")) {
                        next();
                        var yes = expression(false);
                        expect(":");
                        return as("conditional", expr, yes, expression(false, no_in));
                    }
                    return expr;
                };

                function is_assignable(expr) {
                    if (!exigent_mode) return true;
                    switch (expr[0]+"") {
                        case "dot":
                        case "sub":
                        case "new":
                        case "call":
                            return true;
                        case "name":
                            return expr[1] != "this";
                    }
                };

                function maybe_assign(no_in) {
                    var left = maybe_conditional(no_in), val = S.token.value;
                    if (is("operator") && HOP(ASSIGNMENT, val)) {
                        if (is_assignable(left)) {
                            next();
                            return as("assign", ASSIGNMENT[val], left, maybe_assign(no_in));
                        }
                        croak("Invalid assignment");
                    }
                    return left;
                };

                var expression = maybe_embed_tokens(function(commas, no_in) {
                    if (arguments.length == 0)
                        commas = true;
                    var expr = maybe_assign(no_in);
                    if (commas && is("punc", ",")) {
                        next();
                        return as("seq", expr, expression(true, no_in));
                    }
                    return expr;
                });

                function in_loop(cont) {
                    try {
                        ++S.in_loop;
                        return cont();
                    } finally {
                        --S.in_loop;
                    }
                };

                return as("toplevel", (function(a){
                    while (!is("eof"))
                        a.push(statement());
                    return a;
                })([]));

            };

            /* -----[ Utilities ]----- */

            function curry(f) {
                var args = slice(arguments, 1);
                return function() { return f.apply(this, args.concat(slice(arguments))); };
            };

            function prog1(ret) {
                if (ret instanceof Function)
                    ret = ret();
                for (var i = 1, n = arguments.length; --n > 0; ++i)
                    arguments[i]();
                return ret;
            };

            function array_to_hash(a) {
                var ret = {};
                for (var i = 0; i < a.length; ++i)
                    ret[a[i]] = true;
                return ret;
            };

            function slice(a, start) {
                return Array.prototype.slice.call(a, start || 0);
            };

            function characters(str) {
                return str.split("");
            };

            function member(name, array) {
                for (var i = array.length; --i >= 0;)
                    if (array[i] == name)
                        return true;
                return false;
            };

            function HOP(obj, prop) {
                return Object.prototype.hasOwnProperty.call(obj, prop);
            };

            var warn = function() {};

            /* -----[ Exports ]----- */

            exports.tokenizer = tokenizer;
            exports.parse = parse;
            exports.slice = slice;
            exports.curry = curry;
            exports.member = member;
            exports.array_to_hash = array_to_hash;
            exports.PRECEDENCE = PRECEDENCE;
            exports.KEYWORDS_ATOM = KEYWORDS_ATOM;
            exports.RESERVED_WORDS = RESERVED_WORDS;
            exports.KEYWORDS = KEYWORDS;
            exports.ATOMIC_START_TOKEN = ATOMIC_START_TOKEN;
            exports.OPERATORS = OPERATORS;
            exports.is_alphanumeric_char = is_alphanumeric_char;
            exports.is_identifier_start = is_identifier_start;
            exports.is_identifier_char = is_identifier_char;
            exports.set_logger = function(logger) {
                warn = logger;
            };

// Local variables:
// js-indent-level: 4
// End:
        });define('uglifyjs/squeeze-more', ["require", "exports", "module", "./parse-js", "./squeeze-more"], function(require, exports, module) {
            var jsp = require("./parse-js"),
                pro = require("./process"),
                slice = jsp.slice,
                member = jsp.member,
                curry = jsp.curry,
                MAP = pro.MAP,
                PRECEDENCE = jsp.PRECEDENCE,
                OPERATORS = jsp.OPERATORS;

            function ast_squeeze_more(ast) {
                var w = pro.ast_walker(), walk = w.walk, scope;
                function with_scope(s, cont) {
                    var save = scope, ret;
                    scope = s;
                    ret = cont();
                    scope = save;
                    return ret;
                };
                function _lambda(name, args, body) {
                    return [ this[0], name, args, with_scope(body.scope, curry(MAP, body, walk)) ];
                };
                return w.with_walkers({
                    "toplevel": function(body) {
                        return [ this[0], with_scope(this.scope, curry(MAP, body, walk)) ];
                    },
                    "function": _lambda,
                    "defun": _lambda,
                    "new": function(ctor, args) {
                        if (ctor[0] == "name") {
                            if (ctor[1] == "Array" && !scope.has("Array")) {
                                if (args.length != 1) {
                                    return [ "array", args ];
                                } else {
                                    return walk([ "call", [ "name", "Array" ], args ]);
                                }
                            } else if (ctor[1] == "Object" && !scope.has("Object")) {
                                if (!args.length) {
                                    return [ "object", [] ];
                                } else {
                                    return walk([ "call", [ "name", "Object" ], args ]);
                                }
                            } else if ((ctor[1] == "RegExp" || ctor[1] == "Function" || ctor[1] == "Error") && !scope.has(ctor[1])) {
                                return walk([ "call", [ "name", ctor[1] ], args]);
                            }
                        }
                    },
                    "call": function(expr, args) {
                        if (expr[0] == "dot" && expr[1][0] == "string" && args.length == 1
                            && (args[0][1] > 0 && expr[2] == "substring" || expr[2] == "substr")) {
                            return [ "call", [ "dot", expr[1], "slice"], args];
                        }
                        if (expr[0] == "dot" && expr[2] == "toString" && args.length == 0) {
                            // foo.toString()  ==>  foo+""
                            if (expr[1][0] == "string") return expr[1];
                            return [ "binary", "+", expr[1], [ "string", "" ]];
                        }
                        if (expr[0] == "name") {
                            if (expr[1] == "Array" && args.length != 1 && !scope.has("Array")) {
                                return [ "array", args ];
                            }
                            if (expr[1] == "Object" && !args.length && !scope.has("Object")) {
                                return [ "object", [] ];
                            }
                            if (expr[1] == "String" && !scope.has("String")) {
                                return [ "binary", "+", args[0], [ "string", "" ]];
                            }
                        }
                    }
                }, function() {
                    return walk(pro.ast_add_scope(ast));
                });
            };

            exports.ast_squeeze_more = ast_squeeze_more;

// Local variables:
// js-indent-level: 4
// End:
        });
        define('uglifyjs/process', ["require", "exports", "module", "./parse-js", "./squeeze-more"], function(require, exports, module) {
            /***********************************************************************

             A JavaScript tokenizer / parser / beautifier / compressor.

             This version is suitable for Node.js.  With minimal changes (the
             exports stuff) it should work on any JS platform.

             This file implements some AST processors.  They work on data built
             by parse-js.

             Exported functions:

             - ast_mangle(ast, options) -- mangles the variable/function names
             in the AST.  Returns an AST.

             - ast_squeeze(ast) -- employs various optimizations to make the
             final generated code even smaller.  Returns an AST.

             - gen_code(ast, options) -- generates JS code from the AST.  Pass
             true (or an object, see the code for some options) as second
             argument to get "pretty" (indented) code.

             -------------------------------- (C) ---------------------------------

             Author: Mihai Bazon
             <mihai.bazon@gmail.com>
             http://mihai.bazon.net/blog

             Distributed under the BSD license:

             Copyright 2010 (c) Mihai Bazon <mihai.bazon@gmail.com>

             Redistribution and use in source and binary forms, with or without
             modification, are permitted provided that the following conditions
             are met:

             * Redistributions of source code must retain the above
             copyright notice, this list of conditions and the following
             disclaimer.

             * Redistributions in binary form must reproduce the above
             copyright notice, this list of conditions and the following
             disclaimer in the documentation and/or other materials
             provided with the distribution.

             THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDER â€œAS ISâ€ AND ANY
             EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
             IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
             PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE
             LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY,
             OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
             PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
             PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
             THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
             TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF
             THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
             SUCH DAMAGE.

             ***********************************************************************/

            var jsp = require("./parse-js"),
                curry = jsp.curry,
                slice = jsp.slice,
                member = jsp.member,
                is_identifier_char = jsp.is_identifier_char,
                PRECEDENCE = jsp.PRECEDENCE,
                OPERATORS = jsp.OPERATORS;

            /* -----[ helper for AST traversal ]----- */

            function ast_walker() {
                function _vardefs(defs) {
                    return [ this[0], MAP(defs, function(def){
                        var a = [ def[0] ];
                        if (def.length > 1)
                            a[1] = walk(def[1]);
                        return a;
                    }) ];
                };
                function _block(statements) {
                    var out = [ this[0] ];
                    if (statements != null)
                        out.push(MAP(statements, walk));
                    return out;
                };
                var walkers = {
                    "string": function(str) {
                        return [ this[0], str ];
                    },
                    "num": function(num) {
                        return [ this[0], num ];
                    },
                    "name": function(name) {
                        return [ this[0], name ];
                    },
                    "toplevel": function(statements) {
                        return [ this[0], MAP(statements, walk) ];
                    },
                    "block": _block,
                    "splice": _block,
                    "var": _vardefs,
                    "const": _vardefs,
                    "try": function(t, c, f) {
                        return [
                            this[0],
                            MAP(t, walk),
                            c != null ? [ c[0], MAP(c[1], walk) ] : null,
                            f != null ? MAP(f, walk) : null
                        ];
                    },
                    "throw": function(expr) {
                        return [ this[0], walk(expr) ];
                    },
                    "new": function(ctor, args) {
                        return [ this[0], walk(ctor), MAP(args, walk) ];
                    },
                    "switch": function(expr, body) {
                        return [ this[0], walk(expr), MAP(body, function(branch){
                            return [ branch[0] ? walk(branch[0]) : null,
                                MAP(branch[1], walk) ];
                        }) ];
                    },
                    "break": function(label) {
                        return [ this[0], label ];
                    },
                    "continue": function(label) {
                        return [ this[0], label ];
                    },
                    "conditional": function(cond, t, e) {
                        return [ this[0], walk(cond), walk(t), walk(e) ];
                    },
                    "assign": function(op, lvalue, rvalue) {
                        return [ this[0], op, walk(lvalue), walk(rvalue) ];
                    },
                    "dot": function(expr) {
                        return [ this[0], walk(expr) ].concat(slice(arguments, 1));
                    },
                    "call": function(expr, args) {
                        return [ this[0], walk(expr), MAP(args, walk) ];
                    },
                    "function": function(name, args, body) {
                        return [ this[0], name, args.slice(), MAP(body, walk) ];
                    },
                    "debugger": function() {
                        return [ this[0] ];
                    },
                    "defun": function(name, args, body) {
                        return [ this[0], name, args.slice(), MAP(body, walk) ];
                    },
                    "if": function(conditional, t, e) {
                        return [ this[0], walk(conditional), walk(t), walk(e) ];
                    },
                    "for": function(init, cond, step, block) {
                        return [ this[0], walk(init), walk(cond), walk(step), walk(block) ];
                    },
                    "for-in": function(vvar, key, hash, block) {
                        return [ this[0], walk(vvar), walk(key), walk(hash), walk(block) ];
                    },
                    "while": function(cond, block) {
                        return [ this[0], walk(cond), walk(block) ];
                    },
                    "do": function(cond, block) {
                        return [ this[0], walk(cond), walk(block) ];
                    },
                    "return": function(expr) {
                        return [ this[0], walk(expr) ];
                    },
                    "binary": function(op, left, right) {
                        return [ this[0], op, walk(left), walk(right) ];
                    },
                    "unary-prefix": function(op, expr) {
                        return [ this[0], op, walk(expr) ];
                    },
                    "unary-postfix": function(op, expr) {
                        return [ this[0], op, walk(expr) ];
                    },
                    "sub": function(expr, subscript) {
                        return [ this[0], walk(expr), walk(subscript) ];
                    },
                    "object": function(props) {
                        return [ this[0], MAP(props, function(p){
                            return p.length == 2
                                ? [ p[0], walk(p[1]) ]
                                : [ p[0], walk(p[1]), p[2] ]; // get/set-ter
                        }) ];
                    },
                    "regexp": function(rx, mods) {
                        return [ this[0], rx, mods ];
                    },
                    "array": function(elements) {
                        return [ this[0], MAP(elements, walk) ];
                    },
                    "stat": function(stat) {
                        return [ this[0], walk(stat) ];
                    },
                    "seq": function() {
                        return [ this[0] ].concat(MAP(slice(arguments), walk));
                    },
                    "label": function(name, block) {
                        return [ this[0], name, walk(block) ];
                    },
                    "with": function(expr, block) {
                        return [ this[0], walk(expr), walk(block) ];
                    },
                    "atom": function(name) {
                        return [ this[0], name ];
                    },
                    "directive": function(dir) {
                        return [ this[0], dir ];
                    }
                };

                var user = {};
                var stack = [];
                function walk(ast) {
                    if (ast == null)
                        return null;
                    try {
                        stack.push(ast);
                        var type = ast[0];
                        var gen = user[type];
                        if (gen) {
                            var ret = gen.apply(ast, ast.slice(1));
                            if (ret != null)
                                return ret;
                        }
                        gen = walkers[type];
                        return gen.apply(ast, ast.slice(1));
                    } finally {
                        stack.pop();
                    }
                };

                function dive(ast) {
                    if (ast == null)
                        return null;
                    try {
                        stack.push(ast);
                        return walkers[ast[0]].apply(ast, ast.slice(1));
                    } finally {
                        stack.pop();
                    }
                };

                function with_walkers(walkers, cont){
                    var save = {}, i;
                    for (i in walkers) if (HOP(walkers, i)) {
                        save[i] = user[i];
                        user[i] = walkers[i];
                    }
                    var ret = cont();
                    for (i in save) if (HOP(save, i)) {
                        if (!save[i]) delete user[i];
                        else user[i] = save[i];
                    }
                    return ret;
                };

                return {
                    walk: walk,
                    dive: dive,
                    with_walkers: with_walkers,
                    parent: function() {
                        return stack[stack.length - 2]; // last one is current node
                    },
                    stack: function() {
                        return stack;
                    }
                };
            };

            /* -----[ Scope and mangling ]----- */

            function Scope(parent) {
                this.names = {};        // names defined in this scope
                this.mangled = {};      // mangled names (orig.name => mangled)
                this.rev_mangled = {};  // reverse lookup (mangled => orig.name)
                this.cname = -1;        // current mangled name
                this.refs = {};         // names referenced from this scope
                this.uses_with = false; // will become TRUE if with() is detected in this or any subscopes
                this.uses_eval = false; // will become TRUE if eval() is detected in this or any subscopes
                this.directives = [];   // directives activated from this scope
                this.parent = parent;   // parent scope
                this.children = [];     // sub-scopes
                if (parent) {
                    this.level = parent.level + 1;
                    parent.children.push(this);
                } else {
                    this.level = 0;
                }
            };

            function base54_digits() {
                if (typeof DIGITS_OVERRIDE_FOR_TESTING != "undefined")
                    return DIGITS_OVERRIDE_FOR_TESTING;
                else
                    return "etnrisouaflchpdvmgybwESxTNCkLAOM_DPHBjFIqRUzWXV$JKQGYZ0516372984";
            }

            var base54 = (function(){
                var DIGITS = base54_digits();
                return function(num) {
                    var ret = "", base = 54;
                    do {
                        ret += DIGITS.charAt(num % base);
                        num = Math.floor(num / base);
                        base = 64;
                    } while (num > 0);
                    return ret;
                };
            })();

            Scope.prototype = {
                has: function(name) {
                    for (var s = this; s; s = s.parent)
                        if (HOP(s.names, name))
                            return s;
                },
                has_mangled: function(mname) {
                    for (var s = this; s; s = s.parent)
                        if (HOP(s.rev_mangled, mname))
                            return s;
                },
                toJSON: function() {
                    return {
                        names: this.names,
                        uses_eval: this.uses_eval,
                        uses_with: this.uses_with
                    };
                },

                next_mangled: function() {
                    // we must be careful that the new mangled name:
                    //
                    // 1. doesn't shadow a mangled name from a parent
                    //    scope, unless we don't reference the original
                    //    name from this scope OR from any sub-scopes!
                    //    This will get slow.
                    //
                    // 2. doesn't shadow an original name from a parent
                    //    scope, in the event that the name is not mangled
                    //    in the parent scope and we reference that name
                    //    here OR IN ANY SUBSCOPES!
                    //
                    // 3. doesn't shadow a name that is referenced but not
                    //    defined (possibly global defined elsewhere).
                    for (;;) {
                        var m = base54(++this.cname), prior;

                        // case 1.
                        prior = this.has_mangled(m);
                        if (prior && this.refs[prior.rev_mangled[m]] === prior)
                            continue;

                        // case 2.
                        prior = this.has(m);
                        if (prior && prior !== this && this.refs[m] === prior && !prior.has_mangled(m))
                            continue;

                        // case 3.
                        if (HOP(this.refs, m) && this.refs[m] == null)
                            continue;

                        // I got "do" once. :-/
                        if (!is_identifier(m))
                            continue;

                        return m;
                    }
                },
                set_mangle: function(name, m) {
                    this.rev_mangled[m] = name;
                    return this.mangled[name] = m;
                },
                get_mangled: function(name, newMangle) {
                    if (this.uses_eval || this.uses_with) return name; // no mangle if eval or with is in use
                    var s = this.has(name);
                    if (!s) return name; // not in visible scope, no mangle
                    if (HOP(s.mangled, name)) return s.mangled[name]; // already mangled in this scope
                    if (!newMangle) return name;                      // not found and no mangling requested
                    return s.set_mangle(name, s.next_mangled());
                },
                references: function(name) {
                    return name && !this.parent || this.uses_with || this.uses_eval || this.refs[name];
                },
                define: function(name, type) {
                    if (name != null) {
                        if (type == "var" || !HOP(this.names, name))
                            this.names[name] = type || "var";
                        return name;
                    }
                },
                active_directive: function(dir) {
                    return member(dir, this.directives) || this.parent && this.parent.active_directive(dir);
                }
            };

            function ast_add_scope(ast) {

                var current_scope = null;
                var w = ast_walker(), walk = w.walk;
                var having_eval = [];

                function with_new_scope(cont) {
                    current_scope = new Scope(current_scope);
                    current_scope.labels = new Scope();
                    var ret = current_scope.body = cont();
                    ret.scope = current_scope;
                    current_scope = current_scope.parent;
                    return ret;
                };

                function define(name, type) {
                    return current_scope.define(name, type);
                };

                function reference(name) {
                    current_scope.refs[name] = true;
                };

                function _lambda(name, args, body) {
                    var is_defun = this[0] == "defun";
                    return [ this[0], is_defun ? define(name, "defun") : name, args, with_new_scope(function(){
                        if (!is_defun) define(name, "lambda");
                        MAP(args, function(name){ define(name, "arg") });
                        return MAP(body, walk);
                    })];
                };

                function _vardefs(type) {
                    return function(defs) {
                        MAP(defs, function(d){
                            define(d[0], type);
                            if (d[1]) reference(d[0]);
                        });
                    };
                };

                function _breacont(label) {
                    if (label)
                        current_scope.labels.refs[label] = true;
                };

                return with_new_scope(function(){
                    // process AST
                    var ret = w.with_walkers({
                        "function": _lambda,
                        "defun": _lambda,
                        "label": function(name, stat) { current_scope.labels.define(name) },
                        "break": _breacont,
                        "continue": _breacont,
                        "with": function(expr, block) {
                            for (var s = current_scope; s; s = s.parent)
                                s.uses_with = true;
                        },
                        "var": _vardefs("var"),
                        "const": _vardefs("const"),
                        "try": function(t, c, f) {
                            if (c != null) return [
                                this[0],
                                MAP(t, walk),
                                [ define(c[0], "catch"), MAP(c[1], walk) ],
                                f != null ? MAP(f, walk) : null
                            ];
                        },
                        "name": function(name) {
                            if (name == "eval")
                                having_eval.push(current_scope);
                            reference(name);
                        }
                    }, function(){
                        return walk(ast);
                    });

                    // the reason why we need an additional pass here is
                    // that names can be used prior to their definition.

                    // scopes where eval was detected and their parents
                    // are marked with uses_eval, unless they define the
                    // "eval" name.
                    MAP(having_eval, function(scope){
                        if (!scope.has("eval")) while (scope) {
                            scope.uses_eval = true;
                            scope = scope.parent;
                        }
                    });

                    // for referenced names it might be useful to know
                    // their origin scope.  current_scope here is the
                    // toplevel one.
                    function fixrefs(scope, i) {
                        // do children first; order shouldn't matter
                        for (i = scope.children.length; --i >= 0;)
                            fixrefs(scope.children[i]);
                        for (i in scope.refs) if (HOP(scope.refs, i)) {
                            // find origin scope and propagate the reference to origin
                            for (var origin = scope.has(i), s = scope; s; s = s.parent) {
                                s.refs[i] = origin;
                                if (s === origin) break;
                            }
                        }
                    };
                    fixrefs(current_scope);

                    return ret;
                });

            };

            /* -----[ mangle names ]----- */

            function ast_mangle(ast, options) {
                var w = ast_walker(), walk = w.walk, scope;
                options = defaults(options, {
                    mangle       : true,
                    toplevel     : false,
                    defines      : null,
                    except       : null,
                    no_functions : false
                });

                function get_mangled(name, newMangle) {
                    if (!options.mangle) return name;
                    if (!options.toplevel && !scope.parent) return name; // don't mangle toplevel
                    if (options.except && member(name, options.except))
                        return name;
                    if (options.no_functions && HOP(scope.names, name) &&
                        (scope.names[name] == 'defun' || scope.names[name] == 'lambda'))
                        return name;
                    return scope.get_mangled(name, newMangle);
                };

                function get_define(name) {
                    if (options.defines) {
                        // we always lookup a defined symbol for the current scope FIRST, so declared
                        // vars trump a DEFINE symbol, but if no such var is found, then match a DEFINE value
                        if (!scope.has(name)) {
                            if (HOP(options.defines, name)) {
                                return options.defines[name];
                            }
                        }
                        return null;
                    }
                };

                function _lambda(name, args, body) {
                    if (!options.no_functions && options.mangle) {
                        var is_defun = this[0] == "defun", extra;
                        if (name) {
                            if (is_defun) name = get_mangled(name);
                            else if (body.scope.references(name)) {
                                extra = {};
                                if (!(scope.uses_eval || scope.uses_with))
                                    name = extra[name] = scope.next_mangled();
                                else
                                    extra[name] = name;
                            }
                            else name = null;
                        }
                    }
                    body = with_scope(body.scope, function(){
                        args = MAP(args, function(name){ return get_mangled(name) });
                        return MAP(body, walk);
                    }, extra);
                    return [ this[0], name, args, body ];
                };

                function with_scope(s, cont, extra) {
                    var _scope = scope;
                    scope = s;
                    if (extra) for (var i in extra) if (HOP(extra, i)) {
                        s.set_mangle(i, extra[i]);
                    }
                    for (var i in s.names) if (HOP(s.names, i)) {
                        get_mangled(i, true);
                    }
                    var ret = cont();
                    ret.scope = s;
                    scope = _scope;
                    return ret;
                };

                function _vardefs(defs) {
                    return [ this[0], MAP(defs, function(d){
                        return [ get_mangled(d[0]), walk(d[1]) ];
                    }) ];
                };

                function _breacont(label) {
                    if (label) return [ this[0], scope.labels.get_mangled(label) ];
                };

                return w.with_walkers({
                    "function": _lambda,
                    "defun": function() {
                        // move function declarations to the top when
                        // they are not in some block.
                        var ast = _lambda.apply(this, arguments);
                        switch (w.parent()[0]) {
                            case "toplevel":
                            case "function":
                            case "defun":
                                return MAP.at_top(ast);
                        }
                        return ast;
                    },
                    "label": function(label, stat) {
                        if (scope.labels.refs[label]) return [
                            this[0],
                            scope.labels.get_mangled(label, true),
                            walk(stat)
                        ];
                        return walk(stat);
                    },
                    "break": _breacont,
                    "continue": _breacont,
                    "var": _vardefs,
                    "const": _vardefs,
                    "name": function(name) {
                        return get_define(name) || [ this[0], get_mangled(name) ];
                    },
                    "try": function(t, c, f) {
                        return [ this[0],
                            MAP(t, walk),
                            c != null ? [ get_mangled(c[0]), MAP(c[1], walk) ] : null,
                            f != null ? MAP(f, walk) : null ];
                    },
                    "toplevel": function(body) {
                        var self = this;
                        return with_scope(self.scope, function(){
                            return [ self[0], MAP(body, walk) ];
                        });
                    },
                    "directive": function() {
                        return MAP.at_top(this);
                    }
                }, function() {
                    return walk(ast_add_scope(ast));
                });
            };

            /* -----[
             - compress foo["bar"] into foo.bar,
             - remove block brackets {} where possible
             - join consecutive var declarations
             - various optimizations for IFs:
             - if (cond) foo(); else bar();  ==>  cond?foo():bar();
             - if (cond) foo();  ==>  cond&&foo();
             - if (foo) return bar(); else return baz();  ==> return foo?bar():baz(); // also for throw
             - if (foo) return bar(); else something();  ==> {if(foo)return bar();something()}
             ]----- */

            var warn = function(){};

            function best_of(ast1, ast2) {
                return gen_code(ast1).length > gen_code(ast2[0] == "stat" ? ast2[1] : ast2).length ? ast2 : ast1;
            };

            function last_stat(b) {
                if (b[0] == "block" && b[1] && b[1].length > 0)
                    return b[1][b[1].length - 1];
                return b;
            }

            function aborts(t) {
                if (t) switch (last_stat(t)[0]) {
                    case "return":
                    case "break":
                    case "continue":
                    case "throw":
                        return true;
                }
            };

            function boolean_expr(expr) {
                return ( (expr[0] == "unary-prefix"
                    && member(expr[1], [ "!", "delete" ])) ||

                    (expr[0] == "binary"
                    && member(expr[1], [ "in", "instanceof", "==", "!=", "===", "!==", "<", "<=", ">=", ">" ])) ||

                    (expr[0] == "binary"
                    && member(expr[1], [ "&&", "||" ])
                    && boolean_expr(expr[2])
                    && boolean_expr(expr[3])) ||

                    (expr[0] == "conditional"
                    && boolean_expr(expr[2])
                    && boolean_expr(expr[3])) ||

                    (expr[0] == "assign"
                    && expr[1] === true
                    && boolean_expr(expr[3])) ||

                    (expr[0] == "seq"
                    && boolean_expr(expr[expr.length - 1]))
                );
            };

            function empty(b) {
                return !b || (b[0] == "block" && (!b[1] || b[1].length == 0));
            };

            function is_string(node) {
                return (node[0] == "string" ||
                node[0] == "unary-prefix" && node[1] == "typeof" ||
                node[0] == "binary" && node[1] == "+" &&
                (is_string(node[2]) || is_string(node[3])));
            };

            var when_constant = (function(){

                var $NOT_CONSTANT = {};

                // this can only evaluate constant expressions.  If it finds anything
                // not constant, it throws $NOT_CONSTANT.
                function evaluate(expr) {
                    switch (expr[0]) {
                        case "string":
                        case "num":
                            return expr[1];
                        case "name":
                        case "atom":
                            switch (expr[1]) {
                                case "true": return true;
                                case "false": return false;
                                case "null": return null;
                            }
                            break;
                        case "unary-prefix":
                            switch (expr[1]) {
                                case "!": return !evaluate(expr[2]);
                                case "typeof": return typeof evaluate(expr[2]);
                                case "~": return ~evaluate(expr[2]);
                                case "-": return -evaluate(expr[2]);
                                case "+": return +evaluate(expr[2]);
                            }
                            break;
                        case "binary":
                            var left = expr[2], right = expr[3];
                            switch (expr[1]) {
                                case "&&"         : return evaluate(left) &&         evaluate(right);
                                case "||"         : return evaluate(left) ||         evaluate(right);
                                case "|"          : return evaluate(left) |          evaluate(right);
                                case "&"          : return evaluate(left) &          evaluate(right);
                                case "^"          : return evaluate(left) ^          evaluate(right);
                                case "+"          : return evaluate(left) +          evaluate(right);
                                case "*"          : return evaluate(left) *          evaluate(right);
                                case "/"          : return evaluate(left) /          evaluate(right);
                                case "%"          : return evaluate(left) %          evaluate(right);
                                case "-"          : return evaluate(left) -          evaluate(right);
                                case "<<"         : return evaluate(left) <<         evaluate(right);
                                case ">>"         : return evaluate(left) >>         evaluate(right);
                                case ">>>"        : return evaluate(left) >>>        evaluate(right);
                                case "=="         : return evaluate(left) ==         evaluate(right);
                                case "==="        : return evaluate(left) ===        evaluate(right);
                                case "!="         : return evaluate(left) !=         evaluate(right);
                                case "!=="        : return evaluate(left) !==        evaluate(right);
                                case "<"          : return evaluate(left) <          evaluate(right);
                                case "<="         : return evaluate(left) <=         evaluate(right);
                                case ">"          : return evaluate(left) >          evaluate(right);
                                case ">="         : return evaluate(left) >=         evaluate(right);
                                case "in"         : return evaluate(left) in         evaluate(right);
                                case "instanceof" : return evaluate(left) instanceof evaluate(right);
                            }
                    }
                    throw $NOT_CONSTANT;
                };

                return function(expr, yes, no) {
                    try {
                        var val = evaluate(expr), ast;
                        switch (typeof val) {
                            case "string": ast =  [ "string", val ]; break;
                            case "number": ast =  [ "num", val ]; break;
                            case "boolean": ast =  [ "name", String(val) ]; break;
                            default:
                                if (val === null) { ast = [ "atom", "null" ]; break; }
                                throw new Error("Can't handle constant of type: " + (typeof val));
                        }
                        return yes.call(expr, ast, val);
                    } catch(ex) {
                        if (ex === $NOT_CONSTANT) {
                            if (expr[0] == "binary"
                                && (expr[1] == "===" || expr[1] == "!==")
                                && ((is_string(expr[2]) && is_string(expr[3]))
                                || (boolean_expr(expr[2]) && boolean_expr(expr[3])))) {
                                expr[1] = expr[1].substr(0, 2);
                            }
                            else if (no && expr[0] == "binary"
                                && (expr[1] == "||" || expr[1] == "&&")) {
                                // the whole expression is not constant but the lval may be...
                                try {
                                    var lval = evaluate(expr[2]);
                                    expr = ((expr[1] == "&&" && (lval ? expr[3] : lval))    ||
                                    (expr[1] == "||" && (lval ? lval    : expr[3])) ||
                                    expr);
                                } catch(ex2) {
                                    // IGNORE... lval is not constant
                                }
                            }
                            return no ? no.call(expr, expr) : null;
                        }
                        else throw ex;
                    }
                };

            })();

            function warn_unreachable(ast) {
                if (!empty(ast))
                    warn("Dropping unreachable code: " + gen_code(ast, true));
            };

            function prepare_ifs(ast) {
                var w = ast_walker(), walk = w.walk;
                // In this first pass, we rewrite ifs which abort with no else with an
                // if-else.  For example:
                //
                // if (x) {
                //     blah();
                //     return y;
                // }
                // foobar();
                //
                // is rewritten into:
                //
                // if (x) {
                //     blah();
                //     return y;
                // } else {
                //     foobar();
                // }
                function redo_if(statements) {
                    statements = MAP(statements, walk);

                    for (var i = 0; i < statements.length; ++i) {
                        var fi = statements[i];
                        if (fi[0] != "if") continue;

                        if (fi[3]) continue;

                        var t = fi[2];
                        if (!aborts(t)) continue;

                        var conditional = walk(fi[1]);

                        var e_body = redo_if(statements.slice(i + 1));
                        var e = e_body.length == 1 ? e_body[0] : [ "block", e_body ];

                        return statements.slice(0, i).concat([ [
                            fi[0],          // "if"
                            conditional,    // conditional
                            t,              // then
                            e               // else
                        ] ]);
                    }

                    return statements;
                };

                function redo_if_lambda(name, args, body) {
                    body = redo_if(body);
                    return [ this[0], name, args, body ];
                };

                function redo_if_block(statements) {
                    return [ this[0], statements != null ? redo_if(statements) : null ];
                };

                return w.with_walkers({
                    "defun": redo_if_lambda,
                    "function": redo_if_lambda,
                    "block": redo_if_block,
                    "splice": redo_if_block,
                    "toplevel": function(statements) {
                        return [ this[0], redo_if(statements) ];
                    },
                    "try": function(t, c, f) {
                        return [
                            this[0],
                            redo_if(t),
                            c != null ? [ c[0], redo_if(c[1]) ] : null,
                            f != null ? redo_if(f) : null
                        ];
                    }
                }, function() {
                    return walk(ast);
                });
            };

            function for_side_effects(ast, handler) {
                var w = ast_walker(), walk = w.walk;
                var $stop = {}, $restart = {};
                function stop() { throw $stop };
                function restart() { throw $restart };
                function found(){ return handler.call(this, this, w, stop, restart) };
                function unary(op) {
                    if (op == "++" || op == "--")
                        return found.apply(this, arguments);
                };
                function binary(op) {
                    if (op == "&&" || op == "||")
                        return found.apply(this, arguments);
                };
                return w.with_walkers({
                    "try": found,
                    "throw": found,
                    "return": found,
                    "new": found,
                    "switch": found,
                    "break": found,
                    "continue": found,
                    "assign": found,
                    "call": found,
                    "if": found,
                    "for": found,
                    "for-in": found,
                    "while": found,
                    "do": found,
                    "return": found,
                    "unary-prefix": unary,
                    "unary-postfix": unary,
                    "conditional": found,
                    "binary": binary,
                    "defun": found
                }, function(){
                    while (true) try {
                        walk(ast);
                        break;
                    } catch(ex) {
                        if (ex === $stop) break;
                        if (ex === $restart) continue;
                        throw ex;
                    }
                });
            };

            function ast_lift_variables(ast) {
                var w = ast_walker(), walk = w.walk, scope;
                function do_body(body, env) {
                    var _scope = scope;
                    scope = env;
                    body = MAP(body, walk);
                    var hash = {}, names = MAP(env.names, function(type, name){
                        if (type != "var") return MAP.skip;
                        if (!env.references(name)) return MAP.skip;
                        hash[name] = true;
                        return [ name ];
                    });
                    if (names.length > 0) {
                        // looking for assignments to any of these variables.
                        // we can save considerable space by moving the definitions
                        // in the var declaration.
                        for_side_effects([ "block", body ], function(ast, walker, stop, restart) {
                            if (ast[0] == "assign"
                                && ast[1] === true
                                && ast[2][0] == "name"
                                && HOP(hash, ast[2][1])) {
                                // insert the definition into the var declaration
                                for (var i = names.length; --i >= 0;) {
                                    if (names[i][0] == ast[2][1]) {
                                        if (names[i][1]) // this name already defined, we must stop
                                            stop();
                                        names[i][1] = ast[3]; // definition
                                        names.push(names.splice(i, 1)[0]);
                                        break;
                                    }
                                }
                                // remove this assignment from the AST.
                                var p = walker.parent();
                                if (p[0] == "seq") {
                                    var a = p[2];
                                    a.unshift(0, p.length);
                                    p.splice.apply(p, a);
                                }
                                else if (p[0] == "stat") {
                                    p.splice(0, p.length, "block"); // empty statement
                                }
                                else {
                                    stop();
                                }
                                restart();
                            }
                            stop();
                        });
                        body.unshift([ "var", names ]);
                    }
                    scope = _scope;
                    return body;
                };
                function _vardefs(defs) {
                    var ret = null;
                    for (var i = defs.length; --i >= 0;) {
                        var d = defs[i];
                        if (!d[1]) continue;
                        d = [ "assign", true, [ "name", d[0] ], d[1] ];
                        if (ret == null) ret = d;
                        else ret = [ "seq", d, ret ];
                    }
                    if (ret == null && w.parent()[0] != "for") {
                        if (w.parent()[0] == "for-in")
                            return [ "name", defs[0][0] ];
                        return MAP.skip;
                    }
                    return [ "stat", ret ];
                };
                function _toplevel(body) {
                    return [ this[0], do_body(body, this.scope) ];
                };
                return w.with_walkers({
                    "function": function(name, args, body){
                        for (var i = args.length; --i >= 0 && !body.scope.references(args[i]);)
                            args.pop();
                        if (!body.scope.references(name)) name = null;
                        return [ this[0], name, args, do_body(body, body.scope) ];
                    },
                    "defun": function(name, args, body){
                        if (!scope.references(name)) return MAP.skip;
                        for (var i = args.length; --i >= 0 && !body.scope.references(args[i]);)
                            args.pop();
                        return [ this[0], name, args, do_body(body, body.scope) ];
                    },
                    "var": _vardefs,
                    "toplevel": _toplevel
                }, function(){
                    return walk(ast_add_scope(ast));
                });
            };

            function ast_squeeze(ast, options) {
                ast = squeeze_1(ast, options);
                ast = squeeze_2(ast, options);
                return ast;
            };

            function squeeze_1(ast, options) {
                options = defaults(options, {
                    make_seqs   : true,
                    dead_code   : true,
                    no_warnings : false,
                    keep_comps  : true,
                    unsafe      : false
                });

                var w = ast_walker(), walk = w.walk, scope;

                function negate(c) {
                    var not_c = [ "unary-prefix", "!", c ];
                    switch (c[0]) {
                        case "unary-prefix":
                            return c[1] == "!" && boolean_expr(c[2]) ? c[2] : not_c;
                        case "seq":
                            c = slice(c);
                            c[c.length - 1] = negate(c[c.length - 1]);
                            return c;
                        case "conditional":
                            return best_of(not_c, [ "conditional", c[1], negate(c[2]), negate(c[3]) ]);
                        case "binary":
                            var op = c[1], left = c[2], right = c[3];
                            if (!options.keep_comps) switch (op) {
                                case "<="  : return [ "binary", ">", left, right ];
                                case "<"   : return [ "binary", ">=", left, right ];
                                case ">="  : return [ "binary", "<", left, right ];
                                case ">"   : return [ "binary", "<=", left, right ];
                            }
                            switch (op) {
                                case "=="  : return [ "binary", "!=", left, right ];
                                case "!="  : return [ "binary", "==", left, right ];
                                case "===" : return [ "binary", "!==", left, right ];
                                case "!==" : return [ "binary", "===", left, right ];
                                case "&&"  : return best_of(not_c, [ "binary", "||", negate(left), negate(right) ]);
                                case "||"  : return best_of(not_c, [ "binary", "&&", negate(left), negate(right) ]);
                            }
                            break;
                    }
                    return not_c;
                };

                function make_conditional(c, t, e) {
                    var make_real_conditional = function() {
                        if (c[0] == "unary-prefix" && c[1] == "!") {
                            return e ? [ "conditional", c[2], e, t ] : [ "binary", "||", c[2], t ];
                        } else {
                            return e ? best_of(
                                [ "conditional", c, t, e ],
                                [ "conditional", negate(c), e, t ]
                            ) : [ "binary", "&&", c, t ];
                        }
                    };
                    // shortcut the conditional if the expression has a constant value
                    return when_constant(c, function(ast, val){
                        warn_unreachable(val ? e : t);
                        return          (val ? t : e);
                    }, make_real_conditional);
                };

                function rmblock(block) {
                    if (block != null && block[0] == "block" && block[1]) {
                        if (block[1].length == 1)
                            block = block[1][0];
                        else if (block[1].length == 0)
                            block = [ "block" ];
                    }
                    return block;
                };

                function _lambda(name, args, body) {
                    return [ this[0], name, args, tighten(body, "lambda") ];
                };

                // this function does a few things:
                // 1. discard useless blocks
                // 2. join consecutive var declarations
                // 3. remove obviously dead code
                // 4. transform consecutive statements using the comma operator
                // 5. if block_type == "lambda" and it detects constructs like if(foo) return ... - rewrite like if (!foo) { ... }
                function tighten(statements, block_type) {
                    statements = MAP(statements, walk);

                    statements = statements.reduce(function(a, stat){
                        if (stat[0] == "block") {
                            if (stat[1]) {
                                a.push.apply(a, stat[1]);
                            }
                        } else {
                            a.push(stat);
                        }
                        return a;
                    }, []);

                    statements = (function(a, prev){
                        statements.forEach(function(cur){
                            if (prev && ((cur[0] == "var" && prev[0] == "var") ||
                                (cur[0] == "const" && prev[0] == "const"))) {
                                prev[1] = prev[1].concat(cur[1]);
                            } else {
                                a.push(cur);
                                prev = cur;
                            }
                        });
                        return a;
                    })([]);

                    if (options.dead_code) statements = (function(a, has_quit){
                        statements.forEach(function(st){
                            if (has_quit) {
                                if (st[0] == "function" || st[0] == "defun") {
                                    a.push(st);
                                }
                                else if (st[0] == "var" || st[0] == "const") {
                                    if (!options.no_warnings)
                                        warn("Variables declared in unreachable code");
                                    st[1] = MAP(st[1], function(def){
                                        if (def[1] && !options.no_warnings)
                                            warn_unreachable([ "assign", true, [ "name", def[0] ], def[1] ]);
                                        return [ def[0] ];
                                    });
                                    a.push(st);
                                }
                                else if (!options.no_warnings)
                                    warn_unreachable(st);
                            }
                            else {
                                a.push(st);
                                if (member(st[0], [ "return", "throw", "break", "continue" ]))
                                    has_quit = true;
                            }
                        });
                        return a;
                    })([]);

                    if (options.make_seqs) statements = (function(a, prev) {
                        statements.forEach(function(cur){
                            if (prev && prev[0] == "stat" && cur[0] == "stat") {
                                prev[1] = [ "seq", prev[1], cur[1] ];
                            } else {
                                a.push(cur);
                                prev = cur;
                            }
                        });
                        if (a.length >= 2
                            && a[a.length-2][0] == "stat"
                            && (a[a.length-1][0] == "return" || a[a.length-1][0] == "throw")
                            && a[a.length-1][1])
                        {
                            a.splice(a.length - 2, 2,
                                [ a[a.length-1][0],
                                    [ "seq", a[a.length-2][1], a[a.length-1][1] ]]);
                        }
                        return a;
                    })([]);

                    // this increases jQuery by 1K.  Probably not such a good idea after all..
                    // part of this is done in prepare_ifs anyway.
                    // if (block_type == "lambda") statements = (function(i, a, stat){
                    //         while (i < statements.length) {
                    //                 stat = statements[i++];
                    //                 if (stat[0] == "if" && !stat[3]) {
                    //                         if (stat[2][0] == "return" && stat[2][1] == null) {
                    //                                 a.push(make_if(negate(stat[1]), [ "block", statements.slice(i) ]));
                    //                                 break;
                    //                         }
                    //                         var last = last_stat(stat[2]);
                    //                         if (last[0] == "return" && last[1] == null) {
                    //                                 a.push(make_if(stat[1], [ "block", stat[2][1].slice(0, -1) ], [ "block", statements.slice(i) ]));
                    //                                 break;
                    //                         }
                    //                 }
                    //                 a.push(stat);
                    //         }
                    //         return a;
                    // })(0, []);

                    return statements;
                };

                function make_if(c, t, e) {
                    return when_constant(c, function(ast, val){
                        if (val) {
                            t = walk(t);
                            warn_unreachable(e);
                            return t || [ "block" ];
                        } else {
                            e = walk(e);
                            warn_unreachable(t);
                            return e || [ "block" ];
                        }
                    }, function() {
                        return make_real_if(c, t, e);
                    });
                };

                function abort_else(c, t, e) {
                    var ret = [ [ "if", negate(c), e ] ];
                    if (t[0] == "block") {
                        if (t[1]) ret = ret.concat(t[1]);
                    } else {
                        ret.push(t);
                    }
                    return walk([ "block", ret ]);
                };

                function make_real_if(c, t, e) {
                    c = walk(c);
                    t = walk(t);
                    e = walk(e);

                    if (empty(e) && empty(t))
                        return [ "stat", c ];

                    if (empty(t)) {
                        c = negate(c);
                        t = e;
                        e = null;
                    } else if (empty(e)) {
                        e = null;
                    } else {
                        // if we have both else and then, maybe it makes sense to switch them?
                        (function(){
                            var a = gen_code(c);
                            var n = negate(c);
                            var b = gen_code(n);
                            if (b.length < a.length) {
                                var tmp = t;
                                t = e;
                                e = tmp;
                                c = n;
                            }
                        })();
                    }
                    var ret = [ "if", c, t, e ];
                    if (t[0] == "if" && empty(t[3]) && empty(e)) {
                        ret = best_of(ret, walk([ "if", [ "binary", "&&", c, t[1] ], t[2] ]));
                    }
                    else if (t[0] == "stat") {
                        if (e) {
                            if (e[0] == "stat")
                                ret = best_of(ret, [ "stat", make_conditional(c, t[1], e[1]) ]);
                            else if (aborts(e))
                                ret = abort_else(c, t, e);
                        }
                        else {
                            ret = best_of(ret, [ "stat", make_conditional(c, t[1]) ]);
                        }
                    }
                    else if (e && t[0] == e[0] && (t[0] == "return" || t[0] == "throw") && t[1] && e[1]) {
                        ret = best_of(ret, [ t[0], make_conditional(c, t[1], e[1] ) ]);
                    }
                    else if (e && aborts(t)) {
                        ret = [ [ "if", c, t ] ];
                        if (e[0] == "block") {
                            if (e[1]) ret = ret.concat(e[1]);
                        }
                        else {
                            ret.push(e);
                        }
                        ret = walk([ "block", ret ]);
                    }
                    else if (t && aborts(e)) {
                        ret = abort_else(c, t, e);
                    }
                    return ret;
                };

                function _do_while(cond, body) {
                    return when_constant(cond, function(cond, val){
                        if (!val) {
                            warn_unreachable(body);
                            return [ "block" ];
                        } else {
                            return [ "for", null, null, null, walk(body) ];
                        }
                    });
                };

                return w.with_walkers({
                    "sub": function(expr, subscript) {
                        if (subscript[0] == "string") {
                            var name = subscript[1];
                            if (is_identifier(name))
                                return [ "dot", walk(expr), name ];
                            else if (/^[1-9][0-9]*$/.test(name) || name === "0")
                                return [ "sub", walk(expr), [ "num", parseInt(name, 10) ] ];
                        }
                    },
                    "if": make_if,
                    "toplevel": function(body) {
                        return [ "toplevel", tighten(body) ];
                    },
                    "switch": function(expr, body) {
                        var last = body.length - 1;
                        return [ "switch", walk(expr), MAP(body, function(branch, i){
                            var block = tighten(branch[1]);
                            if (i == last && block.length > 0) {
                                var node = block[block.length - 1];
                                if (node[0] == "break" && !node[1])
                                    block.pop();
                            }
                            return [ branch[0] ? walk(branch[0]) : null, block ];
                        }) ];
                    },
                    "function": _lambda,
                    "defun": _lambda,
                    "block": function(body) {
                        if (body) return rmblock([ "block", tighten(body) ]);
                    },
                    "binary": function(op, left, right) {
                        return when_constant([ "binary", op, walk(left), walk(right) ], function yes(c){
                            return best_of(walk(c), this);
                        }, function no() {
                            return function(){
                                    if(op != "==" && op != "!=") return;
                                    var l = walk(left), r = walk(right);
                                    if(l && l[0] == "unary-prefix" && l[1] == "!" && l[2][0] == "num")
                                        left = ['num', +!l[2][1]];
                                    else if (r && r[0] == "unary-prefix" && r[1] == "!" && r[2][0] == "num")
                                        right = ['num', +!r[2][1]];
                                    return ["binary", op, left, right];
                                }() || this;
                        });
                    },
                    "conditional": function(c, t, e) {
                        return make_conditional(walk(c), walk(t), walk(e));
                    },
                    "try": function(t, c, f) {
                        return [
                            "try",
                            tighten(t),
                            c != null ? [ c[0], tighten(c[1]) ] : null,
                            f != null ? tighten(f) : null
                        ];
                    },
                    "unary-prefix": function(op, expr) {
                        expr = walk(expr);
                        var ret = [ "unary-prefix", op, expr ];
                        if (op == "!")
                            ret = best_of(ret, negate(expr));
                        return when_constant(ret, function(ast, val){
                            return walk(ast); // it's either true or false, so minifies to !0 or !1
                        }, function() { return ret });
                    },
                    "name": function(name) {
                        switch (name) {
                            case "true": return [ "unary-prefix", "!", [ "num", 0 ]];
                            case "false": return [ "unary-prefix", "!", [ "num", 1 ]];
                        }
                    },
                    "while": _do_while,
                    "assign": function(op, lvalue, rvalue) {
                        lvalue = walk(lvalue);
                        rvalue = walk(rvalue);
                        var okOps = [ '+', '-', '/', '*', '%', '>>', '<<', '>>>', '|', '^', '&' ];
                        if (op === true && lvalue[0] === "name" && rvalue[0] === "binary" &&
                            ~okOps.indexOf(rvalue[1]) && rvalue[2][0] === "name" &&
                            rvalue[2][1] === lvalue[1]) {
                            return [ this[0], rvalue[1], lvalue, rvalue[3] ]
                        }
                        return [ this[0], op, lvalue, rvalue ];
                    },
                    "call": function(expr, args) {
                        expr = walk(expr);
                        if (options.unsafe && expr[0] == "dot" && expr[1][0] == "string" && expr[2] == "toString") {
                            return expr[1];
                        }
                        return [ this[0], expr,  MAP(args, walk) ];
                    },
                    "num": function (num) {
                        if (!isFinite(num))
                            return [ "binary", "/", num === 1 / 0
                                ? [ "num", 1 ] : num === -1 / 0
                                ? [ "unary-prefix", "-", [ "num", 1 ] ]
                                : [ "num", 0 ], [ "num", 0 ] ];

                        return [ this[0], num ];
                    }
                }, function() {
                    return walk(prepare_ifs(walk(prepare_ifs(ast))));
                });
            };

            function squeeze_2(ast, options) {
                var w = ast_walker(), walk = w.walk, scope;
                function with_scope(s, cont) {
                    var save = scope, ret;
                    scope = s;
                    ret = cont();
                    scope = save;
                    return ret;
                };
                function lambda(name, args, body) {
                    return [ this[0], name, args, with_scope(body.scope, curry(MAP, body, walk)) ];
                };
                return w.with_walkers({
                    "directive": function(dir) {
                        if (scope.active_directive(dir))
                            return [ "block" ];
                        scope.directives.push(dir);
                    },
                    "toplevel": function(body) {
                        return [ this[0], with_scope(this.scope, curry(MAP, body, walk)) ];
                    },
                    "function": lambda,
                    "defun": lambda
                }, function(){
                    return walk(ast_add_scope(ast));
                });
            };

            /* -----[ re-generate code from the AST ]----- */

            var DOT_CALL_NO_PARENS = jsp.array_to_hash([
                "name",
                "array",
                "object",
                "string",
                "dot",
                "sub",
                "call",
                "regexp",
                "defun"
            ]);

            function make_string(str, ascii_only) {
                var dq = 0, sq = 0;
                str = str.replace(/[\\\b\f\n\r\t\x22\x27\u2028\u2029\0]/g, function(s){
                    switch (s) {
                        case "\\": return "\\\\";
                        case "\b": return "\\b";
                        case "\f": return "\\f";
                        case "\n": return "\\n";
                        case "\r": return "\\r";
                        case "\u2028": return "\\u2028";
                        case "\u2029": return "\\u2029";
                        case '"': ++dq; return '"';
                        case "'": ++sq; return "'";
                        case "\0": return "\\0";
                    }
                    return s;
                });
                if (ascii_only) str = to_ascii(str);
                if (dq > sq) return "'" + str.replace(/\x27/g, "\\'") + "'";
                else return '"' + str.replace(/\x22/g, '\\"') + '"';
            };

            function to_ascii(str) {
                return str.replace(/[\u0080-\uffff]/g, function(ch) {
                    var code = ch.charCodeAt(0).toString(16);
                    while (code.length < 4) code = "0" + code;
                    return "\\u" + code;
                });
            };

            var SPLICE_NEEDS_BRACKETS = jsp.array_to_hash([ "if", "while", "do", "for", "for-in", "with" ]);

            function gen_code(ast, options) {
                options = defaults(options, {
                    indent_start : 0,
                    indent_level : 4,
                    quote_keys   : false,
                    space_colon  : false,
                    beautify     : false,
                    ascii_only   : false,
                    inline_script: false
                });
                var beautify = !!options.beautify;
                var indentation = 0,
                    newline = beautify ? "\n" : "",
                    space = beautify ? " " : "";

                function encode_string(str) {
                    var ret = make_string(str, options.ascii_only);
                    if (options.inline_script)
                        ret = ret.replace(/<\x2fscript([>\/\t\n\f\r ])/gi, "<\\/script$1");
                    return ret;
                };

                function make_name(name) {
                    name = name.toString();
                    if (options.ascii_only)
                        name = to_ascii(name);
                    return name;
                };

                function indent(line) {
                    if (line == null)
                        line = "";
                    if (beautify)
                        line = repeat_string(" ", options.indent_start + indentation * options.indent_level) + line;
                    return line;
                };

                function with_indent(cont, incr) {
                    if (incr == null) incr = 1;
                    indentation += incr;
                    try { return cont.apply(null, slice(arguments, 1)); }
                    finally { indentation -= incr; }
                };

                function last_char(str) {
                    str = str.toString();
                    return str.charAt(str.length - 1);
                };

                function first_char(str) {
                    return str.toString().charAt(0);
                };

                function add_spaces(a) {
                    if (beautify)
                        return a.join(" ");
                    var b = [];
                    for (var i = 0; i < a.length; ++i) {
                        var next = a[i + 1];
                        b.push(a[i]);
                        if (next &&
                            ((is_identifier_char(last_char(a[i])) && (is_identifier_char(first_char(next))
                            || first_char(next) == "\\")) ||
                            (/[\+\-]$/.test(a[i].toString()) && /^[\+\-]/.test(next.toString()) ||
                            last_char(a[i]) == "/" && first_char(next) == "/"))) {
                            b.push(" ");
                        }
                    }
                    return b.join("");
                };

                function add_commas(a) {
                    return a.join("," + space);
                };

                function parenthesize(expr) {
                    var gen = make(expr);
                    for (var i = 1; i < arguments.length; ++i) {
                        var el = arguments[i];
                        if ((el instanceof Function && el(expr)) || expr[0] == el)
                            return "(" + gen + ")";
                    }
                    return gen;
                };

                function best_of(a) {
                    if (a.length == 1) {
                        return a[0];
                    }
                    if (a.length == 2) {
                        var b = a[1];
                        a = a[0];
                        return a.length <= b.length ? a : b;
                    }
                    return best_of([ a[0], best_of(a.slice(1)) ]);
                };

                function needs_parens(expr) {
                    if (expr[0] == "function" || expr[0] == "object") {
                        // dot/call on a literal function requires the
                        // function literal itself to be parenthesized
                        // only if it's the first "thing" in a
                        // statement.  This means that the parent is
                        // "stat", but it could also be a "seq" and
                        // we're the first in this "seq" and the
                        // parent is "stat", and so on.  Messy stuff,
                        // but it worths the trouble.
                        var a = slice(w.stack()), self = a.pop(), p = a.pop();
                        while (p) {
                            if (p[0] == "stat") return true;
                            if (((p[0] == "seq" || p[0] == "call" || p[0] == "dot" || p[0] == "sub" || p[0] == "conditional") && p[1] === self) ||
                                ((p[0] == "binary" || p[0] == "assign" || p[0] == "unary-postfix") && p[2] === self)) {
                                self = p;
                                p = a.pop();
                            } else {
                                return false;
                            }
                        }
                    }
                    return !HOP(DOT_CALL_NO_PARENS, expr[0]);
                };

                function make_num(num) {
                    var str = num.toString(10), a = [ str.replace(/^0\./, ".").replace('e+', 'e') ], m;
                    if (Math.floor(num) === num) {
                        if (num >= 0) {
                            a.push("0x" + num.toString(16).toLowerCase(), // probably pointless
                                "0" + num.toString(8)); // same.
                        } else {
                            a.push("-0x" + (-num).toString(16).toLowerCase(), // probably pointless
                                "-0" + (-num).toString(8)); // same.
                        }
                        if ((m = /^(.*?)(0+)$/.exec(num))) {
                            a.push(m[1] + "e" + m[2].length);
                        }
                    } else if ((m = /^0?\.(0+)(.*)$/.exec(num))) {
                        a.push(m[2] + "e-" + (m[1].length + m[2].length),
                            str.substr(str.indexOf(".")));
                    }
                    return best_of(a);
                };

                var w = ast_walker();
                var make = w.walk;
                return w.with_walkers({
                    "string": encode_string,
                    "num": make_num,
                    "name": make_name,
                    "debugger": function(){ return "debugger;" },
                    "toplevel": function(statements) {
                        return make_block_statements(statements)
                            .join(newline + newline);
                    },
                    "splice": function(statements) {
                        var parent = w.parent();
                        if (HOP(SPLICE_NEEDS_BRACKETS, parent)) {
                            // we need block brackets in this case
                            return make_block.apply(this, arguments);
                        } else {
                            return MAP(make_block_statements(statements, true),
                                function(line, i) {
                                    // the first line is already indented
                                    return i > 0 ? indent(line) : line;
                                }).join(newline);
                        }
                    },
                    "block": make_block,
                    "var": function(defs) {
                        return "var " + add_commas(MAP(defs, make_1vardef)) + ";";
                    },
                    "const": function(defs) {
                        return "const " + add_commas(MAP(defs, make_1vardef)) + ";";
                    },
                    "try": function(tr, ca, fi) {
                        var out = [ "try", make_block(tr) ];
                        if (ca) out.push("catch", "(" + ca[0] + ")", make_block(ca[1]));
                        if (fi) out.push("finally", make_block(fi));
                        return add_spaces(out);
                    },
                    "throw": function(expr) {
                        return add_spaces([ "throw", make(expr) ]) + ";";
                    },
                    "new": function(ctor, args) {
                        args = args.length > 0 ? "(" + add_commas(MAP(args, function(expr){
                            return parenthesize(expr, "seq");
                        })) + ")" : "";
                        return add_spaces([ "new", parenthesize(ctor, "seq", "binary", "conditional", "assign", function(expr){
                            var w = ast_walker(), has_call = {};
                            try {
                                w.with_walkers({
                                    "call": function() { throw has_call },
                                    "function": function() { return this }
                                }, function(){
                                    w.walk(expr);
                                });
                            } catch(ex) {
                                if (ex === has_call)
                                    return true;
                                throw ex;
                            }
                        }) + args ]);
                    },
                    "switch": function(expr, body) {
                        return add_spaces([ "switch", "(" + make(expr) + ")", make_switch_block(body) ]);
                    },
                    "break": function(label) {
                        var out = "break";
                        if (label != null)
                            out += " " + make_name(label);
                        return out + ";";
                    },
                    "continue": function(label) {
                        var out = "continue";
                        if (label != null)
                            out += " " + make_name(label);
                        return out + ";";
                    },
                    "conditional": function(co, th, el) {
                        return add_spaces([ parenthesize(co, "assign", "seq", "conditional"), "?",
                            parenthesize(th, "seq"), ":",
                            parenthesize(el, "seq") ]);
                    },
                    "assign": function(op, lvalue, rvalue) {
                        if (op && op !== true) op += "=";
                        else op = "=";
                        return add_spaces([ make(lvalue), op, parenthesize(rvalue, "seq") ]);
                    },
                    "dot": function(expr) {
                        var out = make(expr), i = 1;
                        if (expr[0] == "num") {
                            if (!/[a-f.]/i.test(out))
                                out += ".";
                        } else if (expr[0] != "function" && needs_parens(expr))
                            out = "(" + out + ")";
                        while (i < arguments.length)
                            out += "." + make_name(arguments[i++]);
                        return out;
                    },
                    "call": function(func, args) {
                        var f = make(func);
                        if (f.charAt(0) != "(" && needs_parens(func))
                            f = "(" + f + ")";
                        return f + "(" + add_commas(MAP(args, function(expr){
                                return parenthesize(expr, "seq");
                            })) + ")";
                    },
                    "function": make_function,
                    "defun": make_function,
                    "if": function(co, th, el) {
                        var out = [ "if", "(" + make(co) + ")", el ? make_then(th) : make(th) ];
                        if (el) {
                            out.push("else", make(el));
                        }
                        return add_spaces(out);
                    },
                    "for": function(init, cond, step, block) {
                        var out = [ "for" ];
                        init = (init != null ? make(init) : "").replace(/;*\s*$/, ";" + space);
                        cond = (cond != null ? make(cond) : "").replace(/;*\s*$/, ";" + space);
                        step = (step != null ? make(step) : "").replace(/;*\s*$/, "");
                        var args = init + cond + step;
                        if (args == "; ; ") args = ";;";
                        out.push("(" + args + ")", make(block));
                        return add_spaces(out);
                    },
                    "for-in": function(vvar, key, hash, block) {
                        return add_spaces([ "for", "(" +
                        (vvar ? make(vvar).replace(/;+$/, "") : make(key)),
                            "in",
                            make(hash) + ")", make(block) ]);
                    },
                    "while": function(condition, block) {
                        return add_spaces([ "while", "(" + make(condition) + ")", make(block) ]);
                    },
                    "do": function(condition, block) {
                        return add_spaces([ "do", make(block), "while", "(" + make(condition) + ")" ]) + ";";
                    },
                    "return": function(expr) {
                        var out = [ "return" ];
                        if (expr != null) out.push(make(expr));
                        return add_spaces(out) + ";";
                    },
                    "binary": function(operator, lvalue, rvalue) {
                        var left = make(lvalue), right = make(rvalue);
                        // XXX: I'm pretty sure other cases will bite here.
                        //      we need to be smarter.
                        //      adding parens all the time is the safest bet.
                        if (member(lvalue[0], [ "assign", "conditional", "seq" ]) ||
                            lvalue[0] == "binary" && PRECEDENCE[operator] > PRECEDENCE[lvalue[1]] ||
                            lvalue[0] == "function" && needs_parens(this)) {
                            left = "(" + left + ")";
                        }
                        if (member(rvalue[0], [ "assign", "conditional", "seq" ]) ||
                            rvalue[0] == "binary" && PRECEDENCE[operator] >= PRECEDENCE[rvalue[1]] &&
                            !(rvalue[1] == operator && member(operator, [ "&&", "||", "*" ]))) {
                            right = "(" + right + ")";
                        }
                        else if (!beautify && options.inline_script && (operator == "<" || operator == "<<")
                            && rvalue[0] == "regexp" && /^script/i.test(rvalue[1])) {
                            right = " " + right;
                        }
                        return add_spaces([ left, operator, right ]);
                    },
                    "unary-prefix": function(operator, expr) {
                        var val = make(expr);
                        if (!(expr[0] == "num" || (expr[0] == "unary-prefix" && !HOP(OPERATORS, operator + expr[1])) || !needs_parens(expr)))
                            val = "(" + val + ")";
                        return operator + (jsp.is_alphanumeric_char(operator.charAt(0)) ? " " : "") + val;
                    },
                    "unary-postfix": function(operator, expr) {
                        var val = make(expr);
                        if (!(expr[0] == "num" || (expr[0] == "unary-postfix" && !HOP(OPERATORS, operator + expr[1])) || !needs_parens(expr)))
                            val = "(" + val + ")";
                        return val + operator;
                    },
                    "sub": function(expr, subscript) {
                        var hash = make(expr);
                        if (needs_parens(expr))
                            hash = "(" + hash + ")";
                        return hash + "[" + make(subscript) + "]";
                    },
                    "object": function(props) {
                        var obj_needs_parens = needs_parens(this);
                        if (props.length == 0)
                            return obj_needs_parens ? "({})" : "{}";
                        var out = "{" + newline + with_indent(function(){
                                return MAP(props, function(p){
                                    if (p.length == 3) {
                                        // getter/setter.  The name is in p[0], the arg.list in p[1][2], the
                                        // body in p[1][3] and type ("get" / "set") in p[2].
                                        return indent(make_function(p[0], p[1][2], p[1][3], p[2], true));
                                    }
                                    var key = p[0], val = parenthesize(p[1], "seq");
                                    if (options.quote_keys) {
                                        key = encode_string(key);
                                    } else if ((typeof key == "number" || !beautify && +key + "" == key)
                                        && parseFloat(key) >= 0) {
                                        key = make_num(+key);
                                    } else if (!is_identifier(key)) {
                                        key = encode_string(key);
                                    }
                                    return indent(add_spaces(beautify && options.space_colon
                                        ? [ key, ":", val ]
                                        : [ key + ":", val ]));
                                }).join("," + newline);
                            }) + newline + indent("}");
                        return obj_needs_parens ? "(" + out + ")" : out;
                    },
                    "regexp": function(rx, mods) {
                        if (options.ascii_only) rx = to_ascii(rx);
                        return "/" + rx + "/" + mods;
                    },
                    "array": function(elements) {
                        if (elements.length == 0) return "[]";
                        return add_spaces([ "[", add_commas(MAP(elements, function(el, i){
                            if (!beautify && el[0] == "atom" && el[1] == "undefined") return i === elements.length - 1 ? "," : "";
                            return parenthesize(el, "seq");
                        })), "]" ]);
                    },
                    "stat": function(stmt) {
                        return stmt != null
                            ? make(stmt).replace(/;*\s*$/, ";")
                            : ";";
                    },
                    "seq": function() {
                        return add_commas(MAP(slice(arguments), make));
                    },
                    "label": function(name, block) {
                        return add_spaces([ make_name(name), ":", make(block) ]);
                    },
                    "with": function(expr, block) {
                        return add_spaces([ "with", "(" + make(expr) + ")", make(block) ]);
                    },
                    "atom": function(name) {
                        return make_name(name);
                    },
                    "directive": function(dir) {
                        return make_string(dir) + ";";
                    }
                }, function(){ return make(ast) });

                // The squeezer replaces "block"-s that contain only a single
                // statement with the statement itself; technically, the AST
                // is correct, but this can create problems when we output an
                // IF having an ELSE clause where the THEN clause ends in an
                // IF *without* an ELSE block (then the outer ELSE would refer
                // to the inner IF).  This function checks for this case and
                // adds the block brackets if needed.
                function make_then(th) {
                    if (th == null) return ";";
                    if (th[0] == "do") {
                        // https://github.com/mishoo/UglifyJS/issues/#issue/57
                        // IE croaks with "syntax error" on code like this:
                        //     if (foo) do ... while(cond); else ...
                        // we need block brackets around do/while
                        return make_block([ th ]);
                    }
                    var b = th;
                    while (true) {
                        var type = b[0];
                        if (type == "if") {
                            if (!b[3])
                            // no else, we must add the block
                                return make([ "block", [ th ]]);
                            b = b[3];
                        }
                        else if (type == "while" || type == "do") b = b[2];
                        else if (type == "for" || type == "for-in") b = b[4];
                        else break;
                    }
                    return make(th);
                };

                function make_function(name, args, body, keyword, no_parens) {
                    var out = keyword || "function";
                    if (name) {
                        out += " " + make_name(name);
                    }
                    out += "(" + add_commas(MAP(args, make_name)) + ")";
                    out = add_spaces([ out, make_block(body) ]);
                    return (!no_parens && needs_parens(this)) ? "(" + out + ")" : out;
                };

                function must_has_semicolon(node) {
                    switch (node[0]) {
                        case "with":
                        case "while":
                            return empty(node[2]) || must_has_semicolon(node[2]);
                        case "for":
                        case "for-in":
                            return empty(node[4]) || must_has_semicolon(node[4]);
                        case "if":
                            if (empty(node[2]) && !node[3]) return true; // `if' with empty `then' and no `else'
                            if (node[3]) {
                                if (empty(node[3])) return true; // `else' present but empty
                                return must_has_semicolon(node[3]); // dive into the `else' branch
                            }
                            return must_has_semicolon(node[2]); // dive into the `then' branch
                        case "directive":
                            return true;
                    }
                };

                function make_block_statements(statements, noindent) {
                    for (var a = [], last = statements.length - 1, i = 0; i <= last; ++i) {
                        var stat = statements[i];
                        var code = make(stat);
                        if (code != ";") {
                            if (!beautify && i == last && !must_has_semicolon(stat)) {
                                code = code.replace(/;+\s*$/, "");
                            }
                            a.push(code);
                        }
                    }
                    return noindent ? a : MAP(a, indent);
                };

                function make_switch_block(body) {
                    var n = body.length;
                    if (n == 0) return "{}";
                    return "{" + newline + MAP(body, function(branch, i){
                            var has_body = branch[1].length > 0, code = with_indent(function(){
                                    return indent(branch[0]
                                        ? add_spaces([ "case", make(branch[0]) + ":" ])
                                        : "default:");
                                }, 0.5) + (has_body ? newline + with_indent(function(){
                                    return make_block_statements(branch[1]).join(newline);
                                }) : "");
                            if (!beautify && has_body && i < n - 1)
                                code += ";";
                            return code;
                        }).join(newline) + newline + indent("}");
                };

                function make_block(statements) {
                    if (!statements) return ";";
                    if (statements.length == 0) return "{}";
                    return "{" + newline + with_indent(function(){
                            return make_block_statements(statements).join(newline);
                        }) + newline + indent("}");
                };

                function make_1vardef(def) {
                    var name = def[0], val = def[1];
                    if (val != null)
                        name = add_spaces([ make_name(name), "=", parenthesize(val, "seq") ]);
                    return name;
                };

            };

            function split_lines(code, max_line_length) {
                var splits = [ 0 ];
                jsp.parse(function(){
                    var next_token = jsp.tokenizer(code);
                    var last_split = 0;
                    var prev_token;
                    function current_length(tok) {
                        return tok.pos - last_split;
                    };
                    function split_here(tok) {
                        last_split = tok.pos;
                        splits.push(last_split);
                    };
                    function custom(){
                        var tok = next_token.apply(this, arguments);
                        out: {
                            if (prev_token) {
                                if (prev_token.type == "keyword") break out;
                            }
                            if (current_length(tok) > max_line_length) {
                                switch (tok.type) {
                                    case "keyword":
                                    case "atom":
                                    case "name":
                                    case "punc":
                                        split_here(tok);
                                        break out;
                                }
                            }
                        }
                        prev_token = tok;
                        return tok;
                    };
                    custom.context = function() {
                        return next_token.context.apply(this, arguments);
                    };
                    return custom;
                }());
                return splits.map(function(pos, i){
                    return code.substring(pos, splits[i + 1] || code.length);
                }).join("\n");
            };

            /* -----[ Utilities ]----- */

            function repeat_string(str, i) {
                if (i <= 0) return "";
                if (i == 1) return str;
                var d = repeat_string(str, i >> 1);
                d += d;
                if (i & 1) d += str;
                return d;
            };

            function defaults(args, defs) {
                var ret = {};
                if (args === true)
                    args = {};
                for (var i in defs) if (HOP(defs, i)) {
                    ret[i] = (args && HOP(args, i)) ? args[i] : defs[i];
                }
                return ret;
            };

            function is_identifier(name) {
                return /^[a-z_$][a-z0-9_$]*$/i.test(name)
                    && name != "this"
                    && !HOP(jsp.KEYWORDS_ATOM, name)
                    && !HOP(jsp.RESERVED_WORDS, name)
                    && !HOP(jsp.KEYWORDS, name);
            };

            function HOP(obj, prop) {
                return Object.prototype.hasOwnProperty.call(obj, prop);
            };

// some utilities

            var MAP;

            (function(){
                MAP = function(a, f, o) {
                    var ret = [], top = [], i;
                    function doit() {
                        var val = f.call(o, a[i], i);
                        if (val instanceof AtTop) {
                            val = val.v;
                            if (val instanceof Splice) {
                                top.push.apply(top, val.v);
                            } else {
                                top.push(val);
                            }
                        }
                        else if (val != skip) {
                            if (val instanceof Splice) {
                                ret.push.apply(ret, val.v);
                            } else {
                                ret.push(val);
                            }
                        }
                    };
                    if (a instanceof Array) for (i = 0; i < a.length; ++i) doit();
                    else for (i in a) if (HOP(a, i)) doit();
                    return top.concat(ret);
                };
                MAP.at_top = function(val) { return new AtTop(val) };
                MAP.splice = function(val) { return new Splice(val) };
                var skip = MAP.skip = {};
                function AtTop(val) { this.v = val };
                function Splice(val) { this.v = val };
            })();

            /* -----[ Exports ]----- */

            exports.ast_walker = ast_walker;
            exports.ast_mangle = ast_mangle;
            exports.ast_squeeze = ast_squeeze;
            exports.ast_lift_variables = ast_lift_variables;
            exports.gen_code = gen_code;
            exports.ast_add_scope = ast_add_scope;
            exports.set_logger = function(logger) { warn = logger };
            exports.make_string = make_string;
            exports.split_lines = split_lines;
            exports.MAP = MAP;

// keep this last!
            exports.ast_squeeze_more = require("./squeeze-more").ast_squeeze_more;

// Local variables:
// js-indent-level: 4
// End:
        });
        define('uglifyjs/index', ["require", "exports", "module", "./parse-js", "./process", "./consolidator"], function(require, exports, module) {
//convienence function(src, [options]);
            function uglify(orig_code, options){
                options || (options = {});
                var jsp = uglify.parser;
                var pro = uglify.uglify;

                var ast = jsp.parse(orig_code, options.strict_semicolons); // parse code and get the initial AST
                ast = pro.ast_mangle(ast, options.mangle_options); // get a new AST with mangled names
                ast = pro.ast_squeeze(ast, options.squeeze_options); // get an AST with compression optimizations
                var final_code = pro.gen_code(ast, options.gen_options); // compressed code here
                return final_code;
            };

            uglify.parser = require("./parse-js");
            uglify.uglify = require("./process");
            uglify.consolidator = require("./consolidator");

            module.exports = uglify
        });/* -*- Mode: js; js-indent-level: 2; -*- */
        /*
         * Copyright 2011 Mozilla Foundation and contributors
         * Licensed under the New BSD license. See LICENSE or:
         * http://opensource.org/licenses/BSD-3-Clause
         */

        define('source-map/array-set', function (require, exports, module) {

            var util = require('./util');

            /**
             * A data structure which is a combination of an array and a set. Adding a new
             * member is O(1), testing for membership is O(1), and finding the index of an
             * element is O(1). Removing elements from the set is not supported. Only
             * strings are supported for membership.
             */
            function ArraySet() {
                this._array = [];
                this._set = {};
            }

            /**
             * Static method for creating ArraySet instances from an existing array.
             */
            ArraySet.fromArray = function ArraySet_fromArray(aArray, aAllowDuplicates) {
                var set = new ArraySet();
                for (var i = 0, len = aArray.length; i < len; i++) {
                    set.add(aArray[i], aAllowDuplicates);
                }
                return set;
            };

            /**
             * Add the given string to this set.
             *
             * @param String aStr
             */
            ArraySet.prototype.add = function ArraySet_add(aStr, aAllowDuplicates) {
                var isDuplicate = this.has(aStr);
                var idx = this._array.length;
                if (!isDuplicate || aAllowDuplicates) {
                    this._array.push(aStr);
                }
                if (!isDuplicate) {
                    this._set[util.toSetString(aStr)] = idx;
                }
            };

            /**
             * Is the given string a member of this set?
             *
             * @param String aStr
             */
            ArraySet.prototype.has = function ArraySet_has(aStr) {
                return Object.prototype.hasOwnProperty.call(this._set,
                    util.toSetString(aStr));
            };

            /**
             * What is the index of the given string in the array?
             *
             * @param String aStr
             */
            ArraySet.prototype.indexOf = function ArraySet_indexOf(aStr) {
                if (this.has(aStr)) {
                    return this._set[util.toSetString(aStr)];
                }
                throw new Error('"' + aStr + '" is not in the set.');
            };

            /**
             * What is the element at the given index?
             *
             * @param Number aIdx
             */
            ArraySet.prototype.at = function ArraySet_at(aIdx) {
                if (aIdx >= 0 && aIdx < this._array.length) {
                    return this._array[aIdx];
                }
                throw new Error('No element indexed by ' + aIdx);
            };

            /**
             * Returns the array representation of this set (which has the proper indices
             * indicated by indexOf). Note that this is a copy of the internal array used
             * for storing the members so that no one can mess with internal state.
             */
            ArraySet.prototype.toArray = function ArraySet_toArray() {
                return this._array.slice();
            };

            exports.ArraySet = ArraySet;

        });
        /* -*- Mode: js; js-indent-level: 2; -*- */
        /*
         * Copyright 2011 Mozilla Foundation and contributors
         * Licensed under the New BSD license. See LICENSE or:
         * http://opensource.org/licenses/BSD-3-Clause
         *
         * Based on the Base 64 VLQ implementation in Closure Compiler:
         * https://code.google.com/p/closure-compiler/source/browse/trunk/src/com/google/debugging/sourcemap/Base64VLQ.java
         *
         * Copyright 2011 The Closure Compiler Authors. All rights reserved.
         * Redistribution and use in source and binary forms, with or without
         * modification, are permitted provided that the following conditions are
         * met:
         *
         *  * Redistributions of source code must retain the above copyright
         *    notice, this list of conditions and the following disclaimer.
         *  * Redistributions in binary form must reproduce the above
         *    copyright notice, this list of conditions and the following
         *    disclaimer in the documentation and/or other materials provided
         *    with the distribution.
         *  * Neither the name of Google Inc. nor the names of its
         *    contributors may be used to endorse or promote products derived
         *    from this software without specific prior written permission.
         *
         * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
         * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
         * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
         * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
         * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
         * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
         * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
         * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
         * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
         * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
         * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
         */

        define('source-map/base64-vlq', function (require, exports, module) {

            var base64 = require('./base64');

            // A single base 64 digit can contain 6 bits of data. For the base 64 variable
            // length quantities we use in the source map spec, the first bit is the sign,
            // the next four bits are the actual value, and the 6th bit is the
            // continuation bit. The continuation bit tells us whether there are more
            // digits in this value following this digit.
            //
            //   Continuation
            //   |    Sign
            //   |    |
            //   V    V
            //   101011

            var VLQ_BASE_SHIFT = 5;

            // binary: 100000
            var VLQ_BASE = 1 << VLQ_BASE_SHIFT;

            // binary: 011111
            var VLQ_BASE_MASK = VLQ_BASE - 1;

            // binary: 100000
            var VLQ_CONTINUATION_BIT = VLQ_BASE;

            /**
             * Converts from a two-complement value to a value where the sign bit is
             * is placed in the least significant bit.  For example, as decimals:
             *   1 becomes 2 (10 binary), -1 becomes 3 (11 binary)
             *   2 becomes 4 (100 binary), -2 becomes 5 (101 binary)
             */
            function toVLQSigned(aValue) {
                return aValue < 0
                    ? ((-aValue) << 1) + 1
                    : (aValue << 1) + 0;
            }

            /**
             * Converts to a two-complement value from a value where the sign bit is
             * is placed in the least significant bit.  For example, as decimals:
             *   2 (10 binary) becomes 1, 3 (11 binary) becomes -1
             *   4 (100 binary) becomes 2, 5 (101 binary) becomes -2
             */
            function fromVLQSigned(aValue) {
                var isNegative = (aValue & 1) === 1;
                var shifted = aValue >> 1;
                return isNegative
                    ? -shifted
                    : shifted;
            }

            /**
             * Returns the base 64 VLQ encoded value.
             */
            exports.encode = function base64VLQ_encode(aValue) {
                var encoded = "";
                var digit;

                var vlq = toVLQSigned(aValue);

                do {
                    digit = vlq & VLQ_BASE_MASK;
                    vlq >>>= VLQ_BASE_SHIFT;
                    if (vlq > 0) {
                        // There are still more digits in this value, so we must make sure the
                        // continuation bit is marked.
                        digit |= VLQ_CONTINUATION_BIT;
                    }
                    encoded += base64.encode(digit);
                } while (vlq > 0);

                return encoded;
            };

            /**
             * Decodes the next base 64 VLQ value from the given string and returns the
             * value and the rest of the string.
             */
            exports.decode = function base64VLQ_decode(aStr) {
                var i = 0;
                var strLen = aStr.length;
                var result = 0;
                var shift = 0;
                var continuation, digit;

                do {
                    if (i >= strLen) {
                        throw new Error("Expected more digits in base 64 VLQ value.");
                    }
                    digit = base64.decode(aStr.charAt(i++));
                    continuation = !!(digit & VLQ_CONTINUATION_BIT);
                    digit &= VLQ_BASE_MASK;
                    result = result + (digit << shift);
                    shift += VLQ_BASE_SHIFT;
                } while (continuation);

                return {
                    value: fromVLQSigned(result),
                    rest: aStr.slice(i)
                };
            };

        });
        /* -*- Mode: js; js-indent-level: 2; -*- */
        /*
         * Copyright 2011 Mozilla Foundation and contributors
         * Licensed under the New BSD license. See LICENSE or:
         * http://opensource.org/licenses/BSD-3-Clause
         */

        define('source-map/base64', function (require, exports, module) {

            var charToIntMap = {};
            var intToCharMap = {};

            'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
                .split('')
                .forEach(function (ch, index) {
                    charToIntMap[ch] = index;
                    intToCharMap[index] = ch;
                });

            /**
             * Encode an integer in the range of 0 to 63 to a single base 64 digit.
             */
            exports.encode = function base64_encode(aNumber) {
                if (aNumber in intToCharMap) {
                    return intToCharMap[aNumber];
                }
                throw new TypeError("Must be between 0 and 63: " + aNumber);
            };

            /**
             * Decode a single base 64 digit to an integer.
             */
            exports.decode = function base64_decode(aChar) {
                if (aChar in charToIntMap) {
                    return charToIntMap[aChar];
                }
                throw new TypeError("Not a valid base 64 digit: " + aChar);
            };

        });
        /* -*- Mode: js; js-indent-level: 2; -*- */
        /*
         * Copyright 2011 Mozilla Foundation and contributors
         * Licensed under the New BSD license. See LICENSE or:
         * http://opensource.org/licenses/BSD-3-Clause
         */

        define('source-map/binary-search', function (require, exports, module) {

            /**
             * Recursive implementation of binary search.
             *
             * @param aLow Indices here and lower do not contain the needle.
             * @param aHigh Indices here and higher do not contain the needle.
             * @param aNeedle The element being searched for.
             * @param aHaystack The non-empty array being searched.
             * @param aCompare Function which takes two elements and returns -1, 0, or 1.
             */
            function recursiveSearch(aLow, aHigh, aNeedle, aHaystack, aCompare) {
                // This function terminates when one of the following is true:
                //
                //   1. We find the exact element we are looking for.
                //
                //   2. We did not find the exact element, but we can return the next
                //      closest element that is less than that element.
                //
                //   3. We did not find the exact element, and there is no next-closest
                //      element which is less than the one we are searching for, so we
                //      return null.
                var mid = Math.floor((aHigh - aLow) / 2) + aLow;
                var cmp = aCompare(aNeedle, aHaystack[mid], true);
                if (cmp === 0) {
                    // Found the element we are looking for.
                    return aHaystack[mid];
                }
                else if (cmp > 0) {
                    // aHaystack[mid] is greater than our needle.
                    if (aHigh - mid > 1) {
                        // The element is in the upper half.
                        return recursiveSearch(mid, aHigh, aNeedle, aHaystack, aCompare);
                    }
                    // We did not find an exact match, return the next closest one
                    // (termination case 2).
                    return aHaystack[mid];
                }
                else {
                    // aHaystack[mid] is less than our needle.
                    if (mid - aLow > 1) {
                        // The element is in the lower half.
                        return recursiveSearch(aLow, mid, aNeedle, aHaystack, aCompare);
                    }
                    // The exact needle element was not found in this haystack. Determine if
                    // we are in termination case (2) or (3) and return the appropriate thing.
                    return aLow < 0
                        ? null
                        : aHaystack[aLow];
                }
            }

            /**
             * This is an implementation of binary search which will always try and return
             * the next lowest value checked if there is no exact hit. This is because
             * mappings between original and generated line/col pairs are single points,
             * and there is an implicit region between each of them, so a miss just means
             * that you aren't on the very start of a region.
             *
             * @param aNeedle The element you are looking for.
             * @param aHaystack The array that is being searched.
             * @param aCompare A function which takes the needle and an element in the
             *     array and returns -1, 0, or 1 depending on whether the needle is less
             *     than, equal to, or greater than the element, respectively.
             */
            exports.search = function search(aNeedle, aHaystack, aCompare) {
                return aHaystack.length > 0
                    ? recursiveSearch(-1, aHaystack.length, aNeedle, aHaystack, aCompare)
                    : null;
            };

        });
        /* -*- Mode: js; js-indent-level: 2; -*- */
        /*
         * Copyright 2011 Mozilla Foundation and contributors
         * Licensed under the New BSD license. See LICENSE or:
         * http://opensource.org/licenses/BSD-3-Clause
         */

        define('source-map/source-map-consumer', function (require, exports, module) {

            var util = require('./util');
            var binarySearch = require('./binary-search');
            var ArraySet = require('./array-set').ArraySet;
            var base64VLQ = require('./base64-vlq');

            /**
             * A SourceMapConsumer instance represents a parsed source map which we can
             * query for information about the original file positions by giving it a file
             * position in the generated source.
             *
             * The only parameter is the raw source map (either as a JSON string, or
             * already parsed to an object). According to the spec, source maps have the
             * following attributes:
             *
             *   - version: Which version of the source map spec this map is following.
             *   - sources: An array of URLs to the original source files.
             *   - names: An array of identifiers which can be referrenced by individual mappings.
             *   - sourceRoot: Optional. The URL root from which all sources are relative.
             *   - sourcesContent: Optional. An array of contents of the original source files.
             *   - mappings: A string of base64 VLQs which contain the actual mappings.
             *   - file: Optional. The generated file this source map is associated with.
             *
             * Here is an example source map, taken from the source map spec[0]:
             *
             *     {
   *       version : 3,
   *       file: "out.js",
   *       sourceRoot : "",
   *       sources: ["foo.js", "bar.js"],
   *       names: ["src", "maps", "are", "fun"],
   *       mappings: "AA,AB;;ABCDE;"
   *     }
             *
             * [0]: https://docs.google.com/document/d/1U1RGAehQwRypUTovF1KRlpiOFze0b-_2gc6fAH0KY0k/edit?pli=1#
             */
            function SourceMapConsumer(aSourceMap) {
                var sourceMap = aSourceMap;
                if (typeof aSourceMap === 'string') {
                    sourceMap = JSON.parse(aSourceMap.replace(/^\)\]\}'/, ''));
                }

                var version = util.getArg(sourceMap, 'version');
                var sources = util.getArg(sourceMap, 'sources');
                // Sass 3.3 leaves out the 'names' array, so we deviate from the spec (which
                // requires the array) to play nice here.
                var names = util.getArg(sourceMap, 'names', []);
                var sourceRoot = util.getArg(sourceMap, 'sourceRoot', null);
                var sourcesContent = util.getArg(sourceMap, 'sourcesContent', null);
                var mappings = util.getArg(sourceMap, 'mappings');
                var file = util.getArg(sourceMap, 'file', null);

                // Once again, Sass deviates from the spec and supplies the version as a
                // string rather than a number, so we use loose equality checking here.
                if (version != this._version) {
                    throw new Error('Unsupported version: ' + version);
                }

                // Pass `true` below to allow duplicate names and sources. While source maps
                // are intended to be compressed and deduplicated, the TypeScript compiler
                // sometimes generates source maps with duplicates in them. See Github issue
                // #72 and bugzil.la/889492.
                this._names = ArraySet.fromArray(names, true);
                this._sources = ArraySet.fromArray(sources, true);

                this.sourceRoot = sourceRoot;
                this.sourcesContent = sourcesContent;
                this._mappings = mappings;
                this.file = file;
            }

            /**
             * Create a SourceMapConsumer from a SourceMapGenerator.
             *
             * @param SourceMapGenerator aSourceMap
             *        The source map that will be consumed.
             * @returns SourceMapConsumer
             */
            SourceMapConsumer.fromSourceMap =
                function SourceMapConsumer_fromSourceMap(aSourceMap) {
                    var smc = Object.create(SourceMapConsumer.prototype);

                    smc._names = ArraySet.fromArray(aSourceMap._names.toArray(), true);
                    smc._sources = ArraySet.fromArray(aSourceMap._sources.toArray(), true);
                    smc.sourceRoot = aSourceMap._sourceRoot;
                    smc.sourcesContent = aSourceMap._generateSourcesContent(smc._sources.toArray(),
                        smc.sourceRoot);
                    smc.file = aSourceMap._file;

                    smc.__generatedMappings = aSourceMap._mappings.slice()
                        .sort(util.compareByGeneratedPositions);
                    smc.__originalMappings = aSourceMap._mappings.slice()
                        .sort(util.compareByOriginalPositions);

                    return smc;
                };

            /**
             * The version of the source mapping spec that we are consuming.
             */
            SourceMapConsumer.prototype._version = 3;

            /**
             * The list of original sources.
             */
            Object.defineProperty(SourceMapConsumer.prototype, 'sources', {
                get: function () {
                    return this._sources.toArray().map(function (s) {
                        return this.sourceRoot ? util.join(this.sourceRoot, s) : s;
                    }, this);
                }
            });

            // `__generatedMappings` and `__originalMappings` are arrays that hold the
            // parsed mapping coordinates from the source map's "mappings" attribute. They
            // are lazily instantiated, accessed via the `_generatedMappings` and
            // `_originalMappings` getters respectively, and we only parse the mappings
            // and create these arrays once queried for a source location. We jump through
            // these hoops because there can be many thousands of mappings, and parsing
            // them is expensive, so we only want to do it if we must.
            //
            // Each object in the arrays is of the form:
            //
            //     {
            //       generatedLine: The line number in the generated code,
            //       generatedColumn: The column number in the generated code,
            //       source: The path to the original source file that generated this
            //               chunk of code,
            //       originalLine: The line number in the original source that
            //                     corresponds to this chunk of generated code,
            //       originalColumn: The column number in the original source that
            //                       corresponds to this chunk of generated code,
            //       name: The name of the original symbol which generated this chunk of
            //             code.
            //     }
            //
            // All properties except for `generatedLine` and `generatedColumn` can be
            // `null`.
            //
            // `_generatedMappings` is ordered by the generated positions.
            //
            // `_originalMappings` is ordered by the original positions.

            SourceMapConsumer.prototype.__generatedMappings = null;
            Object.defineProperty(SourceMapConsumer.prototype, '_generatedMappings', {
                get: function () {
                    if (!this.__generatedMappings) {
                        this.__generatedMappings = [];
                        this.__originalMappings = [];
                        this._parseMappings(this._mappings, this.sourceRoot);
                    }

                    return this.__generatedMappings;
                }
            });

            SourceMapConsumer.prototype.__originalMappings = null;
            Object.defineProperty(SourceMapConsumer.prototype, '_originalMappings', {
                get: function () {
                    if (!this.__originalMappings) {
                        this.__generatedMappings = [];
                        this.__originalMappings = [];
                        this._parseMappings(this._mappings, this.sourceRoot);
                    }

                    return this.__originalMappings;
                }
            });

            /**
             * Parse the mappings in a string in to a data structure which we can easily
             * query (the ordered arrays in the `this.__generatedMappings` and
             * `this.__originalMappings` properties).
             */
            SourceMapConsumer.prototype._parseMappings =
                function SourceMapConsumer_parseMappings(aStr, aSourceRoot) {
                    var generatedLine = 1;
                    var previousGeneratedColumn = 0;
                    var previousOriginalLine = 0;
                    var previousOriginalColumn = 0;
                    var previousSource = 0;
                    var previousName = 0;
                    var mappingSeparator = /^[,;]/;
                    var str = aStr;
                    var mapping;
                    var temp;

                    while (str.length > 0) {
                        if (str.charAt(0) === ';') {
                            generatedLine++;
                            str = str.slice(1);
                            previousGeneratedColumn = 0;
                        }
                        else if (str.charAt(0) === ',') {
                            str = str.slice(1);
                        }
                        else {
                            mapping = {};
                            mapping.generatedLine = generatedLine;

                            // Generated column.
                            temp = base64VLQ.decode(str);
                            mapping.generatedColumn = previousGeneratedColumn + temp.value;
                            previousGeneratedColumn = mapping.generatedColumn;
                            str = temp.rest;

                            if (str.length > 0 && !mappingSeparator.test(str.charAt(0))) {
                                // Original source.
                                temp = base64VLQ.decode(str);
                                mapping.source = this._sources.at(previousSource + temp.value);
                                previousSource += temp.value;
                                str = temp.rest;
                                if (str.length === 0 || mappingSeparator.test(str.charAt(0))) {
                                    throw new Error('Found a source, but no line and column');
                                }

                                // Original line.
                                temp = base64VLQ.decode(str);
                                mapping.originalLine = previousOriginalLine + temp.value;
                                previousOriginalLine = mapping.originalLine;
                                // Lines are stored 0-based
                                mapping.originalLine += 1;
                                str = temp.rest;
                                if (str.length === 0 || mappingSeparator.test(str.charAt(0))) {
                                    throw new Error('Found a source and line, but no column');
                                }

                                // Original column.
                                temp = base64VLQ.decode(str);
                                mapping.originalColumn = previousOriginalColumn + temp.value;
                                previousOriginalColumn = mapping.originalColumn;
                                str = temp.rest;

                                if (str.length > 0 && !mappingSeparator.test(str.charAt(0))) {
                                    // Original name.
                                    temp = base64VLQ.decode(str);
                                    mapping.name = this._names.at(previousName + temp.value);
                                    previousName += temp.value;
                                    str = temp.rest;
                                }
                            }

                            this.__generatedMappings.push(mapping);
                            if (typeof mapping.originalLine === 'number') {
                                this.__originalMappings.push(mapping);
                            }
                        }
                    }

                    this.__generatedMappings.sort(util.compareByGeneratedPositions);
                    this.__originalMappings.sort(util.compareByOriginalPositions);
                };

            /**
             * Find the mapping that best matches the hypothetical "needle" mapping that
             * we are searching for in the given "haystack" of mappings.
             */
            SourceMapConsumer.prototype._findMapping =
                function SourceMapConsumer_findMapping(aNeedle, aMappings, aLineName,
                                                       aColumnName, aComparator) {
                    // To return the position we are searching for, we must first find the
                    // mapping for the given position and then return the opposite position it
                    // points to. Because the mappings are sorted, we can use binary search to
                    // find the best mapping.

                    if (aNeedle[aLineName] <= 0) {
                        throw new TypeError('Line must be greater than or equal to 1, got '
                            + aNeedle[aLineName]);
                    }
                    if (aNeedle[aColumnName] < 0) {
                        throw new TypeError('Column must be greater than or equal to 0, got '
                            + aNeedle[aColumnName]);
                    }

                    return binarySearch.search(aNeedle, aMappings, aComparator);
                };

            /**
             * Returns the original source, line, and column information for the generated
             * source's line and column positions provided. The only argument is an object
             * with the following properties:
             *
             *   - line: The line number in the generated source.
             *   - column: The column number in the generated source.
             *
             * and an object is returned with the following properties:
             *
             *   - source: The original source file, or null.
             *   - line: The line number in the original source, or null.
             *   - column: The column number in the original source, or null.
             *   - name: The original identifier, or null.
             */
            SourceMapConsumer.prototype.originalPositionFor =
                function SourceMapConsumer_originalPositionFor(aArgs) {
                    var needle = {
                        generatedLine: util.getArg(aArgs, 'line'),
                        generatedColumn: util.getArg(aArgs, 'column')
                    };

                    var mapping = this._findMapping(needle,
                        this._generatedMappings,
                        "generatedLine",
                        "generatedColumn",
                        util.compareByGeneratedPositions);

                    if (mapping && mapping.generatedLine === needle.generatedLine) {
                        var source = util.getArg(mapping, 'source', null);
                        if (source && this.sourceRoot) {
                            source = util.join(this.sourceRoot, source);
                        }
                        return {
                            source: source,
                            line: util.getArg(mapping, 'originalLine', null),
                            column: util.getArg(mapping, 'originalColumn', null),
                            name: util.getArg(mapping, 'name', null)
                        };
                    }

                    return {
                        source: null,
                        line: null,
                        column: null,
                        name: null
                    };
                };

            /**
             * Returns the original source content. The only argument is the url of the
             * original source file. Returns null if no original source content is
             * availible.
             */
            SourceMapConsumer.prototype.sourceContentFor =
                function SourceMapConsumer_sourceContentFor(aSource) {
                    if (!this.sourcesContent) {
                        return null;
                    }

                    if (this.sourceRoot) {
                        aSource = util.relative(this.sourceRoot, aSource);
                    }

                    if (this._sources.has(aSource)) {
                        return this.sourcesContent[this._sources.indexOf(aSource)];
                    }

                    var url;
                    if (this.sourceRoot
                        && (url = util.urlParse(this.sourceRoot))) {
                        // XXX: file:// URIs and absolute paths lead to unexpected behavior for
                        // many users. We can help them out when they expect file:// URIs to
                        // behave like it would if they were running a local HTTP server. See
                        // https://bugzilla.mozilla.org/show_bug.cgi?id=885597.
                        var fileUriAbsPath = aSource.replace(/^file:\/\//, "");
                        if (url.scheme == "file"
                            && this._sources.has(fileUriAbsPath)) {
                            return this.sourcesContent[this._sources.indexOf(fileUriAbsPath)]
                        }

                        if ((!url.path || url.path == "/")
                            && this._sources.has("/" + aSource)) {
                            return this.sourcesContent[this._sources.indexOf("/" + aSource)];
                        }
                    }

                    throw new Error('"' + aSource + '" is not in the SourceMap.');
                };

            /**
             * Returns the generated line and column information for the original source,
             * line, and column positions provided. The only argument is an object with
             * the following properties:
             *
             *   - source: The filename of the original source.
             *   - line: The line number in the original source.
             *   - column: The column number in the original source.
             *
             * and an object is returned with the following properties:
             *
             *   - line: The line number in the generated source, or null.
             *   - column: The column number in the generated source, or null.
             */
            SourceMapConsumer.prototype.generatedPositionFor =
                function SourceMapConsumer_generatedPositionFor(aArgs) {
                    var needle = {
                        source: util.getArg(aArgs, 'source'),
                        originalLine: util.getArg(aArgs, 'line'),
                        originalColumn: util.getArg(aArgs, 'column')
                    };

                    if (this.sourceRoot) {
                        needle.source = util.relative(this.sourceRoot, needle.source);
                    }

                    var mapping = this._findMapping(needle,
                        this._originalMappings,
                        "originalLine",
                        "originalColumn",
                        util.compareByOriginalPositions);

                    if (mapping) {
                        return {
                            line: util.getArg(mapping, 'generatedLine', null),
                            column: util.getArg(mapping, 'generatedColumn', null)
                        };
                    }

                    return {
                        line: null,
                        column: null
                    };
                };

            SourceMapConsumer.GENERATED_ORDER = 1;
            SourceMapConsumer.ORIGINAL_ORDER = 2;

            /**
             * Iterate over each mapping between an original source/line/column and a
             * generated line/column in this source map.
             *
             * @param Function aCallback
             *        The function that is called with each mapping.
             * @param Object aContext
             *        Optional. If specified, this object will be the value of `this` every
             *        time that `aCallback` is called.
             * @param aOrder
             *        Either `SourceMapConsumer.GENERATED_ORDER` or
             *        `SourceMapConsumer.ORIGINAL_ORDER`. Specifies whether you want to
             *        iterate over the mappings sorted by the generated file's line/column
             *        order or the original's source/line/column order, respectively. Defaults to
             *        `SourceMapConsumer.GENERATED_ORDER`.
             */
            SourceMapConsumer.prototype.eachMapping =
                function SourceMapConsumer_eachMapping(aCallback, aContext, aOrder) {
                    var context = aContext || null;
                    var order = aOrder || SourceMapConsumer.GENERATED_ORDER;

                    var mappings;
                    switch (order) {
                        case SourceMapConsumer.GENERATED_ORDER:
                            mappings = this._generatedMappings;
                            break;
                        case SourceMapConsumer.ORIGINAL_ORDER:
                            mappings = this._originalMappings;
                            break;
                        default:
                            throw new Error("Unknown order of iteration.");
                    }

                    var sourceRoot = this.sourceRoot;
                    mappings.map(function (mapping) {
                        var source = mapping.source;
                        if (source && sourceRoot) {
                            source = util.join(sourceRoot, source);
                        }
                        return {
                            source: source,
                            generatedLine: mapping.generatedLine,
                            generatedColumn: mapping.generatedColumn,
                            originalLine: mapping.originalLine,
                            originalColumn: mapping.originalColumn,
                            name: mapping.name
                        };
                    }).forEach(aCallback, context);
                };

            exports.SourceMapConsumer = SourceMapConsumer;

        });
        /* -*- Mode: js; js-indent-level: 2; -*- */
        /*
         * Copyright 2011 Mozilla Foundation and contributors
         * Licensed under the New BSD license. See LICENSE or:
         * http://opensource.org/licenses/BSD-3-Clause
         */

        define('source-map/source-map-generator', function (require, exports, module) {

            var base64VLQ = require('./base64-vlq');
            var util = require('./util');
            var ArraySet = require('./array-set').ArraySet;

            /**
             * An instance of the SourceMapGenerator represents a source map which is
             * being built incrementally. You may pass an object with the following
             * properties:
             *
             *   - file: The filename of the generated source.
             *   - sourceRoot: A root for all relative URLs in this source map.
             */
            function SourceMapGenerator(aArgs) {
                if (!aArgs) {
                    aArgs = {};
                }
                this._file = util.getArg(aArgs, 'file', null);
                this._sourceRoot = util.getArg(aArgs, 'sourceRoot', null);
                this._sources = new ArraySet();
                this._names = new ArraySet();
                this._mappings = [];
                this._sourcesContents = null;
            }

            SourceMapGenerator.prototype._version = 3;

            /**
             * Creates a new SourceMapGenerator based on a SourceMapConsumer
             *
             * @param aSourceMapConsumer The SourceMap.
             */
            SourceMapGenerator.fromSourceMap =
                function SourceMapGenerator_fromSourceMap(aSourceMapConsumer) {
                    var sourceRoot = aSourceMapConsumer.sourceRoot;
                    var generator = new SourceMapGenerator({
                        file: aSourceMapConsumer.file,
                        sourceRoot: sourceRoot
                    });
                    aSourceMapConsumer.eachMapping(function (mapping) {
                        var newMapping = {
                            generated: {
                                line: mapping.generatedLine,
                                column: mapping.generatedColumn
                            }
                        };

                        if (mapping.source) {
                            newMapping.source = mapping.source;
                            if (sourceRoot) {
                                newMapping.source = util.relative(sourceRoot, newMapping.source);
                            }

                            newMapping.original = {
                                line: mapping.originalLine,
                                column: mapping.originalColumn
                            };

                            if (mapping.name) {
                                newMapping.name = mapping.name;
                            }
                        }

                        generator.addMapping(newMapping);
                    });
                    aSourceMapConsumer.sources.forEach(function (sourceFile) {
                        var content = aSourceMapConsumer.sourceContentFor(sourceFile);
                        if (content) {
                            generator.setSourceContent(sourceFile, content);
                        }
                    });
                    return generator;
                };

            /**
             * Add a single mapping from original source line and column to the generated
             * source's line and column for this source map being created. The mapping
             * object should have the following properties:
             *
             *   - generated: An object with the generated line and column positions.
             *   - original: An object with the original line and column positions.
             *   - source: The original source file (relative to the sourceRoot).
             *   - name: An optional original token name for this mapping.
             */
            SourceMapGenerator.prototype.addMapping =
                function SourceMapGenerator_addMapping(aArgs) {
                    var generated = util.getArg(aArgs, 'generated');
                    var original = util.getArg(aArgs, 'original', null);
                    var source = util.getArg(aArgs, 'source', null);
                    var name = util.getArg(aArgs, 'name', null);

                    this._validateMapping(generated, original, source, name);

                    if (source && !this._sources.has(source)) {
                        this._sources.add(source);
                    }

                    if (name && !this._names.has(name)) {
                        this._names.add(name);
                    }

                    this._mappings.push({
                        generatedLine: generated.line,
                        generatedColumn: generated.column,
                        originalLine: original != null && original.line,
                        originalColumn: original != null && original.column,
                        source: source,
                        name: name
                    });
                };

            /**
             * Set the source content for a source file.
             */
            SourceMapGenerator.prototype.setSourceContent =
                function SourceMapGenerator_setSourceContent(aSourceFile, aSourceContent) {
                    var source = aSourceFile;
                    if (this._sourceRoot) {
                        source = util.relative(this._sourceRoot, source);
                    }

                    if (aSourceContent !== null) {
                        // Add the source content to the _sourcesContents map.
                        // Create a new _sourcesContents map if the property is null.
                        if (!this._sourcesContents) {
                            this._sourcesContents = {};
                        }
                        this._sourcesContents[util.toSetString(source)] = aSourceContent;
                    } else {
                        // Remove the source file from the _sourcesContents map.
                        // If the _sourcesContents map is empty, set the property to null.
                        delete this._sourcesContents[util.toSetString(source)];
                        if (Object.keys(this._sourcesContents).length === 0) {
                            this._sourcesContents = null;
                        }
                    }
                };

            /**
             * Applies the mappings of a sub-source-map for a specific source file to the
             * source map being generated. Each mapping to the supplied source file is
             * rewritten using the supplied source map. Note: The resolution for the
             * resulting mappings is the minimium of this map and the supplied map.
             *
             * @param aSourceMapConsumer The source map to be applied.
             * @param aSourceFile Optional. The filename of the source file.
             *        If omitted, SourceMapConsumer's file property will be used.
             * @param aSourceMapPath Optional. The dirname of the path to the source map
             *        to be applied. If relative, it is relative to the SourceMapConsumer.
             *        This parameter is needed when the two source maps aren't in the same
             *        directory, and the source map to be applied contains relative source
             *        paths. If so, those relative source paths need to be rewritten
             *        relative to the SourceMapGenerator.
             */
            SourceMapGenerator.prototype.applySourceMap =
                function SourceMapGenerator_applySourceMap(aSourceMapConsumer, aSourceFile, aSourceMapPath) {
                    // If aSourceFile is omitted, we will use the file property of the SourceMap
                    if (!aSourceFile) {
                        if (!aSourceMapConsumer.file) {
                            throw new Error(
                                'SourceMapGenerator.prototype.applySourceMap requires either an explicit source file, ' +
                                'or the source map\'s "file" property. Both were omitted.'
                            );
                        }
                        aSourceFile = aSourceMapConsumer.file;
                    }
                    var sourceRoot = this._sourceRoot;
                    // Make "aSourceFile" relative if an absolute Url is passed.
                    if (sourceRoot) {
                        aSourceFile = util.relative(sourceRoot, aSourceFile);
                    }
                    // Applying the SourceMap can add and remove items from the sources and
                    // the names array.
                    var newSources = new ArraySet();
                    var newNames = new ArraySet();

                    // Find mappings for the "aSourceFile"
                    this._mappings.forEach(function (mapping) {
                        if (mapping.source === aSourceFile && mapping.originalLine) {
                            // Check if it can be mapped by the source map, then update the mapping.
                            var original = aSourceMapConsumer.originalPositionFor({
                                line: mapping.originalLine,
                                column: mapping.originalColumn
                            });
                            if (original.source !== null) {
                                // Copy mapping
                                mapping.source = original.source;
                                if (aSourceMapPath) {
                                    mapping.source = util.join(aSourceMapPath, mapping.source)
                                }
                                if (sourceRoot) {
                                    mapping.source = util.relative(sourceRoot, mapping.source);
                                }
                                mapping.originalLine = original.line;
                                mapping.originalColumn = original.column;
                                if (original.name !== null && mapping.name !== null) {
                                    // Only use the identifier name if it's an identifier
                                    // in both SourceMaps
                                    mapping.name = original.name;
                                }
                            }
                        }

                        var source = mapping.source;
                        if (source && !newSources.has(source)) {
                            newSources.add(source);
                        }

                        var name = mapping.name;
                        if (name && !newNames.has(name)) {
                            newNames.add(name);
                        }

                    }, this);
                    this._sources = newSources;
                    this._names = newNames;

                    // Copy sourcesContents of applied map.
                    aSourceMapConsumer.sources.forEach(function (sourceFile) {
                        var content = aSourceMapConsumer.sourceContentFor(sourceFile);
                        if (content) {
                            if (aSourceMapPath) {
                                sourceFile = util.join(aSourceMapPath, sourceFile);
                            }
                            if (sourceRoot) {
                                sourceFile = util.relative(sourceRoot, sourceFile);
                            }
                            this.setSourceContent(sourceFile, content);
                        }
                    }, this);
                };

            /**
             * A mapping can have one of the three levels of data:
             *
             *   1. Just the generated position.
             *   2. The Generated position, original position, and original source.
             *   3. Generated and original position, original source, as well as a name
             *      token.
             *
             * To maintain consistency, we validate that any new mapping being added falls
             * in to one of these categories.
             */
            SourceMapGenerator.prototype._validateMapping =
                function SourceMapGenerator_validateMapping(aGenerated, aOriginal, aSource,
                                                            aName) {
                    if (aGenerated && 'line' in aGenerated && 'column' in aGenerated
                        && aGenerated.line > 0 && aGenerated.column >= 0
                        && !aOriginal && !aSource && !aName) {
                        // Case 1.
                        return;
                    }
                    else if (aGenerated && 'line' in aGenerated && 'column' in aGenerated
                        && aOriginal && 'line' in aOriginal && 'column' in aOriginal
                        && aGenerated.line > 0 && aGenerated.column >= 0
                        && aOriginal.line > 0 && aOriginal.column >= 0
                        && aSource) {
                        // Cases 2 and 3.
                        return;
                    }
                    else {
                        throw new Error('Invalid mapping: ' + JSON.stringify({
                                generated: aGenerated,
                                source: aSource,
                                original: aOriginal,
                                name: aName
                            }));
                    }
                };

            /**
             * Serialize the accumulated mappings in to the stream of base 64 VLQs
             * specified by the source map format.
             */
            SourceMapGenerator.prototype._serializeMappings =
                function SourceMapGenerator_serializeMappings() {
                    var previousGeneratedColumn = 0;
                    var previousGeneratedLine = 1;
                    var previousOriginalColumn = 0;
                    var previousOriginalLine = 0;
                    var previousName = 0;
                    var previousSource = 0;
                    var result = '';
                    var mapping;

                    // The mappings must be guaranteed to be in sorted order before we start
                    // serializing them or else the generated line numbers (which are defined
                    // via the ';' separators) will be all messed up. Note: it might be more
                    // performant to maintain the sorting as we insert them, rather than as we
                    // serialize them, but the big O is the same either way.
                    this._mappings.sort(util.compareByGeneratedPositions);

                    for (var i = 0, len = this._mappings.length; i < len; i++) {
                        mapping = this._mappings[i];

                        if (mapping.generatedLine !== previousGeneratedLine) {
                            previousGeneratedColumn = 0;
                            while (mapping.generatedLine !== previousGeneratedLine) {
                                result += ';';
                                previousGeneratedLine++;
                            }
                        }
                        else {
                            if (i > 0) {
                                if (!util.compareByGeneratedPositions(mapping, this._mappings[i - 1])) {
                                    continue;
                                }
                                result += ',';
                            }
                        }

                        result += base64VLQ.encode(mapping.generatedColumn
                            - previousGeneratedColumn);
                        previousGeneratedColumn = mapping.generatedColumn;

                        if (mapping.source) {
                            result += base64VLQ.encode(this._sources.indexOf(mapping.source)
                                - previousSource);
                            previousSource = this._sources.indexOf(mapping.source);

                            // lines are stored 0-based in SourceMap spec version 3
                            result += base64VLQ.encode(mapping.originalLine - 1
                                - previousOriginalLine);
                            previousOriginalLine = mapping.originalLine - 1;

                            result += base64VLQ.encode(mapping.originalColumn
                                - previousOriginalColumn);
                            previousOriginalColumn = mapping.originalColumn;

                            if (mapping.name) {
                                result += base64VLQ.encode(this._names.indexOf(mapping.name)
                                    - previousName);
                                previousName = this._names.indexOf(mapping.name);
                            }
                        }
                    }

                    return result;
                };

            SourceMapGenerator.prototype._generateSourcesContent =
                function SourceMapGenerator_generateSourcesContent(aSources, aSourceRoot) {
                    return aSources.map(function (source) {
                        if (!this._sourcesContents) {
                            return null;
                        }
                        if (aSourceRoot) {
                            source = util.relative(aSourceRoot, source);
                        }
                        var key = util.toSetString(source);
                        return Object.prototype.hasOwnProperty.call(this._sourcesContents,
                            key)
                            ? this._sourcesContents[key]
                            : null;
                    }, this);
                };

            /**
             * Externalize the source map.
             */
            SourceMapGenerator.prototype.toJSON =
                function SourceMapGenerator_toJSON() {
                    var map = {
                        version: this._version,
                        file: this._file,
                        sources: this._sources.toArray(),
                        names: this._names.toArray(),
                        mappings: this._serializeMappings()
                    };
                    if (this._sourceRoot) {
                        map.sourceRoot = this._sourceRoot;
                    }
                    if (this._sourcesContents) {
                        map.sourcesContent = this._generateSourcesContent(map.sources, map.sourceRoot);
                    }

                    return map;
                };

            /**
             * Render the source map being generated to a string.
             */
            SourceMapGenerator.prototype.toString =
                function SourceMapGenerator_toString() {
                    return JSON.stringify(this);
                };

            exports.SourceMapGenerator = SourceMapGenerator;

        });
        /* -*- Mode: js; js-indent-level: 2; -*- */
        /*
         * Copyright 2011 Mozilla Foundation and contributors
         * Licensed under the New BSD license. See LICENSE or:
         * http://opensource.org/licenses/BSD-3-Clause
         */

        define('source-map/source-node', function (require, exports, module) {

            var SourceMapGenerator = require('./source-map-generator').SourceMapGenerator;
            var util = require('./util');

            // Matches a Windows-style `\r\n` newline or a `\n` newline used by all other
            // operating systems these days (capturing the result).
            var REGEX_NEWLINE = /(\r?\n)/g;

            // Matches a Windows-style newline, or any character.
            var REGEX_CHARACTER = /\r\n|[\s\S]/g;

            /**
             * SourceNodes provide a way to abstract over interpolating/concatenating
             * snippets of generated JavaScript source code while maintaining the line and
             * column information associated with the original source code.
             *
             * @param aLine The original line number.
             * @param aColumn The original column number.
             * @param aSource The original source's filename.
             * @param aChunks Optional. An array of strings which are snippets of
             *        generated JS, or other SourceNodes.
             * @param aName The original identifier.
             */
            function SourceNode(aLine, aColumn, aSource, aChunks, aName) {
                this.children = [];
                this.sourceContents = {};
                this.line = aLine === undefined ? null : aLine;
                this.column = aColumn === undefined ? null : aColumn;
                this.source = aSource === undefined ? null : aSource;
                this.name = aName === undefined ? null : aName;
                if (aChunks != null) this.add(aChunks);
            }

            /**
             * Creates a SourceNode from generated code and a SourceMapConsumer.
             *
             * @param aGeneratedCode The generated code
             * @param aSourceMapConsumer The SourceMap for the generated code
             */
            SourceNode.fromStringWithSourceMap =
                function SourceNode_fromStringWithSourceMap(aGeneratedCode, aSourceMapConsumer) {
                    // The SourceNode we want to fill with the generated code
                    // and the SourceMap
                    var node = new SourceNode();

                    // All even indices of this array are one line of the generated code,
                    // while all odd indices are the newlines between two adjacent lines
                    // (since `REGEX_NEWLINE` captures its match).
                    // Processed fragments are removed from this array, by calling `shiftNextLine`.
                    var remainingLines = aGeneratedCode.split(REGEX_NEWLINE);
                    var shiftNextLine = function() {
                        var lineContents = remainingLines.shift();
                        // The last line of a file might not have a newline.
                        var newLine = remainingLines.shift() || "";
                        return lineContents + newLine;
                    };

                    // We need to remember the position of "remainingLines"
                    var lastGeneratedLine = 1, lastGeneratedColumn = 0;

                    // The generate SourceNodes we need a code range.
                    // To extract it current and last mapping is used.
                    // Here we store the last mapping.
                    var lastMapping = null;

                    aSourceMapConsumer.eachMapping(function (mapping) {
                        if (lastMapping !== null) {
                            // We add the code from "lastMapping" to "mapping":
                            // First check if there is a new line in between.
                            if (lastGeneratedLine < mapping.generatedLine) {
                                var code = "";
                                // Associate first line with "lastMapping"
                                addMappingWithCode(lastMapping, shiftNextLine());
                                lastGeneratedLine++;
                                lastGeneratedColumn = 0;
                                // The remaining code is added without mapping
                            } else {
                                // There is no new line in between.
                                // Associate the code between "lastGeneratedColumn" and
                                // "mapping.generatedColumn" with "lastMapping"
                                var nextLine = remainingLines[0];
                                var code = nextLine.substr(0, mapping.generatedColumn -
                                    lastGeneratedColumn);
                                remainingLines[0] = nextLine.substr(mapping.generatedColumn -
                                    lastGeneratedColumn);
                                lastGeneratedColumn = mapping.generatedColumn;
                                addMappingWithCode(lastMapping, code);
                                // No more remaining code, continue
                                lastMapping = mapping;
                                return;
                            }
                        }
                        // We add the generated code until the first mapping
                        // to the SourceNode without any mapping.
                        // Each line is added as separate string.
                        while (lastGeneratedLine < mapping.generatedLine) {
                            node.add(shiftNextLine());
                            lastGeneratedLine++;
                        }
                        if (lastGeneratedColumn < mapping.generatedColumn) {
                            var nextLine = remainingLines[0];
                            node.add(nextLine.substr(0, mapping.generatedColumn));
                            remainingLines[0] = nextLine.substr(mapping.generatedColumn);
                            lastGeneratedColumn = mapping.generatedColumn;
                        }
                        lastMapping = mapping;
                    }, this);
                    // We have processed all mappings.
                    if (remainingLines.length > 0) {
                        if (lastMapping) {
                            // Associate the remaining code in the current line with "lastMapping"
                            addMappingWithCode(lastMapping, shiftNextLine());
                        }
                        // and add the remaining lines without any mapping
                        node.add(remainingLines.join(""));
                    }

                    // Copy sourcesContent into SourceNode
                    aSourceMapConsumer.sources.forEach(function (sourceFile) {
                        var content = aSourceMapConsumer.sourceContentFor(sourceFile);
                        if (content) {
                            node.setSourceContent(sourceFile, content);
                        }
                    });

                    return node;

                    function addMappingWithCode(mapping, code) {
                        if (mapping === null || mapping.source === undefined) {
                            node.add(code);
                        } else {
                            node.add(new SourceNode(mapping.originalLine,
                                mapping.originalColumn,
                                mapping.source,
                                code,
                                mapping.name));
                        }
                    }
                };

            /**
             * Add a chunk of generated JS to this source node.
             *
             * @param aChunk A string snippet of generated JS code, another instance of
             *        SourceNode, or an array where each member is one of those things.
             */
            SourceNode.prototype.add = function SourceNode_add(aChunk) {
                if (Array.isArray(aChunk)) {
                    aChunk.forEach(function (chunk) {
                        this.add(chunk);
                    }, this);
                }
                else if (aChunk instanceof SourceNode || typeof aChunk === "string") {
                    if (aChunk) {
                        this.children.push(aChunk);
                    }
                }
                else {
                    throw new TypeError(
                        "Expected a SourceNode, string, or an array of SourceNodes and strings. Got " + aChunk
                    );
                }
                return this;
            };

            /**
             * Add a chunk of generated JS to the beginning of this source node.
             *
             * @param aChunk A string snippet of generated JS code, another instance of
             *        SourceNode, or an array where each member is one of those things.
             */
            SourceNode.prototype.prepend = function SourceNode_prepend(aChunk) {
                if (Array.isArray(aChunk)) {
                    for (var i = aChunk.length-1; i >= 0; i--) {
                        this.prepend(aChunk[i]);
                    }
                }
                else if (aChunk instanceof SourceNode || typeof aChunk === "string") {
                    this.children.unshift(aChunk);
                }
                else {
                    throw new TypeError(
                        "Expected a SourceNode, string, or an array of SourceNodes and strings. Got " + aChunk
                    );
                }
                return this;
            };

            /**
             * Walk over the tree of JS snippets in this node and its children. The
             * walking function is called once for each snippet of JS and is passed that
             * snippet and the its original associated source's line/column location.
             *
             * @param aFn The traversal function.
             */
            SourceNode.prototype.walk = function SourceNode_walk(aFn) {
                var chunk;
                for (var i = 0, len = this.children.length; i < len; i++) {
                    chunk = this.children[i];
                    if (chunk instanceof SourceNode) {
                        chunk.walk(aFn);
                    }
                    else {
                        if (chunk !== '') {
                            aFn(chunk, { source: this.source,
                                line: this.line,
                                column: this.column,
                                name: this.name });
                        }
                    }
                }
            };

            /**
             * Like `String.prototype.join` except for SourceNodes. Inserts `aStr` between
             * each of `this.children`.
             *
             * @param aSep The separator.
             */
            SourceNode.prototype.join = function SourceNode_join(aSep) {
                var newChildren;
                var i;
                var len = this.children.length;
                if (len > 0) {
                    newChildren = [];
                    for (i = 0; i < len-1; i++) {
                        newChildren.push(this.children[i]);
                        newChildren.push(aSep);
                    }
                    newChildren.push(this.children[i]);
                    this.children = newChildren;
                }
                return this;
            };

            /**
             * Call String.prototype.replace on the very right-most source snippet. Useful
             * for trimming whitespace from the end of a source node, etc.
             *
             * @param aPattern The pattern to replace.
             * @param aReplacement The thing to replace the pattern with.
             */
            SourceNode.prototype.replaceRight = function SourceNode_replaceRight(aPattern, aReplacement) {
                var lastChild = this.children[this.children.length - 1];
                if (lastChild instanceof SourceNode) {
                    lastChild.replaceRight(aPattern, aReplacement);
                }
                else if (typeof lastChild === 'string') {
                    this.children[this.children.length - 1] = lastChild.replace(aPattern, aReplacement);
                }
                else {
                    this.children.push(''.replace(aPattern, aReplacement));
                }
                return this;
            };

            /**
             * Set the source content for a source file. This will be added to the SourceMapGenerator
             * in the sourcesContent field.
             *
             * @param aSourceFile The filename of the source file
             * @param aSourceContent The content of the source file
             */
            SourceNode.prototype.setSourceContent =
                function SourceNode_setSourceContent(aSourceFile, aSourceContent) {
                    this.sourceContents[util.toSetString(aSourceFile)] = aSourceContent;
                };

            /**
             * Walk over the tree of SourceNodes. The walking function is called for each
             * source file content and is passed the filename and source content.
             *
             * @param aFn The traversal function.
             */
            SourceNode.prototype.walkSourceContents =
                function SourceNode_walkSourceContents(aFn) {
                    for (var i = 0, len = this.children.length; i < len; i++) {
                        if (this.children[i] instanceof SourceNode) {
                            this.children[i].walkSourceContents(aFn);
                        }
                    }

                    var sources = Object.keys(this.sourceContents);
                    for (var i = 0, len = sources.length; i < len; i++) {
                        aFn(util.fromSetString(sources[i]), this.sourceContents[sources[i]]);
                    }
                };

            /**
             * Return the string representation of this source node. Walks over the tree
             * and concatenates all the various snippets together to one string.
             */
            SourceNode.prototype.toString = function SourceNode_toString() {
                var str = "";
                this.walk(function (chunk) {
                    str += chunk;
                });
                return str;
            };

            /**
             * Returns the string representation of this source node along with a source
             * map.
             */
            SourceNode.prototype.toStringWithSourceMap = function SourceNode_toStringWithSourceMap(aArgs) {
                var generated = {
                    code: "",
                    line: 1,
                    column: 0
                };
                var map = new SourceMapGenerator(aArgs);
                var sourceMappingActive = false;
                var lastOriginalSource = null;
                var lastOriginalLine = null;
                var lastOriginalColumn = null;
                var lastOriginalName = null;
                this.walk(function (chunk, original) {
                    generated.code += chunk;
                    if (original.source !== null
                        && original.line !== null
                        && original.column !== null) {
                        if(lastOriginalSource !== original.source
                            || lastOriginalLine !== original.line
                            || lastOriginalColumn !== original.column
                            || lastOriginalName !== original.name) {
                            map.addMapping({
                                source: original.source,
                                original: {
                                    line: original.line,
                                    column: original.column
                                },
                                generated: {
                                    line: generated.line,
                                    column: generated.column
                                },
                                name: original.name
                            });
                        }
                        lastOriginalSource = original.source;
                        lastOriginalLine = original.line;
                        lastOriginalColumn = original.column;
                        lastOriginalName = original.name;
                        sourceMappingActive = true;
                    } else if (sourceMappingActive) {
                        map.addMapping({
                            generated: {
                                line: generated.line,
                                column: generated.column
                            }
                        });
                        lastOriginalSource = null;
                        sourceMappingActive = false;
                    }
                    chunk.match(REGEX_CHARACTER).forEach(function (ch, idx, array) {
                        if (REGEX_NEWLINE.test(ch)) {
                            generated.line++;
                            generated.column = 0;
                            // Mappings end at eol
                            if (idx + 1 === array.length) {
                                lastOriginalSource = null;
                                sourceMappingActive = false;
                            } else if (sourceMappingActive) {
                                map.addMapping({
                                    source: original.source,
                                    original: {
                                        line: original.line,
                                        column: original.column
                                    },
                                    generated: {
                                        line: generated.line,
                                        column: generated.column
                                    },
                                    name: original.name
                                });
                            }
                        } else {
                            generated.column += ch.length;
                        }
                    });
                });
                this.walkSourceContents(function (sourceFile, sourceContent) {
                    map.setSourceContent(sourceFile, sourceContent);
                });

                return { code: generated.code, map: map };
            };

            exports.SourceNode = SourceNode;

        });
        /* -*- Mode: js; js-indent-level: 2; -*- */
        /*
         * Copyright 2011 Mozilla Foundation and contributors
         * Licensed under the New BSD license. See LICENSE or:
         * http://opensource.org/licenses/BSD-3-Clause
         */

        define('source-map/util', function (require, exports, module) {

            /**
             * This is a helper function for getting values from parameter/options
             * objects.
             *
             * @param args The object we are extracting values from
             * @param name The name of the property we are getting.
             * @param defaultValue An optional value to return if the property is missing
             * from the object. If this is not specified and the property is missing, an
             * error will be thrown.
             */
            function getArg(aArgs, aName, aDefaultValue) {
                if (aName in aArgs) {
                    return aArgs[aName];
                } else if (arguments.length === 3) {
                    return aDefaultValue;
                } else {
                    throw new Error('"' + aName + '" is a required argument.');
                }
            }
            exports.getArg = getArg;

            var urlRegexp = /^(?:([\w+\-.]+):)?\/\/(?:(\w+:\w+)@)?([\w.]*)(?::(\d+))?(\S*)$/;
            var dataUrlRegexp = /^data:.+\,.+$/;

            function urlParse(aUrl) {
                var match = aUrl.match(urlRegexp);
                if (!match) {
                    return null;
                }
                return {
                    scheme: match[1],
                    auth: match[2],
                    host: match[3],
                    port: match[4],
                    path: match[5]
                };
            }
            exports.urlParse = urlParse;

            function urlGenerate(aParsedUrl) {
                var url = '';
                if (aParsedUrl.scheme) {
                    url += aParsedUrl.scheme + ':';
                }
                url += '//';
                if (aParsedUrl.auth) {
                    url += aParsedUrl.auth + '@';
                }
                if (aParsedUrl.host) {
                    url += aParsedUrl.host;
                }
                if (aParsedUrl.port) {
                    url += ":" + aParsedUrl.port
                }
                if (aParsedUrl.path) {
                    url += aParsedUrl.path;
                }
                return url;
            }
            exports.urlGenerate = urlGenerate;

            /**
             * Normalizes a path, or the path portion of a URL:
             *
             * - Replaces consequtive slashes with one slash.
             * - Removes unnecessary '.' parts.
             * - Removes unnecessary '<dir>/..' parts.
             *
             * Based on code in the Node.js 'path' core module.
             *
             * @param aPath The path or url to normalize.
             */
            function normalize(aPath) {
                var path = aPath;
                var url = urlParse(aPath);
                if (url) {
                    if (!url.path) {
                        return aPath;
                    }
                    path = url.path;
                }
                var isAbsolute = (path.charAt(0) === '/');

                var parts = path.split(/\/+/);
                for (var part, up = 0, i = parts.length - 1; i >= 0; i--) {
                    part = parts[i];
                    if (part === '.') {
                        parts.splice(i, 1);
                    } else if (part === '..') {
                        up++;
                    } else if (up > 0) {
                        if (part === '') {
                            // The first part is blank if the path is absolute. Trying to go
                            // above the root is a no-op. Therefore we can remove all '..' parts
                            // directly after the root.
                            parts.splice(i + 1, up);
                            up = 0;
                        } else {
                            parts.splice(i, 2);
                            up--;
                        }
                    }
                }
                path = parts.join('/');

                if (path === '') {
                    path = isAbsolute ? '/' : '.';
                }

                if (url) {
                    url.path = path;
                    return urlGenerate(url);
                }
                return path;
            }
            exports.normalize = normalize;

            /**
             * Joins two paths/URLs.
             *
             * @param aRoot The root path or URL.
             * @param aPath The path or URL to be joined with the root.
             *
             * - If aPath is a URL or a data URI, aPath is returned, unless aPath is a
             *   scheme-relative URL: Then the scheme of aRoot, if any, is prepended
             *   first.
             * - Otherwise aPath is a path. If aRoot is a URL, then its path portion
             *   is updated with the result and aRoot is returned. Otherwise the result
             *   is returned.
             *   - If aPath is absolute, the result is aPath.
             *   - Otherwise the two paths are joined with a slash.
             * - Joining for example 'http://' and 'www.example.com' is also supported.
             */
            function join(aRoot, aPath) {
                var aPathUrl = urlParse(aPath);
                var aRootUrl = urlParse(aRoot);
                if (aRootUrl) {
                    aRoot = aRootUrl.path || '/';
                }

                // `join(foo, '//www.example.org')`
                if (aPathUrl && !aPathUrl.scheme) {
                    if (aRootUrl) {
                        aPathUrl.scheme = aRootUrl.scheme;
                    }
                    return urlGenerate(aPathUrl);
                }

                if (aPathUrl || aPath.match(dataUrlRegexp)) {
                    return aPath;
                }

                // `join('http://', 'www.example.com')`
                if (aRootUrl && !aRootUrl.host && !aRootUrl.path) {
                    aRootUrl.host = aPath;
                    return urlGenerate(aRootUrl);
                }

                var joined = aPath.charAt(0) === '/'
                    ? aPath
                    : normalize(aRoot.replace(/\/+$/, '') + '/' + aPath);

                if (aRootUrl) {
                    aRootUrl.path = joined;
                    return urlGenerate(aRootUrl);
                }
                return joined;
            }
            exports.join = join;

            /**
             * Because behavior goes wacky when you set `__proto__` on objects, we
             * have to prefix all the strings in our set with an arbitrary character.
             *
             * See https://github.com/mozilla/source-map/pull/31 and
             * https://github.com/mozilla/source-map/issues/30
             *
             * @param String aStr
             */
            function toSetString(aStr) {
                return '$' + aStr;
            }
            exports.toSetString = toSetString;

            function fromSetString(aStr) {
                return aStr.substr(1);
            }
            exports.fromSetString = fromSetString;

            function relative(aRoot, aPath) {
                aRoot = aRoot.replace(/\/$/, '');

                var url = urlParse(aRoot);
                if (aPath.charAt(0) == "/" && url && url.path == "/") {
                    return aPath.slice(1);
                }

                return aPath.indexOf(aRoot + '/') === 0
                    ? aPath.substr(aRoot.length + 1)
                    : aPath;
            }
            exports.relative = relative;

            function strcmp(aStr1, aStr2) {
                var s1 = aStr1 || "";
                var s2 = aStr2 || "";
                return (s1 > s2) - (s1 < s2);
            }

            /**
             * Comparator between two mappings where the original positions are compared.
             *
             * Optionally pass in `true` as `onlyCompareGenerated` to consider two
             * mappings with the same original source/line/column, but different generated
             * line and column the same. Useful when searching for a mapping with a
             * stubbed out mapping.
             */
            function compareByOriginalPositions(mappingA, mappingB, onlyCompareOriginal) {
                var cmp;

                cmp = strcmp(mappingA.source, mappingB.source);
                if (cmp) {
                    return cmp;
                }

                cmp = mappingA.originalLine - mappingB.originalLine;
                if (cmp) {
                    return cmp;
                }

                cmp = mappingA.originalColumn - mappingB.originalColumn;
                if (cmp || onlyCompareOriginal) {
                    return cmp;
                }

                cmp = strcmp(mappingA.name, mappingB.name);
                if (cmp) {
                    return cmp;
                }

                cmp = mappingA.generatedLine - mappingB.generatedLine;
                if (cmp) {
                    return cmp;
                }

                return mappingA.generatedColumn - mappingB.generatedColumn;
            };
            exports.compareByOriginalPositions = compareByOriginalPositions;

            /**
             * Comparator between two mappings where the generated positions are
             * compared.
             *
             * Optionally pass in `true` as `onlyCompareGenerated` to consider two
             * mappings with the same generated line and column, but different
             * source/name/original line and column the same. Useful when searching for a
             * mapping with a stubbed out mapping.
             */
            function compareByGeneratedPositions(mappingA, mappingB, onlyCompareGenerated) {
                var cmp;

                cmp = mappingA.generatedLine - mappingB.generatedLine;
                if (cmp) {
                    return cmp;
                }

                cmp = mappingA.generatedColumn - mappingB.generatedColumn;
                if (cmp || onlyCompareGenerated) {
                    return cmp;
                }

                cmp = strcmp(mappingA.source, mappingB.source);
                if (cmp) {
                    return cmp;
                }

                cmp = mappingA.originalLine - mappingB.originalLine;
                if (cmp) {
                    return cmp;
                }

                cmp = mappingA.originalColumn - mappingB.originalColumn;
                if (cmp) {
                    return cmp;
                }

                return strcmp(mappingA.name, mappingB.name);
            };
            exports.compareByGeneratedPositions = compareByGeneratedPositions;

        });
        define('source-map', function (require, exports, module) {

            /*
             * Copyright 2009-2011 Mozilla Foundation and contributors
             * Licensed under the New BSD license. See LICENSE.txt or:
             * http://opensource.org/licenses/BSD-3-Clause
             */
            exports.SourceMapGenerator = require('./source-map/source-map-generator').SourceMapGenerator;
            exports.SourceMapConsumer = require('./source-map/source-map-consumer').SourceMapConsumer;
            exports.SourceNode = require('./source-map/source-node').SourceNode;

        });

//Distributed under the BSD license:
//Copyright 2012 (c) Mihai Bazon <mihai.bazon@gmail.com>
        define('uglifyjs2', ['exports', 'source-map', 'logger', 'env!env/file'], function (exports, MOZ_SourceMap, logger, rjsFile) {

            /***********************************************************************

             A JavaScript tokenizer / parser / beautifier / compressor.
             https://github.com/mishoo/UglifyJS2

             -------------------------------- (C) ---------------------------------

             Author: Mihai Bazon
             <mihai.bazon@gmail.com>
             http://mihai.bazon.net/blog

             Distributed under the BSD license:

             Copyright 2012 (c) Mihai Bazon <mihai.bazon@gmail.com>

             Redistribution and use in source and binary forms, with or without
             modification, are permitted provided that the following conditions
             are met:

             * Redistributions of source code must retain the above
             copyright notice, this list of conditions and the following
             disclaimer.

             * Redistributions in binary form must reproduce the above
             copyright notice, this list of conditions and the following
             disclaimer in the documentation and/or other materials
             provided with the distribution.

             THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDER â€œAS ISâ€ AND ANY
             EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
             IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
             PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE
             LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY,
             OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
             PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
             PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
             THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
             TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF
             THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
             SUCH DAMAGE.

             ***********************************************************************/

            "use strict";

            function array_to_hash(a) {
                var ret = Object.create(null);
                for (var i = 0; i < a.length; ++i)
                    ret[a[i]] = true;
                return ret;
            };

            function slice(a, start) {
                return Array.prototype.slice.call(a, start || 0);
            };

            function characters(str) {
                return str.split("");
            };

            function member(name, array) {
                for (var i = array.length; --i >= 0;)
                    if (array[i] == name)
                        return true;
                return false;
            };

            function find_if(func, array) {
                for (var i = 0, n = array.length; i < n; ++i) {
                    if (func(array[i]))
                        return array[i];
                }
            };

            function repeat_string(str, i) {
                if (i <= 0) return "";
                if (i == 1) return str;
                var d = repeat_string(str, i >> 1);
                d += d;
                if (i & 1) d += str;
                return d;
            };

            function DefaultsError(msg, defs) {
                Error.call(this, msg);
                this.msg = msg;
                this.defs = defs;
            };
            DefaultsError.prototype = Object.create(Error.prototype);
            DefaultsError.prototype.constructor = DefaultsError;

            DefaultsError.croak = function(msg, defs) {
                throw new DefaultsError(msg, defs);
            };

            function defaults(args, defs, croak) {
                if (args === true)
                    args = {};
                var ret = args || {};
                if (croak) for (var i in ret) if (ret.hasOwnProperty(i) && !defs.hasOwnProperty(i))
                    DefaultsError.croak("`" + i + "` is not a supported option", defs);
                for (var i in defs) if (defs.hasOwnProperty(i)) {
                    ret[i] = (args && args.hasOwnProperty(i)) ? args[i] : defs[i];
                }
                return ret;
            };

            function merge(obj, ext) {
                var count = 0;
                for (var i in ext) if (ext.hasOwnProperty(i)) {
                    obj[i] = ext[i];
                    count++;
                }
                return count;
            };

            function noop() {};

            var MAP = (function(){
                function MAP(a, f, backwards) {
                    var ret = [], top = [], i;
                    function doit() {
                        var val = f(a[i], i);
                        var is_last = val instanceof Last;
                        if (is_last) val = val.v;
                        if (val instanceof AtTop) {
                            val = val.v;
                            if (val instanceof Splice) {
                                top.push.apply(top, backwards ? val.v.slice().reverse() : val.v);
                            } else {
                                top.push(val);
                            }
                        }
                        else if (val !== skip) {
                            if (val instanceof Splice) {
                                ret.push.apply(ret, backwards ? val.v.slice().reverse() : val.v);
                            } else {
                                ret.push(val);
                            }
                        }
                        return is_last;
                    };
                    if (a instanceof Array) {
                        if (backwards) {
                            for (i = a.length; --i >= 0;) if (doit()) break;
                            ret.reverse();
                            top.reverse();
                        } else {
                            for (i = 0; i < a.length; ++i) if (doit()) break;
                        }
                    }
                    else {
                        for (i in a) if (a.hasOwnProperty(i)) if (doit()) break;
                    }
                    return top.concat(ret);
                };
                MAP.at_top = function(val) { return new AtTop(val) };
                MAP.splice = function(val) { return new Splice(val) };
                MAP.last = function(val) { return new Last(val) };
                var skip = MAP.skip = {};
                function AtTop(val) { this.v = val };
                function Splice(val) { this.v = val };
                function Last(val) { this.v = val };
                return MAP;
            })();

            function push_uniq(array, el) {
                if (array.indexOf(el) < 0)
                    array.push(el);
            };

            function string_template(text, props) {
                return text.replace(/\{(.+?)\}/g, function(str, p){
                    return props[p];
                });
            };

            function remove(array, el) {
                for (var i = array.length; --i >= 0;) {
                    if (array[i] === el) array.splice(i, 1);
                }
            };

            function mergeSort(array, cmp) {
                if (array.length < 2) return array.slice();
                function merge(a, b) {
                    var r = [], ai = 0, bi = 0, i = 0;
                    while (ai < a.length && bi < b.length) {
                        cmp(a[ai], b[bi]) <= 0
                            ? r[i++] = a[ai++]
                            : r[i++] = b[bi++];
                    }
                    if (ai < a.length) r.push.apply(r, a.slice(ai));
                    if (bi < b.length) r.push.apply(r, b.slice(bi));
                    return r;
                };
                function _ms(a) {
                    if (a.length <= 1)
                        return a;
                    var m = Math.floor(a.length / 2), left = a.slice(0, m), right = a.slice(m);
                    left = _ms(left);
                    right = _ms(right);
                    return merge(left, right);
                };
                return _ms(array);
            };

            function set_difference(a, b) {
                return a.filter(function(el){
                    return b.indexOf(el) < 0;
                });
            };

            function set_intersection(a, b) {
                return a.filter(function(el){
                    return b.indexOf(el) >= 0;
                });
            };

// this function is taken from Acorn [1], written by Marijn Haverbeke
// [1] https://github.com/marijnh/acorn
            function makePredicate(words) {
                if (!(words instanceof Array)) words = words.split(" ");
                var f = "", cats = [];
                out: for (var i = 0; i < words.length; ++i) {
                    for (var j = 0; j < cats.length; ++j)
                        if (cats[j][0].length == words[i].length) {
                            cats[j].push(words[i]);
                            continue out;
                        }
                    cats.push([words[i]]);
                }
                function compareTo(arr) {
                    if (arr.length == 1) return f += "return str === " + JSON.stringify(arr[0]) + ";";
                    f += "switch(str){";
                    for (var i = 0; i < arr.length; ++i) f += "case " + JSON.stringify(arr[i]) + ":";
                    f += "return true}return false;";
                }
                // When there are more than three length categories, an outer
                // switch first dispatches on the lengths, to save on comparisons.
                if (cats.length > 3) {
                    cats.sort(function(a, b) {return b.length - a.length;});
                    f += "switch(str.length){";
                    for (var i = 0; i < cats.length; ++i) {
                        var cat = cats[i];
                        f += "case " + cat[0].length + ":";
                        compareTo(cat);
                    }
                    f += "}";
                    // Otherwise, simply generate a flat `switch` statement.
                } else {
                    compareTo(words);
                }
                return new Function("str", f);
            };

            function all(array, predicate) {
                for (var i = array.length; --i >= 0;)
                    if (!predicate(array[i]))
                        return false;
                return true;
            };

            function Dictionary() {
                this._values = Object.create(null);
                this._size = 0;
            };
            Dictionary.prototype = {
                set: function(key, val) {
                    if (!this.has(key)) ++this._size;
                    this._values["$" + key] = val;
                    return this;
                },
                add: function(key, val) {
                    if (this.has(key)) {
                        this.get(key).push(val);
                    } else {
                        this.set(key, [ val ]);
                    }
                    return this;
                },
                get: function(key) { return this._values["$" + key] },
                del: function(key) {
                    if (this.has(key)) {
                        --this._size;
                        delete this._values["$" + key];
                    }
                    return this;
                },
                has: function(key) { return ("$" + key) in this._values },
                each: function(f) {
                    for (var i in this._values)
                        f(this._values[i], i.substr(1));
                },
                size: function() {
                    return this._size;
                },
                map: function(f) {
                    var ret = [];
                    for (var i in this._values)
                        ret.push(f(this._values[i], i.substr(1)));
                    return ret;
                },
                toObject: function() { return this._values }
            };
            Dictionary.fromObject = function(obj) {
                var dict = new Dictionary();
                dict._size = merge(dict._values, obj);
                return dict;
            };

            /***********************************************************************

             A JavaScript tokenizer / parser / beautifier / compressor.
             https://github.com/mishoo/UglifyJS2

             -------------------------------- (C) ---------------------------------

             Author: Mihai Bazon
             <mihai.bazon@gmail.com>
             http://mihai.bazon.net/blog

             Distributed under the BSD license:

             Copyright 2012 (c) Mihai Bazon <mihai.bazon@gmail.com>

             Redistribution and use in source and binary forms, with or without
             modification, are permitted provided that the following conditions
             are met:

             * Redistributions of source code must retain the above
             copyright notice, this list of conditions and the following
             disclaimer.

             * Redistributions in binary form must reproduce the above
             copyright notice, this list of conditions and the following
             disclaimer in the documentation and/or other materials
             provided with the distribution.

             THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDER â€œAS ISâ€ AND ANY
             EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
             IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
             PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE
             LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY,
             OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
             PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
             PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
             THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
             TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF
             THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
             SUCH DAMAGE.

             ***********************************************************************/

            "use strict";

            function DEFNODE(type, props, methods, base) {
                if (arguments.length < 4) base = AST_Node;
                if (!props) props = [];
                else props = props.split(/\s+/);
                var self_props = props;
                if (base && base.PROPS)
                    props = props.concat(base.PROPS);
                var code = "return function AST_" + type + "(props){ if (props) { ";
                for (var i = props.length; --i >= 0;) {
                    code += "this." + props[i] + " = props." + props[i] + ";";
                }
                var proto = base && new base;
                if (proto && proto.initialize || (methods && methods.initialize))
                    code += "this.initialize();";
                code += "}}";
                var ctor = new Function(code)();
                if (proto) {
                    ctor.prototype = proto;
                    ctor.BASE = base;
                }
                if (base) base.SUBCLASSES.push(ctor);
                ctor.prototype.CTOR = ctor;
                ctor.PROPS = props || null;
                ctor.SELF_PROPS = self_props;
                ctor.SUBCLASSES = [];
                if (type) {
                    ctor.prototype.TYPE = ctor.TYPE = type;
                }
                if (methods) for (i in methods) if (methods.hasOwnProperty(i)) {
                    if (/^\$/.test(i)) {
                        ctor[i.substr(1)] = methods[i];
                    } else {
                        ctor.prototype[i] = methods[i];
                    }
                }
                ctor.DEFMETHOD = function(name, method) {
                    this.prototype[name] = method;
                };
                return ctor;
            };

            var AST_Token = DEFNODE("Token", "type value line col pos endline endcol endpos nlb comments_before file", {
            }, null);

            var AST_Node = DEFNODE("Node", "start end", {
                clone: function() {
                    return new this.CTOR(this);
                },
                $documentation: "Base class of all AST nodes",
                $propdoc: {
                    start: "[AST_Token] The first token of this node",
                    end: "[AST_Token] The last token of this node"
                },
                _walk: function(visitor) {
                    return visitor._visit(this);
                },
                walk: function(visitor) {
                    return this._walk(visitor); // not sure the indirection will be any help
                }
            }, null);

            AST_Node.warn_function = null;
            AST_Node.warn = function(txt, props) {
                if (AST_Node.warn_function)
                    AST_Node.warn_function(string_template(txt, props));
            };

            /* -----[ statements ]----- */

            var AST_Statement = DEFNODE("Statement", null, {
                $documentation: "Base class of all statements",
            });

            var AST_Debugger = DEFNODE("Debugger", null, {
                $documentation: "Represents a debugger statement",
            }, AST_Statement);

            var AST_Directive = DEFNODE("Directive", "value scope quote", {
                $documentation: "Represents a directive, like \"use strict\";",
                $propdoc: {
                    value: "[string] The value of this directive as a plain string (it's not an AST_String!)",
                    scope: "[AST_Scope/S] The scope that this directive affects",
                    quote: "[string] the original quote character"
                },
            }, AST_Statement);

            var AST_SimpleStatement = DEFNODE("SimpleStatement", "body", {
                $documentation: "A statement consisting of an expression, i.e. a = 1 + 2",
                $propdoc: {
                    body: "[AST_Node] an expression node (should not be instanceof AST_Statement)"
                },
                _walk: function(visitor) {
                    return visitor._visit(this, function(){
                        this.body._walk(visitor);
                    });
                }
            }, AST_Statement);

            function walk_body(node, visitor) {
                if (node.body instanceof AST_Statement) {
                    node.body._walk(visitor);
                }
                else node.body.forEach(function(stat){
                    stat._walk(visitor);
                });
            };

            var AST_Block = DEFNODE("Block", "body", {
                $documentation: "A body of statements (usually bracketed)",
                $propdoc: {
                    body: "[AST_Statement*] an array of statements"
                },
                _walk: function(visitor) {
                    return visitor._visit(this, function(){
                        walk_body(this, visitor);
                    });
                }
            }, AST_Statement);

            var AST_BlockStatement = DEFNODE("BlockStatement", null, {
                $documentation: "A block statement",
            }, AST_Block);

            var AST_EmptyStatement = DEFNODE("EmptyStatement", null, {
                $documentation: "The empty statement (empty block or simply a semicolon)",
                _walk: function(visitor) {
                    return visitor._visit(this);
                }
            }, AST_Statement);

            var AST_StatementWithBody = DEFNODE("StatementWithBody", "body", {
                $documentation: "Base class for all statements that contain one nested body: `For`, `ForIn`, `Do`, `While`, `With`",
                $propdoc: {
                    body: "[AST_Statement] the body; this should always be present, even if it's an AST_EmptyStatement"
                },
                _walk: function(visitor) {
                    return visitor._visit(this, function(){
                        this.body._walk(visitor);
                    });
                }
            }, AST_Statement);

            var AST_LabeledStatement = DEFNODE("LabeledStatement", "label", {
                $documentation: "Statement with a label",
                $propdoc: {
                    label: "[AST_Label] a label definition"
                },
                _walk: function(visitor) {
                    return visitor._visit(this, function(){
                        this.label._walk(visitor);
                        this.body._walk(visitor);
                    });
                }
            }, AST_StatementWithBody);

            var AST_IterationStatement = DEFNODE("IterationStatement", null, {
                $documentation: "Internal class.  All loops inherit from it."
            }, AST_StatementWithBody);

            var AST_DWLoop = DEFNODE("DWLoop", "condition", {
                $documentation: "Base class for do/while statements",
                $propdoc: {
                    condition: "[AST_Node] the loop condition.  Should not be instanceof AST_Statement"
                }
            }, AST_IterationStatement);

            var AST_Do = DEFNODE("Do", null, {
                $documentation: "A `do` statement",
                _walk: function(visitor) {
                    return visitor._visit(this, function(){
                        this.body._walk(visitor);
                        this.condition._walk(visitor);
                    });
                }
            }, AST_DWLoop);

            var AST_While = DEFNODE("While", null, {
                $documentation: "A `while` statement",
                _walk: function(visitor) {
                    return visitor._visit(this, function(){
                        this.condition._walk(visitor);
                        this.body._walk(visitor);
                    });
                }
            }, AST_DWLoop);

            var AST_For = DEFNODE("For", "init condition step", {
                $documentation: "A `for` statement",
                $propdoc: {
                    init: "[AST_Node?] the `for` initialization code, or null if empty",
                    condition: "[AST_Node?] the `for` termination clause, or null if empty",
                    step: "[AST_Node?] the `for` update clause, or null if empty"
                },
                _walk: function(visitor) {
                    return visitor._visit(this, function(){
                        if (this.init) this.init._walk(visitor);
                        if (this.condition) this.condition._walk(visitor);
                        if (this.step) this.step._walk(visitor);
                        this.body._walk(visitor);
                    });
                }
            }, AST_IterationStatement);

            var AST_ForIn = DEFNODE("ForIn", "init name object", {
                $documentation: "A `for ... in` statement",
                $propdoc: {
                    init: "[AST_Node] the `for/in` initialization code",
                    name: "[AST_SymbolRef?] the loop variable, only if `init` is AST_Var",
                    object: "[AST_Node] the object that we're looping through"
                },
                _walk: function(visitor) {
                    return visitor._visit(this, function(){
                        this.init._walk(visitor);
                        this.object._walk(visitor);
                        this.body._walk(visitor);
                    });
                }
            }, AST_IterationStatement);

            var AST_With = DEFNODE("With", "expression", {
                $documentation: "A `with` statement",
                $propdoc: {
                    expression: "[AST_Node] the `with` expression"
                },
                _walk: function(visitor) {
                    return visitor._visit(this, function(){
                        this.expression._walk(visitor);
                        this.body._walk(visitor);
                    });
                }
            }, AST_StatementWithBody);

            /* -----[ scope and functions ]----- */

            var AST_Scope = DEFNODE("Scope", "directives variables functions uses_with uses_eval parent_scope enclosed cname", {
                $documentation: "Base class for all statements introducing a lexical scope",
                $propdoc: {
                    directives: "[string*/S] an array of directives declared in this scope",
                    variables: "[Object/S] a map of name -> SymbolDef for all variables/functions defined in this scope",
                    functions: "[Object/S] like `variables`, but only lists function declarations",
                    uses_with: "[boolean/S] tells whether this scope uses the `with` statement",
                    uses_eval: "[boolean/S] tells whether this scope contains a direct call to the global `eval`",
                    parent_scope: "[AST_Scope?/S] link to the parent scope",
                    enclosed: "[SymbolDef*/S] a list of all symbol definitions that are accessed from this scope or any subscopes",
                    cname: "[integer/S] current index for mangling variables (used internally by the mangler)",
                },
            }, AST_Block);

            var AST_Toplevel = DEFNODE("Toplevel", "globals", {
                $documentation: "The toplevel scope",
                $propdoc: {
                    globals: "[Object/S] a map of name -> SymbolDef for all undeclared names",
                },
                wrap_enclose: function(arg_parameter_pairs) {
                    var self = this;
                    var args = [];
                    var parameters = [];

                    arg_parameter_pairs.forEach(function(pair) {
                        var splitAt = pair.lastIndexOf(":");

                        args.push(pair.substr(0, splitAt));
                        parameters.push(pair.substr(splitAt + 1));
                    });

                    var wrapped_tl = "(function(" + parameters.join(",") + "){ '$ORIG'; })(" + args.join(",") + ")";
                    wrapped_tl = parse(wrapped_tl);
                    wrapped_tl = wrapped_tl.transform(new TreeTransformer(function before(node){
                        if (node instanceof AST_Directive && node.value == "$ORIG") {
                            return MAP.splice(self.body);
                        }
                    }));
                    return wrapped_tl;
                },
                wrap_commonjs: function(name, export_all) {
                    var self = this;
                    var to_export = [];
                    if (export_all) {
                        self.figure_out_scope();
                        self.walk(new TreeWalker(function(node){
                            if (node instanceof AST_SymbolDeclaration && node.definition().global) {
                                if (!find_if(function(n){ return n.name == node.name }, to_export))
                                    to_export.push(node);
                            }
                        }));
                    }
                    var wrapped_tl = "(function(exports, global){ global['" + name + "'] = exports; '$ORIG'; '$EXPORTS'; }({}, (function(){return this}())))";
                    wrapped_tl = parse(wrapped_tl);
                    wrapped_tl = wrapped_tl.transform(new TreeTransformer(function before(node){
                        if (node instanceof AST_SimpleStatement) {
                            node = node.body;
                            if (node instanceof AST_String) switch (node.getValue()) {
                                case "$ORIG":
                                    return MAP.splice(self.body);
                                case "$EXPORTS":
                                    var body = [];
                                    to_export.forEach(function(sym){
                                        body.push(new AST_SimpleStatement({
                                            body: new AST_Assign({
                                                left: new AST_Sub({
                                                    expression: new AST_SymbolRef({ name: "exports" }),
                                                    property: new AST_String({ value: sym.name }),
                                                }),
                                                operator: "=",
                                                right: new AST_SymbolRef(sym),
                                            }),
                                        }));
                                    });
                                    return MAP.splice(body);
                            }
                        }
                    }));
                    return wrapped_tl;
                }
            }, AST_Scope);

            var AST_Lambda = DEFNODE("Lambda", "name argnames uses_arguments", {
                $documentation: "Base class for functions",
                $propdoc: {
                    name: "[AST_SymbolDeclaration?] the name of this function",
                    argnames: "[AST_SymbolFunarg*] array of function arguments",
                    uses_arguments: "[boolean/S] tells whether this function accesses the arguments array"
                },
                _walk: function(visitor) {
                    return visitor._visit(this, function(){
                        if (this.name) this.name._walk(visitor);
                        this.argnames.forEach(function(arg){
                            arg._walk(visitor);
                        });
                        walk_body(this, visitor);
                    });
                }
            }, AST_Scope);

            var AST_Accessor = DEFNODE("Accessor", null, {
                $documentation: "A setter/getter function.  The `name` property is always null."
            }, AST_Lambda);

            var AST_Function = DEFNODE("Function", null, {
                $documentation: "A function expression"
            }, AST_Lambda);

            var AST_Defun = DEFNODE("Defun", null, {
                $documentation: "A function definition"
            }, AST_Lambda);

            /* -----[ JUMPS ]----- */

            var AST_Jump = DEFNODE("Jump", null, {
                $documentation: "Base class for â€œjumpsâ€ (for now that's `return`, `throw`, `break` and `continue`)"
            }, AST_Statement);

            var AST_Exit = DEFNODE("Exit", "value", {
                $documentation: "Base class for â€œexitsâ€ (`return` and `throw`)",
                $propdoc: {
                    value: "[AST_Node?] the value returned or thrown by this statement; could be null for AST_Return"
                },
                _walk: function(visitor) {
                    return visitor._visit(this, this.value && function(){
                            this.value._walk(visitor);
                        });
                }
            }, AST_Jump);

            var AST_Return = DEFNODE("Return", null, {
                $documentation: "A `return` statement"
            }, AST_Exit);

            var AST_Throw = DEFNODE("Throw", null, {
                $documentation: "A `throw` statement"
            }, AST_Exit);

            var AST_LoopControl = DEFNODE("LoopControl", "label", {
                $documentation: "Base class for loop control statements (`break` and `continue`)",
                $propdoc: {
                    label: "[AST_LabelRef?] the label, or null if none",
                },
                _walk: function(visitor) {
                    return visitor._visit(this, this.label && function(){
                            this.label._walk(visitor);
                        });
                }
            }, AST_Jump);

            var AST_Break = DEFNODE("Break", null, {
                $documentation: "A `break` statement"
            }, AST_LoopControl);

            var AST_Continue = DEFNODE("Continue", null, {
                $documentation: "A `continue` statement"
            }, AST_LoopControl);

            /* -----[ IF ]----- */

            var AST_If = DEFNODE("If", "condition alternative", {
                $documentation: "A `if` statement",
                $propdoc: {
                    condition: "[AST_Node] the `if` condition",
                    alternative: "[AST_Statement?] the `else` part, or null if not present"
                },
                _walk: function(visitor) {
                    return visitor._visit(this, function(){
                        this.condition._walk(visitor);
                        this.body._walk(visitor);
                        if (this.alternative) this.alternative._walk(visitor);
                    });
                }
            }, AST_StatementWithBody);

            /* -----[ SWITCH ]----- */

            var AST_Switch = DEFNODE("Switch", "expression", {
                $documentation: "A `switch` statement",
                $propdoc: {
                    expression: "[AST_Node] the `switch` â€œdiscriminantâ€"
                },
                _walk: function(visitor) {
                    return visitor._visit(this, function(){
                        this.expression._walk(visitor);
                        walk_body(this, visitor);
                    });
                }
            }, AST_Block);

            var AST_SwitchBranch = DEFNODE("SwitchBranch", null, {
                $documentation: "Base class for `switch` branches",
            }, AST_Block);

            var AST_Default = DEFNODE("Default", null, {
                $documentation: "A `default` switch branch",
            }, AST_SwitchBranch);

            var AST_Case = DEFNODE("Case", "expression", {
                $documentation: "A `case` switch branch",
                $propdoc: {
                    expression: "[AST_Node] the `case` expression"
                },
                _walk: function(visitor) {
                    return visitor._visit(this, function(){
                        this.expression._walk(visitor);
                        walk_body(this, visitor);
                    });
                }
            }, AST_SwitchBranch);

            /* -----[ EXCEPTIONS ]----- */

            var AST_Try = DEFNODE("Try", "bcatch bfinally", {
                $documentation: "A `try` statement",
                $propdoc: {
                    bcatch: "[AST_Catch?] the catch block, or null if not present",
                    bfinally: "[AST_Finally?] the finally block, or null if not present"
                },
                _walk: function(visitor) {
                    return visitor._visit(this, function(){
                        walk_body(this, visitor);
                        if (this.bcatch) this.bcatch._walk(visitor);
                        if (this.bfinally) this.bfinally._walk(visitor);
                    });
                }
            }, AST_Block);

            var AST_Catch = DEFNODE("Catch", "argname", {
                $documentation: "A `catch` node; only makes sense as part of a `try` statement",
                $propdoc: {
                    argname: "[AST_SymbolCatch] symbol for the exception"
                },
                _walk: function(visitor) {
                    return visitor._visit(this, function(){
                        this.argname._walk(visitor);
                        walk_body(this, visitor);
                    });
                }
            }, AST_Block);

            var AST_Finally = DEFNODE("Finally", null, {
                $documentation: "A `finally` node; only makes sense as part of a `try` statement"
            }, AST_Block);

            /* -----[ VAR/CONST ]----- */

            var AST_Definitions = DEFNODE("Definitions", "definitions", {
                $documentation: "Base class for `var` or `const` nodes (variable declarations/initializations)",
                $propdoc: {
                    definitions: "[AST_VarDef*] array of variable definitions"
                },
                _walk: function(visitor) {
                    return visitor._visit(this, function(){
                        this.definitions.forEach(function(def){
                            def._walk(visitor);
                        });
                    });
                }
            }, AST_Statement);

            var AST_Var = DEFNODE("Var", null, {
                $documentation: "A `var` statement"
            }, AST_Definitions);

            var AST_Const = DEFNODE("Const", null, {
                $documentation: "A `const` statement"
            }, AST_Definitions);

            var AST_VarDef = DEFNODE("VarDef", "name value", {
                $documentation: "A variable declaration; only appears in a AST_Definitions node",
                $propdoc: {
                    name: "[AST_SymbolVar|AST_SymbolConst] name of the variable",
                    value: "[AST_Node?] initializer, or null of there's no initializer"
                },
                _walk: function(visitor) {
                    return visitor._visit(this, function(){
                        this.name._walk(visitor);
                        if (this.value) this.value._walk(visitor);
                    });
                }
            });

            /* -----[ OTHER ]----- */

            var AST_Call = DEFNODE("Call", "expression args", {
                $documentation: "A function call expression",
                $propdoc: {
                    expression: "[AST_Node] expression to invoke as function",
                    args: "[AST_Node*] array of arguments"
                },
                _walk: function(visitor) {
                    return visitor._visit(this, function(){
                        this.expression._walk(visitor);
                        this.args.forEach(function(arg){
                            arg._walk(visitor);
                        });
                    });
                }
            });

            var AST_New = DEFNODE("New", null, {
                $documentation: "An object instantiation.  Derives from a function call since it has exactly the same properties"
            }, AST_Call);

            var AST_Seq = DEFNODE("Seq", "car cdr", {
                $documentation: "A sequence expression (two comma-separated expressions)",
                $propdoc: {
                    car: "[AST_Node] first element in sequence",
                    cdr: "[AST_Node] second element in sequence"
                },
                $cons: function(x, y) {
                    var seq = new AST_Seq(x);
                    seq.car = x;
                    seq.cdr = y;
                    return seq;
                },
                $from_array: function(array) {
                    if (array.length == 0) return null;
                    if (array.length == 1) return array[0].clone();
                    var list = null;
                    for (var i = array.length; --i >= 0;) {
                        list = AST_Seq.cons(array[i], list);
                    }
                    var p = list;
                    while (p) {
                        if (p.cdr && !p.cdr.cdr) {
                            p.cdr = p.cdr.car;
                            break;
                        }
                        p = p.cdr;
                    }
                    return list;
                },
                to_array: function() {
                    var p = this, a = [];
                    while (p) {
                        a.push(p.car);
                        if (p.cdr && !(p.cdr instanceof AST_Seq)) {
                            a.push(p.cdr);
                            break;
                        }
                        p = p.cdr;
                    }
                    return a;
                },
                add: function(node) {
                    var p = this;
                    while (p) {
                        if (!(p.cdr instanceof AST_Seq)) {
                            var cell = AST_Seq.cons(p.cdr, node);
                            return p.cdr = cell;
                        }
                        p = p.cdr;
                    }
                },
                _walk: function(visitor) {
                    return visitor._visit(this, function(){
                        this.car._walk(visitor);
                        if (this.cdr) this.cdr._walk(visitor);
                    });
                }
            });

            var AST_PropAccess = DEFNODE("PropAccess", "expression property", {
                $documentation: "Base class for property access expressions, i.e. `a.foo` or `a[\"foo\"]`",
                $propdoc: {
                    expression: "[AST_Node] the â€œcontainerâ€ expression",
                    property: "[AST_Node|string] the property to access.  For AST_Dot this is always a plain string, while for AST_Sub it's an arbitrary AST_Node"
                }
            });

            var AST_Dot = DEFNODE("Dot", null, {
                $documentation: "A dotted property access expression",
                _walk: function(visitor) {
                    return visitor._visit(this, function(){
                        this.expression._walk(visitor);
                    });
                }
            }, AST_PropAccess);

            var AST_Sub = DEFNODE("Sub", null, {
                $documentation: "Index-style property access, i.e. `a[\"foo\"]`",
                _walk: function(visitor) {
                    return visitor._visit(this, function(){
                        this.expression._walk(visitor);
                        this.property._walk(visitor);
                    });
                }
            }, AST_PropAccess);

            var AST_Unary = DEFNODE("Unary", "operator expression", {
                $documentation: "Base class for unary expressions",
                $propdoc: {
                    operator: "[string] the operator",
                    expression: "[AST_Node] expression that this unary operator applies to"
                },
                _walk: function(visitor) {
                    return visitor._visit(this, function(){
                        this.expression._walk(visitor);
                    });
                }
            });

            var AST_UnaryPrefix = DEFNODE("UnaryPrefix", null, {
                $documentation: "Unary prefix expression, i.e. `typeof i` or `++i`"
            }, AST_Unary);

            var AST_UnaryPostfix = DEFNODE("UnaryPostfix", null, {
                $documentation: "Unary postfix expression, i.e. `i++`"
            }, AST_Unary);

            var AST_Binary = DEFNODE("Binary", "left operator right", {
                $documentation: "Binary expression, i.e. `a + b`",
                $propdoc: {
                    left: "[AST_Node] left-hand side expression",
                    operator: "[string] the operator",
                    right: "[AST_Node] right-hand side expression"
                },
                _walk: function(visitor) {
                    return visitor._visit(this, function(){
                        this.left._walk(visitor);
                        this.right._walk(visitor);
                    });
                }
            });

            var AST_Conditional = DEFNODE("Conditional", "condition consequent alternative", {
                $documentation: "Conditional expression using the ternary operator, i.e. `a ? b : c`",
                $propdoc: {
                    condition: "[AST_Node]",
                    consequent: "[AST_Node]",
                    alternative: "[AST_Node]"
                },
                _walk: function(visitor) {
                    return visitor._visit(this, function(){
                        this.condition._walk(visitor);
                        this.consequent._walk(visitor);
                        this.alternative._walk(visitor);
                    });
                }
            });

            var AST_Assign = DEFNODE("Assign", null, {
                $documentation: "An assignment expression â€” `a = b + 5`",
            }, AST_Binary);

            /* -----[ LITERALS ]----- */

            var AST_Array = DEFNODE("Array", "elements", {
                $documentation: "An array literal",
                $propdoc: {
                    elements: "[AST_Node*] array of elements"
                },
                _walk: function(visitor) {
                    return visitor._visit(this, function(){
                        this.elements.forEach(function(el){
                            el._walk(visitor);
                        });
                    });
                }
            });

            var AST_Object = DEFNODE("Object", "properties", {
                $documentation: "An object literal",
                $propdoc: {
                    properties: "[AST_ObjectProperty*] array of properties"
                },
                _walk: function(visitor) {
                    return visitor._visit(this, function(){
                        this.properties.forEach(function(prop){
                            prop._walk(visitor);
                        });
                    });
                }
            });

            var AST_ObjectProperty = DEFNODE("ObjectProperty", "key value", {
                $documentation: "Base class for literal object properties",
                $propdoc: {
                    key: "[string] the property name converted to a string for ObjectKeyVal.  For setters and getters this is an arbitrary AST_Node.",
                    value: "[AST_Node] property value.  For setters and getters this is an AST_Function."
                },
                _walk: function(visitor) {
                    return visitor._visit(this, function(){
                        this.value._walk(visitor);
                    });
                }
            });

            var AST_ObjectKeyVal = DEFNODE("ObjectKeyVal", "quote", {
                $documentation: "A key: value object property",
                $propdoc: {
                    quote: "[string] the original quote character"
                }
            }, AST_ObjectProperty);

            var AST_ObjectSetter = DEFNODE("ObjectSetter", null, {
                $documentation: "An object setter property",
            }, AST_ObjectProperty);

            var AST_ObjectGetter = DEFNODE("ObjectGetter", null, {
                $documentation: "An object getter property",
            }, AST_ObjectProperty);

            var AST_Symbol = DEFNODE("Symbol", "scope name thedef", {
                $propdoc: {
                    name: "[string] name of this symbol",
                    scope: "[AST_Scope/S] the current scope (not necessarily the definition scope)",
                    thedef: "[SymbolDef/S] the definition of this symbol"
                },
                $documentation: "Base class for all symbols",
            });

            var AST_SymbolAccessor = DEFNODE("SymbolAccessor", null, {
                $documentation: "The name of a property accessor (setter/getter function)"
            }, AST_Symbol);

            var AST_SymbolDeclaration = DEFNODE("SymbolDeclaration", "init", {
                $documentation: "A declaration symbol (symbol in var/const, function name or argument, symbol in catch)",
                $propdoc: {
                    init: "[AST_Node*/S] array of initializers for this declaration."
                }
            }, AST_Symbol);

            var AST_SymbolVar = DEFNODE("SymbolVar", null, {
                $documentation: "Symbol defining a variable",
            }, AST_SymbolDeclaration);

            var AST_SymbolConst = DEFNODE("SymbolConst", null, {
                $documentation: "A constant declaration"
            }, AST_SymbolDeclaration);

            var AST_SymbolFunarg = DEFNODE("SymbolFunarg", null, {
                $documentation: "Symbol naming a function argument",
            }, AST_SymbolVar);

            var AST_SymbolDefun = DEFNODE("SymbolDefun", null, {
                $documentation: "Symbol defining a function",
            }, AST_SymbolDeclaration);

            var AST_SymbolLambda = DEFNODE("SymbolLambda", null, {
                $documentation: "Symbol naming a function expression",
            }, AST_SymbolDeclaration);

            var AST_SymbolCatch = DEFNODE("SymbolCatch", null, {
                $documentation: "Symbol naming the exception in catch",
            }, AST_SymbolDeclaration);

            var AST_Label = DEFNODE("Label", "references", {
                $documentation: "Symbol naming a label (declaration)",
                $propdoc: {
                    references: "[AST_LoopControl*] a list of nodes referring to this label"
                },
                initialize: function() {
                    this.references = [];
                    this.thedef = this;
                }
            }, AST_Symbol);

            var AST_SymbolRef = DEFNODE("SymbolRef", null, {
                $documentation: "Reference to some symbol (not definition/declaration)",
            }, AST_Symbol);

            var AST_LabelRef = DEFNODE("LabelRef", null, {
                $documentation: "Reference to a label symbol",
            }, AST_Symbol);

            var AST_This = DEFNODE("This", null, {
                $documentation: "The `this` symbol",
            }, AST_Symbol);

            var AST_Constant = DEFNODE("Constant", null, {
                $documentation: "Base class for all constants",
                getValue: function() {
                    return this.value;
                }
            });

            var AST_String = DEFNODE("String", "value quote", {
                $documentation: "A string literal",
                $propdoc: {
                    value: "[string] the contents of this string",
                    quote: "[string] the original quote character"
                }
            }, AST_Constant);

            var AST_Number = DEFNODE("Number", "value", {
                $documentation: "A number literal",
                $propdoc: {
                    value: "[number] the numeric value"
                }
            }, AST_Constant);

            var AST_RegExp = DEFNODE("RegExp", "value", {
                $documentation: "A regexp literal",
                $propdoc: {
                    value: "[RegExp] the actual regexp"
                }
            }, AST_Constant);

            var AST_Atom = DEFNODE("Atom", null, {
                $documentation: "Base class for atoms",
            }, AST_Constant);

            var AST_Null = DEFNODE("Null", null, {
                $documentation: "The `null` atom",
                value: null
            }, AST_Atom);

            var AST_NaN = DEFNODE("NaN", null, {
                $documentation: "The impossible value",
                value: 0/0
            }, AST_Atom);

            var AST_Undefined = DEFNODE("Undefined", null, {
                $documentation: "The `undefined` value",
                value: (function(){}())
            }, AST_Atom);

            var AST_Hole = DEFNODE("Hole", null, {
                $documentation: "A hole in an array",
                value: (function(){}())
            }, AST_Atom);

            var AST_Infinity = DEFNODE("Infinity", null, {
                $documentation: "The `Infinity` value",
                value: 1/0
            }, AST_Atom);

            var AST_Boolean = DEFNODE("Boolean", null, {
                $documentation: "Base class for booleans",
            }, AST_Atom);

            var AST_False = DEFNODE("False", null, {
                $documentation: "The `false` atom",
                value: false
            }, AST_Boolean);

            var AST_True = DEFNODE("True", null, {
                $documentation: "The `true` atom",
                value: true
            }, AST_Boolean);

            /* -----[ TreeWalker ]----- */

            function TreeWalker(callback) {
                this.visit = callback;
                this.stack = [];
            };
            TreeWalker.prototype = {
                _visit: function(node, descend) {
                    this.stack.push(node);
                    var ret = this.visit(node, descend ? function(){
                        descend.call(node);
                    } : noop);
                    if (!ret && descend) {
                        descend.call(node);
                    }
                    this.stack.pop();
                    return ret;
                },
                parent: function(n) {
                    return this.stack[this.stack.length - 2 - (n || 0)];
                },
                push: function (node) {
                    this.stack.push(node);
                },
                pop: function() {
                    return this.stack.pop();
                },
                self: function() {
                    return this.stack[this.stack.length - 1];
                },
                find_parent: function(type) {
                    var stack = this.stack;
                    for (var i = stack.length; --i >= 0;) {
                        var x = stack[i];
                        if (x instanceof type) return x;
                    }
                },
                has_directive: function(type) {
                    return this.find_parent(AST_Scope).has_directive(type);
                },
                in_boolean_context: function() {
                    var stack = this.stack;
                    var i = stack.length, self = stack[--i];
                    while (i > 0) {
                        var p = stack[--i];
                        if ((p instanceof AST_If           && p.condition === self) ||
                            (p instanceof AST_Conditional  && p.condition === self) ||
                            (p instanceof AST_DWLoop       && p.condition === self) ||
                            (p instanceof AST_For          && p.condition === self) ||
                            (p instanceof AST_UnaryPrefix  && p.operator == "!" && p.expression === self))
                        {
                            return true;
                        }
                        if (!(p instanceof AST_Binary && (p.operator == "&&" || p.operator == "||")))
                            return false;
                        self = p;
                    }
                },
                loopcontrol_target: function(label) {
                    var stack = this.stack;
                    if (label) for (var i = stack.length; --i >= 0;) {
                        var x = stack[i];
                        if (x instanceof AST_LabeledStatement && x.label.name == label.name) {
                            return x.body;
                        }
                    } else for (var i = stack.length; --i >= 0;) {
                        var x = stack[i];
                        if (x instanceof AST_Switch || x instanceof AST_IterationStatement)
                            return x;
                    }
                }
            };

            /***********************************************************************

             A JavaScript tokenizer / parser / beautifier / compressor.
             https://github.com/mishoo/UglifyJS2

             -------------------------------- (C) ---------------------------------

             Author: Mihai Bazon
             <mihai.bazon@gmail.com>
             http://mihai.bazon.net/blog

             Distributed under the BSD license:

             Copyright 2012 (c) Mihai Bazon <mihai.bazon@gmail.com>
             Parser based on parse-js (http://marijn.haverbeke.nl/parse-js/).

             Redistribution and use in source and binary forms, with or without
             modification, are permitted provided that the following conditions
             are met:

             * Redistributions of source code must retain the above
             copyright notice, this list of conditions and the following
             disclaimer.

             * Redistributions in binary form must reproduce the above
             copyright notice, this list of conditions and the following
             disclaimer in the documentation and/or other materials
             provided with the distribution.

             THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDER â€œAS ISâ€ AND ANY
             EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
             IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
             PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE
             LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY,
             OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
             PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
             PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
             THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
             TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF
             THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
             SUCH DAMAGE.

             ***********************************************************************/

            "use strict";

            var KEYWORDS = 'break case catch const continue debugger default delete do else finally for function if in instanceof new return switch throw try typeof var void while with';
            var KEYWORDS_ATOM = 'false null true';
            var RESERVED_WORDS = 'abstract boolean byte char class double enum export extends final float goto implements import int interface long native package private protected public short static super synchronized this throws transient volatile yield'
                + " " + KEYWORDS_ATOM + " " + KEYWORDS;
            var KEYWORDS_BEFORE_EXPRESSION = 'return new delete throw else case';

            KEYWORDS = makePredicate(KEYWORDS);
            RESERVED_WORDS = makePredicate(RESERVED_WORDS);
            KEYWORDS_BEFORE_EXPRESSION = makePredicate(KEYWORDS_BEFORE_EXPRESSION);
            KEYWORDS_ATOM = makePredicate(KEYWORDS_ATOM);

            var OPERATOR_CHARS = makePredicate(characters("+-*&%=<>!?|~^"));

            var RE_HEX_NUMBER = /^0x[0-9a-f]+$/i;
            var RE_OCT_NUMBER = /^0[0-7]+$/;
            var RE_DEC_NUMBER = /^\d*\.?\d*(?:e[+-]?\d*(?:\d\.?|\.?\d)\d*)?$/i;

            var OPERATORS = makePredicate([
                "in",
                "instanceof",
                "typeof",
                "new",
                "void",
                "delete",
                "++",
                "--",
                "+",
                "-",
                "!",
                "~",
                "&",
                "|",
                "^",
                "*",
                "/",
                "%",
                ">>",
                "<<",
                ">>>",
                "<",
                ">",
                "<=",
                ">=",
                "==",
                "===",
                "!=",
                "!==",
                "?",
                "=",
                "+=",
                "-=",
                "/=",
                "*=",
                "%=",
                ">>=",
                "<<=",
                ">>>=",
                "|=",
                "^=",
                "&=",
                "&&",
                "||"
            ]);

            var WHITESPACE_CHARS = makePredicate(characters(" \u00a0\n\r\t\f\u000b\u200b\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\uFEFF"));

            var PUNC_BEFORE_EXPRESSION = makePredicate(characters("[{(,.;:"));

            var PUNC_CHARS = makePredicate(characters("[]{}(),;:"));

            var REGEXP_MODIFIERS = makePredicate(characters("gmsiy"));

            /* -----[ Tokenizer ]----- */

// regexps adapted from http://xregexp.com/plugins/#unicode
            var UNICODE = {
                letter: new RegExp("[\\u0041-\\u005A\\u0061-\\u007A\\u00AA\\u00B5\\u00BA\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02C1\\u02C6-\\u02D1\\u02E0-\\u02E4\\u02EC\\u02EE\\u0370-\\u0374\\u0376\\u0377\\u037A-\\u037D\\u037F\\u0386\\u0388-\\u038A\\u038C\\u038E-\\u03A1\\u03A3-\\u03F5\\u03F7-\\u0481\\u048A-\\u052F\\u0531-\\u0556\\u0559\\u0561-\\u0587\\u05D0-\\u05EA\\u05F0-\\u05F2\\u0620-\\u064A\\u066E\\u066F\\u0671-\\u06D3\\u06D5\\u06E5\\u06E6\\u06EE\\u06EF\\u06FA-\\u06FC\\u06FF\\u0710\\u0712-\\u072F\\u074D-\\u07A5\\u07B1\\u07CA-\\u07EA\\u07F4\\u07F5\\u07FA\\u0800-\\u0815\\u081A\\u0824\\u0828\\u0840-\\u0858\\u08A0-\\u08B2\\u0904-\\u0939\\u093D\\u0950\\u0958-\\u0961\\u0971-\\u0980\\u0985-\\u098C\\u098F\\u0990\\u0993-\\u09A8\\u09AA-\\u09B0\\u09B2\\u09B6-\\u09B9\\u09BD\\u09CE\\u09DC\\u09DD\\u09DF-\\u09E1\\u09F0\\u09F1\\u0A05-\\u0A0A\\u0A0F\\u0A10\\u0A13-\\u0A28\\u0A2A-\\u0A30\\u0A32\\u0A33\\u0A35\\u0A36\\u0A38\\u0A39\\u0A59-\\u0A5C\\u0A5E\\u0A72-\\u0A74\\u0A85-\\u0A8D\\u0A8F-\\u0A91\\u0A93-\\u0AA8\\u0AAA-\\u0AB0\\u0AB2\\u0AB3\\u0AB5-\\u0AB9\\u0ABD\\u0AD0\\u0AE0\\u0AE1\\u0B05-\\u0B0C\\u0B0F\\u0B10\\u0B13-\\u0B28\\u0B2A-\\u0B30\\u0B32\\u0B33\\u0B35-\\u0B39\\u0B3D\\u0B5C\\u0B5D\\u0B5F-\\u0B61\\u0B71\\u0B83\\u0B85-\\u0B8A\\u0B8E-\\u0B90\\u0B92-\\u0B95\\u0B99\\u0B9A\\u0B9C\\u0B9E\\u0B9F\\u0BA3\\u0BA4\\u0BA8-\\u0BAA\\u0BAE-\\u0BB9\\u0BD0\\u0C05-\\u0C0C\\u0C0E-\\u0C10\\u0C12-\\u0C28\\u0C2A-\\u0C39\\u0C3D\\u0C58\\u0C59\\u0C60\\u0C61\\u0C85-\\u0C8C\\u0C8E-\\u0C90\\u0C92-\\u0CA8\\u0CAA-\\u0CB3\\u0CB5-\\u0CB9\\u0CBD\\u0CDE\\u0CE0\\u0CE1\\u0CF1\\u0CF2\\u0D05-\\u0D0C\\u0D0E-\\u0D10\\u0D12-\\u0D3A\\u0D3D\\u0D4E\\u0D60\\u0D61\\u0D7A-\\u0D7F\\u0D85-\\u0D96\\u0D9A-\\u0DB1\\u0DB3-\\u0DBB\\u0DBD\\u0DC0-\\u0DC6\\u0E01-\\u0E30\\u0E32\\u0E33\\u0E40-\\u0E46\\u0E81\\u0E82\\u0E84\\u0E87\\u0E88\\u0E8A\\u0E8D\\u0E94-\\u0E97\\u0E99-\\u0E9F\\u0EA1-\\u0EA3\\u0EA5\\u0EA7\\u0EAA\\u0EAB\\u0EAD-\\u0EB0\\u0EB2\\u0EB3\\u0EBD\\u0EC0-\\u0EC4\\u0EC6\\u0EDC-\\u0EDF\\u0F00\\u0F40-\\u0F47\\u0F49-\\u0F6C\\u0F88-\\u0F8C\\u1000-\\u102A\\u103F\\u1050-\\u1055\\u105A-\\u105D\\u1061\\u1065\\u1066\\u106E-\\u1070\\u1075-\\u1081\\u108E\\u10A0-\\u10C5\\u10C7\\u10CD\\u10D0-\\u10FA\\u10FC-\\u1248\\u124A-\\u124D\\u1250-\\u1256\\u1258\\u125A-\\u125D\\u1260-\\u1288\\u128A-\\u128D\\u1290-\\u12B0\\u12B2-\\u12B5\\u12B8-\\u12BE\\u12C0\\u12C2-\\u12C5\\u12C8-\\u12D6\\u12D8-\\u1310\\u1312-\\u1315\\u1318-\\u135A\\u1380-\\u138F\\u13A0-\\u13F4\\u1401-\\u166C\\u166F-\\u167F\\u1681-\\u169A\\u16A0-\\u16EA\\u16EE-\\u16F8\\u1700-\\u170C\\u170E-\\u1711\\u1720-\\u1731\\u1740-\\u1751\\u1760-\\u176C\\u176E-\\u1770\\u1780-\\u17B3\\u17D7\\u17DC\\u1820-\\u1877\\u1880-\\u18A8\\u18AA\\u18B0-\\u18F5\\u1900-\\u191E\\u1950-\\u196D\\u1970-\\u1974\\u1980-\\u19AB\\u19C1-\\u19C7\\u1A00-\\u1A16\\u1A20-\\u1A54\\u1AA7\\u1B05-\\u1B33\\u1B45-\\u1B4B\\u1B83-\\u1BA0\\u1BAE\\u1BAF\\u1BBA-\\u1BE5\\u1C00-\\u1C23\\u1C4D-\\u1C4F\\u1C5A-\\u1C7D\\u1CE9-\\u1CEC\\u1CEE-\\u1CF1\\u1CF5\\u1CF6\\u1D00-\\u1DBF\\u1E00-\\u1F15\\u1F18-\\u1F1D\\u1F20-\\u1F45\\u1F48-\\u1F4D\\u1F50-\\u1F57\\u1F59\\u1F5B\\u1F5D\\u1F5F-\\u1F7D\\u1F80-\\u1FB4\\u1FB6-\\u1FBC\\u1FBE\\u1FC2-\\u1FC4\\u1FC6-\\u1FCC\\u1FD0-\\u1FD3\\u1FD6-\\u1FDB\\u1FE0-\\u1FEC\\u1FF2-\\u1FF4\\u1FF6-\\u1FFC\\u2071\\u207F\\u2090-\\u209C\\u2102\\u2107\\u210A-\\u2113\\u2115\\u2119-\\u211D\\u2124\\u2126\\u2128\\u212A-\\u212D\\u212F-\\u2139\\u213C-\\u213F\\u2145-\\u2149\\u214E\\u2160-\\u2188\\u2C00-\\u2C2E\\u2C30-\\u2C5E\\u2C60-\\u2CE4\\u2CEB-\\u2CEE\\u2CF2\\u2CF3\\u2D00-\\u2D25\\u2D27\\u2D2D\\u2D30-\\u2D67\\u2D6F\\u2D80-\\u2D96\\u2DA0-\\u2DA6\\u2DA8-\\u2DAE\\u2DB0-\\u2DB6\\u2DB8-\\u2DBE\\u2DC0-\\u2DC6\\u2DC8-\\u2DCE\\u2DD0-\\u2DD6\\u2DD8-\\u2DDE\\u2E2F\\u3005-\\u3007\\u3021-\\u3029\\u3031-\\u3035\\u3038-\\u303C\\u3041-\\u3096\\u309D-\\u309F\\u30A1-\\u30FA\\u30FC-\\u30FF\\u3105-\\u312D\\u3131-\\u318E\\u31A0-\\u31BA\\u31F0-\\u31FF\\u3400-\\u4DB5\\u4E00-\\u9FCC\\uA000-\\uA48C\\uA4D0-\\uA4FD\\uA500-\\uA60C\\uA610-\\uA61F\\uA62A\\uA62B\\uA640-\\uA66E\\uA67F-\\uA69D\\uA6A0-\\uA6EF\\uA717-\\uA71F\\uA722-\\uA788\\uA78B-\\uA78E\\uA790-\\uA7AD\\uA7B0\\uA7B1\\uA7F7-\\uA801\\uA803-\\uA805\\uA807-\\uA80A\\uA80C-\\uA822\\uA840-\\uA873\\uA882-\\uA8B3\\uA8F2-\\uA8F7\\uA8FB\\uA90A-\\uA925\\uA930-\\uA946\\uA960-\\uA97C\\uA984-\\uA9B2\\uA9CF\\uA9E0-\\uA9E4\\uA9E6-\\uA9EF\\uA9FA-\\uA9FE\\uAA00-\\uAA28\\uAA40-\\uAA42\\uAA44-\\uAA4B\\uAA60-\\uAA76\\uAA7A\\uAA7E-\\uAAAF\\uAAB1\\uAAB5\\uAAB6\\uAAB9-\\uAABD\\uAAC0\\uAAC2\\uAADB-\\uAADD\\uAAE0-\\uAAEA\\uAAF2-\\uAAF4\\uAB01-\\uAB06\\uAB09-\\uAB0E\\uAB11-\\uAB16\\uAB20-\\uAB26\\uAB28-\\uAB2E\\uAB30-\\uAB5A\\uAB5C-\\uAB5F\\uAB64\\uAB65\\uABC0-\\uABE2\\uAC00-\\uD7A3\\uD7B0-\\uD7C6\\uD7CB-\\uD7FB\\uF900-\\uFA6D\\uFA70-\\uFAD9\\uFB00-\\uFB06\\uFB13-\\uFB17\\uFB1D\\uFB1F-\\uFB28\\uFB2A-\\uFB36\\uFB38-\\uFB3C\\uFB3E\\uFB40\\uFB41\\uFB43\\uFB44\\uFB46-\\uFBB1\\uFBD3-\\uFD3D\\uFD50-\\uFD8F\\uFD92-\\uFDC7\\uFDF0-\\uFDFB\\uFE70-\\uFE74\\uFE76-\\uFEFC\\uFF21-\\uFF3A\\uFF41-\\uFF5A\\uFF66-\\uFFBE\\uFFC2-\\uFFC7\\uFFCA-\\uFFCF\\uFFD2-\\uFFD7\\uFFDA-\\uFFDC]"),
                digit: new RegExp("[\\u0030-\\u0039\\u0660-\\u0669\\u06F0-\\u06F9\\u07C0-\\u07C9\\u0966-\\u096F\\u09E6-\\u09EF\\u0A66-\\u0A6F\\u0AE6-\\u0AEF\\u0B66-\\u0B6F\\u0BE6-\\u0BEF\\u0C66-\\u0C6F\\u0CE6-\\u0CEF\\u0D66-\\u0D6F\\u0DE6-\\u0DEF\\u0E50-\\u0E59\\u0ED0-\\u0ED9\\u0F20-\\u0F29\\u1040-\\u1049\\u1090-\\u1099\\u17E0-\\u17E9\\u1810-\\u1819\\u1946-\\u194F\\u19D0-\\u19D9\\u1A80-\\u1A89\\u1A90-\\u1A99\\u1B50-\\u1B59\\u1BB0-\\u1BB9\\u1C40-\\u1C49\\u1C50-\\u1C59\\uA620-\\uA629\\uA8D0-\\uA8D9\\uA900-\\uA909\\uA9D0-\\uA9D9\\uA9F0-\\uA9F9\\uAA50-\\uAA59\\uABF0-\\uABF9\\uFF10-\\uFF19]"),
                non_spacing_mark: new RegExp("[\\u0300-\\u036F\\u0483-\\u0487\\u0591-\\u05BD\\u05BF\\u05C1\\u05C2\\u05C4\\u05C5\\u05C7\\u0610-\\u061A\\u064B-\\u065E\\u0670\\u06D6-\\u06DC\\u06DF-\\u06E4\\u06E7\\u06E8\\u06EA-\\u06ED\\u0711\\u0730-\\u074A\\u07A6-\\u07B0\\u07EB-\\u07F3\\u0816-\\u0819\\u081B-\\u0823\\u0825-\\u0827\\u0829-\\u082D\\u0900-\\u0902\\u093C\\u0941-\\u0948\\u094D\\u0951-\\u0955\\u0962\\u0963\\u0981\\u09BC\\u09C1-\\u09C4\\u09CD\\u09E2\\u09E3\\u0A01\\u0A02\\u0A3C\\u0A41\\u0A42\\u0A47\\u0A48\\u0A4B-\\u0A4D\\u0A51\\u0A70\\u0A71\\u0A75\\u0A81\\u0A82\\u0ABC\\u0AC1-\\u0AC5\\u0AC7\\u0AC8\\u0ACD\\u0AE2\\u0AE3\\u0B01\\u0B3C\\u0B3F\\u0B41-\\u0B44\\u0B4D\\u0B56\\u0B62\\u0B63\\u0B82\\u0BC0\\u0BCD\\u0C3E-\\u0C40\\u0C46-\\u0C48\\u0C4A-\\u0C4D\\u0C55\\u0C56\\u0C62\\u0C63\\u0CBC\\u0CBF\\u0CC6\\u0CCC\\u0CCD\\u0CE2\\u0CE3\\u0D41-\\u0D44\\u0D4D\\u0D62\\u0D63\\u0DCA\\u0DD2-\\u0DD4\\u0DD6\\u0E31\\u0E34-\\u0E3A\\u0E47-\\u0E4E\\u0EB1\\u0EB4-\\u0EB9\\u0EBB\\u0EBC\\u0EC8-\\u0ECD\\u0F18\\u0F19\\u0F35\\u0F37\\u0F39\\u0F71-\\u0F7E\\u0F80-\\u0F84\\u0F86\\u0F87\\u0F90-\\u0F97\\u0F99-\\u0FBC\\u0FC6\\u102D-\\u1030\\u1032-\\u1037\\u1039\\u103A\\u103D\\u103E\\u1058\\u1059\\u105E-\\u1060\\u1071-\\u1074\\u1082\\u1085\\u1086\\u108D\\u109D\\u135F\\u1712-\\u1714\\u1732-\\u1734\\u1752\\u1753\\u1772\\u1773\\u17B7-\\u17BD\\u17C6\\u17C9-\\u17D3\\u17DD\\u180B-\\u180D\\u18A9\\u1920-\\u1922\\u1927\\u1928\\u1932\\u1939-\\u193B\\u1A17\\u1A18\\u1A56\\u1A58-\\u1A5E\\u1A60\\u1A62\\u1A65-\\u1A6C\\u1A73-\\u1A7C\\u1A7F\\u1B00-\\u1B03\\u1B34\\u1B36-\\u1B3A\\u1B3C\\u1B42\\u1B6B-\\u1B73\\u1B80\\u1B81\\u1BA2-\\u1BA5\\u1BA8\\u1BA9\\u1C2C-\\u1C33\\u1C36\\u1C37\\u1CD0-\\u1CD2\\u1CD4-\\u1CE0\\u1CE2-\\u1CE8\\u1CED\\u1DC0-\\u1DE6\\u1DFD-\\u1DFF\\u20D0-\\u20DC\\u20E1\\u20E5-\\u20F0\\u2CEF-\\u2CF1\\u2DE0-\\u2DFF\\u302A-\\u302F\\u3099\\u309A\\uA66F\\uA67C\\uA67D\\uA6F0\\uA6F1\\uA802\\uA806\\uA80B\\uA825\\uA826\\uA8C4\\uA8E0-\\uA8F1\\uA926-\\uA92D\\uA947-\\uA951\\uA980-\\uA982\\uA9B3\\uA9B6-\\uA9B9\\uA9BC\\uAA29-\\uAA2E\\uAA31\\uAA32\\uAA35\\uAA36\\uAA43\\uAA4C\\uAAB0\\uAAB2-\\uAAB4\\uAAB7\\uAAB8\\uAABE\\uAABF\\uAAC1\\uABE5\\uABE8\\uABED\\uFB1E\\uFE00-\\uFE0F\\uFE20-\\uFE26]"),
                space_combining_mark: new RegExp("[\\u0903\\u093E-\\u0940\\u0949-\\u094C\\u094E\\u0982\\u0983\\u09BE-\\u09C0\\u09C7\\u09C8\\u09CB\\u09CC\\u09D7\\u0A03\\u0A3E-\\u0A40\\u0A83\\u0ABE-\\u0AC0\\u0AC9\\u0ACB\\u0ACC\\u0B02\\u0B03\\u0B3E\\u0B40\\u0B47\\u0B48\\u0B4B\\u0B4C\\u0B57\\u0BBE\\u0BBF\\u0BC1\\u0BC2\\u0BC6-\\u0BC8\\u0BCA-\\u0BCC\\u0BD7\\u0C01-\\u0C03\\u0C41-\\u0C44\\u0C82\\u0C83\\u0CBE\\u0CC0-\\u0CC4\\u0CC7\\u0CC8\\u0CCA\\u0CCB\\u0CD5\\u0CD6\\u0D02\\u0D03\\u0D3E-\\u0D40\\u0D46-\\u0D48\\u0D4A-\\u0D4C\\u0D57\\u0D82\\u0D83\\u0DCF-\\u0DD1\\u0DD8-\\u0DDF\\u0DF2\\u0DF3\\u0F3E\\u0F3F\\u0F7F\\u102B\\u102C\\u1031\\u1038\\u103B\\u103C\\u1056\\u1057\\u1062-\\u1064\\u1067-\\u106D\\u1083\\u1084\\u1087-\\u108C\\u108F\\u109A-\\u109C\\u17B6\\u17BE-\\u17C5\\u17C7\\u17C8\\u1923-\\u1926\\u1929-\\u192B\\u1930\\u1931\\u1933-\\u1938\\u19B0-\\u19C0\\u19C8\\u19C9\\u1A19-\\u1A1B\\u1A55\\u1A57\\u1A61\\u1A63\\u1A64\\u1A6D-\\u1A72\\u1B04\\u1B35\\u1B3B\\u1B3D-\\u1B41\\u1B43\\u1B44\\u1B82\\u1BA1\\u1BA6\\u1BA7\\u1BAA\\u1C24-\\u1C2B\\u1C34\\u1C35\\u1CE1\\u1CF2\\uA823\\uA824\\uA827\\uA880\\uA881\\uA8B4-\\uA8C3\\uA952\\uA953\\uA983\\uA9B4\\uA9B5\\uA9BA\\uA9BB\\uA9BD-\\uA9C0\\uAA2F\\uAA30\\uAA33\\uAA34\\uAA4D\\uAA7B\\uABE3\\uABE4\\uABE6\\uABE7\\uABE9\\uABEA\\uABEC]"),
                connector_punctuation: new RegExp("[\\u005F\\u203F\\u2040\\u2054\\uFE33\\uFE34\\uFE4D-\\uFE4F\\uFF3F]")
            };

            function is_letter(code) {
                return (code >= 97 && code <= 122)
                    || (code >= 65 && code <= 90)
                    || (code >= 0xaa && UNICODE.letter.test(String.fromCharCode(code)));
            };

            function is_digit(code) {
                return code >= 48 && code <= 57;
            };

            function is_alphanumeric_char(code) {
                return is_digit(code) || is_letter(code);
            };

            function is_unicode_digit(code) {
                return UNICODE.digit.test(String.fromCharCode(code));
            }

            function is_unicode_combining_mark(ch) {
                return UNICODE.non_spacing_mark.test(ch) || UNICODE.space_combining_mark.test(ch);
            };

            function is_unicode_connector_punctuation(ch) {
                return UNICODE.connector_punctuation.test(ch);
            };

            function is_identifier(name) {
                return !RESERVED_WORDS(name) && /^[a-z_$][a-z0-9_$]*$/i.test(name);
            };

            function is_identifier_start(code) {
                return code == 36 || code == 95 || is_letter(code);
            };

            function is_identifier_char(ch) {
                var code = ch.charCodeAt(0);
                return is_identifier_start(code)
                    || is_digit(code)
                    || code == 8204 // \u200c: zero-width non-joiner <ZWNJ>
                    || code == 8205 // \u200d: zero-width joiner <ZWJ> (in my ECMA-262 PDF, this is also 200c)
                    || is_unicode_combining_mark(ch)
                    || is_unicode_connector_punctuation(ch)
                    || is_unicode_digit(code)
                    ;
            };

            function is_identifier_string(str){
                return /^[a-z_$][a-z0-9_$]*$/i.test(str);
            };

            function parse_js_number(num) {
                if (RE_HEX_NUMBER.test(num)) {
                    return parseInt(num.substr(2), 16);
                } else if (RE_OCT_NUMBER.test(num)) {
                    return parseInt(num.substr(1), 8);
                } else if (RE_DEC_NUMBER.test(num)) {
                    return parseFloat(num);
                }
            };

            function JS_Parse_Error(message, filename, line, col, pos) {
                this.message = message;
                this.filename = filename;
                this.line = line;
                this.col = col;
                this.pos = pos;
                this.stack = new Error().stack;
            };

            JS_Parse_Error.prototype.toString = function() {
                return this.message + " (line: " + this.line + ", col: " + this.col + ", pos: " + this.pos + ")" + "\n\n" + this.stack;
            };

            function js_error(message, filename, line, col, pos) {
                throw new JS_Parse_Error(message, filename, line, col, pos);
            };

            function is_token(token, type, val) {
                return token.type == type && (val == null || token.value == val);
            };

            var EX_EOF = {};

            function tokenizer($TEXT, filename, html5_comments) {

                var S = {
                    text            : $TEXT,
                    filename        : filename,
                    pos             : 0,
                    tokpos          : 0,
                    line            : 1,
                    tokline         : 0,
                    col             : 0,
                    tokcol          : 0,
                    newline_before  : false,
                    regex_allowed   : false,
                    comments_before : []
                };

                function peek() { return S.text.charAt(S.pos); };

                function next(signal_eof, in_string) {
                    var ch = S.text.charAt(S.pos++);
                    if (signal_eof && !ch)
                        throw EX_EOF;
                    if ("\r\n\u2028\u2029".indexOf(ch) >= 0) {
                        S.newline_before = S.newline_before || !in_string;
                        ++S.line;
                        S.col = 0;
                        if (!in_string && ch == "\r" && peek() == "\n") {
                            // treat a \r\n sequence as a single \n
                            ++S.pos;
                            ch = "\n";
                        }
                    } else {
                        ++S.col;
                    }
                    return ch;
                };

                function forward(i) {
                    while (i-- > 0) next();
                };

                function looking_at(str) {
                    return S.text.substr(S.pos, str.length) == str;
                };

                function find(what, signal_eof) {
                    var pos = S.text.indexOf(what, S.pos);
                    if (signal_eof && pos == -1) throw EX_EOF;
                    return pos;
                };

                function start_token() {
                    S.tokline = S.line;
                    S.tokcol = S.col;
                    S.tokpos = S.pos;
                };

                var prev_was_dot = false;
                function token(type, value, is_comment) {
                    S.regex_allowed = ((type == "operator" && !UNARY_POSTFIX(value)) ||
                    (type == "keyword" && KEYWORDS_BEFORE_EXPRESSION(value)) ||
                    (type == "punc" && PUNC_BEFORE_EXPRESSION(value)));
                    prev_was_dot = (type == "punc" && value == ".");
                    var ret = {
                        type    : type,
                        value   : value,
                        line    : S.tokline,
                        col     : S.tokcol,
                        pos     : S.tokpos,
                        endline : S.line,
                        endcol  : S.col,
                        endpos  : S.pos,
                        nlb     : S.newline_before,
                        file    : filename
                    };
                    if (!is_comment) {
                        ret.comments_before = S.comments_before;
                        S.comments_before = [];
                        // make note of any newlines in the comments that came before
                        for (var i = 0, len = ret.comments_before.length; i < len; i++) {
                            ret.nlb = ret.nlb || ret.comments_before[i].nlb;
                        }
                    }
                    S.newline_before = false;
                    return new AST_Token(ret);
                };

                function skip_whitespace() {
                    var ch;
                    while (WHITESPACE_CHARS(ch = peek()) || ch == "\u2028" || ch == "\u2029")
                        next();
                };

                function read_while(pred) {
                    var ret = "", ch, i = 0;
                    while ((ch = peek()) && pred(ch, i++))
                        ret += next();
                    return ret;
                };

                function parse_error(err) {
                    js_error(err, filename, S.tokline, S.tokcol, S.tokpos);
                };

                function read_num(prefix) {
                    var has_e = false, after_e = false, has_x = false, has_dot = prefix == ".";
                    var num = read_while(function(ch, i){
                        var code = ch.charCodeAt(0);
                        switch (code) {
                            case 120: case 88: // xX
                            return has_x ? false : (has_x = true);
                            case 101: case 69: // eE
                            return has_x ? true : has_e ? false : (has_e = after_e = true);
                            case 45: // -
                                return after_e || (i == 0 && !prefix);
                            case 43: // +
                                return after_e;
                            case (after_e = false, 46): // .
                                return (!has_dot && !has_x && !has_e) ? (has_dot = true) : false;
                        }
                        return is_alphanumeric_char(code);
                    });
                    if (prefix) num = prefix + num;
                    var valid = parse_js_number(num);
                    if (!isNaN(valid)) {
                        return token("num", valid);
                    } else {
                        parse_error("Invalid syntax: " + num);
                    }
                };

                function read_escaped_char(in_string) {
                    var ch = next(true, in_string);
                    switch (ch.charCodeAt(0)) {
                        case 110 : return "\n";
                        case 114 : return "\r";
                        case 116 : return "\t";
                        case 98  : return "\b";
                        case 118 : return "\u000b"; // \v
                        case 102 : return "\f";
                        case 48  : return "\0";
                        case 120 : return String.fromCharCode(hex_bytes(2)); // \x
                        case 117 : return String.fromCharCode(hex_bytes(4)); // \u
                        case 10  : return ""; // newline
                        case 13  :            // \r
                            if (peek() == "\n") { // DOS newline
                                next(true, in_string);
                                return "";
                            }
                    }
                    return ch;
                };

                function hex_bytes(n) {
                    var num = 0;
                    for (; n > 0; --n) {
                        var digit = parseInt(next(true), 16);
                        if (isNaN(digit))
                            parse_error("Invalid hex-character pattern in string");
                        num = (num << 4) | digit;
                    }
                    return num;
                };

                var read_string = with_eof_error("Unterminated string constant", function(quote_char){
                    var quote = next(), ret = "";
                    for (;;) {
                        var ch = next(true, true);
                        if (ch == "\\") {
                            // read OctalEscapeSequence (XXX: deprecated if "strict mode")
                            // https://github.com/mishoo/UglifyJS/issues/178
                            var octal_len = 0, first = null;
                            ch = read_while(function(ch){
                                if (ch >= "0" && ch <= "7") {
                                    if (!first) {
                                        first = ch;
                                        return ++octal_len;
                                    }
                                    else if (first <= "3" && octal_len <= 2) return ++octal_len;
                                    else if (first >= "4" && octal_len <= 1) return ++octal_len;
                                }
                                return false;
                            });
                            if (octal_len > 0) ch = String.fromCharCode(parseInt(ch, 8));
                            else ch = read_escaped_char(true);
                        }
                        else if (ch == quote) break;
                        ret += ch;
                    }
                    var tok = token("string", ret);
                    tok.quote = quote_char;
                    return tok;
                });

                function skip_line_comment(type) {
                    var regex_allowed = S.regex_allowed;
                    var i = find("\n"), ret;
                    if (i == -1) {
                        ret = S.text.substr(S.pos);
                        S.pos = S.text.length;
                    } else {
                        ret = S.text.substring(S.pos, i);
                        S.pos = i;
                    }
                    S.col = S.tokcol + (S.pos - S.tokpos);
                    S.comments_before.push(token(type, ret, true));
                    S.regex_allowed = regex_allowed;
                    return next_token();
                };

                var skip_multiline_comment = with_eof_error("Unterminated multiline comment", function(){
                    var regex_allowed = S.regex_allowed;
                    var i = find("*/", true);
                    var text = S.text.substring(S.pos, i);
                    var a = text.split("\n"), n = a.length;
                    // update stream position
                    S.pos = i + 2;
                    S.line += n - 1;
                    if (n > 1) S.col = a[n - 1].length;
                    else S.col += a[n - 1].length;
                    S.col += 2;
                    var nlb = S.newline_before = S.newline_before || text.indexOf("\n") >= 0;
                    S.comments_before.push(token("comment2", text, true));
                    S.regex_allowed = regex_allowed;
                    S.newline_before = nlb;
                    return next_token();
                });

                function read_name() {
                    var backslash = false, name = "", ch, escaped = false, hex;
                    while ((ch = peek()) != null) {
                        if (!backslash) {
                            if (ch == "\\") escaped = backslash = true, next();
                            else if (is_identifier_char(ch)) name += next();
                            else break;
                        }
                        else {
                            if (ch != "u") parse_error("Expecting UnicodeEscapeSequence -- uXXXX");
                            ch = read_escaped_char();
                            if (!is_identifier_char(ch)) parse_error("Unicode char: " + ch.charCodeAt(0) + " is not valid in identifier");
                            name += ch;
                            backslash = false;
                        }
                    }
                    if (KEYWORDS(name) && escaped) {
                        hex = name.charCodeAt(0).toString(16).toUpperCase();
                        name = "\\u" + "0000".substr(hex.length) + hex + name.slice(1);
                    }
                    return name;
                };

                var read_regexp = with_eof_error("Unterminated regular expression", function(regexp){
                    var prev_backslash = false, ch, in_class = false;
                    while ((ch = next(true))) if (prev_backslash) {
                        regexp += "\\" + ch;
                        prev_backslash = false;
                    } else if (ch == "[") {
                        in_class = true;
                        regexp += ch;
                    } else if (ch == "]" && in_class) {
                        in_class = false;
                        regexp += ch;
                    } else if (ch == "/" && !in_class) {
                        break;
                    } else if (ch == "\\") {
                        prev_backslash = true;
                    } else {
                        regexp += ch;
                    }
                    var mods = read_name();
                    return token("regexp", new RegExp(regexp, mods));
                });

                function read_operator(prefix) {
                    function grow(op) {
                        if (!peek()) return op;
                        var bigger = op + peek();
                        if (OPERATORS(bigger)) {
                            next();
                            return grow(bigger);
                        } else {
                            return op;
                        }
                    };
                    return token("operator", grow(prefix || next()));
                };

                function handle_slash() {
                    next();
                    switch (peek()) {
                        case "/":
                            next();
                            return skip_line_comment("comment1");
                        case "*":
                            next();
                            return skip_multiline_comment();
                    }
                    return S.regex_allowed ? read_regexp("") : read_operator("/");
                };

                function handle_dot() {
                    next();
                    return is_digit(peek().charCodeAt(0))
                        ? read_num(".")
                        : token("punc", ".");
                };

                function read_word() {
                    var word = read_name();
                    if (prev_was_dot) return token("name", word);
                    return KEYWORDS_ATOM(word) ? token("atom", word)
                        : !KEYWORDS(word) ? token("name", word)
                        : OPERATORS(word) ? token("operator", word)
                        : token("keyword", word);
                };

                function with_eof_error(eof_error, cont) {
                    return function(x) {
                        try {
                            return cont(x);
                        } catch(ex) {
                            if (ex === EX_EOF) parse_error(eof_error);
                            else throw ex;
                        }
                    };
                };

                function next_token(force_regexp) {
                    if (force_regexp != null)
                        return read_regexp(force_regexp);
                    skip_whitespace();
                    start_token();
                    if (html5_comments) {
                        if (looking_at("<!--")) {
                            forward(4);
                            return skip_line_comment("comment3");
                        }
                        if (looking_at("-->") && S.newline_before) {
                            forward(3);
                            return skip_line_comment("comment4");
                        }
                    }
                    var ch = peek();
                    if (!ch) return token("eof");
                    var code = ch.charCodeAt(0);
                    switch (code) {
                        case 34: case 39: return read_string(ch);
                        case 46: return handle_dot();
                        case 47: return handle_slash();
                    }
                    if (is_digit(code)) return read_num();
                    if (PUNC_CHARS(ch)) return token("punc", next());
                    if (OPERATOR_CHARS(ch)) return read_operator();
                    if (code == 92 || is_identifier_start(code)) return read_word();
                    parse_error("Unexpected character '" + ch + "'");
                };

                next_token.context = function(nc) {
                    if (nc) S = nc;
                    return S;
                };

                return next_token;

            };

            /* -----[ Parser (constants) ]----- */

            var UNARY_PREFIX = makePredicate([
                "typeof",
                "void",
                "delete",
                "--",
                "++",
                "!",
                "~",
                "-",
                "+"
            ]);

            var UNARY_POSTFIX = makePredicate([ "--", "++" ]);

            var ASSIGNMENT = makePredicate([ "=", "+=", "-=", "/=", "*=", "%=", ">>=", "<<=", ">>>=", "|=", "^=", "&=" ]);

            var PRECEDENCE = (function(a, ret){
                for (var i = 0; i < a.length; ++i) {
                    var b = a[i];
                    for (var j = 0; j < b.length; ++j) {
                        ret[b[j]] = i + 1;
                    }
                }
                return ret;
            })(
                [
                    ["||"],
                    ["&&"],
                    ["|"],
                    ["^"],
                    ["&"],
                    ["==", "===", "!=", "!=="],
                    ["<", ">", "<=", ">=", "in", "instanceof"],
                    [">>", "<<", ">>>"],
                    ["+", "-"],
                    ["*", "/", "%"]
                ],
                {}
            );

            var STATEMENTS_WITH_LABELS = array_to_hash([ "for", "do", "while", "switch" ]);

            var ATOMIC_START_TOKEN = array_to_hash([ "atom", "num", "string", "regexp", "name" ]);

            /* -----[ Parser ]----- */

            function parse($TEXT, options) {

                options = defaults(options, {
                    strict         : false,
                    filename       : null,
                    toplevel       : null,
                    expression     : false,
                    html5_comments : true,
                    bare_returns   : false,
                });

                var S = {
                    input         : (typeof $TEXT == "string"
                        ? tokenizer($TEXT, options.filename,
                        options.html5_comments)
                        : $TEXT),
                    token         : null,
                    prev          : null,
                    peeked        : null,
                    in_function   : 0,
                    in_directives : true,
                    in_loop       : 0,
                    labels        : []
                };

                S.token = next();

                function is(type, value) {
                    return is_token(S.token, type, value);
                };

                function peek() { return S.peeked || (S.peeked = S.input()); };

                function next() {
                    S.prev = S.token;
                    if (S.peeked) {
                        S.token = S.peeked;
                        S.peeked = null;
                    } else {
                        S.token = S.input();
                    }
                    S.in_directives = S.in_directives && (
                            S.token.type == "string" || is("punc", ";")
                        );
                    return S.token;
                };

                function prev() {
                    return S.prev;
                };

                function croak(msg, line, col, pos) {
                    var ctx = S.input.context();
                    js_error(msg,
                        ctx.filename,
                        line != null ? line : ctx.tokline,
                        col != null ? col : ctx.tokcol,
                        pos != null ? pos : ctx.tokpos);
                };

                function token_error(token, msg) {
                    croak(msg, token.line, token.col);
                };

                function unexpected(token) {
                    if (token == null)
                        token = S.token;
                    token_error(token, "Unexpected token: " + token.type + " (" + token.value + ")");
                };

                function expect_token(type, val) {
                    if (is(type, val)) {
                        return next();
                    }
                    token_error(S.token, "Unexpected token " + S.token.type + " Â«" + S.token.value + "Â»" + ", expected " + type + " Â«" + val + "Â»");
                };

                function expect(punc) { return expect_token("punc", punc); };

                function can_insert_semicolon() {
                    return !options.strict && (
                            S.token.nlb || is("eof") || is("punc", "}")
                        );
                };

                function semicolon() {
                    if (is("punc", ";")) next();
                    else if (!can_insert_semicolon()) unexpected();
                };

                function parenthesised() {
                    expect("(");
                    var exp = expression(true);
                    expect(")");
                    return exp;
                };

                function embed_tokens(parser) {
                    return function() {
                        var start = S.token;
                        var expr = parser();
                        var end = prev();
                        expr.start = start;
                        expr.end = end;
                        return expr;
                    };
                };

                function handle_regexp() {
                    if (is("operator", "/") || is("operator", "/=")) {
                        S.peeked = null;
                        S.token = S.input(S.token.value.substr(1)); // force regexp
                    }
                };

                var statement = embed_tokens(function() {
                    var tmp;
                    handle_regexp();
                    switch (S.token.type) {
                        case "string":
                            var dir = S.in_directives, stat = simple_statement();
                            // XXXv2: decide how to fix directives
                            if (dir && stat.body instanceof AST_String && !is("punc", ",")) {
                                return new AST_Directive({
                                    start : stat.body.start,
                                    end   : stat.body.end,
                                    quote : stat.body.quote,
                                    value : stat.body.value,
                                });
                            }
                            return stat;
                        case "num":
                        case "regexp":
                        case "operator":
                        case "atom":
                            return simple_statement();

                        case "name":
                            return is_token(peek(), "punc", ":")
                                ? labeled_statement()
                                : simple_statement();

                        case "punc":
                            switch (S.token.value) {
                                case "{":
                                    return new AST_BlockStatement({
                                        start : S.token,
                                        body  : block_(),
                                        end   : prev()
                                    });
                                case "[":
                                case "(":
                                    return simple_statement();
                                case ";":
                                    next();
                                    return new AST_EmptyStatement();
                                default:
                                    unexpected();
                            }

                        case "keyword":
                            switch (tmp = S.token.value, next(), tmp) {
                                case "break":
                                    return break_cont(AST_Break);

                                case "continue":
                                    return break_cont(AST_Continue);

                                case "debugger":
                                    semicolon();
                                    return new AST_Debugger();

                                case "do":
                                    return new AST_Do({
                                        body      : in_loop(statement),
                                        condition : (expect_token("keyword", "while"), tmp = parenthesised(), semicolon(), tmp)
                                    });

                                case "while":
                                    return new AST_While({
                                        condition : parenthesised(),
                                        body      : in_loop(statement)
                                    });

                                case "for":
                                    return for_();

                                case "function":
                                    return function_(AST_Defun);

                                case "if":
                                    return if_();

                                case "return":
                                    if (S.in_function == 0 && !options.bare_returns)
                                        croak("'return' outside of function");
                                    return new AST_Return({
                                        value: ( is("punc", ";")
                                            ? (next(), null)
                                            : can_insert_semicolon()
                                            ? null
                                            : (tmp = expression(true), semicolon(), tmp) )
                                    });

                                case "switch":
                                    return new AST_Switch({
                                        expression : parenthesised(),
                                        body       : in_loop(switch_body_)
                                    });

                                case "throw":
                                    if (S.token.nlb)
                                        croak("Illegal newline after 'throw'");
                                    return new AST_Throw({
                                        value: (tmp = expression(true), semicolon(), tmp)
                                    });

                                case "try":
                                    return try_();

                                case "var":
                                    return tmp = var_(), semicolon(), tmp;

                                case "const":
                                    return tmp = const_(), semicolon(), tmp;

                                case "with":
                                    return new AST_With({
                                        expression : parenthesised(),
                                        body       : statement()
                                    });

                                default:
                                    unexpected();
                            }
                    }
                });

                function labeled_statement() {
                    var label = as_symbol(AST_Label);
                    if (find_if(function(l){ return l.name == label.name }, S.labels)) {
                        // ECMA-262, 12.12: An ECMAScript program is considered
                        // syntactically incorrect if it contains a
                        // LabelledStatement that is enclosed by a
                        // LabelledStatement with the same Identifier as label.
                        croak("Label " + label.name + " defined twice");
                    }
                    expect(":");
                    S.labels.push(label);
                    var stat = statement();
                    S.labels.pop();
                    if (!(stat instanceof AST_IterationStatement)) {
                        // check for `continue` that refers to this label.
                        // those should be reported as syntax errors.
                        // https://github.com/mishoo/UglifyJS2/issues/287
                        label.references.forEach(function(ref){
                            if (ref instanceof AST_Continue) {
                                ref = ref.label.start;
                                croak("Continue label `" + label.name + "` refers to non-IterationStatement.",
                                    ref.line, ref.col, ref.pos);
                            }
                        });
                    }
                    return new AST_LabeledStatement({ body: stat, label: label });
                };

                function simple_statement(tmp) {
                    return new AST_SimpleStatement({ body: (tmp = expression(true), semicolon(), tmp) });
                };

                function break_cont(type) {
                    var label = null, ldef;
                    if (!can_insert_semicolon()) {
                        label = as_symbol(AST_LabelRef, true);
                    }
                    if (label != null) {
                        ldef = find_if(function(l){ return l.name == label.name }, S.labels);
                        if (!ldef)
                            croak("Undefined label " + label.name);
                        label.thedef = ldef;
                    }
                    else if (S.in_loop == 0)
                        croak(type.TYPE + " not inside a loop or switch");
                    semicolon();
                    var stat = new type({ label: label });
                    if (ldef) ldef.references.push(stat);
                    return stat;
                };

                function for_() {
                    expect("(");
                    var init = null;
                    if (!is("punc", ";")) {
                        init = is("keyword", "var")
                            ? (next(), var_(true))
                            : expression(true, true);
                        if (is("operator", "in")) {
                            if (init instanceof AST_Var && init.definitions.length > 1)
                                croak("Only one variable declaration allowed in for..in loop");
                            next();
                            return for_in(init);
                        }
                    }
                    return regular_for(init);
                };

                function regular_for(init) {
                    expect(";");
                    var test = is("punc", ";") ? null : expression(true);
                    expect(";");
                    var step = is("punc", ")") ? null : expression(true);
                    expect(")");
                    return new AST_For({
                        init      : init,
                        condition : test,
                        step      : step,
                        body      : in_loop(statement)
                    });
                };

                function for_in(init) {
                    var lhs = init instanceof AST_Var ? init.definitions[0].name : null;
                    var obj = expression(true);
                    expect(")");
                    return new AST_ForIn({
                        init   : init,
                        name   : lhs,
                        object : obj,
                        body   : in_loop(statement)
                    });
                };

                var function_ = function(ctor) {
                    var in_statement = ctor === AST_Defun;
                    var name = is("name") ? as_symbol(in_statement ? AST_SymbolDefun : AST_SymbolLambda) : null;
                    if (in_statement && !name)
                        unexpected();
                    expect("(");
                    return new ctor({
                        name: name,
                        argnames: (function(first, a){
                            while (!is("punc", ")")) {
                                if (first) first = false; else expect(",");
                                a.push(as_symbol(AST_SymbolFunarg));
                            }
                            next();
                            return a;
                        })(true, []),
                        body: (function(loop, labels){
                            ++S.in_function;
                            S.in_directives = true;
                            S.in_loop = 0;
                            S.labels = [];
                            var a = block_();
                            --S.in_function;
                            S.in_loop = loop;
                            S.labels = labels;
                            return a;
                        })(S.in_loop, S.labels)
                    });
                };

                function if_() {
                    var cond = parenthesised(), body = statement(), belse = null;
                    if (is("keyword", "else")) {
                        next();
                        belse = statement();
                    }
                    return new AST_If({
                        condition   : cond,
                        body        : body,
                        alternative : belse
                    });
                };

                function block_() {
                    expect("{");
                    var a = [];
                    while (!is("punc", "}")) {
                        if (is("eof")) unexpected();
                        a.push(statement());
                    }
                    next();
                    return a;
                };

                function switch_body_() {
                    expect("{");
                    var a = [], cur = null, branch = null, tmp;
                    while (!is("punc", "}")) {
                        if (is("eof")) unexpected();
                        if (is("keyword", "case")) {
                            if (branch) branch.end = prev();
                            cur = [];
                            branch = new AST_Case({
                                start      : (tmp = S.token, next(), tmp),
                                expression : expression(true),
                                body       : cur
                            });
                            a.push(branch);
                            expect(":");
                        }
                        else if (is("keyword", "default")) {
                            if (branch) branch.end = prev();
                            cur = [];
                            branch = new AST_Default({
                                start : (tmp = S.token, next(), expect(":"), tmp),
                                body  : cur
                            });
                            a.push(branch);
                        }
                        else {
                            if (!cur) unexpected();
                            cur.push(statement());
                        }
                    }
                    if (branch) branch.end = prev();
                    next();
                    return a;
                };

                function try_() {
                    var body = block_(), bcatch = null, bfinally = null;
                    if (is("keyword", "catch")) {
                        var start = S.token;
                        next();
                        expect("(");
                        var name = as_symbol(AST_SymbolCatch);
                        expect(")");
                        bcatch = new AST_Catch({
                            start   : start,
                            argname : name,
                            body    : block_(),
                            end     : prev()
                        });
                    }
                    if (is("keyword", "finally")) {
                        var start = S.token;
                        next();
                        bfinally = new AST_Finally({
                            start : start,
                            body  : block_(),
                            end   : prev()
                        });
                    }
                    if (!bcatch && !bfinally)
                        croak("Missing catch/finally blocks");
                    return new AST_Try({
                        body     : body,
                        bcatch   : bcatch,
                        bfinally : bfinally
                    });
                };

                function vardefs(no_in, in_const) {
                    var a = [];
                    for (;;) {
                        a.push(new AST_VarDef({
                            start : S.token,
                            name  : as_symbol(in_const ? AST_SymbolConst : AST_SymbolVar),
                            value : is("operator", "=") ? (next(), expression(false, no_in)) : null,
                            end   : prev()
                        }));
                        if (!is("punc", ","))
                            break;
                        next();
                    }
                    return a;
                };

                var var_ = function(no_in) {
                    return new AST_Var({
                        start       : prev(),
                        definitions : vardefs(no_in, false),
                        end         : prev()
                    });
                };

                var const_ = function() {
                    return new AST_Const({
                        start       : prev(),
                        definitions : vardefs(false, true),
                        end         : prev()
                    });
                };

                var new_ = function() {
                    var start = S.token;
                    expect_token("operator", "new");
                    var newexp = expr_atom(false), args;
                    if (is("punc", "(")) {
                        next();
                        args = expr_list(")");
                    } else {
                        args = [];
                    }
                    return subscripts(new AST_New({
                        start      : start,
                        expression : newexp,
                        args       : args,
                        end        : prev()
                    }), true);
                };

                function as_atom_node() {
                    var tok = S.token, ret;
                    switch (tok.type) {
                        case "name":
                        case "keyword":
                            ret = _make_symbol(AST_SymbolRef);
                            break;
                        case "num":
                            ret = new AST_Number({ start: tok, end: tok, value: tok.value });
                            break;
                        case "string":
                            ret = new AST_String({
                                start : tok,
                                end   : tok,
                                value : tok.value,
                                quote : tok.quote
                            });
                            break;
                        case "regexp":
                            ret = new AST_RegExp({ start: tok, end: tok, value: tok.value });
                            break;
                        case "atom":
                            switch (tok.value) {
                                case "false":
                                    ret = new AST_False({ start: tok, end: tok });
                                    break;
                                case "true":
                                    ret = new AST_True({ start: tok, end: tok });
                                    break;
                                case "null":
                                    ret = new AST_Null({ start: tok, end: tok });
                                    break;
                            }
                            break;
                    }
                    next();
                    return ret;
                };

                var expr_atom = function(allow_calls) {
                    if (is("operator", "new")) {
                        return new_();
                    }
                    var start = S.token;
                    if (is("punc")) {
                        switch (start.value) {
                            case "(":
                                next();
                                var ex = expression(true);
                                ex.start = start;
                                ex.end = S.token;
                                expect(")");
                                return subscripts(ex, allow_calls);
                            case "[":
                                return subscripts(array_(), allow_calls);
                            case "{":
                                return subscripts(object_(), allow_calls);
                        }
                        unexpected();
                    }
                    if (is("keyword", "function")) {
                        next();
                        var func = function_(AST_Function);
                        func.start = start;
                        func.end = prev();
                        return subscripts(func, allow_calls);
                    }
                    if (ATOMIC_START_TOKEN[S.token.type]) {
                        return subscripts(as_atom_node(), allow_calls);
                    }
                    unexpected();
                };

                function expr_list(closing, allow_trailing_comma, allow_empty) {
                    var first = true, a = [];
                    while (!is("punc", closing)) {
                        if (first) first = false; else expect(",");
                        if (allow_trailing_comma && is("punc", closing)) break;
                        if (is("punc", ",") && allow_empty) {
                            a.push(new AST_Hole({ start: S.token, end: S.token }));
                        } else {
                            a.push(expression(false));
                        }
                    }
                    next();
                    return a;
                };

                var array_ = embed_tokens(function() {
                    expect("[");
                    return new AST_Array({
                        elements: expr_list("]", !options.strict, true)
                    });
                });

                var object_ = embed_tokens(function() {
                    expect("{");
                    var first = true, a = [];
                    while (!is("punc", "}")) {
                        if (first) first = false; else expect(",");
                        if (!options.strict && is("punc", "}"))
                        // allow trailing comma
                            break;
                        var start = S.token;
                        var type = start.type;
                        var name = as_property_name();
                        if (type == "name" && !is("punc", ":")) {
                            if (name == "get") {
                                a.push(new AST_ObjectGetter({
                                    start : start,
                                    key   : as_atom_node(),
                                    value : function_(AST_Accessor),
                                    end   : prev()
                                }));
                                continue;
                            }
                            if (name == "set") {
                                a.push(new AST_ObjectSetter({
                                    start : start,
                                    key   : as_atom_node(),
                                    value : function_(AST_Accessor),
                                    end   : prev()
                                }));
                                continue;
                            }
                        }
                        expect(":");
                        a.push(new AST_ObjectKeyVal({
                            start : start,
                            quote : start.quote,
                            key   : name,
                            value : expression(false),
                            end   : prev()
                        }));
                    }
                    next();
                    return new AST_Object({ properties: a });
                });

                function as_property_name() {
                    var tmp = S.token;
                    next();
                    switch (tmp.type) {
                        case "num":
                        case "string":
                        case "name":
                        case "operator":
                        case "keyword":
                        case "atom":
                            return tmp.value;
                        default:
                            unexpected();
                    }
                };

                function as_name() {
                    var tmp = S.token;
                    next();
                    switch (tmp.type) {
                        case "name":
                        case "operator":
                        case "keyword":
                        case "atom":
                            return tmp.value;
                        default:
                            unexpected();
                    }
                };

                function _make_symbol(type) {
                    var name = S.token.value;
                    return new (name == "this" ? AST_This : type)({
                        name  : String(name),
                        start : S.token,
                        end   : S.token
                    });
                };

                function as_symbol(type, noerror) {
                    if (!is("name")) {
                        if (!noerror) croak("Name expected");
                        return null;
                    }
                    var sym = _make_symbol(type);
                    next();
                    return sym;
                };

                var subscripts = function(expr, allow_calls) {
                    var start = expr.start;
                    if (is("punc", ".")) {
                        next();
                        return subscripts(new AST_Dot({
                            start      : start,
                            expression : expr,
                            property   : as_name(),
                            end        : prev()
                        }), allow_calls);
                    }
                    if (is("punc", "[")) {
                        next();
                        var prop = expression(true);
                        expect("]");
                        return subscripts(new AST_Sub({
                            start      : start,
                            expression : expr,
                            property   : prop,
                            end        : prev()
                        }), allow_calls);
                    }
                    if (allow_calls && is("punc", "(")) {
                        next();
                        return subscripts(new AST_Call({
                            start      : start,
                            expression : expr,
                            args       : expr_list(")"),
                            end        : prev()
                        }), true);
                    }
                    return expr;
                };

                var maybe_unary = function(allow_calls) {
                    var start = S.token;
                    if (is("operator") && UNARY_PREFIX(start.value)) {
                        next();
                        handle_regexp();
                        var ex = make_unary(AST_UnaryPrefix, start.value, maybe_unary(allow_calls));
                        ex.start = start;
                        ex.end = prev();
                        return ex;
                    }
                    var val = expr_atom(allow_calls);
                    while (is("operator") && UNARY_POSTFIX(S.token.value) && !S.token.nlb) {
                        val = make_unary(AST_UnaryPostfix, S.token.value, val);
                        val.start = start;
                        val.end = S.token;
                        next();
                    }
                    return val;
                };

                function make_unary(ctor, op, expr) {
                    if ((op == "++" || op == "--") && !is_assignable(expr))
                        croak("Invalid use of " + op + " operator");
                    return new ctor({ operator: op, expression: expr });
                };

                var expr_op = function(left, min_prec, no_in) {
                    var op = is("operator") ? S.token.value : null;
                    if (op == "in" && no_in) op = null;
                    var prec = op != null ? PRECEDENCE[op] : null;
                    if (prec != null && prec > min_prec) {
                        next();
                        var right = expr_op(maybe_unary(true), prec, no_in);
                        return expr_op(new AST_Binary({
                            start    : left.start,
                            left     : left,
                            operator : op,
                            right    : right,
                            end      : right.end
                        }), min_prec, no_in);
                    }
                    return left;
                };

                function expr_ops(no_in) {
                    return expr_op(maybe_unary(true), 0, no_in);
                };

                var maybe_conditional = function(no_in) {
                    var start = S.token;
                    var expr = expr_ops(no_in);
                    if (is("operator", "?")) {
                        next();
                        var yes = expression(false);
                        expect(":");
                        return new AST_Conditional({
                            start       : start,
                            condition   : expr,
                            consequent  : yes,
                            alternative : expression(false, no_in),
                            end         : prev()
                        });
                    }
                    return expr;
                };

                function is_assignable(expr) {
                    if (!options.strict) return true;
                    if (expr instanceof AST_This) return false;
                    return (expr instanceof AST_PropAccess || expr instanceof AST_Symbol);
                };

                var maybe_assign = function(no_in) {
                    var start = S.token;
                    var left = maybe_conditional(no_in), val = S.token.value;
                    if (is("operator") && ASSIGNMENT(val)) {
                        if (is_assignable(left)) {
                            next();
                            return new AST_Assign({
                                start    : start,
                                left     : left,
                                operator : val,
                                right    : maybe_assign(no_in),
                                end      : prev()
                            });
                        }
                        croak("Invalid assignment");
                    }
                    return left;
                };

                var expression = function(commas, no_in) {
                    var start = S.token;
                    var expr = maybe_assign(no_in);
                    if (commas && is("punc", ",")) {
                        next();
                        return new AST_Seq({
                            start  : start,
                            car    : expr,
                            cdr    : expression(true, no_in),
                            end    : peek()
                        });
                    }
                    return expr;
                };

                function in_loop(cont) {
                    ++S.in_loop;
                    var ret = cont();
                    --S.in_loop;
                    return ret;
                };

                if (options.expression) {
                    return expression(true);
                }

                return (function(){
                    var start = S.token;
                    var body = [];
                    while (!is("eof"))
                        body.push(statement());
                    var end = prev();
                    var toplevel = options.toplevel;
                    if (toplevel) {
                        toplevel.body = toplevel.body.concat(body);
                        toplevel.end = end;
                    } else {
                        toplevel = new AST_Toplevel({ start: start, body: body, end: end });
                    }
                    return toplevel;
                })();

            };

            /***********************************************************************

             A JavaScript tokenizer / parser / beautifier / compressor.
             https://github.com/mishoo/UglifyJS2

             -------------------------------- (C) ---------------------------------

             Author: Mihai Bazon
             <mihai.bazon@gmail.com>
             http://mihai.bazon.net/blog

             Distributed under the BSD license:

             Copyright 2012 (c) Mihai Bazon <mihai.bazon@gmail.com>

             Redistribution and use in source and binary forms, with or without
             modification, are permitted provided that the following conditions
             are met:

             * Redistributions of source code must retain the above
             copyright notice, this list of conditions and the following
             disclaimer.

             * Redistributions in binary form must reproduce the above
             copyright notice, this list of conditions and the following
             disclaimer in the documentation and/or other materials
             provided with the distribution.

             THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDER â€œAS ISâ€ AND ANY
             EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
             IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
             PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE
             LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY,
             OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
             PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
             PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
             THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
             TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF
             THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
             SUCH DAMAGE.

             ***********************************************************************/

            "use strict";

// Tree transformer helpers.

            function TreeTransformer(before, after) {
                TreeWalker.call(this);
                this.before = before;
                this.after = after;
            }
            TreeTransformer.prototype = new TreeWalker;

            (function(undefined){

                function _(node, descend) {
                    node.DEFMETHOD("transform", function(tw, in_list){
                        var x, y;
                        tw.push(this);
                        if (tw.before) x = tw.before(this, descend, in_list);
                        if (x === undefined) {
                            if (!tw.after) {
                                x = this;
                                descend(x, tw);
                            } else {
                                tw.stack[tw.stack.length - 1] = x = this.clone();
                                descend(x, tw);
                                y = tw.after(x, in_list);
                                if (y !== undefined) x = y;
                            }
                        }
                        tw.pop();
                        return x;
                    });
                };

                function do_list(list, tw) {
                    return MAP(list, function(node){
                        return node.transform(tw, true);
                    });
                };

                _(AST_Node, noop);

                _(AST_LabeledStatement, function(self, tw){
                    self.label = self.label.transform(tw);
                    self.body = self.body.transform(tw);
                });

                _(AST_SimpleStatement, function(self, tw){
                    self.body = self.body.transform(tw);
                });

                _(AST_Block, function(self, tw){
                    self.body = do_list(self.body, tw);
                });

                _(AST_DWLoop, function(self, tw){
                    self.condition = self.condition.transform(tw);
                    self.body = self.body.transform(tw);
                });

                _(AST_For, function(self, tw){
                    if (self.init) self.init = self.init.transform(tw);
                    if (self.condition) self.condition = self.condition.transform(tw);
                    if (self.step) self.step = self.step.transform(tw);
                    self.body = self.body.transform(tw);
                });

                _(AST_ForIn, function(self, tw){
                    self.init = self.init.transform(tw);
                    self.object = self.object.transform(tw);
                    self.body = self.body.transform(tw);
                });

                _(AST_With, function(self, tw){
                    self.expression = self.expression.transform(tw);
                    self.body = self.body.transform(tw);
                });

                _(AST_Exit, function(self, tw){
                    if (self.value) self.value = self.value.transform(tw);
                });

                _(AST_LoopControl, function(self, tw){
                    if (self.label) self.label = self.label.transform(tw);
                });

                _(AST_If, function(self, tw){
                    self.condition = self.condition.transform(tw);
                    self.body = self.body.transform(tw);
                    if (self.alternative) self.alternative = self.alternative.transform(tw);
                });

                _(AST_Switch, function(self, tw){
                    self.expression = self.expression.transform(tw);
                    self.body = do_list(self.body, tw);
                });

                _(AST_Case, function(self, tw){
                    self.expression = self.expression.transform(tw);
                    self.body = do_list(self.body, tw);
                });

                _(AST_Try, function(self, tw){
                    self.body = do_list(self.body, tw);
                    if (self.bcatch) self.bcatch = self.bcatch.transform(tw);
                    if (self.bfinally) self.bfinally = self.bfinally.transform(tw);
                });

                _(AST_Catch, function(self, tw){
                    self.argname = self.argname.transform(tw);
                    self.body = do_list(self.body, tw);
                });

                _(AST_Definitions, function(self, tw){
                    self.definitions = do_list(self.definitions, tw);
                });

                _(AST_VarDef, function(self, tw){
                    self.name = self.name.transform(tw);
                    if (self.value) self.value = self.value.transform(tw);
                });

                _(AST_Lambda, function(self, tw){
                    if (self.name) self.name = self.name.transform(tw);
                    self.argnames = do_list(self.argnames, tw);
                    self.body = do_list(self.body, tw);
                });

                _(AST_Call, function(self, tw){
                    self.expression = self.expression.transform(tw);
                    self.args = do_list(self.args, tw);
                });

                _(AST_Seq, function(self, tw){
                    self.car = self.car.transform(tw);
                    self.cdr = self.cdr.transform(tw);
                });

                _(AST_Dot, function(self, tw){
                    self.expression = self.expression.transform(tw);
                });

                _(AST_Sub, function(self, tw){
                    self.expression = self.expression.transform(tw);
                    self.property = self.property.transform(tw);
                });

                _(AST_Unary, function(self, tw){
                    self.expression = self.expression.transform(tw);
                });

                _(AST_Binary, function(self, tw){
                    self.left = self.left.transform(tw);
                    self.right = self.right.transform(tw);
                });

                _(AST_Conditional, function(self, tw){
                    self.condition = self.condition.transform(tw);
                    self.consequent = self.consequent.transform(tw);
                    self.alternative = self.alternative.transform(tw);
                });

                _(AST_Array, function(self, tw){
                    self.elements = do_list(self.elements, tw);
                });

                _(AST_Object, function(self, tw){
                    self.properties = do_list(self.properties, tw);
                });

                _(AST_ObjectProperty, function(self, tw){
                    self.value = self.value.transform(tw);
                });

            })();

            /***********************************************************************

             A JavaScript tokenizer / parser / beautifier / compressor.
             https://github.com/mishoo/UglifyJS2

             -------------------------------- (C) ---------------------------------

             Author: Mihai Bazon
             <mihai.bazon@gmail.com>
             http://mihai.bazon.net/blog

             Distributed under the BSD license:

             Copyright 2012 (c) Mihai Bazon <mihai.bazon@gmail.com>

             Redistribution and use in source and binary forms, with or without
             modification, are permitted provided that the following conditions
             are met:

             * Redistributions of source code must retain the above
             copyright notice, this list of conditions and the following
             disclaimer.

             * Redistributions in binary form must reproduce the above
             copyright notice, this list of conditions and the following
             disclaimer in the documentation and/or other materials
             provided with the distribution.

             THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDER â€œAS ISâ€ AND ANY
             EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
             IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
             PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE
             LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY,
             OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
             PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
             PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
             THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
             TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF
             THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
             SUCH DAMAGE.

             ***********************************************************************/

            "use strict";

            function SymbolDef(scope, index, orig) {
                this.name = orig.name;
                this.orig = [ orig ];
                this.scope = scope;
                this.references = [];
                this.global = false;
                this.mangled_name = null;
                this.undeclared = false;
                this.constant = false;
                this.index = index;
            };

            SymbolDef.prototype = {
                unmangleable: function(options) {
                    if (!options) options = {};

                    return (this.global && !options.toplevel)
                        || this.undeclared
                        || (!options.eval && (this.scope.uses_eval || this.scope.uses_with))
                        || (options.keep_fnames
                        && (this.orig[0] instanceof AST_SymbolLambda
                        || this.orig[0] instanceof AST_SymbolDefun));
                },
                mangle: function(options) {
                    var cache = options.cache && options.cache.props;
                    if (this.global && cache && cache.has(this.name)) {
                        this.mangled_name = cache.get(this.name);
                    }
                    else if (!this.mangled_name && !this.unmangleable(options)) {
                        var s = this.scope;
                        if (!options.screw_ie8 && this.orig[0] instanceof AST_SymbolLambda)
                            s = s.parent_scope;
                        this.mangled_name = s.next_mangled(options, this);
                        if (this.global && cache) {
                            cache.set(this.name, this.mangled_name);
                        }
                    }
                }
            };

            AST_Toplevel.DEFMETHOD("figure_out_scope", function(options){
                options = defaults(options, {
                    screw_ie8: false,
                    cache: null
                });

                // pass 1: setup scope chaining and handle definitions
                var self = this;
                var scope = self.parent_scope = null;
                var defun = null;
                var nesting = 0;
                var tw = new TreeWalker(function(node, descend){
                    if (options.screw_ie8 && node instanceof AST_Catch) {
                        var save_scope = scope;
                        scope = new AST_Scope(node);
                        scope.init_scope_vars(nesting);
                        scope.parent_scope = save_scope;
                        descend();
                        scope = save_scope;
                        return true;
                    }
                    if (node instanceof AST_Scope) {
                        node.init_scope_vars(nesting);
                        var save_scope = node.parent_scope = scope;
                        var save_defun = defun;
                        defun = scope = node;
                        ++nesting; descend(); --nesting;
                        scope = save_scope;
                        defun = save_defun;
                        return true;        // don't descend again in TreeWalker
                    }
                    if (node instanceof AST_Directive) {
                        node.scope = scope;
                        push_uniq(scope.directives, node.value);
                        return true;
                    }
                    if (node instanceof AST_With) {
                        for (var s = scope; s; s = s.parent_scope)
                            s.uses_with = true;
                        return;
                    }
                    if (node instanceof AST_Symbol) {
                        node.scope = scope;
                    }
                    if (node instanceof AST_SymbolLambda) {
                        defun.def_function(node);
                    }
                    else if (node instanceof AST_SymbolDefun) {
                        // Careful here, the scope where this should be defined is
                        // the parent scope.  The reason is that we enter a new
                        // scope when we encounter the AST_Defun node (which is
                        // instanceof AST_Scope) but we get to the symbol a bit
                        // later.
                        (node.scope = defun.parent_scope).def_function(node);
                    }
                    else if (node instanceof AST_SymbolVar
                        || node instanceof AST_SymbolConst) {
                        var def = defun.def_variable(node);
                        def.constant = node instanceof AST_SymbolConst;
                        def.init = tw.parent().value;
                    }
                    else if (node instanceof AST_SymbolCatch) {
                        (options.screw_ie8 ? scope : defun)
                            .def_variable(node);
                    }
                });
                self.walk(tw);

                // pass 2: find back references and eval
                var func = null;
                var globals = self.globals = new Dictionary();
                var tw = new TreeWalker(function(node, descend){
                    if (node instanceof AST_Lambda) {
                        var prev_func = func;
                        func = node;
                        descend();
                        func = prev_func;
                        return true;
                    }
                    if (node instanceof AST_SymbolRef) {
                        var name = node.name;
                        var sym = node.scope.find_variable(name);
                        if (!sym) {
                            var g;
                            if (globals.has(name)) {
                                g = globals.get(name);
                            } else {
                                g = new SymbolDef(self, globals.size(), node);
                                g.undeclared = true;
                                g.global = true;
                                globals.set(name, g);
                            }
                            node.thedef = g;
                            if (name == "eval" && tw.parent() instanceof AST_Call) {
                                for (var s = node.scope; s && !s.uses_eval; s = s.parent_scope)
                                    s.uses_eval = true;
                            }
                            if (func && name == "arguments") {
                                func.uses_arguments = true;
                            }
                        } else {
                            node.thedef = sym;
                        }
                        node.reference();
                        return true;
                    }
                });
                self.walk(tw);

                if (options.cache) {
                    this.cname = options.cache.cname;
                }
            });

            AST_Scope.DEFMETHOD("init_scope_vars", function(nesting){
                this.directives = [];     // contains the directives defined in this scope, i.e. "use strict"
                this.variables = new Dictionary(); // map name to AST_SymbolVar (variables defined in this scope; includes functions)
                this.functions = new Dictionary(); // map name to AST_SymbolDefun (functions defined in this scope)
                this.uses_with = false;   // will be set to true if this or some nested scope uses the `with` statement
                this.uses_eval = false;   // will be set to true if this or nested scope uses the global `eval`
                this.parent_scope = null; // the parent scope
                this.enclosed = [];       // a list of variables from this or outer scope(s) that are referenced from this or inner scopes
                this.cname = -1;          // the current index for mangling functions/variables
                this.nesting = nesting;   // the nesting level of this scope (0 means toplevel)
            });

            AST_Scope.DEFMETHOD("strict", function(){
                return this.has_directive("use strict");
            });

            AST_Lambda.DEFMETHOD("init_scope_vars", function(){
                AST_Scope.prototype.init_scope_vars.apply(this, arguments);
                this.uses_arguments = false;
            });

            AST_SymbolRef.DEFMETHOD("reference", function() {
                var def = this.definition();
                def.references.push(this);
                var s = this.scope;
                while (s) {
                    push_uniq(s.enclosed, def);
                    if (s === def.scope) break;
                    s = s.parent_scope;
                }
                this.frame = this.scope.nesting - def.scope.nesting;
            });

            AST_Scope.DEFMETHOD("find_variable", function(name){
                if (name instanceof AST_Symbol) name = name.name;
                return this.variables.get(name)
                    || (this.parent_scope && this.parent_scope.find_variable(name));
            });

            AST_Scope.DEFMETHOD("has_directive", function(value){
                return this.parent_scope && this.parent_scope.has_directive(value)
                    || (this.directives.indexOf(value) >= 0 ? this : null);
            });

            AST_Scope.DEFMETHOD("def_function", function(symbol){
                this.functions.set(symbol.name, this.def_variable(symbol));
            });

            AST_Scope.DEFMETHOD("def_variable", function(symbol){
                var def;
                if (!this.variables.has(symbol.name)) {
                    def = new SymbolDef(this, this.variables.size(), symbol);
                    this.variables.set(symbol.name, def);
                    def.global = !this.parent_scope;
                } else {
                    def = this.variables.get(symbol.name);
                    def.orig.push(symbol);
                }
                return symbol.thedef = def;
            });

            AST_Scope.DEFMETHOD("next_mangled", function(options){
                var ext = this.enclosed;
                out: while (true) {
                    var m = base54(++this.cname);
                    if (!is_identifier(m)) continue; // skip over "do"

                    // https://github.com/mishoo/UglifyJS2/issues/242 -- do not
                    // shadow a name excepted from mangling.
                    if (options.except.indexOf(m) >= 0) continue;

                    // we must ensure that the mangled name does not shadow a name
                    // from some parent scope that is referenced in this or in
                    // inner scopes.
                    for (var i = ext.length; --i >= 0;) {
                        var sym = ext[i];
                        var name = sym.mangled_name || (sym.unmangleable(options) && sym.name);
                        if (m == name) continue out;
                    }
                    return m;
                }
            });

            AST_Function.DEFMETHOD("next_mangled", function(options, def){
                // #179, #326
                // in Safari strict mode, something like (function x(x){...}) is a syntax error;
                // a function expression's argument cannot shadow the function expression's name

                var tricky_def = def.orig[0] instanceof AST_SymbolFunarg && this.name && this.name.definition();
                while (true) {
                    var name = AST_Lambda.prototype.next_mangled.call(this, options, def);
                    if (!(tricky_def && tricky_def.mangled_name == name))
                        return name;
                }
            });

            AST_Scope.DEFMETHOD("references", function(sym){
                if (sym instanceof AST_Symbol) sym = sym.definition();
                return this.enclosed.indexOf(sym) < 0 ? null : sym;
            });

            AST_Symbol.DEFMETHOD("unmangleable", function(options){
                return this.definition().unmangleable(options);
            });

// property accessors are not mangleable
            AST_SymbolAccessor.DEFMETHOD("unmangleable", function(){
                return true;
            });

// labels are always mangleable
            AST_Label.DEFMETHOD("unmangleable", function(){
                return false;
            });

            AST_Symbol.DEFMETHOD("unreferenced", function(){
                return this.definition().references.length == 0
                    && !(this.scope.uses_eval || this.scope.uses_with);
            });

            AST_Symbol.DEFMETHOD("undeclared", function(){
                return this.definition().undeclared;
            });

            AST_LabelRef.DEFMETHOD("undeclared", function(){
                return false;
            });

            AST_Label.DEFMETHOD("undeclared", function(){
                return false;
            });

            AST_Symbol.DEFMETHOD("definition", function(){
                return this.thedef;
            });

            AST_Symbol.DEFMETHOD("global", function(){
                return this.definition().global;
            });

            AST_Toplevel.DEFMETHOD("_default_mangler_options", function(options){
                return defaults(options, {
                    except      : [],
                    eval        : false,
                    sort        : false,
                    toplevel    : false,
                    screw_ie8   : false,
                    keep_fnames : false
                });
            });

            AST_Toplevel.DEFMETHOD("mangle_names", function(options){
                options = this._default_mangler_options(options);
                // We only need to mangle declaration nodes.  Special logic wired
                // into the code generator will display the mangled name if it's
                // present (and for AST_SymbolRef-s it'll use the mangled name of
                // the AST_SymbolDeclaration that it points to).
                var lname = -1;
                var to_mangle = [];

                if (options.cache) {
                    this.globals.each(function(symbol){
                        if (options.except.indexOf(symbol.name) < 0) {
                            to_mangle.push(symbol);
                        }
                    });
                }

                var tw = new TreeWalker(function(node, descend){
                    if (node instanceof AST_LabeledStatement) {
                        // lname is incremented when we get to the AST_Label
                        var save_nesting = lname;
                        descend();
                        lname = save_nesting;
                        return true;        // don't descend again in TreeWalker
                    }
                    if (node instanceof AST_Scope) {
                        var p = tw.parent(), a = [];
                        node.variables.each(function(symbol){
                            if (options.except.indexOf(symbol.name) < 0) {
                                a.push(symbol);
                            }
                        });
                        if (options.sort) a.sort(function(a, b){
                            return b.references.length - a.references.length;
                        });
                        to_mangle.push.apply(to_mangle, a);
                        return;
                    }
                    if (node instanceof AST_Label) {
                        var name;
                        do name = base54(++lname); while (!is_identifier(name));
                        node.mangled_name = name;
                        return true;
                    }
                    if (options.screw_ie8 && node instanceof AST_SymbolCatch) {
                        to_mangle.push(node.definition());
                        return;
                    }
                });
                this.walk(tw);
                to_mangle.forEach(function(def){ def.mangle(options) });

                if (options.cache) {
                    options.cache.cname = this.cname;
                }
            });

            AST_Toplevel.DEFMETHOD("compute_char_frequency", function(options){
                options = this._default_mangler_options(options);
                var tw = new TreeWalker(function(node){
                    if (node instanceof AST_Constant)
                        base54.consider(node.print_to_string());
                    else if (node instanceof AST_Return)
                        base54.consider("return");
                    else if (node instanceof AST_Throw)
                        base54.consider("throw");
                    else if (node instanceof AST_Continue)
                        base54.consider("continue");
                    else if (node instanceof AST_Break)
                        base54.consider("break");
                    else if (node instanceof AST_Debugger)
                        base54.consider("debugger");
                    else if (node instanceof AST_Directive)
                        base54.consider(node.value);
                    else if (node instanceof AST_While)
                        base54.consider("while");
                    else if (node instanceof AST_Do)
                        base54.consider("do while");
                    else if (node instanceof AST_If) {
                        base54.consider("if");
                        if (node.alternative) base54.consider("else");
                    }
                    else if (node instanceof AST_Var)
                        base54.consider("var");
                    else if (node instanceof AST_Const)
                        base54.consider("const");
                    else if (node instanceof AST_Lambda)
                        base54.consider("function");
                    else if (node instanceof AST_For)
                        base54.consider("for");
                    else if (node instanceof AST_ForIn)
                        base54.consider("for in");
                    else if (node instanceof AST_Switch)
                        base54.consider("switch");
                    else if (node instanceof AST_Case)
                        base54.consider("case");
                    else if (node instanceof AST_Default)
                        base54.consider("default");
                    else if (node instanceof AST_With)
                        base54.consider("with");
                    else if (node instanceof AST_ObjectSetter)
                        base54.consider("set" + node.key);
                    else if (node instanceof AST_ObjectGetter)
                        base54.consider("get" + node.key);
                    else if (node instanceof AST_ObjectKeyVal)
                        base54.consider(node.key);
                    else if (node instanceof AST_New)
                        base54.consider("new");
                    else if (node instanceof AST_This)
                        base54.consider("this");
                    else if (node instanceof AST_Try)
                        base54.consider("try");
                    else if (node instanceof AST_Catch)
                        base54.consider("catch");
                    else if (node instanceof AST_Finally)
                        base54.consider("finally");
                    else if (node instanceof AST_Symbol && node.unmangleable(options))
                        base54.consider(node.name);
                    else if (node instanceof AST_Unary || node instanceof AST_Binary)
                        base54.consider(node.operator);
                    else if (node instanceof AST_Dot)
                        base54.consider(node.property);
                });
                this.walk(tw);
                base54.sort();
            });

            var base54 = (function() {
                var string = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_0123456789";
                var chars, frequency;
                function reset() {
                    frequency = Object.create(null);
                    chars = string.split("").map(function(ch){ return ch.charCodeAt(0) });
                    chars.forEach(function(ch){ frequency[ch] = 0 });
                }
                base54.consider = function(str){
                    for (var i = str.length; --i >= 0;) {
                        var code = str.charCodeAt(i);
                        if (code in frequency) ++frequency[code];
                    }
                };
                base54.sort = function() {
                    chars = mergeSort(chars, function(a, b){
                        if (is_digit(a) && !is_digit(b)) return 1;
                        if (is_digit(b) && !is_digit(a)) return -1;
                        return frequency[b] - frequency[a];
                    });
                };
                base54.reset = reset;
                reset();
                base54.get = function(){ return chars };
                base54.freq = function(){ return frequency };
                function base54(num) {
                    var ret = "", base = 54;
                    num++;
                    do {
                        num--;
                        ret += String.fromCharCode(chars[num % base]);
                        num = Math.floor(num / base);
                        base = 64;
                    } while (num > 0);
                    return ret;
                };
                return base54;
            })();

            AST_Toplevel.DEFMETHOD("scope_warnings", function(options){
                options = defaults(options, {
                    undeclared       : false, // this makes a lot of noise
                    unreferenced     : true,
                    assign_to_global : true,
                    func_arguments   : true,
                    nested_defuns    : true,
                    eval             : true
                });
                var tw = new TreeWalker(function(node){
                    if (options.undeclared
                        && node instanceof AST_SymbolRef
                        && node.undeclared())
                    {
                        // XXX: this also warns about JS standard names,
                        // i.e. Object, Array, parseInt etc.  Should add a list of
                        // exceptions.
                        AST_Node.warn("Undeclared symbol: {name} [{file}:{line},{col}]", {
                            name: node.name,
                            file: node.start.file,
                            line: node.start.line,
                            col: node.start.col
                        });
                    }
                    if (options.assign_to_global)
                    {
                        var sym = null;
                        if (node instanceof AST_Assign && node.left instanceof AST_SymbolRef)
                            sym = node.left;
                        else if (node instanceof AST_ForIn && node.init instanceof AST_SymbolRef)
                            sym = node.init;
                        if (sym
                            && (sym.undeclared()
                            || (sym.global() && sym.scope !== sym.definition().scope))) {
                            AST_Node.warn("{msg}: {name} [{file}:{line},{col}]", {
                                msg: sym.undeclared() ? "Accidental global?" : "Assignment to global",
                                name: sym.name,
                                file: sym.start.file,
                                line: sym.start.line,
                                col: sym.start.col
                            });
                        }
                    }
                    if (options.eval
                        && node instanceof AST_SymbolRef
                        && node.undeclared()
                        && node.name == "eval") {
                        AST_Node.warn("Eval is used [{file}:{line},{col}]", node.start);
                    }
                    if (options.unreferenced
                        && (node instanceof AST_SymbolDeclaration || node instanceof AST_Label)
                        && !(node instanceof AST_SymbolCatch)
                        && node.unreferenced()) {
                        AST_Node.warn("{type} {name} is declared but not referenced [{file}:{line},{col}]", {
                            type: node instanceof AST_Label ? "Label" : "Symbol",
                            name: node.name,
                            file: node.start.file,
                            line: node.start.line,
                            col: node.start.col
                        });
                    }
                    if (options.func_arguments
                        && node instanceof AST_Lambda
                        && node.uses_arguments) {
                        AST_Node.warn("arguments used in function {name} [{file}:{line},{col}]", {
                            name: node.name ? node.name.name : "anonymous",
                            file: node.start.file,
                            line: node.start.line,
                            col: node.start.col
                        });
                    }
                    if (options.nested_defuns
                        && node instanceof AST_Defun
                        && !(tw.parent() instanceof AST_Scope)) {
                        AST_Node.warn("Function {name} declared in nested statement \"{type}\" [{file}:{line},{col}]", {
                            name: node.name.name,
                            type: tw.parent().TYPE,
                            file: node.start.file,
                            line: node.start.line,
                            col: node.start.col
                        });
                    }
                });
                this.walk(tw);
            });

            /***********************************************************************

             A JavaScript tokenizer / parser / beautifier / compressor.
             https://github.com/mishoo/UglifyJS2

             -------------------------------- (C) ---------------------------------

             Author: Mihai Bazon
             <mihai.bazon@gmail.com>
             http://mihai.bazon.net/blog

             Distributed under the BSD license:

             Copyright 2012 (c) Mihai Bazon <mihai.bazon@gmail.com>

             Redistribution and use in source and binary forms, with or without
             modification, are permitted provided that the following conditions
             are met:

             * Redistributions of source code must retain the above
             copyright notice, this list of conditions and the following
             disclaimer.

             * Redistributions in binary form must reproduce the above
             copyright notice, this list of conditions and the following
             disclaimer in the documentation and/or other materials
             provided with the distribution.

             THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDER â€œAS ISâ€ AND ANY
             EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
             IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
             PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE
             LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY,
             OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
             PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
             PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
             THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
             TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF
             THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
             SUCH DAMAGE.

             ***********************************************************************/

            "use strict";

            function OutputStream(options) {

                options = defaults(options, {
                    indent_start     : 0,
                    indent_level     : 4,
                    quote_keys       : false,
                    space_colon      : true,
                    ascii_only       : false,
                    unescape_regexps : false,
                    inline_script    : false,
                    width            : 80,
                    max_line_len     : 32000,
                    beautify         : false,
                    source_map       : null,
                    bracketize       : false,
                    semicolons       : true,
                    comments         : false,
                    preserve_line    : false,
                    screw_ie8        : false,
                    preamble         : null,
                    quote_style      : 0
                }, true);

                var indentation = 0;
                var current_col = 0;
                var current_line = 1;
                var current_pos = 0;
                var OUTPUT = "";

                function to_ascii(str, identifier) {
                    return str.replace(/[\u0080-\uffff]/g, function(ch) {
                        var code = ch.charCodeAt(0).toString(16);
                        if (code.length <= 2 && !identifier) {
                            while (code.length < 2) code = "0" + code;
                            return "\\x" + code;
                        } else {
                            while (code.length < 4) code = "0" + code;
                            return "\\u" + code;
                        }
                    });
                };

                function make_string(str, quote) {
                    var dq = 0, sq = 0;
                    str = str.replace(/[\\\b\f\n\r\t\x22\x27\u2028\u2029\0\ufeff]/g, function(s){
                        switch (s) {
                            case "\\": return "\\\\";
                            case "\b": return "\\b";
                            case "\f": return "\\f";
                            case "\n": return "\\n";
                            case "\r": return "\\r";
                            case "\u2028": return "\\u2028";
                            case "\u2029": return "\\u2029";
                            case '"': ++dq; return '"';
                            case "'": ++sq; return "'";
                            case "\0": return "\\x00";
                            case "\ufeff": return "\\ufeff";
                        }
                        return s;
     