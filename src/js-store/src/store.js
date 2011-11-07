// exports
exports.Store = {};
var Store = exports.Store;

// imports
var QueryEngine = require("./../../js-query-engine/src/query_engine").QueryEngine;
var QuadBackend = require("./../../js-rdf-persistence/src/quad_backend").QuadBackend;
var Lexicon = require("./../../js-rdf-persistence/src/lexicon").Lexicon;
var RDFJSInterface = require("./../../js-query-engine/src/rdf_js_interface").RDFJSInterface;
var RDFStoreClient = require("./../../js-connection/src/rdfstore_client").RDFStoreClient;
var Worker = require('webworker');

Store.VERSION = "0.4.8";

/**
 * Tries to create a new RDFStore instance that will be
 * executed in a web worker.
 * The first argument to this function is the URL/FS location 
 * of the store script. 
 * This parameter is mandatory in the browser. It is safe to
 * ignore this parameter in Node.js.
 * If support for web workers is not present, a regular
 * store object will be initialized and returned.
 *
 * @param {String} [scriptPath] URL of the RDFStore script
 * @param {Object[]} [args] Arguments to be passed to the store that will be created
 * @param {Function} callback Callback function that will be invoked with an error flag and the connection/store object.
 */
Store.connect = function() {
    var path, args, callback;
    if(arguments.length == 1) {
        path = __dirname;
        args = {};
        callback = arguments[0]
    } if(arguments.length == 2) {
        if(typeof(arguments[0]) === 'string') {
            path = arguments[0];
            args = {};
        } else {
            path = __dirname+"/index.js";
            args = arguments[0];
        }
        callback = arguments[1];
    } else {
        path = arguments[0];
        args = arguments[1];
        callback = arguments[2];
    }
    try {
        if(!!Worker) {
            new RDFStoreClient.RDFStoreClient(path, args, function(success,connection) {
                callback(success, connection);
            });
        } else {
            Store.create(args,function(connection){
                callback(false, connection);
            });
        }
    } catch(e) {
        console.log(e)
        Store.create(args,function(connection){
            callback(false, connection);
        });        
    }
};

Store.create = function(){
    if(arguments.length == 1) {
        return new Store.Store(arguments[0]);
    } else if(arguments.length == 2) {
        return new Store.Store(arguments[0], arguments[1]);
    } else {
        return new Store.Store();
    };
};

/**
 * Creates a new store.
 *
 * @param {Function} [callback] Callback that will be invoked when the store has been created
 * @param {Object} [params]
 *  - persistent:  should use persistence?
 *  - name: if using persistence, the name for this store
 *  - maxCacheSize: if using persistence, maximum size of the index cache
 */
Store.Store = function(arg1, arg2) {
    var callback = null;
    var params   = null;

    if(arguments.length == 0) {
        params ={};
    } else if(arguments.length == 1) {
        params   = {};
        callback = arg1;
    } else if(arguments.length > 1) {
        params   = arg1;
        callback = arg2;
    } else {
        throw("An optional argument map and a callback must be provided");
    }

    if(params['treeOrder'] == null) {
        params['treeOrder'] = 15;
    }

    this.rdf = RDFJSInterface.rdf;
    this.functionMap = {};

    var that = this;
    new Lexicon.Lexicon(function(lexicon){
        if(params['overwrite'] === true) {
            // delete lexicon values
            lexicon.clear();
        }
        new QuadBackend.QuadBackend(params, function(backend){
            if(params['overwrite'] === true) {
                // delete index values
                backend.clear();
            }
            params.backend = backend;
            params.lexicon =lexicon;
            that.engine = new QueryEngine.QueryEngine(params);      
            if(callback) {
                callback(that);
            }
        })
    },
    params['name']);
};


/**
 * Executes a query in the store.
 * There are two possible way of invoking this function,
 * providing a pair of arrays of namespaces that will be
 * used to compute the union of the default and named
 * dataset, or without them.
 * Both invocations receive as an optional last parameter
 * a callback function that will receive the return status
 * of the query and the results.
 *
 * @arguments:
 * 1)
 * @param {String} query
 * @param {Function} [callback]
 * 
 * 2)
 * @param {String} query
 * @param {String} URIs default namespaces
 * @param {String} URIs named namespaces
 * @param {Function} [callback]
 */
