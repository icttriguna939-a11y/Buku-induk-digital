/* ═══════════════════════════════════════════════════════════════
   gas-bridge.js — pengganti google.script.run untuk frontend di luar Apps Script
   Semua pemanggilan  google.script.run.withSuccessHandler(..).withFailureHandler(..).namaFungsi(args)
   diteruskan lewat fetch POST ke backend Apps Script (Api_Backend.gs → doPost).
   Kode aplikasi TIDAK perlu diubah.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var CFG = window.APP_CONFIG || {};
  var TIMEOUT_MS = CFG.TIMEOUT_MS || 6 * 60 * 1000; // batas Apps Script 6 menit

  function muatLazy(nama) {
    if (!/^[A-Za-z0-9_]+$/.test(nama)) return Promise.reject(new Error('Nama modul tidak valid: ' + nama));
    return fetch('lazy/' + nama + '.js', { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('Modul ' + nama + ' tidak ditemukan (' + r.status + ')');
      return r.text();
    });
  }

  function panggilServer(fn, args) {
    if (fn === 'getLazyScript') return muatLazy(String(args[0]));
    if (!CFG.GAS_URL || /XXXX/.test(CFG.GAS_URL)) return Promise.reject(new Error('GAS_URL belum diisi di config.js'));
    var ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, TIMEOUT_MS) : null;
    return fetch(CFG.GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // text/plain → tanpa preflight CORS
      body: JSON.stringify({ fn: fn, args: args }),
      redirect: 'follow',
      signal: ctl ? ctl.signal : undefined
    }).then(function (r) { return r.text(); }).then(function (txt) {
      var j;
      try { j = JSON.parse(txt); } catch (e) { throw new Error('Respons server tidak valid. Pastikan GAS_URL benar dan akses deployment = "Siapa saja".'); }
      if (!j.ok) throw new Error(j.error || 'Terjadi kesalahan di server');
      return j.result;
    }).catch(function (e) {
      if (e && e.name === 'AbortError') throw new Error('Waktu tunggu server habis.');
      throw e;
    }).then(function (v) { if (timer) clearTimeout(timer); return v; }, function (e) { if (timer) clearTimeout(timer); throw e; });
  }

  function buatRunner(onOk, onFail, userObj) {
    return new Proxy({}, {
      get: function (_, prop) {
        if (prop === 'withSuccessHandler') return function (f) { return buatRunner(f, onFail, userObj); };
        if (prop === 'withFailureHandler') return function (f) { return buatRunner(onOk, f, userObj); };
        if (prop === 'withUserObject') return function (o) { return buatRunner(onOk, onFail, o); };
        if (typeof prop !== 'string') return undefined;
        return function () {
          var args = Array.prototype.slice.call(arguments);
          panggilServer(prop, args).then(function (hasil) {
            if (onOk) onOk(hasil, userObj);
          }, function (err) {
            if (onFail) onFail(err, userObj); else console.error('[gas-bridge] ' + prop + ':', err);
          });
        };
      }
    });
  }

  window.google = window.google || {};
  window.google.script = {
    run: buatRunner(null, null, undefined),
    host: { close: function () {}, setHeight: function () {}, setWidth: function () {}, origin: location.origin },
    history: { push: function () {}, replace: function () {}, setChangeHandler: function () {} }
  };
})();
