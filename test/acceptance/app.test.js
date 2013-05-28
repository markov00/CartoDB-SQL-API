/**
 *
 * Requires the database and tables setup in config/environments/test.js to exist
 * Ensure the user is present in the pgbouncer auth file too
 * TODO: Add OAuth tests.
 *
 * To run this test, ensure that cartodb_test_user_1_db metadata exists in Redis for the vizziality.cartodb.com domain
 *
 * SELECT 5
 * HSET rails:users:vizzuality id 1
 * HSET rails:users:vizzuality database_name cartodb_test_user_1_db
 *
 */
require('../helper');
require('../support/assert');


var app    = require(global.settings.app_root + '/app/controllers/app')
    , assert = require('assert')
    , querystring = require('querystring')
    , _ = require('underscore')
    , zipfile = require('zipfile')
    , fs      = require('fs')
    , libxmljs = require('libxmljs')
    , Step = require('step')
    ;

// allow lots of emitters to be set to silence warning
app.setMaxListeners(0);

suite('app.test', function() {

var expected_cache_control = 'no-cache,max-age=3600,must-revalidate,public';
var expected_cache_control_persist = 'public,max-age=31536000';

// use dec_sep for internationalization
var checkDecimals = function(x, dec_sep){
    var tmp='' + x;
    if (tmp.indexOf(dec_sep)>-1)
        return tmp.length-tmp.indexOf(dec_sep)-1;
    else
        return 0;
}

test('GET /api/v1/sql', function(done){
    assert.response(app, {
        url: '/api/v1/sql',
        method: 'GET'
    },{
        status: 400
    }, function(res) {
        assert.deepEqual(res.headers['content-type'], 'application/json; charset=utf-8');
        assert.deepEqual(res.headers['content-disposition'], 'inline');
        assert.deepEqual(JSON.parse(res.body), {"error":["You must indicate a sql query"]});
        done();
    });
});

// Test base_url setting
test('GET /api/whatever/sql', function(done){
    assert.response(app, {
        url: '/api/whatever/sql',
        method: 'GET'
    },{
        status: 400
    }, function(res) {
        assert.deepEqual(res.headers['content-type'], 'application/json; charset=utf-8');
        assert.deepEqual(res.headers['content-disposition'], 'inline');
        assert.deepEqual(JSON.parse(res.body), {"error":["You must indicate a sql query"]});
        done();
    });
});


test('GET /api/v1/sql with SQL parameter on SELECT only. No oAuth included ', function(done){
    assert.response(app, {
        url: '/api/v1/sql?q=SELECT%20*%20FROM%20untitle_table_4&database=cartodb_test_user_1_db',
        method: 'GET'
    },{ }, function(res) {
        assert.equal(res.statusCode, 200, res.body);
        // Check cache headers
        // See https://github.com/Vizzuality/CartoDB-SQL-API/issues/43
        assert.equal(res.headers['x-cache-channel'], 'cartodb_test_user_1_db:untitle_table_4');
        assert.equal(res.headers['cache-control'], expected_cache_control);
        done();
    });
});

test('cache_policy=persist', function(done){
    assert.response(app, {
        url: '/api/v1/sql?q=SELECT%20*%20FROM%20untitle_table_4&database=cartodb_test_user_1_db&cache_policy=persist',
        method: 'GET'
    },{ }, function(res) {
        assert.equal(res.statusCode, 200, res.body);
        // Check cache headers
        // See https://github.com/Vizzuality/CartoDB-SQL-API/issues/43
        assert.equal(res.headers['x-cache-channel'], 'cartodb_test_user_1_db:untitle_table_4');
        assert.equal(res.headers['cache-control'], expected_cache_control_persist);
        done();
    });
});

test('GET /api/v1/sql with SQL parameter on SELECT only. no database param, just id using headers', function(done){
    assert.response(app, {
        url: '/api/v1/sql?q=SELECT%20*%20FROM%20untitle_table_4',
        headers: {host: 'vizzuality.cartodb.com'},
        method: 'GET'
    },{ }, function(res) {
        assert.equal(res.statusCode, 200, res.body);
        done();
    });
});

test('GET /api/v1/sql with SQL parameter on SELECT only. no database param, just id using headers. Authenticated.',
function(done){
    assert.response(app, {
        url: '/api/v1/sql?q=SELECT%20cartodb_id*2%20FROM%20untitle_table_4&api_key=1234',
        headers: {host: 'vizzuality.cartodb.com'},
        method: 'GET'
    },{ }, function(res) {
        assert.equal(res.statusCode, 200, res.body);
        // Check cache headers
        // See https://github.com/Vizzuality/CartoDB-SQL-API/issues/43
        assert.equal(res.headers['x-cache-channel'], 'cartodb_test_user_1_db:untitle_table_4');
        assert.equal(res.headers['cache-control'], expected_cache_control);
        done();
    });
});

// Test for https://github.com/Vizzuality/CartoDB-SQL-API/issues/85
test("paging doesn't break x-cache-channel", 
function(done){
    assert.response(app, {
        url: '/api/v1/sql?' + querystring.stringify({
          q: 'SELECT cartodb_id*3 FROM untitle_table_4',
          api_key: '1234',
          rows_per_page: 1,
          page: 2
        }),
        headers: {host: 'vizzuality.cartodb.com'},
        method: 'GET'
    },{ }, function(res) {
        assert.equal(res.statusCode, 200, res.body);
        assert.equal(res.headers['x-cache-channel'], 'cartodb_test_user_1_db:untitle_table_4');
        done();
    });
});


test('POST /api/v1/sql with SQL parameter on SELECT only. no database param, just id using headers', function(done){
    assert.response(app, {
        url: '/api/v1/sql',
        data: querystring.stringify({q: "SELECT * FROM untitle_table_4"}),
        headers: {host: 'vizzuality.cartodb.com', 'Content-Type': 'application/x-www-form-urlencoded' },
        method: 'POST'
    },{ }, function(res) {
        assert.equal(res.statusCode, 200, res.body);
        done();
    });
});

test('GET /api/v1/sql with INSERT. oAuth not used, so public user - should fail', function(done){
    assert.response(app, {
        url: "/api/v1/sql?q=INSERT%20INTO%20untitle_table_4%20(cartodb_id)%20VALUES%20(1e4)&database=cartodb_test_user_1_db",
        method: 'GET'
    },{
    }, function(res) {
        assert.equal(res.statusCode, 400, res.statusCode + ': ' + res.body);
        assert.deepEqual(res.headers['content-type'], 'application/json; charset=utf-8');
        assert.deepEqual(res.headers['content-disposition'], 'inline');
        assert.deepEqual(JSON.parse(res.body), 
          {"error":["permission denied for relation untitle_table_4"]} 
        );
        done();
    });
});

test('GET /api/v1/sql with DROP TABLE. oAuth not used, so public user - should fail', function(done){
    assert.response(app, {
        url: "/api/v1/sql?q=DROP%20TABLE%20untitle_table_4&database=cartodb_test_user_1_db",
        method: 'GET'
    },{
    }, function(res) {
        assert.equal(res.statusCode, 400, res.statusCode + ': ' + res.body);
        assert.deepEqual(res.headers['content-type'], 'application/json; charset=utf-8');
        assert.deepEqual(res.headers['content-disposition'], 'inline');
        assert.deepEqual(JSON.parse(res.body), 
          {"error":["must be owner of relation untitle_table_4"]}
        );
        done();
    });
});

test('GET /api/v1/sql with INSERT. header based db - should fail', function(){
    assert.response(app, {
        url: "/api/v1/sql?q=INSERT%20INTO%20untitle_table_4%20(id)%20VALUES%20(1)",
        headers: {host: 'vizzuality.cartodb.com'},
        method: 'GET'
    },{
        status: 400
    });
});

// Check results from INSERT 
//
// See https://github.com/Vizzuality/CartoDB-SQL-API/issues/13
test('INSERT returns affected rows', function(done){
    assert.response(app, {
        // view prepare_db.sh to see where to set api_key
        url: "/api/v1/sql?api_key=1234&"
         + querystring.stringify({q:
          "INSERT INTO private_table(name) VALUES('noret1') UNION VALUES('noret2')"
        }),
        headers: {host: 'vizzuality.localhost.lan:8080' },
        method: 'GET'
    },{}, function(res) {
        assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
        var out = JSON.parse(res.body);
        assert.ok(out.hasOwnProperty('time'));
        assert.equal(out.total_rows, 2);
        assert.equal(out.rows.length, 0);
        // Check cache headers
        // See https://github.com/Vizzuality/CartoDB-SQL-API/issues/43
        assert.equal(res.headers['x-cache-channel'], 'NONE');
        assert.equal(res.headers['cache-control'], expected_cache_control);
        done();
    });
});

// Check results from UPDATE
//
// See https://github.com/Vizzuality/CartoDB-SQL-API/issues/13
test('UPDATE returns affected rows', function(done){
    assert.response(app, {
        // view prepare_db.sh to see where to set api_key
        url: "/api/v1/sql?api_key=1234&"
         + querystring.stringify({q:
          "UPDATE private_table SET name = upper(name) WHERE name in ('noret1', 'noret2')"
        }),
        headers: {host: 'vizzuality.localhost.lan:8080' },
        method: 'GET'
    },{}, function(res) {
        assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
        var out = JSON.parse(res.body);
        assert.ok(out.hasOwnProperty('time'));
        assert.equal(out.total_rows, 2);
        assert.equal(out.rows.length, 0);
        // Check cache headers
        // See https://github.com/Vizzuality/CartoDB-SQL-API/issues/43
        assert.equal(res.headers['x-cache-channel'], 'NONE');
        assert.equal(res.headers['cache-control'], expected_cache_control);
        done();
    });
});

// Check results from DELETE
//
// See https://github.com/Vizzuality/CartoDB-SQL-API/issues/13
test('DELETE returns affected rows', function(done){
    assert.response(app, {
        // view prepare_db.sh to see where to set api_key
        url: "/api/v1/sql?api_key=1234&"
         + querystring.stringify({q:
          "DELETE FROM private_table WHERE name in ('NORET1', 'NORET2')"
        }),
        headers: {host: 'vizzuality.localhost.lan:8080' },
        method: 'GET'
    },{}, function(res) {
        assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
        var out = JSON.parse(res.body);
        assert.ok(out.hasOwnProperty('time'));
        assert.equal(out.total_rows, 2);
        assert.equal(out.rows.length, 0);
        // Check cache headers
        // See https://github.com/Vizzuality/CartoDB-SQL-API/issues/43
        assert.equal(res.headers['x-cache-channel'], 'NONE');
        assert.equal(res.headers['cache-control'], expected_cache_control);
        done();
    });
});

// Check results from INSERT .. RETURNING
//
// See https://github.com/Vizzuality/CartoDB-SQL-API/issues/50
test('INSERT with RETURNING returns all results', function(done){
    assert.response(app, {
        // view prepare_db.sh to see where to set api_key
        url: "/api/v1/sql?api_key=1234&"
         + querystring.stringify({q:
          "INSERT INTO private_table(name) VALUES('test') RETURNING upper(name), reverse(name)"
        }),
        headers: {host: 'vizzuality.localhost.lan:8080' },
        method: 'GET'
    },{}, function(res) {
        assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
        var out = JSON.parse(res.body);
        assert.ok(out.hasOwnProperty('time'));
        assert.equal(out.total_rows, 1);
        assert.equal(out.rows.length, 1);
        assert.equal(_.keys(out.rows[0]).length, 2);
        assert.equal(out.rows[0].upper, 'TEST');
        assert.equal(out.rows[0].reverse, 'tset');
        done();
    });
});

// Check results from UPDATE .. RETURNING
//
// See https://github.com/Vizzuality/CartoDB-SQL-API/issues/50
test('UPDATE with RETURNING returns all results', function(done){
    assert.response(app, {
        // view prepare_db.sh to see where to set api_key
        url: "/api/v1/sql?api_key=1234&"
         + querystring.stringify({q:
          "UPDATE private_table SET name = 'tost' WHERE name = 'test' RETURNING upper(name), reverse(name)"
        }),
        headers: {host: 'vizzuality.localhost.lan:8080' },
        method: 'GET'
    },{}, function(res) {
        assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
        var out = JSON.parse(res.body);
        assert.ok(out.hasOwnProperty('time'));
        assert.equal(out.total_rows, 1);
        assert.equal(out.rows.length, 1);
        assert.equal(_.keys(out.rows[0]).length, 2);
        assert.equal(out.rows[0].upper, 'TOST');
        assert.equal(out.rows[0].reverse, 'tsot');
        done();
    });
});

// Check results from DELETE .. RETURNING
//
// See https://github.com/Vizzuality/CartoDB-SQL-API/issues/50
test('DELETE with RETURNING returns all results', function(done){
    assert.response(app, {
        // view prepare_db.sh to see where to set api_key
        url: "/api/v1/sql?api_key=1234&"
         + querystring.stringify({q:
          "DELETE FROM private_table WHERE name = 'tost' RETURNING name"
        }),
        headers: {host: 'vizzuality.localhost.lan:8080' },
        method: 'GET'
    },{}, function(res) {
        assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
        var out = JSON.parse(res.body);
        assert.ok(out.hasOwnProperty('time'));
        assert.equal(out.total_rows, 1);
        assert.equal(out.rows.length, 1);
        assert.equal(_.keys(out.rows[0]).length, 1);
        assert.equal(out.rows[0].name, 'tost');
        done();
    });
});

test('GET /api/v1/sql with SQL parameter on DROP TABLE. should fail', function(done){
    assert.response(app, {
        url: "/api/v1/sql?q=DROP%20TABLE%20untitle_table_4",
        headers: {host: 'vizzuality.cartodb.com'},
        method: 'GET'
    },{}, function(res) {
        assert.equal(res.statusCode, 400, res.statusCode + ': ' + res.body);
        assert.deepEqual(res.headers['content-type'], 'application/json; charset=utf-8');
        assert.deepEqual(res.headers['content-disposition'], 'inline');
        assert.deepEqual(JSON.parse(res.body), 
          {"error":["must be owner of relation untitle_table_4"]} 
        );
        done();
    });
});

test('CREATE TABLE with GET and auth', function(done){
    assert.response(app, {
        url: "/api/v1/sql?" + querystring.stringify({
          q: 'CREATE TABLE test_table(a int)',
          api_key: 1234
        }),
        headers: {host: 'vizzuality.cartodb.com'},
        method: 'GET'
    },{}, function(res) {
      assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
      // Check cache headers
      // See https://github.com/Vizzuality/CartoDB-SQL-API/issues/43
      assert.equal(res.headers['x-cache-channel'], 'NONE');
      assert.equal(res.headers['cache-control'], expected_cache_control);
      done();
    });
});

// Test effects of COPY
// See https://github.com/Vizzuality/cartodb-management/issues/1502
test('COPY TABLE with GET and auth', function(done){
    assert.response(app, {
        url: "/api/v1/sql?" + querystring.stringify({
          q: 'COPY test_table FROM stdin;',
          api_key: 1234
        }),
        headers: {host: 'vizzuality.cartodb.com'},
        method: 'GET'
    },{}, function(res) {
      // We expect a problem, actually
      assert.equal(res.statusCode, 400, res.statusCode + ': ' + res.body);
      assert.deepEqual(res.headers['content-type'], 'application/json; charset=utf-8');
      assert.deepEqual(res.headers['content-disposition'], 'inline');
      assert.deepEqual(JSON.parse(res.body), {"error":["COPY from stdin failed: No source stream defined"]});
      done();
    });
});

test('COPY TABLE with GET and auth', function(done){
    assert.response(app, {
        url: "/api/v1/sql?" + querystring.stringify({
          q: "COPY test_table to '/tmp/x';",
          api_key: 1234
        }),
        headers: {host: 'vizzuality.cartodb.com'},
        method: 'GET'
    },{}, function(res) {
      // We expect a problem, actually
      assert.equal(res.statusCode, 400, res.statusCode + ': ' + res.body);
      assert.deepEqual(res.headers['content-type'], 'application/json; charset=utf-8');
      assert.deepEqual(res.headers['content-disposition'], 'inline');
      assert.deepEqual(JSON.parse(res.body), {"error":["must be superuser to COPY to or from a file"]});
      done();
    });
});

test('ALTER TABLE with GET and auth', function(done){
    assert.response(app, {
        url: "/api/v1/sql?" + querystring.stringify({
          q: 'ALTER TABLE test_table ADD b int',
          api_key: 1234
        }),
        headers: {host: 'vizzuality.cartodb.com'},
        method: 'GET'
    },{}, function(res) {
      assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
      // Check cache headers
      // See https://github.com/Vizzuality/CartoDB-SQL-API/issues/43
      assert.equal(res.headers['x-cache-channel'], 'NONE');
      assert.equal(res.headers['cache-control'], expected_cache_control);
      done();
    });
});

test('multistatement insert, alter, select, begin, commit', function(done){
    assert.response(app, {
        url: "/api/v1/sql?" + querystring.stringify({
          q: 'BEGIN; DELETE FROM test_table; COMMIT; BEGIN; INSERT INTO test_table(b) values (5); COMMIT; ALTER TABLE test_table ALTER b TYPE float USING b::float/2; SELECT b FROM test_table; COMMIT;',
          api_key: 1234
        }),
        headers: {host: 'vizzuality.cartodb.com'},
        method: 'GET'
    },{}, function(res) {
      assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
      var parsedBody = JSON.parse(res.body);
      assert.equal(parsedBody.total_rows, 1);
      assert.deepEqual(parsedBody.rows[0], {b:2.5});
      done();
    });
});

test('TRUNCATE TABLE with GET and auth', function(done){
    assert.response(app, {
        url: "/api/v1/sql?" + querystring.stringify({
          q: 'TRUNCATE TABLE test_table',
          api_key: 1234
        }),
        headers: {host: 'vizzuality.cartodb.com'},
        method: 'GET'
    },{}, function(res) {
      assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
      assert.equal(res.headers['x-cache-channel'], 'NONE');
      assert.equal(res.headers['cache-control'], expected_cache_control);
      var pbody = JSON.parse(res.body);
      assert.equal(pbody.rows.length, 0);
      assert.response(app, {
          url: "/api/v1/sql?" + querystring.stringify({
            q: 'SELECT count(*) FROM test_table',
            api_key: 1234
          }),
          headers: {host: 'vizzuality.cartodb.com'},
          method: 'GET'
      },{}, function(res) {
        assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
        assert.equal(res.headers['x-cache-channel'], 'cartodb_test_user_1_db:test_table');
        assert.equal(res.headers['cache-control'], expected_cache_control);
        var pbody = JSON.parse(res.body);
        assert.equal(pbody.total_rows, 1);
        assert.equal(pbody.rows[0]['count'], 0);
        done();
      });
    });
});

test('DROP TABLE with GET and auth', function(done){
    assert.response(app, {
        url: "/api/v1/sql?" + querystring.stringify({
          q: 'DROP TABLE test_table',
          api_key: 1234
        }),
        headers: {host: 'vizzuality.cartodb.com'},
        method: 'GET'
    },{}, function(res) {
      assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
      // Check cache headers
      // See https://github.com/Vizzuality/CartoDB-SQL-API/issues/43
      assert.equal(res.headers['x-cache-channel'], 'NONE');
      assert.equal(res.headers['cache-control'], expected_cache_control);
      done();
    });
});

test('CREATE FUNCTION with GET and auth', function(done){
    assert.response(app, {
        url: "/api/v1/sql?" + querystring.stringify({
          q: 'CREATE FUNCTION create_func_test(a int) RETURNS INT AS \'SELECT 1\' LANGUAGE \'sql\'',
          api_key: 1234
        }),
        headers: {host: 'vizzuality.cartodb.com'},
        method: 'GET'
    },{}, function(res) {
      assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
      // Check cache headers
      // See https://github.com/Vizzuality/CartoDB-SQL-API/issues/43
      assert.equal(res.headers['x-cache-channel'], 'NONE');
      assert.equal(res.headers['cache-control'], expected_cache_control);
      done();
    });
});

test('DROP FUNCTION with GET and auth', function(done){
    assert.response(app, {
        url: "/api/v1/sql?" + querystring.stringify({
          q: 'DROP FUNCTION create_func_test(a int)',
          api_key: 1234
        }),
        headers: {host: 'vizzuality.cartodb.com'},
        method: 'GET'
    },{}, function(res) {
      assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
      // Check cache headers
      // See https://github.com/Vizzuality/CartoDB-SQL-API/issues/43
      assert.equal(res.headers['x-cache-channel'], 'NONE');
      assert.equal(res.headers['cache-control'], expected_cache_control);
      done();
    });
});

test('sends a 400 when an unsupported format is requested', function(done){
    assert.response(app, {
        url: '/api/v1/sql?q=SELECT%20*%20FROM%20untitle_table_4&format=unknown',
        headers: {host: 'vizzuality.cartodb.com'},
        method: 'GET'
    },{ }, function(res){
        assert.equal(res.statusCode, 400, res.body);
        assert.deepEqual(res.headers['content-type'], 'application/json; charset=utf-8');
        assert.deepEqual(res.headers['content-disposition'], 'inline');
        assert.deepEqual(JSON.parse(res.body), {"error":[ "Invalid format: unknown" ]});
        done();
    });
});

test('GET /api/v1/sql with SQL parameter and no format, ensuring content-disposition set to json', function(done){
    assert.response(app, {
        url: '/api/v1/sql?q=SELECT%20*%20FROM%20untitle_table_4',
        headers: {host: 'vizzuality.cartodb.com'},
        method: 'GET'
    },{ }, function(res){
        assert.equal(res.statusCode, 200, res.body);
        var ct = res.header('Content-Type');
        assert.ok(/json/.test(ct), 'Default format is not JSON: ' + ct);
        var cd = res.header('Content-Disposition');
        assert.equal(true, /^inline/.test(cd), 'Default format is not disposed inline: ' + cd);
        assert.equal(true, /filename=cartodb-query.json/gi.test(cd), 'Unexpected JSON filename: ' + cd);
        done();
    });
});

test('POST /api/v1/sql with SQL parameter and no format, ensuring content-disposition set to json', function(done){
    assert.response(app, {
        url: '/api/v1/sql', 
        data: querystring.stringify({q: "SELECT * FROM untitle_table_4" }),
        headers: {host: 'vizzuality.cartodb.com', 'Content-Type': 'application/x-www-form-urlencoded' },
        method: 'POST'
    },{ }, function(res){
        assert.equal(res.statusCode, 200, res.body);
        var ct = res.header('Content-Type');
        assert.ok(/json/.test(ct), 'Default format is not JSON: ' + ct);
        var cd = res.header('Content-Disposition');
        assert.equal(true, /^inline/.test(cd), 'Default format is not disposed inline: ' + cd);
        assert.equal(true, /filename=cartodb-query.json/gi.test(cd), 'Unexpected JSON filename: ' + cd);
        done();
    });
});

test('GET /api/v1/sql with SQL parameter and no format, but a filename', function(done){
    assert.response(app, {
        url: '/api/v1/sql?q=SELECT%20*%20FROM%20untitle_table_4&filename=x',
        headers: {host: 'vizzuality.cartodb.com'},
        method: 'GET'
    },{ }, function(res){
        assert.equal(res.statusCode, 200, res.body);
        var ct = res.header('Content-Type');
        assert.ok(/json/.test(ct), 'Default format is not JSON: ' + ct);
        var cd = res.header('Content-Disposition');
        assert.equal(true, /^attachment/.test(cd), 'Format with filename is not disposed as attachment: ' + cd);
        assert.equal(true, /filename=x.json/gi.test(cd), 'Unexpected JSON filename: ' + cd);
        done();
    });
});

test('field named "the_geom_webmercator" is not skipped by default', function(done){
    assert.response(app, {
        url: '/api/v1/sql?q=SELECT%20*%20FROM%20untitle_table_4',
        headers: {host: 'vizzuality.cartodb.com'},
        method: 'GET'
    },{ }, function(res){
        assert.equal(res.statusCode, 200, res.body);
        var row0 = JSON.parse(res.body).rows[0];
        var checkfields = {'name':1, 'cartodb_id':1, 'the_geom':1, 'the_geom_webmercator':1};
        for ( var f in checkfields ) {
          if ( checkfields[f] ) {
            assert.ok(row0.hasOwnProperty(f), "result does not include '" + f + "'");
          } else {
            assert.ok(!row0.hasOwnProperty(f), "result includes '" + f + "'");
          }
        }
        done();
    });
});

test('skipfields controls included fields', function(done){
    assert.response(app, {
        url: '/api/v1/sql?q=SELECT%20*%20FROM%20untitle_table_4&skipfields=the_geom_webmercator,cartodb_id,unexistant',
        headers: {host: 'vizzuality.cartodb.com'},
        method: 'GET'
    },{ }, function(res){
        assert.equal(res.statusCode, 200, res.body);
        var row0 = JSON.parse(res.body).rows[0];
        var checkfields = {'name':1, 'cartodb_id':0, 'the_geom':1, 'the_geom_webmercator':0};
        for ( var f in checkfields ) {
          if ( checkfields[f] ) {
            assert.ok(row0.hasOwnProperty(f), "result does not include '" + f + "'");
          } else {
            assert.ok(!row0.hasOwnProperty(f), "result includes '" + f + "'");
          }
        }
        done();
    });
});

test('multiple skipfields parameter do not kill the backend', function(done){
    assert.response(app, {
        url: '/api/v1/sql?q=SELECT%20*%20FROM%20untitle_table_4&skipfields=unexistent,the_geom_webmercator&skipfields=cartodb_id,unexistant',
        headers: {host: 'vizzuality.cartodb.com'},
        method: 'GET'
    },{ }, function(res){
        assert.equal(res.statusCode, 200, res.body);
        var row0 = JSON.parse(res.body).rows[0];
        var checkfields = {'name':1, 'cartodb_id':0, 'the_geom':1, 'the_geom_webmercator':0};
        for ( var f in checkfields ) {
          if ( checkfields[f] ) {
            assert.ok(row0.hasOwnProperty(f), "result does not include '" + f + "'");
          } else {
            assert.ok(!row0.hasOwnProperty(f), "result includes '" + f + "'");
          }
        }
        done();
    });
});

test('GET /api/v1/sql ensure cross domain set on errors', function(done){
    assert.response(app, {
        url: '/api/v1/sql?q=SELECT%20*gadfgadfg%20FROM%20untitle_table_4',
        headers: {host: 'vizzuality.cartodb.com'},
        method: 'GET'
    },{
        status: 400
    }, function(res){
        var cd = res.header('Access-Control-Allow-Origin');
        assert.deepEqual(res.headers['content-type'], 'application/json; charset=utf-8');
        assert.deepEqual(res.headers['content-disposition'], 'inline');
        assert.equal(cd, '*');
        done();
    });
});

test('cannot GET system tables', function(done){
    var req = { headers: {host: 'vizzuality.cartodb.com'},
        method: 'GET' };
    var pre = '/api/v1/sql?';
    Step(
      function trySysTable1() {
        req.url = pre + querystring.stringify({q: 'SELECT * FROM pg_attribute'});
        var next = this;
        assert.response( app, req, function(res) { next(null, res); } );
      },
      function chkSysTable1_trySysTable2(err, res) {
        if ( err ) throw err;
        var next = this;
        assert.equal(res.statusCode, 403);
        req.url = pre + querystring.stringify({q: 'SELECT * FROM PG_attribute'});
        assert.response(app, req, function(res) { next(null, res); });
      },
      function chkSysTable2_trySysTable3(err, res) {
        if ( err ) throw err;
        var next = this;
        assert.equal(res.statusCode, 403);
        req.url = pre + querystring.stringify({q: 'SELECT * FROM "pg_attribute"'});
        assert.response(app, req, function(res) { next(null, res); });
      },
      function chkSysTable3_trySysTable4(err, res) {
        if ( err ) throw err;
        var next = this;
        assert.equal(res.statusCode, 403);
        req.url = pre + querystring.stringify({q: 'SELECT a.* FROM untitle_table_4 a,pg_attribute'});
        assert.response(app, req, function(res) { next(null, res); });
      },
      function chkSysTable4_tryValidPg1(err, res) {
        if ( err ) throw err;
        var next = this;
        assert.equal(res.statusCode, 403);
        req.url = pre + querystring.stringify({q: "SELECT 'pg_'"});
        assert.response(app, req, function(res) { next(null, res); });
      },
      function chkValidPg1_tryValidPg2(err, res) {
        if ( err ) throw err;
        var next = this;
        assert.equal(res.statusCode, 200);
        req.url = pre + querystring.stringify({q: "SELECT pg_attribute FROM ( select 1 as pg_attribute ) as f"});
        assert.response(app, req, function(res) { next(null, res); });
      },
      function chkValidPg2_trySet1(err, res) {
        if ( err ) throw err;
        var next = this;
        assert.equal(res.statusCode, 200);
        req.url = pre + querystring.stringify({q: ' set statement_timeout TO 400'});
        assert.response(app, req, function(res) { next(null, res); });
      },
      function chkSet1_trySet2(err, res) {
        if ( err ) throw err;
        var next = this;
        assert.equal(res.statusCode, 403);
        req.url = pre + querystring.stringify({q: ' SET work_mem TO 80000'});
        assert.response(app, req, function(res) { next(null, res); });
      },
      function chkSet2(err, res) {
        if ( err ) throw err;
        var next = this;
        return true;
      },
      function finish(err) {
        done(err);
      }
    );
});

test('GET decent error if domain is incorrect', function(done){
    assert.response(app, {
        url: '/api/v1/sql?q=SELECT%20*%20FROM%20untitle_table_4&format=geojson',
        headers: {host: 'vizzualinot.cartodb.com'},
        method: 'GET'
    },{
        status: 404
    }, function(res){
        assert.deepEqual(res.headers['content-type'], 'application/json; charset=utf-8');
        assert.deepEqual(res.headers['content-disposition'], 'inline');
        var result = JSON.parse(res.body);
        assert.equal(result.error[0],"Sorry, we can't find this CartoDB. Please check that you have entered the correct domain.");
        done();
    });
});

test('GET decent error if SQL is broken', function(done){
    assert.response(app, {
        url: '/api/v1/sql?' + querystring.stringify({q:
          'SELECT star FROM this and that'
        }),
        headers: {host: 'vizzuality.cartodb.com'},
        method: 'GET'
    },{}, function(res){
        assert.equal(res.statusCode, 400, res.statusCode + ': ' + res.body);
        assert.deepEqual(res.headers['content-type'], 'application/json; charset=utf-8');
        assert.deepEqual(res.headers['content-disposition'], 'inline');
        var result = JSON.parse(res.body);
        // NOTE: actual error message may be slighly different, possibly worth a regexp here
        assert.equal(result.error[0], 'syntax error at or near "and"');
        done();
    });
});

// See https://github.com/Vizzuality/CartoDB-SQL-API/issues/88
test('numeric arrays are rendered as such', function(done){
    assert.response(app, {
        url: "/api/v1/sql?"
         + querystring.stringify({q:
          "SELECT ARRAY[8.7,4.3]::numeric[] as x"
        }),
        headers: {host: 'vizzuality.localhost.lan:8080' },
        method: 'GET'
    },{}, function(res) {
        assert.equal(res.statusCode, 200, res.statusCode + ': ' + res.body);
        var out = JSON.parse(res.body);
        assert.ok(out.hasOwnProperty('time'));
        assert.equal(out.total_rows, 1);
        assert.equal(out.rows.length, 1);
        assert.ok(out.rows[0].hasOwnProperty('x'));
        assert.equal(out.rows[0].x.length, 2);
        assert.equal(out.rows[0].x[0], '8.7');
        assert.equal(out.rows[0].x[1], '4.3');
        assert.equal(res.headers['x-cache-channel'], 'cartodb_test_user_1_db:'); // keep forever
        done();
    });
});

// GEOJSON tests

test('GET /api/v1/sql with SQL parameter and geojson format, ensuring content-disposition set to geojson', function(done){
    assert.response(app, {
        url: '/api/v1/sql?q=SELECT%20*%20FROM%20untitle_table_4&format=geojson',
        headers: {host: 'vizzuality.cartodb.com'},
        method: 'GET'
    },{ }, function(res){
        assert.equal(res.statusCode, 200, res.body);
        var cd = res.header('Content-Disposition');
        assert.equal(true, /^attachment/.test(cd), 'GEOJSON is not disposed as attachment: ' + cd);
        assert.equal(true, /filename=cartodb-query.geojson/gi.test(cd));
        done();
    });
});

test('POST /api/v1/sql with SQL parameter and geojson format, ensuring content-disposition set to geojson', function(done){
    assert.response(app, {
        url: '/api/v1/sql', 
        data: querystring.stringify({q: "SELECT * FROM untitle_table_4", format: 'geojson' }),
        headers: {host: 'vizzuality.cartodb.com', 'Content-Type': 'application/x-www-form-urlencoded' },
        method: 'POST'
    },{ }, function(res){
        assert.equal(res.statusCode, 200, res.body);
        var cd = res.header('Content-Disposition');
        assert.equal(true, /^attachment/.test(cd), 'GEOJSON is not disposed as attachment: ' + cd);
        assert.equal(true, /filename=cartodb-query.geojson/gi.test(cd));
        done();
    });
});

test('uses the last format parameter when multiple are used', function(done){
    assert.response(app, {
        url: '/api/v1/sql?format=csv&q=SELECT%20*%20FROM%20untitle_table_4&format=geojson',
        headers: {host: 'vizzuality.cartodb.com'},
        method: 'GET'
    },{ }, function(res){
        assert.equal(res.statusCode, 200, res.body);
        var cd = res.header('Content-Disposition');
        assert.equal(true, /filename=cartodb-query.geojson/gi.test(cd));
        done();
    });
});

test('uses custom filename', function(done){
    assert.response(app, {
        url: '/api/v1/sql?q=SELECT%20*%20FROM%20untitle_table_4&format=geojson&filename=x',
        headers: {host: 'vizzuality.cartodb.com'},
        method: 'GET'
    },{ }, function(res){
        assert.equal(res.statusCode, 200, res.body);
        var cd = res.header('Content-Disposition');
        assert.equal(true, /filename=x.geojson/gi.test(cd), cd);
        done();
    });
});

test('does not include the_geom and the_geom_webmercator properties by default', function(done){
    assert.response(app, {
        url: '/api/v1/sql?q=SELECT%20*%20FROM%20untitle_table_4&format=geojson',
        headers: {host: 'vizzuality.cartodb.com'},
        method: 'GET'
    },{ }, function(res){
        assert.equal(res.statusCode, 200, res.body);
        var parsed_body = JSON.parse(res.body);
        var row0 = parsed_body.features[0].properties;
        var checkfields = {'name':1, 'cartodb_id':1, 'the_geom':0, 'the_geom_webmercator':0};
        for ( var f in checkfields ) {
          if ( checkfields[f] ) {
            assert.ok(row0.hasOwnProperty(f), "result does not include '" + f + "'");
          } else {
            assert.ok(!row0.hasOwnProperty(f), "result includes '" + f + "'");
          }
        }
        done();
    });
});

test('skipfields controls fields included in GeoJSON output', function(done){
    assert.response(app, {
        url: '/api/v1/sql?q=SELECT%20*%20FROM%20untitle_table_4&format=geojson&skipfields=unexistant,cartodb_id',
        headers: {host: 'vizzuality.cartodb.com'},
        method: 'GET'
    },{ }, function(res){
        assert.equal(res.statusCode, 200, res.body);
        var parsed_body = JSON.parse(res.body);
        var row0 = parsed_body.features[0].properties;
        var checkfields = {'name':1, 'cartodb_id':0, 'the_geom':0, 'the_geom_webmercator':0};
        for ( var f in checkfields ) {
          if ( checkfields[f] ) {
            assert.ok(row0.hasOwnProperty(f), "result does not include '" + f + "'");
          } else {
            assert.ok(!row0.hasOwnProperty(f), "result includes '" + f + "'");
          }
        }
        done();
    });
});


test('GET /api/v1/sql as geojson limiting decimal places', function(done){
    assert.response(app, {
        url: '/api/v1/sql?' + querystring.stringify({
          q: 'SELECT ST_MakePoint(0.123,2.3456) as the_geom',
          format: 'geojson',
          dp: '1'}),
        headers: {host: 'vizzuality.cartodb.com'},
        method: 'GET'
    },{ }, function(res){
        assert.equal(res.statusCode, 200, res.body);
        var result = JSON.parse(res.body);
        assert.equal(1, checkDecimals(result.features[0].geometry.coordinates[0], '.'));
        done();
    });
});

test('GET /api/v1/sql as geojson with default dp as 6', function(done){
    assert.response(app, {
        url: '/api/v1/sql?' + querystring.stringify({
          q: 'SELECT ST_MakePoint(0.12345678,2.3456787654) as the_geom',
          format: 'geojson'}),
        headers: {host: 'vizzuality.cartodb.com'},
        method: 'GET'
    },{ }, function(res){
        assert.equal(res.statusCode, 200, res.body);
        var result = JSON.parse(res.body);
        assert.equal(6, checkDecimals(result.features[0].geometry.coordinates[0], '.'));
        done();
    });
});

test('null geometries in geojson output', function(done){
    assert.response(app, {
        url: '/api/v1/sql?' + querystring.stringify({
          q: "SELECT 1 as gid, 'U' as name, null::geometry as the_geom ",
          format: 'geojson'
        }),
        headers: {host: 'vizzuality.cartodb.com'},
        method: 'GET'
    },{ }, function(res){
        assert.equal(res.statusCode, 200, res.body);
        var cd = res.header('Content-Disposition');
        assert.equal(true, /^attachment/.test(cd), 'GEOJSON is not disposed as attachment: ' + cd);
        assert.equal(true, /filename=cartodb-query.geojson/gi.test(cd));
        var gjson = JSON.parse(res.body);
        var expected = {
            type: 'FeatureCollection',
            features: [ { type: 'Feature',
                properties: { gid: 1, name: 'U' },
                geometry: null } ]
         };
        assert.deepEqual(gjson, expected);
        done();
      });
});

/**
 * CORS
 */
test('GET /api/v1/sql with SQL parameter on SELECT only should return CORS headers ', function(done){
    assert.response(app, {
        url: '/api/v1/sql?q=SELECT%20*%20FROM%20untitle_table_4&database=cartodb_test_user_1_db',
        method: 'GET'
    },{ }, function(res) {
        assert.equal(res.statusCode, 200, res.body);
        // Check cache headers
        // See https://github.com/Vizzuality/CartoDB-SQL-API/issues/43
        assert.equal(res.headers['x-cache-channel'], 'cartodb_test_user_1_db:untitle_table_4');
        assert.equal(res.headers['cache-control'], expected_cache_control);
        assert.equal(res.headers['access-control-allow-origin'], '*');
        assert.equal(res.headers['access-control-allow-headers'], "X-Requested-With, X-Prototype-Version, X-CSRF-Token");
        done();
    });
});

test('OPTIONS /api/v1/sql with SQL parameter on SELECT only should return CORS headers ', function(done){
    assert.response(app, {
        url: '/api/v1/sql?q=SELECT%20*%20FROM%20untitle_table_4&database=cartodb_test_user_1_db',
        method: 'OPTIONS'
    },{ }, function(res) {
        assert.equal(res.statusCode, 200, res.body);
        // Check cache headers
        // See https://github.com/Vizzuality/CartoDB-SQL-API/issues/43
        assert.equal(res.headers['x-cache-channel'], 'cartodb_test_user_1_db:untitle_table_4');
        assert.equal(res.headers['cache-control'], expected_cache_control);
        assert.equal(res.headers['access-control-allow-origin'], '*');
        assert.equal(res.headers['access-control-allow-headers'], "X-Requested-With, X-Prototype-Version, X-CSRF-Token");
        done();
    });
});

});