Store.Store.prototype.execute = function() {
    if(arguments.length === 3) {
        this.executeWithEnvironment(arguments[0],
                                    arguments[1],
                                    arguments[2]);
    } else if(arguments.length === 4) {
        this.executeWithEnvironment(arguments[0],
                                    arguments[1],
                                    arguments[2],
                                    arguments[3]);
    } else {

        var queryString;
        var callback;
     
        if(arguments.length === 1) {
            queryString = arguments[0];
            callback = function(){};
        } else if(arguments.length === 2) {
            queryString = arguments[0];
            callback = arguments [1];
        }
        this.engine.execute(queryString, callback);
    }
};

Store.Store.prototype.executeWithEnvironment = function() {
    var queryString;
    var callback;
    var defaultGraphs;
    var namedGraphs;

    if(arguments.length === 3) {
        queryString   = arguments[0];
        callback      = function(){};
        defaultGraphs = arguments[1];
        namedGraphs   = arguments[2];
    } else if(arguments.length === 4) {
        queryString   = arguments[0];
        callback      = arguments [3];
        defaultGraphs = arguments[1];
        namedGraphs   = arguments[2];
    }
    this.engine.execute(queryString, callback, defaultGraphs, namedGraphs);
};

Store.Store.prototype.graph = function() {
    var graphUri = null;
    var callback = null;
    if(arguments.length === 1) {
        callback = arguments[0] || function(){};
        graphUri = this.engine.lexicon.defaultGraphUri;
    } else if(arguments.length === 2) {
        callback = arguments[1] || function(){};
        graphUri = arguments[0];
    } else {
        throw("An optional graph URI and a callback function must be provided");
    }

    if(this.rdf.resolve(graphUri) != null) {
        graphUri = this.rdf.resolve(graphUri);
    }

    this.engine.execute("CONSTRUCT { ?s ?p ?o } WHERE { GRAPH <" + graphUri + "> { ?s ?p ?o } }", callback);
};


Store.Store.prototype.node = function() {
     var graphUri = null;
    var callback = null;
    var nodeUri  = null;
    if(arguments.length === 2) {
        nodeUri = arguments[0];
        callback = arguments[1] || function(){};
        graphUri = this.engine.lexicon.defaultGraphUri;
    } else if(arguments.length === 3) {
        nodeUri = arguments[0];
        graphUri = arguments[1];
        callback = arguments[2] || function(){};
    } else {
        throw("An optional graph URI and a callback function must be provided");
    }

    if(this.rdf.resolve(graphUri) != null) {
        graphUri = this.rdf.resolve(graphUri);
    }

    if(this.rdf.resolve(nodeUri) != null) {
        nodeUri = this.rdf.resolve(nodeUri);
    }

    this.engine.execute("CONSTRUCT { <" + nodeUri + "> ?p ?o } WHERE { GRAPH <" + graphUri + "> { <" + nodeUri + "> ?p ?o } }", callback);
};

Store.Store.prototype.startObservingNode = function() {
    var uri, graphUri, callback;

    if(arguments.length === 2) {
        uri = arguments[0];
        callback = arguments[1];
        this.engine.callbacksBackend.observeNode(uri, callback, function(){});
    } else if(arguments.length === 3) {
        uri = arguments[0];
        graphUri = arguments[1];
        callback = arguments[2];
        this.engine.callbacksBackend.observeNode(uri, graphUri, callback, function(){});
    }
};

Store.Store.prototype.stopObservingNode = function(callback) {
    this.engine.callbacksBackend.stopObservingNode(callback);
};

Store.Store.prototype.startObservingQuery = function() {
    var query = arguments[0];
    var callback = arguments[1];
    var endCallback = arguments[2];
    if(endCallback!=null) {
        this.engine.callbacksBackend.observeQuery(query, callback, endCallback);
    } else {
        this.engine.callbacksBackend.observeQuery(query, callback, function(){});
    }
};

