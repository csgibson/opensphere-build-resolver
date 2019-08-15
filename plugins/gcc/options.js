'use strict';
const path = require('path');
const utils = require('../../utils');
const slash = require('slash');

var basePackage = null;
var definesFound = {};
var optionsFound = [];

var pathKeys = ['conformance_configs', 'js', 'externs', 'output_wrapper_file'];
var multiValueKeys = [
  'define',
  'externs',
  'extra_annotation_name',
  'entry_point',
  'hide_warnings_for',
  'js',
  'jscomp_error',
  'jscomp_off',
  'jscomp_warning',
  'module'
];

const resolver = function(pack, projectDir, depth) {
  basePackage = basePackage || pack;

  var options = pack.build ? pack.build.gcc : null;
  if (options) {
    // resolve paths for path keys
    var mapPaths = function(item) {
      var exclusion = false;

      if (item.startsWith('!')) {
        exclusion = true;
        item = item.substring(1);
      }

      // try to resolve the item by walking node_modules
      var packagePath = utils.resolveModulePath(item, projectDir);
      if (packagePath) {
        return (exclusion ? '!' : '') + packagePath;
      }

      // resolve the path from the project directory if not found in node_modules
      return (exclusion ? '!' : '') +
        slash(utils.flattenPath(path.resolve(projectDir, item)));
    };

    for (var key in options) {
      if (options.hasOwnProperty(key) && pathKeys.indexOf(key) > -1) {
        var value = options[key];

        if (!(value instanceof Array)) {
          value = [value];
        }

        options[key] = value.map(mapPaths);
      }
    }

    // assign a priority so options can be added in the appropriate order
    options.priority = utils.getPackagePriority(pack, depth, basePackage);

    optionsFound.unshift(options);
  }

  return Promise.resolve();
};

const toArray = function(item) {
  if (!item) return item;
  return !(item instanceof Array) ? [item] : item;
};

/**
 * Sort options objects in ascending order.
 * @param {Object} a First object
 * @param {Object} b Second object
 * @return {number} The sort order
 */
const sort = function(a, b) {
  return a.priority - b.priority;
};

const adder = function(pack, options) {
  optionsFound.sort(sort);
  optionsFound.reduce(function(options, curr) {
    // remove the priority so it isn't included as an option
    delete curr.priority;

    for (var key in curr) {
      var value = curr[key];

      if (typeof value === 'boolean' || multiValueKeys.indexOf(key) === -1) {
        options[key] = value;
      } else if (key === 'define') {
        // defines should be deduplicated by key, so build a map of them. options are sorted in ascending priority, so
        // replace as we go to ensure the last one wins.
        value.forEach(function(d) {
          var parts = d.split('=');
          if (parts.length === 2) {
            definesFound[parts[0]] = parts[1];
          }
        });
      } else {
        // everything else is an array? This is technically not true,
        // but it is true for everything I can think of modifying on an
        // individual project level.
        var currValue = options[key];
        currValue = toArray(currValue);
        value = toArray(value);

        if (currValue) {
          if (key === 'externs') {
            options[key] = value.concat(currValue);
          } else {
            options[key] = currValue.concat(value);
          }
        } else {
          options[key] = value;
        }
      }
    }

    return options;
  }, options);


  for (var key in definesFound) {
    if (!options.define) {
      options.define = [];
    }
    options.define.push(key + '=' + definesFound[key]);
  }

  pathKeys.forEach(function(key) {
    var list = options[key];
    if (list) {
      list.sort();
    }
  });
};

const clear = function() {
  definesFound = {};
  optionsFound.length = 0;
};

module.exports = {
  resolver: resolver,
  adder: adder,
  clear: clear
};
