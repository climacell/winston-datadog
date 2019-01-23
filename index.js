/**
 * winston-datadog
 * @imports http
 * @imports https
 */

"use strict";

const hostname = require('os').hostname();
const util = require('util');
const format = util.format;
const qs = require('querystring');
const Transport = require('winston-transport');

class DatadogTransport extends Transport { //jshint ignore:line
    /**
     * @constructor Transport
     * @params {object} credentials
     * @example
     * new Transport({
     *   api_key: ...,
     *   application_key: ...
     * });
     */
    constructor(options) {
        super(options)
        var api = this;
        const credentials = {
            api_key: options.api_key,
            application_key: options.application_key
        }; 
        if (options.minimum_log_level) {
            const i = api.allowed_loglevels.indexOf(options.minimum_log_level);
            api.allowed_loglevels = api.allowed_loglevels.slice(i, api.allowed_loglevels.length);
        }
        var paths = DatadogTransport.API_ENDPOINT.split('/').filter(Boolean);
        api.name = 'Datadog';
        api.attachResults = false;
        //set to true to force transport to use text in place of the title
        api.useTextAsTitle = false;
        api.requestOptions = {
            port: paths[0] === 'https:' ? 443 : 80,
            hostname: paths[1],
            path: format('/%s/v%d/events?%s',
                    paths[2],
                    DatadogTransport.API_VERSION,
                    qs.stringify(credentials)),
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        };
        var protocol = api.requestOptions.port === 443 ? require('https') : require('http');
        api.request = protocol.request;
        api.options = new api.Options();
    }

    /**
     * Sets the winston logger to use for DatadogResult event
     */
    receiveResults(logger) {
        var api = this;
        api.attachResults = true;
        if (logger) {
            api.logger = logger;
        }
    }

    /**
     * Sets the winston logger to use for DatadogResult event
     */
    stopResults() {
       this.attachResults = false;
    }

    /**
     * Sets the winston logger to use for DatadogResult event
     */
    resetOptions() {
       var api = this;
       api.options = new api.Options();
    }

    /**
     * Log events from winston
     */
    log(loglevel, text, data, callback) {
        var api = this;
        if (api.loglevels[loglevel]) {
            loglevel = api.loglevels[loglevel];
        }
        if (!api.allowed_loglevels.includes(loglevel)) {
            return;
        }
        var req = api.request(api.requestOptions, (res) => {
            var data = '';
            res.on('data', (buffer) => {
                data += buffer;
            });
            res.on('end', () => {
                if (api.attachResults) {
                    try {
                        res.body = JSON.parse(data);
                        api.logger.emit('DatadogResult', res);
                    } catch (e) {
                        console.error('Failed to emit DatadogResult event', e);
                    }
                }
                callback();
            });
        });
        var opts = api.options;
        opts.alert_type = loglevel;

        if (api.useTextAsTitle) {
            opts.title = text;
        }

        //efficient way to check if object is empty or error
        if (data instanceof Error) {
            opts.text = text + (text.length ? ' | ' + data.stack : data.stack);
        } else {
            var prop;
            for (prop in data) {
                opts.text = text + (text.length ? ' | ' + JSON.stringify(data) : JSON.stringify(data));
                break;
            }
        }
        if (!opts.text) {
            opts.text = text;
        }
        if (opts.text.length > 4000) {
            opts.text = opts.text.substr(0, 4000);
        }

        req.on('error', (e) => {	
            console.error(e);	
        });
        req.write(JSON.stringify(opts));
        req.end();
        opts.text = null;
        delete opts.text;
    }
}

DatadogTransport.API_VERSION = 1;
DatadogTransport.API_ENDPOINT = 'https://api.datadoghq.com/api/';
/**
 * overrides for winston logging levels
 */
DatadogTransport.prototype.loglevels = {
    silly: 'info',
    debug: 'info',
    verbose: 'info',
    warn: 'warning'
};

DatadogTransport.prototype.allowed_loglevels = [
    'silly', 
    'debug', 
    'verbose', 
    'info', 
    'warning', 
    'error', 
    'severe', 
    'none'
];

/**
 * Exposes endpoint options for Data-Dog
 * @const
 */
class TransportOptions {
    constructor() {
        var opts = this;
        return {
            title: opts.title,
            priority: opts.priority,
            date_happened: opts.date_happened,
            host: opts.host,
            tags: opts.tags.slice(0),
            alert_type: opts.alert_type,
            aggregation_key: opts.aggregation_key,
            source_type_name: opts.source_type_name
        };
    }
}
TransportOptions.prototype.title = 'LOG';
TransportOptions.prototype.priority = 'normal'; // or low
TransportOptions.prototype.date_happened = null;
TransportOptions.prototype.host = hostname;
TransportOptions.prototype.tags = [
    'env:' + (process.env.NODE_ENV || 'local')
];
TransportOptions.prototype.alert_type = 'warning'; // or error; warning; success
TransportOptions.prototype.aggregation_key = null; //arbitrary value
TransportOptions.prototype.source_type_name = null; // options = nagios; hudson; jenkins; user; my apps; feed; chef; puppet; git; bitbucket; fabric; capistrano

//expose Transport options
DatadogTransport.prototype.Options = TransportOptions;

module.exports = DatadogTransport;
