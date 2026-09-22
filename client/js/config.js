define(function() {
    var endpoint = { host: window.location.hostname, port: window.location.port, dispatcher: false };
    return { dev: endpoint, build: endpoint, local: endpoint };
});
