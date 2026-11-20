(function (global) {
  'use strict';

  var STORAGE_MIN_CLIENT_VERSION = 9460;
  var WINDOW_INFO_MIN_CLIENT_VERSION = 9490;
  var CAPSULE_AVOIDANCE_MIN_CLIENT_VERSION = 9550;
  var VIBRATE_MIN_CLIENT_VERSION = 9500;
  var GYROSCOPE_MIN_CLIENT_VERSION = 9500;
  var SAVE_IMAGE_MIN_CLIENT_VERSION = 9420;
  var COMMENT_MIN_CLIENT_VERSION = 9490;
  var SHARE_MIN_CLIENT_VERSION = 9530;

  var VIBRATE_THROTTLE_MS = 45;
  var POST_NOTE_TITLE_MAX = 20;
  var POST_NOTE_CONTENT_MAX = 1000;
  var SNAPSHOT_MAX_UTF8_BYTES = 2048;

  var bridgeState = {
    initialized: false,
    xhsRef: null,
    miniToolRef: null,
    buildVersion: null,
    clientVersion: null,
    inContainer: false,
    launchOptions: null,
    capabilities: createEmptyCapabilities()
  };

  var activeInitPromise = null;
  var pendingInitXhsRef = null;
  var lastVibrateAt = -1;
  var gyroQueue = Promise.resolve();
  var sharePending = false;

  function createEmptyCapabilities() {
    return {
      storage: false,
      windowInfo: false,
      capsuleAvoidance: false,
      vibrate: false,
      gyroscope: false,
      saveImage: false,
      writeTempFile: false,
      postNote: false,
      comment: false,
      share: false
    };
  }

  function hasMethod(obj, name) {
    return !!obj && typeof obj[name] === 'function';
  }

  function readBuildVersion(launchOptions) {
    var miniToolEnv = launchOptions && launchOptions.miniToolEnv;
    var value = miniToolEnv && miniToolEnv.buildVersion;
    if (typeof value !== 'number' && typeof value !== 'string') {
      return null;
    }
    if (!/^[1-9]\d{6,}$/.test(String(value))) {
      return null;
    }
    var version = Number(value);
    return Number.isSafeInteger(version) ? version : null;
  }

  function getClientVersion(buildVersion) {
    return Number.isSafeInteger(buildVersion) && buildVersion > 0
      ? Math.floor(buildVersion / 1000)
      : null;
  }

  function isClientVersionAtLeast(buildVersion, minimumClientVersion) {
    var clientVersion = getClientVersion(buildVersion);
    return clientVersion !== null && clientVersion >= minimumClientVersion;
  }

  async function resolveLaunchContext() {
    var xhs = global.xhs;
    var miniTool = (xhs && xhs.miniTool) || null;
    var syncLaunchOptions = (xhs && xhs.launchOptions) || null;
    var syncBuildVersion = readBuildVersion(syncLaunchOptions);

    if (syncBuildVersion !== null) {
      return {
        xhsRef: xhs || null,
        miniTool: miniTool,
        launchOptions: syncLaunchOptions,
        buildVersion: syncBuildVersion
      };
    }

    if (!hasMethod(miniTool, 'getLaunchOptions')) {
      return {
        xhsRef: xhs || null,
        miniTool: miniTool,
        launchOptions: syncLaunchOptions,
        buildVersion: null
      };
    }

    try {
      var asyncLaunchOptions = await miniTool.getLaunchOptions();
      var mergedLaunchOptions = asyncLaunchOptions || syncLaunchOptions || null;
      return {
        xhsRef: xhs || null,
        miniTool: miniTool,
        launchOptions: mergedLaunchOptions,
        buildVersion: readBuildVersion(mergedLaunchOptions)
      };
    } catch (error) {
      console.warn('getLaunchOptions failed; client version remains unknown');
      return {
        xhsRef: xhs || null,
        miniTool: miniTool,
        launchOptions: syncLaunchOptions,
        buildVersion: null
      };
    }
  }

  async function getBuildVersion() {
    var context = await resolveLaunchContext();
    return context.buildVersion;
  }

  function computeCapabilities(buildVersion, miniTool) {
    return {
      storage: isClientVersionAtLeast(buildVersion, STORAGE_MIN_CLIENT_VERSION) &&
        hasMethod(miniTool, 'setStorage') &&
        hasMethod(miniTool, 'getStorage'),
      windowInfo: isClientVersionAtLeast(buildVersion, WINDOW_INFO_MIN_CLIENT_VERSION) &&
        hasMethod(miniTool, 'getWindowInfo'),
      capsuleAvoidance: isClientVersionAtLeast(buildVersion, CAPSULE_AVOIDANCE_MIN_CLIENT_VERSION) &&
        hasMethod(miniTool, 'getWindowInfo'),
      vibrate: isClientVersionAtLeast(buildVersion, VIBRATE_MIN_CLIENT_VERSION) &&
        hasMethod(miniTool, 'vibrateShort'),
      gyroscope: isClientVersionAtLeast(buildVersion, GYROSCOPE_MIN_CLIENT_VERSION) &&
        hasMethod(miniTool, 'startGyroscope') &&
        hasMethod(miniTool, 'stopGyroscope') &&
        hasMethod(miniTool, 'onGyroscopeChange') &&
        hasMethod(miniTool, 'offGyroscopeChange'),
      saveImage: isClientVersionAtLeast(buildVersion, SAVE_IMAGE_MIN_CLIENT_VERSION) &&
        hasMethod(miniTool, 'saveImageToPhotosAlbum'),
      writeTempFile: !!miniTool && hasMethod(miniTool, 'writeTempFile'),
      postNote: !!miniTool && hasMethod(miniTool, 'postNote'),
      comment: isClientVersionAtLeast(buildVersion, COMMENT_MIN_CLIENT_VERSION) &&
        hasMethod(miniTool, 'interactionOpenApi') &&
        hasMethod(miniTool, 'writeTempFile'),
      share: isClientVersionAtLeast(buildVersion, SHARE_MIN_CLIENT_VERSION) &&
        hasMethod(miniTool, 'share')
    };
  }

  function snapshotPublicState() {
    return {
      buildVersion: bridgeState.buildVersion,
      clientVersion: bridgeState.clientVersion,
      inContainer: bridgeState.inContainer,
      capabilities: Object.assign({}, bridgeState.capabilities)
    };
  }

  async function runInit() {
    var context = await resolveLaunchContext();
    var buildVersion = context.buildVersion;
    var clientVersion = getClientVersion(buildVersion);
    var inContainer = !!(context.xhsRef && context.miniTool);
    var capabilities = computeCapabilities(buildVersion, context.miniTool);

    bridgeState.initialized = true;
    bridgeState.xhsRef = context.xhsRef;
    bridgeState.miniToolRef = context.miniTool;
    bridgeState.buildVersion = buildVersion;
    bridgeState.clientVersion = clientVersion;
    bridgeState.inContainer = inContainer;
    bridgeState.launchOptions = context.launchOptions;
    bridgeState.capabilities = capabilities;

    return snapshotPublicState();
  }

  function init() {
    var currentXhs = global.xhs || null;
    if (activeInitPromise && pendingInitXhsRef === currentXhs) {
      return activeInitPromise;
    }

    pendingInitXhsRef = currentXhs;
    var task = runInit();
    activeInitPromise = task;

    function clearPending() {
      if (activeInitPromise === task) {
        activeInitPromise = null;
        pendingInitXhsRef = null;
      }
    }

    task.then(clearPending, clearPending);
    return task;
  }

  async function ensureReady() {
    var currentXhs = global.xhs || null;
    var currentMiniTool = (currentXhs && currentXhs.miniTool) || null;
    if (
      bridgeState.initialized &&
      bridgeState.xhsRef === currentXhs &&
      bridgeState.miniToolRef === currentMiniTool
    ) {
      return bridgeState;
    }
    await init();
    return bridgeState;
  }

  function getMiniTool() {
    return (global.xhs && global.xhs.miniTool) || null;
  }

  function isVisibleRect(rect) {
    return !!rect &&
      typeof rect.width === 'number' && Number.isFinite(rect.width) && rect.width > 0 &&
      typeof rect.height === 'number' && Number.isFinite(rect.height) && rect.height > 0;
  }

  function getRectBottom(rect) {
    if (typeof rect.bottom === 'number' && Number.isFinite(rect.bottom)) {
      return rect.bottom;
    }
    if (
      typeof rect.top === 'number' && Number.isFinite(rect.top) &&
      typeof rect.height === 'number' && Number.isFinite(rect.height)
    ) {
      return rect.top + rect.height;
    }
    return 0;
  }

  function applyTopInsetFromWindowInfo(info) {
    if (!info || typeof info !== 'object') {
      return;
    }
    var menuButtons = info.menuButtons || {};
    var capsule = menuButtons.capsule;
    var buttonRects = isVisibleRect(capsule)
      ? [capsule]
      : [menuButtons.back, menuButtons.me, menuButtons.share].filter(isVisibleRect);
    var safeTop = (info.safeArea && typeof info.safeArea.top === 'number' && Number.isFinite(info.safeArea.top))
      ? info.safeArea.top
      : 0;
    var contentTop = buttonRects.reduce(function (top, rect) {
      var bottom = getRectBottom(rect);
      return bottom > top ? bottom : top;
    }, safeTop);

    if (typeof document !== 'undefined' && document.documentElement && document.documentElement.style) {
      document.documentElement.style.setProperty('--content-top', (contentTop + 8) + 'px');
    }
  }

  async function applyWindowLayout() {
    var xhs = global.xhs;
    var snapshotInfo = (
      xhs &&
      xhs.launchOptions &&
      xhs.launchOptions.miniToolEnv &&
      xhs.launchOptions.miniToolEnv.windowInfo
    ) || null;

    if (snapshotInfo && typeof snapshotInfo === 'object') {
      applyTopInsetFromWindowInfo(snapshotInfo);
    }

    await ensureReady();

    if (
      !snapshotInfo &&
      bridgeState.launchOptions &&
      bridgeState.launchOptions.miniToolEnv &&
      bridgeState.launchOptions.miniToolEnv.windowInfo
    ) {
      snapshotInfo = bridgeState.launchOptions.miniToolEnv.windowInfo;
      if (snapshotInfo && typeof snapshotInfo === 'object') {
        applyTopInsetFromWindowInfo(snapshotInfo);
      }
    }

    var miniTool = getMiniTool();
    if (!bridgeState.capabilities.windowInfo || !miniTool) {
      return snapshotInfo || null;
    }

    try {
      var measured = await miniTool.getWindowInfo();
      if (measured && typeof measured === 'object') {
        applyTopInsetFromWindowInfo(measured);
        return measured;
      }
      return snapshotInfo || null;
    } catch (error) {
      console.warn('getWindowInfo failed:', getErrorMessage(error));
      return snapshotInfo || null;
    }
  }

  function isApiFailResult(res) {
    return !!res && typeof res.errMsg === 'string' && res.errMsg.indexOf(':fail') !== -1;
  }

  function getErrorMessage(err) {
    if (!err) {
      return '';
    }
    if (typeof err === 'string') {
      return err;
    }
    if (typeof err.errMsg === 'string' && err.errMsg) {
      return err.errMsg;
    }
    if (typeof err.message === 'string' && err.message) {
      return err.message;
    }
    return '';
  }

  function getErrorCode(err) {
    if (err && typeof err.errCode === 'number' && Number.isFinite(err.errCode)) {
      return err.errCode;
    }
    return null;
  }

  async function loadState(key) {
    await ensureReady();

    if (!bridgeState.capabilities.storage) {
      return { ok: false, data: null, reason: 'unavailable' };
    }
    if (typeof key !== 'string' || !key) {
      return { ok: false, data: null, reason: 'error' };
    }

    var miniTool = getMiniTool();
    if (!miniTool) {
      return { ok: false, data: null, reason: 'unavailable' };
    }

    try {
      var res = await miniTool.getStorage({ key: key });
      if (!res || typeof res !== 'object' || isApiFailResult(res)) {
        return { ok: false, data: null, reason: 'error' };
      }
      if (res.data === null || res.data === undefined) {
        return { ok: true, data: null, reason: 'empty' };
      }
      if (typeof res.data !== 'string') {
        return { ok: false, data: null, reason: 'error' };
      }
      var parsed = JSON.parse(res.data);
      return { ok: true, data: parsed, reason: 'ok' };
    } catch (error) {
      return { ok: false, data: null, reason: 'error' };
    }
  }

  async function saveState(key, value) {
    await ensureReady();

    if (!bridgeState.capabilities.storage) {
      return { ok: false, reason: 'unavailable' };
    }
    if (typeof key !== 'string' || !key) {
      return { ok: false, reason: 'error' };
    }

    var serialized;
    try {
      serialized = JSON.stringify(value);
    } catch (serializeErr) {
      return { ok: false, reason: 'error' };
    }
    if (typeof serialized !== 'string') {
      return { ok: false, reason: 'error' };
    }

    var miniTool = getMiniTool();
    if (!miniTool) {
      return { ok: false, reason: 'unavailable' };
    }

    try {
      var res = await miniTool.setStorage({ key: key, data: serialized });
      if (res && res.errMsg === 'setStorage:ok') {
        return { ok: true, reason: 'ok' };
      }
      return { ok: false, reason: 'error' };
    } catch (error) {
      return { ok: false, reason: 'error' };
    }
  }

  async function vibrate(type) {
    await ensureReady();

    if (!bridgeState.capabilities.vibrate) {
      return false;
    }

    var miniTool = getMiniTool();
    if (!miniTool) {
      return false;
    }

    var vibrateType = (type === 'light' || type === 'medium' || type === 'heavy')
      ? type
      : 'medium';

    var now = Date.now();
    if (lastVibrateAt >= 0 && now - lastVibrateAt < VIBRATE_THROTTLE_MS) {
      return false;
    }
    lastVibrateAt = now;

    try {
      var res = await miniTool.vibrateShort({ type: vibrateType });
      return !isApiFailResult(res);
    } catch (error) {
      return false;
    }
  }

  function enqueueGyroOp(task) {
    var run = gyroQueue.then(function () {
      return task();
    }, function () {
      return task();
    });
    gyroQueue = run.then(function () {}, function () {});
    return run;
  }

  function startGyroscope(onFrame, interval) {
    if (typeof onFrame !== 'function') {
      return Promise.resolve({
        ok: false,
        code: null,
        message: '陀螺仪监听回调无效'
      });
    }

    var safeInterval = (interval === 'normal' || interval === 'ui') ? interval : 'ui';

    return enqueueGyroOp(async function () {
      await ensureReady();

      if (!bridgeState.inContainer) {
        return {
          ok: false,
          code: null,
          message: '当前不在小红书 App 容器内，暂不支持陀螺仪，可使用点击或自动敲击'
        };
      }
      if (!isClientVersionAtLeast(bridgeState.buildVersion, GYROSCOPE_MIN_CLIENT_VERSION)) {
        return {
          ok: false,
          code: null,
          message: '当前客户端版本低于 9.50（或版本未知），暂不支持陀螺仪，可使用点击敲击'
        };
      }
      if (!bridgeState.capabilities.gyroscope) {
        return {
          ok: false,
          code: null,
          message: '当前环境未开放陀螺仪能力，可使用点击敲击'
        };
      }

      var miniTool = getMiniTool();
      if (!miniTool) {
        return {
          ok: false,
          code: null,
          message: '当前环境未开放陀螺仪能力，可使用点击敲击'
        };
      }

      try {
        miniTool.onGyroscopeChange(onFrame);
        var res = await miniTool.startGyroscope({ interval: safeInterval });
        if (isApiFailResult(res)) {
          throw res;
        }
        return {
          ok: true,
          code: null,
          message: '陀螺仪已开启'
        };
      } catch (error) {
        try {
          miniTool.offGyroscopeChange(onFrame);
        } catch (offErr) {
          // ignore cleanup failure
        }
        var code = getErrorCode(error);
        if (code === 10002) {
          return {
            ok: false,
            code: 10002,
            message: '当前设备不支持陀螺仪，可使用点击敲击'
          };
        }
        var errMsg = getErrorMessage(error);
        return {
          ok: false,
          code: code,
          message: errMsg ? ('陀螺仪启动失败：' + errMsg) : '陀螺仪启动失败，可使用点击敲击'
        };
      }
    });
  }

  function stopGyroscope(onFrame) {
    return enqueueGyroOp(async function () {
      await ensureReady();

      var miniTool = getMiniTool();
      if (!bridgeState.capabilities.gyroscope || !miniTool) {
        return;
      }

      try {
        await miniTool.stopGyroscope();
      } catch (error) {
        console.warn('stopGyroscope failed:', getErrorMessage(error));
      } finally {
        try {
          if (typeof onFrame === 'function') {
            miniTool.offGyroscopeChange(onFrame);
          } else if (typeof onFrame === 'undefined') {
            miniTool.offGyroscopeChange();
          }
        } catch (offErr) {
          // ignore cleanup failure
        }
      }
    });
  }

  function exportCanvasDataUrl(canvas) {
    if (!canvas || typeof canvas.toDataURL !== 'function') {
      return null;
    }
    try {
      var dataUrl = canvas.toDataURL('image/png');
      if (typeof dataUrl !== 'string' || dataUrl.indexOf('data:image/') !== 0) {
        return null;
      }
      return dataUrl;
    } catch (error) {
      return null;
    }
  }

  async function writeCanvasTempFile(miniTool, dataUrl) {
    var tempRes = await miniTool.writeTempFile({ data: dataUrl });
    if (isApiFailResult(tempRes)) {
      throw tempRes;
    }
    if (!tempRes || typeof tempRes.filePath !== 'string' || !tempRes.filePath) {
      throw new Error('临时文件路径无效');
    }
    return tempRes.filePath;
  }

  async function saveCanvasToAlbum(canvas) {
    await ensureReady();

    if (!bridgeState.capabilities.saveImage) {
      return {
        ok: false,
        message: bridgeState.inContainer
          ? '当前客户端版本暂不支持保存相册（需 9.42 及以上）'
          : '请在小红书 App 内保存功德卡到相册'
      };
    }

    var miniTool = getMiniTool();
    if (!miniTool) {
      return { ok: false, message: '请在小红书 App 内保存功德卡到相册' };
    }

    var dataUrl = exportCanvasDataUrl(canvas);
    if (!dataUrl) {
      return { ok: false, message: '生成功德卡图片失败' };
    }

    var filePath = dataUrl;
    if (bridgeState.capabilities.writeTempFile) {
      try {
        filePath = await writeCanvasTempFile(miniTool, dataUrl);
      } catch (tempErr) {
        var tempMsg = getErrorMessage(tempErr);
        return {
          ok: false,
          message: tempMsg ? ('生成临时图片失败：' + tempMsg) : '生成临时图片失败'
        };
      }
    }

    try {
      var res = await miniTool.saveImageToPhotosAlbum({ filePath: filePath });
      if (isApiFailResult(res)) {
        throw res;
      }
      return { ok: true, message: '已保存功德卡到系统相册' };
    } catch (error) {
      var errMsg = getErrorMessage(error);
      var lower = errMsg.toLowerCase();
      if (
        lower.indexOf('auth') !== -1 ||
        lower.indexOf('deny') !== -1 ||
        lower.indexOf('permission') !== -1 ||
        errMsg.indexOf('权限') !== -1 ||
        errMsg.indexOf('拒绝') !== -1
      ) {
        return { ok: false, message: '保存失败：请授权访问系统相册权限' };
      }
      return {
        ok: false,
        message: errMsg ? ('保存相册失败：' + errMsg) : '保存相册失败，请稍后重试'
      };
    }
  }

  function truncateChars(text, maxChars) {
    if (text === null || text === undefined) {
      return '';
    }
    var chars = Array.from(String(text));
    if (chars.length <= maxChars) {
      return chars.join('');
    }
    return chars.slice(0, maxChars).join('');
  }

  async function postNoteWithCanvas(canvas, title, content) {
    await ensureReady();

    if (!bridgeState.capabilities.postNote) {
      return {
        ok: false,
        message: bridgeState.inContainer
          ? '当前客户端版本暂不支持发布笔记'
          : '请在小红书 App 内使用发笔记功能'
      };
    }

    var miniTool = getMiniTool();
    if (!miniTool) {
      return { ok: false, message: '请在小红书 App 内使用发笔记功能' };
    }

    var dataUrl = exportCanvasDataUrl(canvas);
    if (!dataUrl) {
      return { ok: false, message: '生成功德卡图片失败' };
    }

    var mediaUrl = dataUrl;
    if (bridgeState.capabilities.writeTempFile) {
      try {
        mediaUrl = await writeCanvasTempFile(miniTool, dataUrl);
      } catch (tempErr) {
        mediaUrl = dataUrl;
      }
    }

    var safeTitle = truncateChars(title, POST_NOTE_TITLE_MAX);
    var safeContent = truncateChars(content, POST_NOTE_CONTENT_MAX);

    try {
      var res = await miniTool.postNote({
        title: safeTitle,
        content: safeContent,
        pageType: 'photo_publish',
        mediaInfo: {
          image_resources: [{ url: mediaUrl }]
        }
      });
      if (isApiFailResult(res)) {
        throw res;
      }
      return { ok: true, message: '已唤起小红书笔记发布页' };
    } catch (error) {
      var errMsg = getErrorMessage(error);
      return {
        ok: false,
        message: errMsg ? ('唤起发布页失败：' + errMsg) : '唤起笔记发布页失败'
      };
    }
  }

  function getUtf8ByteLength(str) {
    if (typeof TextEncoder === 'function') {
      return new TextEncoder().encode(str).length;
    }
    var bytes = 0;
    for (var i = 0; i < str.length; i += 1) {
      var code = str.charCodeAt(i);
      if (code <= 0x7f) {
        bytes += 1;
      } else if (code <= 0x7ff) {
        bytes += 2;
      } else if (code >= 0xd800 && code <= 0xdbff) {
        bytes += 4;
        i += 1;
      } else {
        bytes += 3;
      }
    }
    return bytes;
  }

  function buildSnapshotInfo(snapshotObj) {
    if (snapshotObj === null || snapshotObj === undefined) {
      return null;
    }

    var normalized = snapshotObj;
    if (typeof normalized === 'string') {
      if (!normalized) {
        return null;
      }
      try {
        var parsedStr = JSON.parse(normalized);
        normalized = parsedStr;
      } catch (e) {
        normalized = { text: normalized };
      }
    }

    var json;
    try {
      json = JSON.stringify(normalized);
    } catch (err) {
      return null;
    }
    if (typeof json !== 'string') {
      return null;
    }
    if (getUtf8ByteLength(json) <= SNAPSHOT_MAX_UTF8_BYTES) {
      return json;
    }

    if (Array.isArray(normalized)) {
      var arrCopy = normalized.slice();
      while (arrCopy.length > 0) {
        arrCopy.pop();
        var arrJson = JSON.stringify(arrCopy);
        if (getUtf8ByteLength(arrJson) <= SNAPSHOT_MAX_UTF8_BYTES) {
          return arrJson;
        }
      }
      return '[]';
    }

    if (typeof normalized === 'object') {
      var copy = Object.assign({}, normalized);
      var caps = [120, 48, 16, 6];
      for (var c = 0; c < caps.length; c += 1) {
        var maxChars = caps[c];
        var keys = Object.keys(copy);
        for (var k = 0; k < keys.length; k += 1) {
          var key = keys[k];
          if (typeof copy[key] === 'string') {
            copy[key] = truncateChars(copy[key], maxChars);
          }
        }
        var trimmedJson = JSON.stringify(copy);
        if (getUtf8ByteLength(trimmedJson) <= SNAPSHOT_MAX_UTF8_BYTES) {
          return trimmedJson;
        }
      }

      var dropKeys = Object.keys(copy);
      while (dropKeys.length > 0) {
        var removeKey = dropKeys.pop();
        delete copy[removeKey];
        var reducedJson = JSON.stringify(copy);
        if (getUtf8ByteLength(reducedJson) <= SNAPSHOT_MAX_UTF8_BYTES) {
          return reducedJson;
        }
      }
      return '{}';
    }

    return '{}';
  }

  async function postCommentWithCanvas(canvas, content, snapshotObj) {
    await ensureReady();

    if (!bridgeState.capabilities.comment) {
      return {
        ok: false,
        message: bridgeState.inContainer
          ? '当前客户端版本暂不支持评论区晒功德（需 9.49 及以上）'
          : '请在小红书 App 内使用评论区晒功德功能'
      };
    }

    var miniTool = getMiniTool();
    if (!miniTool) {
      return { ok: false, message: '请在小红书 App 内使用评论区晒功德功能' };
    }

    var dataUrl = exportCanvasDataUrl(canvas);
    if (!dataUrl) {
      return { ok: false, message: '生成功德卡图片失败' };
    }

    var filePath;
    try {
      filePath = await writeCanvasTempFile(miniTool, dataUrl);
    } catch (tempErr) {
      var tempMsg = getErrorMessage(tempErr);
      return {
        ok: false,
        message: tempMsg ? ('生成本地图片失败：' + tempMsg) : '生成本地图片失败，无法打开评论区'
      };
    }

    var payload = {
      action: 'post_comment',
      content: typeof content === 'string' ? content : '',
      media_bean: [
        {
          media_type: 'image',
          cover_image_url: filePath
        }
      ]
    };

    var snapshotJson = buildSnapshotInfo(snapshotObj);
    if (snapshotJson) {
      payload.miniToolSnapshotInfo = snapshotJson;
    }

    try {
      var res = await miniTool.interactionOpenApi({
        payload: payload,
        saveToAlbum: true
      });
      if (isApiFailResult(res)) {
        throw res;
      }
      if (res && res.routed === false) {
        return { ok: false, message: '未能打开评论区，请稍后重试' };
      }
      if (res && res.savedToAlbum === false && res.albumFailReason) {
        return {
          ok: true,
          message: '已带图打开评论区（同步相册未成功：' + res.albumFailReason + '）'
        };
      }
      return { ok: true, message: '已带图打开评论区' };
    } catch (error) {
      var errMsg = getErrorMessage(error);
      return {
        ok: false,
        message: errMsg ? ('打开评论区失败：' + errMsg) : '打开评论区失败，请稍后重试'
      };
    }
  }

  function mapShareError(error) {
    var code = getErrorCode(error);
    var errMsg = getErrorMessage(error);
    if (code === 15502) {
      return {
        ok: false,
        code: 15502,
        message: '当前容器或模拟器暂不支持分享（仅全屏容器可用）'
      };
    }
    if (code === 15503) {
      return {
        ok: false,
        code: 15503,
        message: '今日分享次数已达上限（每日最多 10 次）'
      };
    }
    if (code === 15501) {
      return {
        ok: false,
        code: 15501,
        message: '分享图片校验失败，请重试'
      };
    }
    if (code === 10001) {
      return {
        ok: false,
        code: 10001,
        message: '分享参数无效'
      };
    }
    return {
      ok: false,
      code: code,
      message: errMsg ? ('分享失败：' + errMsg) : '分享失败，请稍后重试'
    };
  }

  async function runShareOperation(buildOptionsFn) {
    await ensureReady();

    if (!bridgeState.capabilities.share) {
      return {
        ok: false,
        code: null,
        message: bridgeState.inContainer
          ? '当前客户端版本暂不支持分享（需 9.53 及以上）'
          : '请在小红书 App（9.53 及以上全屏容器）内使用分享功能'
      };
    }

    var miniTool = getMiniTool();
    if (!miniTool) {
      return {
        ok: false,
        code: null,
        message: '请在小红书 App（9.53 及以上全屏容器）内使用分享功能'
      };
    }

    if (sharePending) {
      return {
        ok: false,
        code: 15502,
        message: '分享面板正在打开，请勿重复操作'
      };
    }

    sharePending = true;
    try {
      var options = await buildOptionsFn(miniTool);
      if (!options) {
        return {
          ok: false,
          code: null,
          message: '生成功德卡图片失败'
        };
      }
      var res = await miniTool.share(options);
      if (isApiFailResult(res)) {
        throw res;
      }
      return {
        ok: true,
        code: null,
        message: '已打开分享面板'
      };
    } catch (error) {
      return mapShareError(error);
    } finally {
      sharePending = false;
    }
  }

  function shareCard() {
    return runShareOperation(function () {
      return { type: 'card' };
    });
  }

  function shareCanvasImage(canvas) {
    return runShareOperation(async function (miniTool) {
      var dataUrl = exportCanvasDataUrl(canvas);
      if (!dataUrl) {
        return null;
      }
      var imageResource = dataUrl;
      if (bridgeState.capabilities.writeTempFile) {
        try {
          imageResource = await writeCanvasTempFile(miniTool, dataUrl);
        } catch (tempErr) {
          imageResource = dataUrl;
        }
      }
      return {
        type: 'image',
        image_resource: imageResource
      };
    });
  }

  function getCapabilities() {
    return Object.assign({}, bridgeState.capabilities);
  }

  function getState() {
    return snapshotPublicState();
  }

  global.WoodenFishBridge = {
    init: init,
    applyWindowLayout: applyWindowLayout,
    loadState: loadState,
    saveState: saveState,
    vibrate: vibrate,
    startGyroscope: startGyroscope,
    stopGyroscope: stopGyroscope,
    saveCanvasToAlbum: saveCanvasToAlbum,
    postNoteWithCanvas: postNoteWithCanvas,
    postCommentWithCanvas: postCommentWithCanvas,
    shareCard: shareCard,
    shareCanvasImage: shareCanvasImage,
    readBuildVersion: readBuildVersion,
    getBuildVersion: getBuildVersion,
    getClientVersion: getClientVersion,
    isClientVersionAtLeast: isClientVersionAtLeast,
    getCapabilities: getCapabilities,
    getState: getState
  };
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : global));