Store.Store.prototype.stopObservingQuery = function(query) {
    this.engine.callbacksBackend.stopObservingQuery(query);
};

Store.Store.prototype.subscribe = function(s, p, o, g, callback) {
    var adapterCb = function(event,triples){
        var acum = [];
        var queryEnv = {blanks:{}, outCache:{}};
        var bindings = [];

        for(var i=0; i<triples.length; i++) {
            var triple = triples[i];
            var s = RDFJSInterface.buildRDFResource(triple.subject,bindings,this.engine,queryEnv);
            var p = RDFJSInterface.buildRDFResource(triple.predicate,bindings,this.engine,queryEnv);
            var o = RDFJSInterface.buildRDFResource(triple.object,bindings,this.engine,queryEnv);
            if(s!=null && p!=null && o!=null) {
                triple = new RDFJSInterface.Triple(s,p,o);
                acum.push(triple);
            }
        }

        callback(event,acum);
    }

    this.functionMap[callback] = adapterCb;
    this.engine.callbacksBackend.subscribe(s,p,o,g,adapterCb,function(){});
};

Store.Store.prototype.unsubscribe = function(callback) {
    var adapterCb = this.functionMap[callback];
    this.engine.callbacksBackend.unsubscribe(adapterCb);
    delete this.functionMap[callback];
};

Store.Store.prototype.setPrefix = function(prefix, uri) {
    this.rdf.setPrefix(prefix, uri)
};

Store.Store.prototype.setDefaultPrefix = function(uri) {
    this.rdf.setDefaultPrefix(uri)
};

Store.Store.prototype.insert = function() {
    var graph;
    var triples;
    var callback;
    if(arguments.length === 1) {
        triples = arguments[0];
    } else if(arguments.length === 2) {
        graph = this.rdf.createNamedNode(this.engine.lexicon.defaultGraphUri);
        triples = arguments[0];
        callback= arguments[1] || function(){};
    } else if(arguments.length === 3) {
        triples = arguments[0];
        graph = this.rdf.createNamedNode(arguments[1]);
        callback= arguments[2] || function(){};
    } else {
        throw("The triples to insert, an optional graph and callback must be provided");
    }

    var query = "";
    var that = this;
    triples.forEach(function(triple) {
        query = query + that._nodeToQuery(triple.subject) + that._nodeToQuery(triple.predicate) + that._nodeToQuery(triple.object) + ".";
    });

    if(graph != null) {
        query = "INSERT DATA { GRAPH " + this._nodeToQuery(graph) +" { "+ query + " } }";
    } else {
        query = "INSERT DATA { " + this._nodeToQuery(graph) +" { "+ query + " }";
    }

    this.engine.execute(query, callback);
};

Store.Store.prototype._nodeToQuery = function(term) {
    if(term.interfaceName === 'NamedNode') {
        var resolvedUri = this.rdf.resolve(term.valueOf());
        if(resolvedUri != null) {
            return "<" + resolvedUri + ">";
        } else {
            return "<" + term.valueOf() + ">";
        }
    } else if(term.interfaceName === '') {
        return term.toString();
    } else {
        return term.toString();
    }
};

Store.Store.prototype.delete = function() {

    var graph;
    var triples;
    var callback;
    if(arguments.length === 1) {
        triples = arguments[0];
    } else if(arguments.length === 2) {
        graph = this.rdf.createNamedNode(this.engine.lexicon.defaultGraphUri);
        triples = arguments[0];
        callback= arguments[1] || function(){};
    } else if(arguments.length === 3) {
        triples = arguments[0];
        graph = this.rdf.createNamedNode(arguments[1]);
        callback= arguments[2] || function(){};
    } else {
        throw("The triples to delete, an optional graph and callback must be provided");
    }

    var query = "";
    var that = this;
    triples.forEach(function(triple) {
        query = query + that._nodeToQuery(triple.subject) + that._nodeToQuery(triple.predicate) + that._nodeToQuery(triple.object) + ".";
    });

    if(graph != null) {
        query = "DELETE DATA { GRAPH " + this._nodeToQuery(graph) +" { "+ query + " } }";
    } else {
        query = "DELETE DATA { " + this._nodeToQuery(graph) +" { "+ query + " }";
    }

    this.engine.execute(query, callback);
};

