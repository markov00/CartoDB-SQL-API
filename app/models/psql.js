var _      = require('underscore')
    , Step   = require('step')
    , pg     = require('pg');//.native; // disabled for now due to: https://github.com/brianc/node-postgres/issues/48
_.mixin(require('underscore.string'));

// Max database connections in the pool
// Subsequent connections will block waiting for a free slot
pg.defaults.poolSize = global.settings.db_pool_size || 16;

// Milliseconds of idle time before removing connection from pool
// TODO: make config setting ?
pg.defaults.poolIdleTimeout = global.settings.db_pool_idleTimeout || 30000;

// Frequency to check for idle clients within the pool, ms
// TODO: make config setting ?
pg.defaults.reapIntervalMillis = global.settings.db_pool_reapInterval || 1000;

pg.on('error', function(err, client) {
  console.log("PostgreSQL connection error: " + err);
});


// PSQL
//
// A simple postgres wrapper with logic about username and database to connect
//
// * intended for use with pg_bouncer
// * defaults to connecting with a "READ ONLY" user to given DB if not passed a specific user_id
var PSQL = function(user_id, db) {

    var error_text = "Incorrect access parameters. If you are accessing via OAuth, please check your tokens are correct. For public users, please ensure your table is published."
    if (!_.isString(user_id) && !_.isString(db)) throw new Error(error_text);

    var me = {
        public_user: "publicuser"
        , user_id: user_id
        , db: db
    };

    me.username = function(){
        var username = this.user_id;
        return username;
    };

    me.database = function(){
        var database = db;
        
        return database;
    };

    me.conString = "tcp://" + me.username() + "@" +
                    global.settings.db_host + ":" +
                    global.settings.db_port + "/" +
                    me.database();

    me.eventedQuery = function(sql, callback){
        var that = this;

        Step(
            function(){
                that.sanitize(sql, this);
            },
            function(err, clean){
                if (err) throw err;
                pg.connect(that.conString, this);
            },
            function(err, client, done){
                if (err) throw err;
                var query = client.query(sql);
                // NOTE: for some obscure reason passing "done" directly
                //       as the listener works but can be slower
                //      (by x2 factor!)
                query.on('end', function() { done(); }); 
                return query;
            },
            function(err, query){
                callback(err, query)
            }
        );
    },

    me.query = function(sql, callback){
        var that = this;
        var finish;

        Step(
            function(){
                that.sanitize(sql, this);
            },
            function(err, clean){
                if (err) throw err;
                pg.connect(that.conString, this);
            },
            function(err, client, done){
                if (err) throw err;
                finish = done;
                client.query(sql, this);
            },
            function(err, res){

                // Release client to the pool
                // should this be postponed to after the callback ?
                // NOTE: if we pass a true value to finish() the client
                //       will be removed from the pool.
                //       We don't want this. Not now.
                if ( finish ) finish();

                callback(err, res)
            }
        );
    };

    // throw exception if illegal operations are detected
    // NOTE: this check is weak hack, better database
    //       permissions should be used instead.
    me.sanitize = function(sql, callback){
        // NOTE: illegal table access is checked in main app
        if (sql.match(/^\s+set\s+/i)){
            var error = new SyntaxError("SET command is forbidden");
            error.http_status = 403;
            callback(error); 
            return;
        }
        callback(null,true);
    };

    return me;
};

module.exports = PSQL;
