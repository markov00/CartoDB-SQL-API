
var ArrayBufferSer = require("../bin_encoder");

function binary() {}

binary.prototype = {

  id: "bin",

  getQuery: function(sql, options) {
    return sql;
  },

  getContentType: function(){
    return "application/octet-stream";
  },

  getFileExtension: function() {
    return this.id;
  },

  _extractTypeFromName: function(name) {
    var g = name.match(new RegExp(/.*__(uintclamp|uint|int|float)(8|16|32)/i))
    if(g && g.length == 3) {
      var typeName = g[1] + g[2];
      return ArrayBufferSer.typeNames[typeName];
    }
  },

  transform: function(result, options, callback) {
    var total_rows = result.rowCount;
    var rows = result.rows

    //get headers 
    if(!total_rows) {
      callback(null, new Buffer(0));
      return;
    }
    var headersNames = Object.keys(rows[0]);
    var headerTypes = [];

    // get header names
    for(var i = 0; i < headersNames.length; ++i) {
      var r = rows[0];
      var n = headersNames[i];
      if(typeof(r[n]) == 'string') {
        headerTypes.push(ArrayBufferSer.STRING);
      } else if(typeof(r[n]) == 'object') {
        var t = this._extractTypeFromName(n);
        t = t == undefined ? ArrayBufferSer.FLOAT32: t;
        headerTypes.push(ArrayBufferSer.BUFFER + t);
      } else {
        var t = this._extractTypeFromName(n);
        headerTypes.push(t == undefined ? ArrayBufferSer.FLOAT32: t);
      }
    }

    var header = new ArrayBufferSer(ArrayBufferSer.STRING, headersNames);
    var data = [header];
    for(var i = 0; i < headersNames.length; ++i) {
      var d = [];
      var n = headersNames[i];
      for(var r = 0; r < total_rows; ++r) {
        var row = rows[r][n]; 
        if(headerTypes[i] > ArrayBufferSer.BUFFER) {
          row = new ArrayBufferSer(headerTypes[i] - ArrayBufferSer.BUFFER, row);
        }
        d.push(row);
      };
      var b = new ArrayBufferSer(headerTypes[i], d);
      data.push(b);
    }

    var all = new ArrayBufferSer(ArrayBufferSer.BUFFER, data);

    // create the file
    var FILE_TAG_LENGTH = 3;
    var VERSION_LENGTH = 1;
    var res = new Buffer(FILE_TAG_LENGTH + VERSION_LENGTH + all.buffer.length);

    callback(null, all.buffer);
  }

};

module.exports = new binary();
module.exports.ArrayBufferSer = ArrayBufferSer;
