/*
 * gdrive.js — Google Drive 동기화 (Google Identity Services + Drive REST)
 * window.IBDrive 로 노출.
 *
 * 서버 없는 클라이언트 전용 구현. 검증이 필요 없는 drive.file 스코프를 사용해
 * "이 앱이 만든 파일"만 접근한다(사용자 Drive의 다른 파일은 볼 수 없음).
 * 백업 파일: infinite-buying-backup.json (사용자 본인 Drive에 저장).
 */
(function (root) {
  'use strict';

  var SCOPE = 'https://www.googleapis.com/auth/drive.file';
  var FILE_NAME = 'infinite-buying-backup.json';

  var clientId = '';
  var tokenClient = null;
  var accessToken = '';
  var tokenExp = 0;
  var fileId = null;
  var pending = null;

  function gisReady() {
    return typeof google !== 'undefined' && google.accounts && google.accounts.oauth2;
  }

  function loadGis() {
    return new Promise(function (res, rej) {
      if (gisReady()) return res();
      var existing = document.getElementById('gis-script');
      if (existing) { existing.addEventListener('load', function () { res(); }); return; }
      var s = document.createElement('script');
      s.id = 'gis-script';
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true; s.defer = true;
      s.onload = function () { res(); };
      s.onerror = function () { rej(new Error('Google 스크립트를 불러오지 못했습니다.')); };
      document.head.appendChild(s);
    });
  }

  function init(cid) {
    clientId = (cid || '').trim();
    if (!clientId) return Promise.reject(new Error('Google Client ID가 필요합니다.'));
    return loadGis().then(function () {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: function (resp) {
          if (resp && resp.access_token) {
            accessToken = resp.access_token;
            tokenExp = Date.now() + ((parseInt(resp.expires_in, 10) || 3600) * 1000) - 60000;
            if (pending) { pending.resolve(accessToken); pending = null; }
          } else if (pending) {
            pending.reject(new Error('토큰을 받지 못했습니다.')); pending = null;
          }
        },
        error_callback: function (err) {
          if (pending) {
            pending.reject(new Error((err && err.type) || '인증이 취소되었습니다.'));
            pending = null;
          }
        }
      });
    });
  }

  function getToken(interactive) {
    if (accessToken && Date.now() < tokenExp) return Promise.resolve(accessToken);
    if (!tokenClient) return Promise.reject(new Error('먼저 연결(초기화)이 필요합니다.'));
    return new Promise(function (res, rej) {
      pending = { resolve: res, reject: rej };
      try {
        tokenClient.requestAccessToken(interactive ? {} : { prompt: '' });
      } catch (e) { pending = null; rej(e); }
    });
  }

  // 인증 헤더를 붙여 요청. 401이면 대화형으로 토큰 갱신 후 1회 재시도.
  function api(url, opts, interactive) {
    opts = opts || {};
    return getToken(interactive).then(function (tok) {
      var o = cloneOpts(opts, tok);
      return fetch(url, o).then(function (r) {
        if (r.status === 401 && !interactive) {
          accessToken = ''; tokenExp = 0;
          return getToken(true).then(function (tok2) {
            return fetch(url, cloneOpts(opts, tok2));
          });
        }
        return r;
      });
    });
  }

  function cloneOpts(opts, tok) {
    var headers = {};
    for (var k in (opts.headers || {})) headers[k] = opts.headers[k];
    headers.Authorization = 'Bearer ' + tok;
    return { method: opts.method || 'GET', headers: headers, body: opts.body };
  }

  function findFile() {
    if (fileId) return Promise.resolve(fileId);
    var q = encodeURIComponent("name='" + FILE_NAME + "' and trashed=false");
    var url = 'https://www.googleapis.com/drive/v3/files?q=' + q +
      '&spaces=drive&fields=files(id,modifiedTime)&orderBy=modifiedTime desc';
    return api(url).then(function (r) {
      if (!r.ok) throw new Error('Drive 조회 실패 (' + r.status + ')');
      return r.json();
    }).then(function (d) {
      fileId = (d.files && d.files.length) ? d.files[0].id : null;
      return fileId;
    });
  }

  function backup(dataObj) {
    var content = JSON.stringify(dataObj);
    return findFile().then(function (id) {
      if (id) {
        return api('https://www.googleapis.com/upload/drive/v3/files/' + id + '?uploadType=media',
          { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: content })
          .then(function (r) { if (!r.ok) throw new Error('Drive 저장 실패 (' + r.status + ')'); return { id: id }; });
      }
      var boundary = 'ib' + Date.now();
      var meta = { name: FILE_NAME, mimeType: 'application/json' };
      var body = '--' + boundary +
        '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) +
        '\r\n--' + boundary +
        '\r\nContent-Type: application/json\r\n\r\n' + content +
        '\r\n--' + boundary + '--';
      return api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
        { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body: body })
        .then(function (r) { if (!r.ok) throw new Error('Drive 생성 실패 (' + r.status + ')'); return r.json(); })
        .then(function (d) { fileId = d.id; return d; });
    });
  }

  function restore() {
    return findFile().then(function (id) {
      if (!id) return null;
      return api('https://www.googleapis.com/drive/v3/files/' + id + '?alt=media')
        .then(function (r) { if (!r.ok) throw new Error('Drive 불러오기 실패 (' + r.status + ')'); return r.json(); });
    });
  }

  // Client ID로 초기화 후 토큰을 대화형으로 획득(로그인).
  function connect() {
    return init(clientId || IBDriveClientIdGetter()).then(function () {
      return getToken(true);
    });
  }

  function setClientId(cid) { clientId = (cid || '').trim(); fileId = null; }
  function isConnected() { return !!accessToken && Date.now() < tokenExp; }
  function signOut() {
    if (accessToken && gisReady() && google.accounts.oauth2.revoke) {
      try { google.accounts.oauth2.revoke(accessToken); } catch (e) {}
    }
    accessToken = ''; tokenExp = 0; fileId = null;
  }
  function IBDriveClientIdGetter() { return clientId; }

  root.IBDrive = {
    setClientId: setClientId,
    init: init,
    connect: connect,
    backup: backup,
    restore: restore,
    isConnected: isConnected,
    signOut: signOut,
    FILE_NAME: FILE_NAME
  };
})(typeof window !== 'undefined' ? window : this);