Store.Store.prototype.clear = function() {
    var graph;
    var callback;

    if(arguments.length === 1) {
        graph = this.rdf.createNamedNode(this.engine.lexicon.defaultGraphUri);
        callback= arguments[0] || function(){};
    } else if(arguments.length === 2) {
        graph = this.rdf.createNamedNode(arguments[0]);
        callback= arguments[1] || function(){};
    } else {
        throw("The optional graph and a callback must be provided");
    }

    var query = "CLEAR GRAPH " + this._nodeToQuery(graph);
    this.engine.execute(query, callback);
};


Store.Store.prototype.load = function(){
    var mediaType;
    var data;
    var graph;
    var callback;

    if(arguments.length === 3) {
        graph = this.rdf.createNamedNode(this.engine.lexicon.defaultGraphUri);
        mediaType = arguments[0];
        data = arguments[1];
        callback= arguments[2] || function(){};
    } else if(arguments.length === 4) {
        mediaType = arguments[0];
        data = arguments[1];
        graph = this.rdf.createNamedNode(arguments[2]);
        callback= arguments[3] || function(){};
    } else if(arguments.length === 2) {
        throw("The mediaType of the parser, the data a callback and an optional graph must be provided");
    }

    if(mediaType === 'remote') {
        data = this.rdf.createNamedNode(data);
        var query = "LOAD <"+data.valueOf()+"> INTO GRAPH <"+graph.valueOf()+">";

        this.engine.execute(query, callback);
    } else if(data && typeof(data)==='string' && data.indexOf('file://')=== 0) {
        var parser = this.engine.rdfLoader.parsers[mediaType];

        var that = this;
        this.engine.rdfLoader.loadFromFile(parser, {'token':'uri', 'value':graph.valueOf()}, data, function(success, quads) {
            if(success) {
                that.engine.batchLoad(quads,callback);
            } else {
                callback(success, quads);
            }
        });


    } else {
        var parser = this.engine.rdfLoader.parsers[mediaType];

        var that = this;

        this.engine.rdfLoader.tryToParse(parser, {'token':'uri', 'value':graph.valueOf()}, data, function(success, quads) {
            if(success) {
                that.engine.batchLoad(quads,callback);
            } else {
                callback(success, quads);
            }
        });
    }
};

Store.Store.prototype.registerParser = function(mediaType, parser) {
    this.engine.rdfLoader.registerParser(mediaType,parser);
};

/**
 * Returns the URI of all the graphs currently contained
 * in the store
 */
Store.Store.prototype.registeredGraphs = function(callback) {
    var graphs = this.engine.lexicon.registeredGraphs(true);
    var acum = [];
    for(var i=0; i<graphs.length; i++) {
        var graph = graphs[i];
        var uri = new RDFJSInterface.NamedNode(graph);
        acum.push(uri);
    }

    return callback(true, acum);    
};

Store.Store.prototype._nodeToQuery = function(term) {
    if(term.interfaceName === 'NamedNode') {
        var resolvedUri = this.rdf.resolve(term.valueOf());
        if(resolvedUri != null) {
            return "<" + resolvedUri + ">";
        } else {
            return "<" + term.valueOf() + ">";
        }
    } else if(term.interfaceName === '') {
        return term.toString();
    } else {
        return term.toString();
    }
};

/**
 * Returns the current network transport being used by the
 * the store.
 */
Store.Store.prototype.getNetworkTransport = function() {
    return NetworkTransport;
};

/**
 * Sets the network transport used by the store;
 */
Store.Store.prototype.setNetworkTransport = function(networkTransportImpl) {
    NetworkTransport = networkTransportImpl;
};
