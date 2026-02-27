/* ============================================================
   ws-progress.js  —  WebSocket live query progress client
   Provides real-time step updates during query execution.
   ============================================================ */

var QueryProgress = (function () {
  var _ws = null;
  var _sessionId = null;
  var _callbacks = [];
  var _reconnectTimer = null;
  var _pingTimer = null;
  var _connected = false;

  function _generateId() {
    return "s_" + Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
  }

  function getSessionId() {
    if (!_sessionId) {
      _sessionId = _generateId();
    }
    return _sessionId;
  }

  function _getWsUrl() {
    var loc = window.location;
    var proto = loc.protocol === "https:" ? "wss:" : "ws:";
    var base = (typeof API_BASE !== "undefined" && API_BASE) ? API_BASE : "";
    if (base && base.indexOf("http") === 0) {
      base = base.replace(/^http/, "ws");
      return base + "/ws/progress/" + getSessionId();
    }
    return proto + "//" + loc.host + "/ws/progress/" + getSessionId();
  }

  function connect() {
    if (_ws && (_ws.readyState === WebSocket.OPEN || _ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      _ws = new WebSocket(_getWsUrl());
    } catch (e) {
      return;
    }

    _ws.onopen = function () {
      _connected = true;
      _startPing();
    };

    _ws.onmessage = function (evt) {
      try {
        var data = JSON.parse(evt.data);
        if (data.type === "progress") {
          _callbacks.forEach(function (fn) {
            try { fn(data); } catch (e) { /* ignore */ }
          });
        }
      } catch (e) { /* ignore */ }
    };

    _ws.onclose = function () {
      _connected = false;
      _stopPing();
      _scheduleReconnect();
    };

    _ws.onerror = function () {
      // onclose will fire after this
    };
  }

  function _scheduleReconnect() {
    if (_reconnectTimer) return;
    _reconnectTimer = setTimeout(function () {
      _reconnectTimer = null;
      connect();
    }, 3000);
  }

  function _startPing() {
    _stopPing();
    _pingTimer = setInterval(function () {
      if (_ws && _ws.readyState === WebSocket.OPEN) {
        try { _ws.send("ping"); } catch (e) { /* ignore */ }
      }
    }, 30000);
  }

  function _stopPing() {
    if (_pingTimer) {
      clearInterval(_pingTimer);
      _pingTimer = null;
    }
  }

  function onProgress(fn) {
    if (typeof fn === "function") {
      _callbacks.push(fn);
    }
  }

  function isConnected() {
    return _connected;
  }

  return {
    connect: connect,
    onProgress: onProgress,
    getSessionId: getSessionId,
    isConnected: isConnected,
  };
})();
