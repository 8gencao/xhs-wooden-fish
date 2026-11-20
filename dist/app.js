(function () {
  'use strict';

  var STORAGE_KEY = 'wooden_fish_state_v1';
  var PRESET_PHRASES = [
    '功德 +1',
    '烦恼 -1',
    '好运 +1',
    '暴富 +1',
    '水逆退散',
    '心态稳住'
  ];
  var TIMBRE_ORDER = ['sandalwood', 'temple', 'bell'];
  var TIMBRE_LABELS = {
    sandalwood: '清脆檀木',
    temple: '沉稳古木',
    bell: '空灵清磬'
  };
  var AUTO_ORDER = ['off', 'slow', 'medium', 'fast'];
  var AUTO_MODES = {
    off: { label: '关闭', shortLabel: '关闭', intervalMs: 0 },
    slow: { label: '慢速 1200ms', shortLabel: '慢 1.2s', intervalMs: 1200 },
    medium: { label: '中速 700ms', shortLabel: '中 0.7s', intervalMs: 700 },
    fast: { label: '快速 350ms', shortLabel: '快 0.35s', intervalMs: 350 }
  };
  var SENS_LABELS = {
    high: '灵敏',
    medium: '适中',
    low: '稳重'
  };

  function getTodayString() {
    var now = new Date();
    var y = String(now.getFullYear());
    var m = String(now.getMonth() + 1).padStart(2, '0');
    var d = String(now.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  function toSafeInt(value) {
    var num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
      return 0;
    }
    return Math.floor(num);
  }

  function formatNumber(num) {
    return String(toSafeInt(num)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function countChars(text) {
    return Array.from(String(text || '')).length;
  }

  function truncateChars(text, maxLen) {
    var chars = Array.from(String(text || ''));
    if (chars.length <= maxLen) {
      return chars.join('');
    }
    return chars.slice(0, maxLen).join('');
  }

  // 一次性 Flex gap 行为检测（Chrome 61 基线层 + 增强层）
  function supportsFlexGap() {
    if (!document.body) {
      return false;
    }
    var flex = document.createElement('div');
    flex.style.position = 'absolute';
    flex.style.visibility = 'hidden';
    flex.style.display = 'flex';
    flex.style.flexDirection = 'column';
    flex.style.rowGap = '1px';
    flex.appendChild(document.createElement('div'));
    flex.appendChild(document.createElement('div'));
    document.body.appendChild(flex);
    var supported = flex.scrollHeight === 1;
    if (flex.parentNode) {
      flex.parentNode.removeChild(flex);
    }
    return supported;
  }

  function ensureCssEnvFallback() {
    var rootStyle = document.documentElement && document.documentElement.style;
    if (!rootStyle) {
      return;
    }
    var hasEnv = !!(
      window.CSS &&
      typeof window.CSS.supports === 'function' &&
      window.CSS.supports('padding-top', 'env(safe-area-inset-top)')
    );
    if (!hasEnv) {
      if (!rootStyle.getPropertyValue('--content-top')) {
        rootStyle.setProperty('--content-top', '16px');
      }
      if (!rootStyle.getPropertyValue('--safe-area-inset-bottom')) {
        rootStyle.setProperty('--safe-area-inset-bottom', '12px');
      }
    }
  }

  function syncViewportHeight() {
    var rootStyle = document.documentElement && document.documentElement.style;
    if (!rootStyle) {
      return;
    }
    var vh = window.visualViewport && typeof window.visualViewport.height === 'number'
      ? Math.round(window.visualViewport.height)
      : window.innerHeight;
    if (vh > 0) {
      rootStyle.setProperty('--app-height', vh + 'px');
    }
  }

  var state = {
    totalMerits: 0,
    todayMerits: 0,
    todayDate: getTodayString(),
    sessionMerits: 0,
    soundEnabled: true,
    timbre: 'sandalwood',
    theme: 'dark',
    vibrateEnabled: true,
    autoMode: 'off',
    shakeEnabled: false,
    shakeSensitivity: 'medium',
    mantra: '功德 +1',
    customPhrases: [],
    saveHistory: true,
    lastKnockMode: '手敲静心'
  };

  var runtime = {
    inContainer: false,
    clientVersion: null,
    capabilities: {
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
    },
    storageStatus: 'checking',
    loadFailedProtect: false,
    userTouchedPrefsDuringBoot: false,
    autoTimerId: null,
    autoPausedByHidden: false,
    saveTimerId: null,
    dirtySave: false,
    isSaving: false,
    pendingReSave: false,
    shakeBusy: false,
    shakeNoticeMsg: '',
    hitToggle: false,
    rippleIndex: 0,
    rippleToggles: [],
    floatIndex: 0,
    floatToggles: [],
    lastTouchMs: 0,
    lastMouseMs: 0,
    sawPointerDown: false,
    motionRafId: null,
    latestMotionLevel: 0,
    currentCardCanvas: null,
    cardActionBusy: false,
    confirmAction: null
  };

  var dom = {
    todayCount: document.getElementById('today-count'),
    totalCount: document.getElementById('total-count'),
    sessionCount: document.getElementById('session-count'),
    mantraChip: document.getElementById('mantra-chip'),
    mantraBadge: document.getElementById('mantra-badge'),
    statusText: document.getElementById('status-text'),
    btnTheme: document.getElementById('btn-theme'),
    iconThemeLight: document.querySelector('#btn-theme .icon-theme-light'),
    iconThemeDark: document.querySelector('#btn-theme .icon-theme-dark'),
    btnSound: document.getElementById('btn-sound'),
    iconSoundOn: document.querySelector('#btn-sound .icon-sound-on'),
    iconSoundOff: document.querySelector('#btn-sound .icon-sound-off'),
    btnOpenCard: document.getElementById('btn-open-card'),
    btnOpenSettings: document.getElementById('btn-open-settings'),
    fishStageBtn: document.getElementById('fish-stage-btn'),
    energyRing: document.getElementById('energy-ring'),
    rippleRings: Array.prototype.slice.call(document.querySelectorAll('#ripple-layer .ripple-ring')),
    floatTexts: Array.prototype.slice.call(document.querySelectorAll('#float-layer .float-text')),
    shakePanel: document.getElementById('shake-panel'),
    sensPills: Array.prototype.slice.call(document.querySelectorAll('#shake-panel .sens-pill')),
    energyMeterFill: document.getElementById('energy-meter-fill'),
    energyMeterLabel: document.getElementById('energy-meter-label'),
    shakeNotice: document.getElementById('shake-notice'),
    btnShake: document.getElementById('btn-shake'),
    shakeBtnSub: document.getElementById('shake-btn-sub'),
    btnAuto: document.getElementById('btn-auto'),
    autoBtnSub: document.getElementById('auto-btn-sub'),
    btnPhrase: document.getElementById('btn-phrase'),
    phraseBtnSub: document.getElementById('phrase-btn-sub'),
    btnTimbre: document.getElementById('btn-timbre'),
    timbreBtnSub: document.getElementById('timbre-btn-sub'),
    btnCard: document.getElementById('btn-card'),
    settingsModal: document.getElementById('settings-modal'),
    btnCloseSettings: document.getElementById('btn-close-settings'),
    themeChips: Array.prototype.slice.call(document.querySelectorAll('[data-theme]')),
    setSoundToggle: document.getElementById('set-sound-toggle'),
    timbreChips: Array.prototype.slice.call(document.querySelectorAll('[data-timbre]')),
    setVibrateToggle: document.getElementById('set-vibrate-toggle'),
    setVibrateDesc: document.getElementById('set-vibrate-desc'),
    autoChips: Array.prototype.slice.call(document.querySelectorAll('[data-auto]')),
    setShakeToggle: document.getElementById('set-shake-toggle'),
    setSensChips: Array.prototype.slice.call(document.querySelectorAll('[data-set-sens]')),
    setShakeEnvHint: document.getElementById('set-shake-env-hint'),
    btnOpenCustomPhrase: document.getElementById('btn-open-custom-phrase'),
    phrasePresetGrid: document.getElementById('phrase-preset-grid'),
    setSaveToggle: document.getElementById('set-save-toggle'),
    setStorageDesc: document.getElementById('set-storage-desc'),
    btnResetToday: document.getElementById('btn-reset-today'),
    btnResetAll: document.getElementById('btn-reset-all'),
    phraseModal: document.getElementById('phrase-modal'),
    btnClosePhrase: document.getElementById('btn-close-phrase'),
    btnCancelPhrase: document.getElementById('btn-cancel-phrase'),
    customPhraseForm: document.getElementById('custom-phrase-form'),
    customPhraseInput: document.getElementById('custom-phrase-input'),
    phraseError: document.getElementById('phrase-error'),
    phraseCharCount: document.getElementById('phrase-char-count'),
    confirmModal: document.getElementById('confirm-modal'),
    confirmTitle: document.getElementById('confirm-title'),
    confirmMessage: document.getElementById('confirm-message'),
    btnConfirmCancel: document.getElementById('btn-confirm-cancel'),
    btnConfirmOk: document.getElementById('btn-confirm-ok'),
    cardModal: document.getElementById('card-modal'),
    btnCloseCard: document.getElementById('btn-close-card'),
    cardPreviewImg: document.getElementById('card-preview-img'),
    cardFeedback: document.getElementById('card-feedback'),
    cardEnvNotice: document.getElementById('card-env-notice'),
    btnCardSave: document.getElementById('btn-card-save'),
    btnCardNote: document.getElementById('btn-card-note'),
    btnCardComment: document.getElementById('btn-card-comment'),
    btnCardShare: document.getElementById('btn-card-share'),
    btnCardShareCard: document.getElementById('btn-card-share-card')
  };

  var swingDetector = null;

  function getBridge() {
    return window.WoodenFishBridge || null;
  }

  function getEngine() {
    return window.WoodenFishEngine || null;
  }

  function getShareCard() {
    return window.WoodenFishShareCard || null;
  }

  function setStatus(text) {
    if (dom.statusText) {
      dom.statusText.textContent = text;
    }
  }

  function rolloverDayIfNeeded() {
    var today = getTodayString();
    if (state.todayDate !== today) {
      state.todayDate = today;
      state.todayMerits = 0;
      return true;
    }
    return false;
  }

  function renderCounts() {
    if (dom.todayCount) {
      dom.todayCount.textContent = formatNumber(state.todayMerits);
    }
    if (dom.totalCount) {
      dom.totalCount.textContent = formatNumber(state.totalMerits);
    }
    if (dom.sessionCount) {
      dom.sessionCount.textContent = formatNumber(state.sessionMerits);
    }
  }

  function renderPhraseGrid() {
    if (!dom.phrasePresetGrid) {
      return;
    }
    var list = PRESET_PHRASES.slice();
    for (var i = 0; i < state.customPhrases.length; i += 1) {
      var customItem = state.customPhrases[i];
      if (list.indexOf(customItem) === -1) {
        list.push(customItem);
      }
    }
    if (list.indexOf(state.mantra) === -1) {
      list.push(state.mantra);
    }

    dom.phrasePresetGrid.textContent = '';
    var frag = document.createDocumentFragment();
    for (var j = 0; j < list.length; j += 1) {
      var phrase = list[j];
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'choice-chip' + (phrase === state.mantra ? ' is-active' : '');
      btn.setAttribute('data-phrase', phrase);
      btn.textContent = phrase;
      frag.appendChild(btn);
    }
    dom.phrasePresetGrid.appendChild(frag);
  }

  function renderControls() {
    if (dom.btnSound) {
      dom.btnSound.setAttribute('aria-pressed', state.soundEnabled ? 'true' : 'false');
    }
    if (dom.iconSoundOn && dom.iconSoundOff) {
      dom.iconSoundOn.hidden = !state.soundEnabled;
      dom.iconSoundOff.hidden = state.soundEnabled;
    }
    if (dom.setSoundToggle) {
      dom.setSoundToggle.textContent = state.soundEnabled ? '已开启' : '已静音';
      dom.setSoundToggle.setAttribute('aria-pressed', state.soundEnabled ? 'true' : 'false');
      dom.setSoundToggle.classList.toggle('is-on', state.soundEnabled);
    }

    if (dom.mantraBadge) {
      dom.mantraBadge.textContent = state.mantra;
    }
    if (dom.phraseBtnSub) {
      dom.phraseBtnSub.textContent = state.mantra;
    }

    var timbreLabel = TIMBRE_LABELS[state.timbre] || TIMBRE_LABELS.sandalwood;
    if (dom.timbreBtnSub) {
      dom.timbreBtnSub.textContent = timbreLabel;
    }
    for (var t = 0; t < dom.timbreChips.length; t += 1) {
      var tChip = dom.timbreChips[t];
      tChip.classList.toggle('is-active', tChip.getAttribute('data-timbre') === state.timbre);
    }

    if (dom.setVibrateToggle) {
      dom.setVibrateToggle.textContent = state.vibrateEnabled ? '已开启' : '已关闭';
      dom.setVibrateToggle.setAttribute('aria-pressed', state.vibrateEnabled ? 'true' : 'false');
      dom.setVibrateToggle.classList.toggle('is-on', state.vibrateEnabled);
    }
    if (dom.setVibrateDesc) {
      if (runtime.capabilities.vibrate) {
        dom.setVibrateDesc.textContent = '已就绪：敲击触发短振反馈';
      } else if (runtime.inContainer) {
        dom.setVibrateDesc.textContent = '当前客户端版本低于 9.50，短振不可用';
      } else {
        dom.setVibrateDesc.textContent = '请在小红书 App 9.50+ 容器内体验短振反馈';
      }
    }

    var autoCfg = AUTO_MODES[state.autoMode] || AUTO_MODES.off;
    if (dom.btnAuto) {
      dom.btnAuto.classList.toggle('is-active', state.autoMode !== 'off');
      dom.btnAuto.setAttribute('aria-pressed', state.autoMode !== 'off' ? 'true' : 'false');
    }
    if (dom.autoBtnSub) {
      dom.autoBtnSub.textContent = autoCfg.shortLabel;
    }
    for (var a = 0; a < dom.autoChips.length; a += 1) {
      var aChip = dom.autoChips[a];
      aChip.classList.toggle('is-active', aChip.getAttribute('data-auto') === state.autoMode);
    }

    if (dom.btnShake) {
      dom.btnShake.classList.toggle('is-active', state.shakeEnabled);
      dom.btnShake.setAttribute('aria-pressed', state.shakeEnabled ? 'true' : 'false');
    }
    if (dom.shakeBtnSub) {
      dom.shakeBtnSub.textContent = state.shakeEnabled
        ? (SENS_LABELS[state.shakeSensitivity] + ' · 开启')
        : '已关闭';
    }
    if (dom.setShakeToggle) {
      dom.setShakeToggle.textContent = state.shakeEnabled ? '已开启' : '已关闭';
      dom.setShakeToggle.setAttribute('aria-pressed', state.shakeEnabled ? 'true' : 'false');
      dom.setShakeToggle.classList.toggle('is-on', state.shakeEnabled);
    }

    for (var s1 = 0; s1 < dom.sensPills.length; s1 += 1) {
      var pill = dom.sensPills[s1];
      pill.classList.toggle('is-active', pill.getAttribute('data-sens') === state.shakeSensitivity);
    }
    for (var s2 = 0; s2 < dom.setSensChips.length; s2 += 1) {
      var sChip = dom.setSensChips[s2];
      sChip.classList.toggle('is-active', sChip.getAttribute('data-set-sens') === state.shakeSensitivity);
    }

    if (dom.shakePanel) {
      dom.shakePanel.hidden = !(state.shakeEnabled || runtime.shakeNoticeMsg);
    }
    if (dom.shakeNotice) {
      dom.shakeNotice.hidden = !runtime.shakeNoticeMsg;
      dom.shakeNotice.textContent = runtime.shakeNoticeMsg || '';
    }
    if (dom.setShakeEnvHint) {
      if (runtime.shakeNoticeMsg) {
        dom.setShakeEnvHint.textContent = runtime.shakeNoticeMsg;
      } else if (runtime.capabilities.gyroscope) {
        dom.setShakeEnvHint.textContent = '陀螺仪已就绪：拿稳手机上下挥动，像挥木槌一样敲击木鱼';
      } else if (runtime.inContainer) {
        dom.setShakeEnvHint.textContent = '需小红书 App 9.50+ 支持陀螺仪；当前仍支持点击与自动敲击';
      } else {
        dom.setShakeEnvHint.textContent = 'PC 模拟器或普通网页不支持陀螺仪，可使用点击或自动敲击';
      }
    }

    if (dom.setSaveToggle) {
      dom.setSaveToggle.textContent = state.saveHistory ? '已开启' : '已关闭';
      dom.setSaveToggle.setAttribute('aria-pressed', state.saveHistory ? 'true' : 'false');
      dom.setSaveToggle.classList.toggle('is-on', state.saveHistory);
    }
    if (dom.setStorageDesc) {
      if (runtime.loadFailedProtect) {
        dom.setStorageDesc.textContent = '历史存档读取异常，已保护本地记录不被覆盖';
      } else if (runtime.storageStatus === 'ok') {
        dom.setStorageDesc.textContent = state.saveHistory
          ? '已开启容器本地存档（9.46+）'
          : '已关闭计数存档（仅本轮生效）';
      } else if (runtime.storageStatus === 'unavailable') {
        dom.setStorageDesc.textContent = runtime.inContainer
          ? '当前客户端版本低于 9.46，暂不支持持久化存档'
          : '非小红书 App 容器环境，仅记录本轮功德';
      } else {
        dom.setStorageDesc.textContent = '正在检测容器存档能力…';
      }
    }

    renderPhraseGrid();
    applyTheme();
  }

  function applyTheme() {
    var isLight = state.theme === 'light';
    if (document.documentElement && document.documentElement.classList) {
      document.documentElement.classList.toggle('theme-light', isLight);
    }
    if (dom.btnTheme) {
      dom.btnTheme.setAttribute('aria-pressed', isLight ? 'true' : 'false');
      dom.btnTheme.setAttribute('title', isLight ? '切换深色背景' : '切换浅色背景');
    }
    if (dom.iconThemeLight && dom.iconThemeDark) {
      dom.iconThemeLight.hidden = isLight;
      dom.iconThemeDark.hidden = !isLight;
    }
    for (var i = 0; i < dom.themeChips.length; i += 1) {
      var chip = dom.themeChips[i];
      chip.classList.toggle('is-active', chip.getAttribute('data-theme') === state.theme);
    }
  }

  function setTheme(nextTheme) {
    var target = nextTheme === 'light' ? 'light' : 'dark';
    runtime.userTouchedPrefsDuringBoot = true;
    state.theme = target;
    applyTheme();
    scheduleSave(false);
    setStatus(target === 'light' ? '已切换浅色宣纸背景' : '已切换深色暗金背景');
  }

  function toggleTheme() {
    setTheme(state.theme === 'light' ? 'dark' : 'light');
  }

  function renderAll() {
    renderCounts();
    renderControls();
  }

  function applyEnergyVisual(level01) {
    var level = typeof level01 === 'number' && Number.isFinite(level01) ? level01 : 0;
    if (level < 0) {
      level = 0;
    } else if (level > 1) {
      level = 1;
    }

    if (dom.energyRing) {
      if (!state.shakeEnabled) {
        dom.energyRing.style.opacity = '0';
        dom.energyRing.style.transform = 'scale(0.86)';
      } else {
        var ringScale = 0.88 + level * 0.24;
        var ringOpacity = 0.14 + level * 0.82;
        dom.energyRing.style.opacity = String(Math.round(ringOpacity * 100) / 100);
        dom.energyRing.style.transform = 'scale(' + (Math.round(ringScale * 1000) / 1000) + ')';
      }
    }

    if (dom.energyMeterFill) {
      var fillScale = 0.04 + level * 0.96;
      var fillOpacity = 0.42 + level * 0.58;
      dom.energyMeterFill.style.transform = 'scaleX(' + (Math.round(fillScale * 1000) / 1000) + ')';
      dom.energyMeterFill.style.opacity = String(Math.round(fillOpacity * 100) / 100);
    }

    if (dom.energyMeterLabel) {
      if (!state.shakeEnabled) {
        dom.energyMeterLabel.textContent = '已停';
      } else if (level >= 0.78) {
        dom.energyMeterLabel.textContent = '挥锤';
      } else if (level >= 0.22) {
        dom.energyMeterLabel.textContent = '感应中';
      } else {
        dom.energyMeterLabel.textContent = '待机';
      }
    }
  }

  function scheduleEnergyVisual(level01) {
    runtime.latestMotionLevel = level01;
    if (runtime.motionRafId !== null) {
      return;
    }
    var raf = typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame
      : function (cb) { return setTimeout(cb, 16); };
    runtime.motionRafId = raf(function () {
      runtime.motionRafId = null;
      applyEnergyVisual(runtime.latestMotionLevel);
    });
  }

  function triggerHitClasses(el, useA) {
    if (!el) {
      return;
    }
    el.classList.remove('is-hit-a', 'is-hit-b');
    el.classList.add(useA ? 'is-hit-a' : 'is-hit-b');
  }

  function playHitAnimations() {
    runtime.hitToggle = !runtime.hitToggle;
    var useA = runtime.hitToggle;

    triggerHitClasses(dom.fishStageBtn, useA);
    triggerHitClasses(dom.todayCount, useA);

    if (dom.rippleRings.length > 0) {
      var rIdx = runtime.rippleIndex % dom.rippleRings.length;
      runtime.rippleIndex += 1;
      runtime.rippleToggles[rIdx] = !runtime.rippleToggles[rIdx];
      triggerHitClasses(dom.rippleRings[rIdx], runtime.rippleToggles[rIdx]);
    }

    if (dom.floatTexts.length > 0) {
      var fIdx = runtime.floatIndex % dom.floatTexts.length;
      runtime.floatIndex += 1;
      runtime.floatToggles[fIdx] = !runtime.floatToggles[fIdx];
      var floatEl = dom.floatTexts[fIdx];
      var offsetX = Math.round((Math.random() - 0.5) * 52);
      floatEl.textContent = state.mantra;
      floatEl.style.setProperty('--float-x', offsetX + 'px');
      triggerHitClasses(floatEl, runtime.floatToggles[fIdx]);
    }
  }

  function buildPersistedPayload() {
    return {
      totalMerits: state.saveHistory ? state.totalMerits : 0,
      todayMerits: state.saveHistory ? state.todayMerits : 0,
      todayDate: state.todayDate,
      soundEnabled: state.soundEnabled,
      timbre: state.timbre,
      theme: state.theme,
      vibrateEnabled: state.vibrateEnabled,
      shakeSensitivity: state.shakeSensitivity,
      mantra: state.mantra,
      customPhrases: state.customPhrases.slice(0, 4),
      saveHistory: state.saveHistory
    };
  }

  function flushSave() {
    if (runtime.saveTimerId !== null) {
      clearTimeout(runtime.saveTimerId);
      runtime.saveTimerId = null;
    }
    if (!runtime.dirtySave || !runtime.capabilities.storage || runtime.loadFailedProtect) {
      return Promise.resolve();
    }
    var bridge = getBridge();
    if (!bridge || typeof bridge.saveState !== 'function') {
      return Promise.resolve();
    }
    if (runtime.isSaving) {
      runtime.pendingReSave = true;
      return Promise.resolve();
    }

    runtime.isSaving = true;
    runtime.dirtySave = false;

    function finishSave() {
      runtime.isSaving = false;
      if (runtime.pendingReSave) {
        runtime.pendingReSave = false;
        flushSave();
      }
    }

    return bridge.saveState(STORAGE_KEY, buildPersistedPayload()).then(
      function () {
        finishSave();
      },
      function () {
        finishSave();
      }
    );
  }

  function scheduleSave(immediate) {
    if (!runtime.capabilities.storage || runtime.loadFailedProtect) {
      return;
    }
    runtime.dirtySave = true;
    if (immediate) {
      flushSave();
      return;
    }
    if (runtime.saveTimerId !== null) {
      clearTimeout(runtime.saveTimerId);
    }
    runtime.saveTimerId = setTimeout(function () {
      runtime.saveTimerId = null;
      flushSave();
    }, 650);
  }

  function performKnock(source, strikeInfo) {
    rolloverDayIfNeeded();

    var engine = getEngine();
    var bridge = getBridge();

    if (source === 'tap' || source === 'space' || source === 'shake') {
      if (engine && typeof engine.unlockAudio === 'function') {
        engine.unlockAudio();
      }
    }

    var intensity = 1;
    var vibrateType = 'medium';
    var modeLabel = '手敲静心';

    if (source === 'shake') {
      intensity = (strikeInfo && typeof strikeInfo.intensity === 'number') ? strikeInfo.intensity : 1;
      vibrateType = (strikeInfo && strikeInfo.vibrateType) ? strikeInfo.vibrateType : 'medium';
      modeLabel = '挥锤摇动';
    } else if (source === 'auto') {
      intensity = 0.92;
      vibrateType = 'light';
      modeLabel = '自动诵敲';
    }

    if (state.soundEnabled && engine && typeof engine.playKnock === 'function') {
      engine.playKnock(state.timbre, intensity);
    }

    if (state.vibrateEnabled && runtime.capabilities.vibrate && bridge && typeof bridge.vibrate === 'function') {
      bridge.vibrate(vibrateType);
    }

    state.todayMerits += 1;
    state.totalMerits += 1;
    state.sessionMerits += 1;
    state.lastKnockMode = modeLabel;

    renderCounts();
    playHitAnimations();

    if (source !== 'auto' && state.autoMode === 'off' && !state.shakeEnabled) {
      setStatus(state.mantra + ' · 本轮已敲 ' + formatNumber(state.sessionMerits) + ' 下');
    }

    if (state.saveHistory) {
      scheduleSave(false);
    }
  }

  function handleGyroFrame(frame) {
    if (swingDetector && state.shakeEnabled) {
      swingDetector.handleFrame(frame);
    }
  }

  async function setShakeActive(enable) {
    if (runtime.shakeBusy) {
      return;
    }
    var bridge = getBridge();
    var engine = getEngine();

    if (enable) {
      if (engine && typeof engine.unlockAudio === 'function') {
        engine.unlockAudio();
      }
      if (!bridge || typeof bridge.startGyroscope !== 'function') {
        runtime.shakeNoticeMsg = '当前环境未加载容器桥接，暂不支持陀螺仪，可使用点击或自动敲击';
        state.shakeEnabled = false;
        renderControls();
        setStatus(runtime.shakeNoticeMsg);
        return;
      }

      runtime.shakeBusy = true;
      runtime.shakeNoticeMsg = '';
      setStatus('正在启动陀螺仪挥锤模式…');
      try {
        if (swingDetector) {
          swingDetector.reset();
        }
        var res = await bridge.startGyroscope(handleGyroFrame, 'ui');
        if (res && res.ok) {
          state.shakeEnabled = true;
          runtime.shakeNoticeMsg = '';
          applyEnergyVisual(0);
          setStatus('摇一摇已开启：拿稳手机上下挥动，像挥木槌一样敲击木鱼');
        } else {
          state.shakeEnabled = false;
          runtime.shakeNoticeMsg = (res && res.message)
            ? res.message
            : '当前环境不支持陀螺仪，可使用点击敲击';
          applyEnergyVisual(0);
          setStatus(runtime.shakeNoticeMsg);
        }
      } finally {
        runtime.shakeBusy = false;
        renderControls();
      }
      return;
    }

    runtime.shakeBusy = true;
    state.shakeEnabled = false;
    runtime.shakeNoticeMsg = '';
    if (swingDetector) {
      swingDetector.reset();
    }
    applyEnergyVisual(0);
    try {
      if (bridge && typeof bridge.stopGyroscope === 'function') {
        await bridge.stopGyroscope(handleGyroFrame);
      }
      setStatus('已关闭摇一摇，点击木鱼即可敲击');
    } finally {
      runtime.shakeBusy = false;
      renderControls();
    }
  }

  function setShakeSensitivity(level) {
    if (level !== 'high' && level !== 'medium' && level !== 'low') {
      return;
    }
    runtime.userTouchedPrefsDuringBoot = true;
    state.shakeSensitivity = level;
    if (swingDetector) {
      swingDetector.setSensitivity(level);
    }
    renderControls();
    scheduleSave(false);
    if (state.shakeEnabled) {
      setStatus('已切换摇一摇灵敏度为「' + SENS_LABELS[level] + '」');
    }
  }

  function stopAutoTimer() {
    if (runtime.autoTimerId !== null) {
      clearInterval(runtime.autoTimerId);
      runtime.autoTimerId = null;
    }
  }

  function startAutoTimerIfNeeded() {
    stopAutoTimer();
    var cfg = AUTO_MODES[state.autoMode];
    if (!cfg || !cfg.intervalMs || document.hidden) {
      return;
    }
    runtime.autoTimerId = setInterval(function () {
      performKnock('auto');
    }, cfg.intervalMs);
  }

  function setAutoMode(mode) {
    if (!AUTO_MODES[mode]) {
      mode = 'off';
    }
    var engine = getEngine();
    if (mode !== 'off' && engine && typeof engine.unlockAudio === 'function') {
      engine.unlockAudio();
    }
    state.autoMode = mode;
    runtime.autoPausedByHidden = false;
    if (mode === 'off') {
      stopAutoTimer();
      setStatus('已关闭自动敲击');
    } else {
      startAutoTimerIfNeeded();
      setStatus('已开启自动敲击（' + AUTO_MODES[mode].label + '）');
    }
    renderControls();
  }

  function setTimbre(timbre) {
    if (!TIMBRE_LABELS[timbre]) {
      timbre = 'sandalwood';
    }
    runtime.userTouchedPrefsDuringBoot = true;
    state.timbre = timbre;
    var engine = getEngine();
    if (engine && typeof engine.unlockAudio === 'function') {
      engine.unlockAudio();
    }
    renderControls();
    scheduleSave(false);
    setStatus('已切换音色：' + TIMBRE_LABELS[timbre]);
  }

  function toggleSound() {
    runtime.userTouchedPrefsDuringBoot = true;
    state.soundEnabled = !state.soundEnabled;
    var engine = getEngine();
    if (engine && typeof engine.setMuted === 'function') {
      engine.setMuted(!state.soundEnabled);
    }
    if (state.soundEnabled && engine && typeof engine.unlockAudio === 'function') {
      engine.unlockAudio();
    }
    renderControls();
    scheduleSave(false);
    setStatus(state.soundEnabled ? '已开启木鱼音效' : '已切换为静音模式');
  }

  function toggleVibrate() {
    runtime.userTouchedPrefsDuringBoot = true;
    state.vibrateEnabled = !state.vibrateEnabled;
    renderControls();
    scheduleSave(false);
    if (state.vibrateEnabled && !runtime.capabilities.vibrate) {
      setStatus('已开启振动偏好（需小红书 App 9.50+ 生效）');
    } else {
      setStatus(state.vibrateEnabled ? '已开启敲击短振' : '已关闭敲击短振');
    }
  }

  function toggleSaveHistory() {
    runtime.userTouchedPrefsDuringBoot = true;
    state.saveHistory = !state.saveHistory;
    renderControls();
    scheduleSave(true);
    setStatus(state.saveHistory ? '已开启功德数据存档' : '已关闭计数存档（仅保留设置）');
  }

  function setMantra(phrase) {
    var trimmed = truncateChars(String(phrase || '').trim(), 12);
    if (!trimmed) {
      return;
    }
    runtime.userTouchedPrefsDuringBoot = true;
    state.mantra = trimmed;
    if (PRESET_PHRASES.indexOf(trimmed) === -1) {
      var nextCustom = [trimmed];
      for (var i = 0; i < state.customPhrases.length; i += 1) {
        if (state.customPhrases[i] !== trimmed && nextCustom.length < 4) {
          nextCustom.push(state.customPhrases[i]);
        }
      }
      state.customPhrases = nextCustom;
    }
    renderControls();
    scheduleSave(false);
    setStatus('功德飘字已设为「' + state.mantra + '」');
  }

  function cycleMantra() {
    var list = PRESET_PHRASES.slice();
    for (var i = 0; i < state.customPhrases.length; i += 1) {
      if (list.indexOf(state.customPhrases[i]) === -1) {
        list.push(state.customPhrases[i]);
      }
    }
    var idx = list.indexOf(state.mantra);
    var nextPhrase = list[(idx + 1) % list.length];
    setMantra(nextPhrase);
  }

  function hasAnyModalOpen() {
    return (
      (dom.settingsModal && !dom.settingsModal.hidden) ||
      (dom.phraseModal && !dom.phraseModal.hidden) ||
      (dom.confirmModal && !dom.confirmModal.hidden) ||
      (dom.cardModal && !dom.cardModal.hidden)
    );
  }

  function openSettingsModal(scrollToPhrases) {
    if (!dom.settingsModal) {
      return;
    }
    dom.settingsModal.hidden = false;
    renderControls();
    if (scrollToPhrases && dom.phrasePresetGrid && typeof dom.phrasePresetGrid.scrollIntoView === 'function') {
      setTimeout(function () {
        try {
          dom.phrasePresetGrid.scrollIntoView({ block: 'center' });
        } catch (err) {
          dom.phrasePresetGrid.scrollIntoView(false);
        }
      }, 20);
    }
  }

  function closeSettingsModal() {
    if (dom.settingsModal) {
      dom.settingsModal.hidden = true;
    }
  }

  function updatePhraseCounter() {
    if (!dom.customPhraseInput || !dom.phraseCharCount) {
      return;
    }
    var len = countChars(dom.customPhraseInput.value);
    dom.phraseCharCount.textContent = len + ' / 12';
  }

  function openPhraseModal() {
    if (!dom.phraseModal) {
      return;
    }
    if (dom.phraseError) {
      dom.phraseError.textContent = '';
    }
    if (dom.customPhraseInput) {
      dom.customPhraseInput.value = state.mantra;
      updatePhraseCounter();
    }
    dom.phraseModal.hidden = false;
    if (dom.customPhraseInput) {
      setTimeout(function () {
        dom.customPhraseInput.focus();
      }, 30);
    }
  }

  function closePhraseModal() {
    if (dom.phraseModal) {
      dom.phraseModal.hidden = true;
    }
  }

  function openConfirmModal(title, message, onConfirm) {
    if (!dom.confirmModal) {
      return;
    }
    runtime.confirmAction = onConfirm;
    if (dom.confirmTitle) {
      dom.confirmTitle.textContent = title;
    }
    if (dom.confirmMessage) {
      dom.confirmMessage.textContent = message;
    }
    dom.confirmModal.hidden = false;
  }

  function closeConfirmModal() {
    runtime.confirmAction = null;
    if (dom.confirmModal) {
      dom.confirmModal.hidden = true;
    }
  }

  function setCardFeedback(msg, isError) {
    if (!dom.cardFeedback) {
      return;
    }
    if (!msg) {
      dom.cardFeedback.hidden = true;
      dom.cardFeedback.textContent = '';
      dom.cardFeedback.classList.remove('is-error');
      return;
    }
    dom.cardFeedback.hidden = false;
    dom.cardFeedback.textContent = msg;
    dom.cardFeedback.classList.toggle('is-error', !!isError);
  }

  function setCardActionsBusy(busy) {
    runtime.cardActionBusy = !!busy;
    var btns = [
      dom.btnCardSave,
      dom.btnCardNote,
      dom.btnCardComment,
      dom.btnCardShare,
      dom.btnCardShareCard
    ];
    for (var i = 0; i < btns.length; i += 1) {
      if (btns[i]) {
        btns[i].disabled = runtime.cardActionBusy;
      }
    }
  }

  function renderCardCapabilityButtons() {
    var caps = runtime.capabilities;
    if (dom.btnCardSave) {
      dom.btnCardSave.hidden = !caps.saveImage;
    }
    if (dom.btnCardNote) {
      dom.btnCardNote.hidden = !caps.postNote;
    }
    if (dom.btnCardComment) {
      dom.btnCardComment.hidden = !caps.comment;
    }
    if (dom.btnCardShare) {
      dom.btnCardShare.hidden = !caps.share;
    }
    if (dom.btnCardShareCard) {
      dom.btnCardShareCard.hidden = !caps.share;
    }

    if (dom.cardEnvNotice) {
      if (!runtime.inContainer) {
        dom.cardEnvNotice.hidden = false;
        dom.cardEnvNotice.textContent = '当前不在小红书 App 容器内，请在小红书 App 内使用保存相册、发小红书笔记、评论区晒功德与分享功能。';
      } else if (!caps.saveImage && !caps.postNote && !caps.comment && !caps.share) {
        dom.cardEnvNotice.hidden = false;
        dom.cardEnvNotice.textContent = '当前小红书客户端版本暂不支持功德卡保存、发笔记或分享，请升级 App 后重试。';
      } else if (!caps.saveImage || !caps.postNote || !caps.comment || !caps.share) {
        dom.cardEnvNotice.hidden = false;
        dom.cardEnvNotice.textContent = '部分能力受当前小红书客户端版本限制，已为您展示当前可用的操作按钮。';
      } else {
        dom.cardEnvNotice.hidden = true;
      }
    }
  }

  function openCardModal() {
    var shareCard = getShareCard();
    if (!shareCard || typeof shareCard.renderMeritCard !== 'function') {
      setStatus('功德卡绘制模块未就绪，请退出后重新打开');
      return;
    }
    rolloverDayIfNeeded();
    setCardFeedback('', false);
    setCardActionsBusy(false);

    try {
      var canvas = shareCard.renderMeritCard({
        totalMerits: state.totalMerits,
        todayMerits: state.todayMerits,
        sessionMerits: state.sessionMerits,
        mantra: state.mantra,
        dateText: state.todayDate,
        modeLabel: state.lastKnockMode,
        theme: state.theme
      });
      runtime.currentCardCanvas = canvas;
      if (dom.cardPreviewImg) {
        dom.cardPreviewImg.src = canvas.toDataURL('image/png');
      }
    } catch (err) {
      setStatus('生成功德卡失败，请稍后重试');
      return;
    }

    renderCardCapabilityButtons();
    if (dom.cardModal) {
      dom.cardModal.hidden = false;
    }
  }

  function closeCardModal() {
    if (dom.cardModal) {
      dom.cardModal.hidden = true;
    }
  }

  async function handleCardAction(actionType) {
    if (runtime.cardActionBusy || !runtime.currentCardCanvas) {
      return;
    }
    var bridge = getBridge();
    if (!bridge) {
      setCardFeedback('请在小红书 App 内使用该功能', true);
      return;
    }

    setCardActionsBusy(true);
    var pendingText = '处理中…';
    if (actionType === 'save') {
      pendingText = '正在保存到相册…';
    } else if (actionType === 'note') {
      pendingText = '正在准备笔记发布页…';
    } else if (actionType === 'comment') {
      pendingText = '正在打开评论区…';
    } else if (actionType === 'share' || actionType === 'share-card') {
      pendingText = '正在拉起分享面板…';
    }
    setCardFeedback(pendingText, false);

    try {
      var result;
      if (actionType === 'save') {
        result = await bridge.saveCanvasToAlbum(runtime.currentCardCanvas);
      } else if (actionType === 'note') {
        var noteTitle = '今日积攒 ' + formatNumber(state.todayMerits) + ' 功德';
        var noteContent = '今日敲电子木鱼念诵「' + state.mantra + '」，已积攒今日功德 ' +
          formatNumber(state.todayMerits) + '，累计功德 ' + formatNumber(state.totalMerits) +
          '。心静一念，烦恼退散～ #电子木鱼 #每日积德';
        result = await bridge.postNoteWithCanvas(runtime.currentCardCanvas, noteTitle, noteContent);
      } else if (actionType === 'comment') {
        var commentText = '今日已敲电子木鱼 ' + formatNumber(state.todayMerits) +
          ' 下（' + state.mantra + '），评论区一起攒功德！';
        var snapshotObj = {
          todayMerits: state.todayMerits,
          totalMerits: state.totalMerits,
          mantra: state.mantra,
          date: state.todayDate
        };
        result = await bridge.postCommentWithCanvas(runtime.currentCardCanvas, commentText, snapshotObj);
      } else if (actionType === 'share') {
        result = await bridge.shareCanvasImage(runtime.currentCardCanvas);
      } else {
        result = await bridge.shareCard();
      }

      if (result && result.ok) {
        setCardFeedback(result.message || '操作已完成', false);
        setStatus(result.message || '操作已完成');
      } else {
        var errText = (result && result.message) ? result.message : '操作未完成，请在小红书 App 内重试';
        setCardFeedback(errText, true);
      }
    } catch (error) {
      setCardFeedback('操作异常，请稍后重试', true);
    } finally {
      setCardActionsBusy(false);
    }
  }

  function bindEvents() {
    // 木鱼敲击：优先 Pointer Events，兼顾无 PointerEvent 与读屏合成 click
    if (dom.fishStageBtn) {
      if ('onpointerdown' in window) {
        dom.fishStageBtn.addEventListener('pointerdown', function (event) {
          if (event.button && event.button !== 0) {
            return;
          }
          runtime.sawPointerDown = true;
          performKnock('tap');
        });
        dom.fishStageBtn.addEventListener('pointercancel', function () {
          runtime.sawPointerDown = false;
        });
      } else {
        dom.fishStageBtn.addEventListener('touchstart', function () {
          runtime.lastTouchMs = Date.now();
          performKnock('tap');
        }, { passive: true });
        dom.fishStageBtn.addEventListener('mousedown', function (event) {
          if (event.button !== 0) {
            return;
          }
          if (Date.now() - runtime.lastTouchMs < 450) {
            return;
          }
          runtime.lastMouseMs = Date.now();
          performKnock('tap');
        });
      }

      dom.fishStageBtn.addEventListener('click', function () {
        if (runtime.sawPointerDown) {
          runtime.sawPointerDown = false;
          return;
        }
        var now = Date.now();
        if (now - runtime.lastTouchMs < 450 || now - runtime.lastMouseMs < 450) {
          return;
        }
        performKnock('tap');
      });

      // 防止键盘回车/空格 click 二次触发（空格已在 keydown 处理）
      dom.fishStageBtn.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          performKnock('space');
        }
      });
    }

    // PC 空格键敲击 + Escape 关闭弹层
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' || event.keyCode === 27) {
        if (dom.phraseModal && !dom.phraseModal.hidden) {
          closePhraseModal();
          return;
        }
        if (dom.confirmModal && !dom.confirmModal.hidden) {
          closeConfirmModal();
          return;
        }
        if (dom.cardModal && !dom.cardModal.hidden) {
          closeCardModal();
          return;
        }
        if (dom.settingsModal && !dom.settingsModal.hidden) {
          closeSettingsModal();
          return;
        }
      }

      var isSpace = event.code === 'Space' || event.key === ' ' || event.keyCode === 32;
      if (!isSpace || event.repeat || hasAnyModalOpen()) {
        return;
      }

      var activeEl = document.activeElement;
      var tag = activeEl && activeEl.tagName ? activeEl.tagName.toUpperCase() : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        return;
      }
      if (tag === 'BUTTON' && activeEl !== dom.fishStageBtn) {
        activeEl.blur();
      }
      event.preventDefault();
      performKnock('space');
    });

    if (dom.btnTheme) {
      dom.btnTheme.addEventListener('click', toggleTheme);
    }
    if (dom.btnSound) {
      dom.btnSound.addEventListener('click', toggleSound);
    }
    if (dom.btnOpenCard) {
      dom.btnOpenCard.addEventListener('click', openCardModal);
    }
    if (dom.btnOpenSettings) {
      dom.btnOpenSettings.addEventListener('click', function () {
        openSettingsModal(false);
      });
    }

    if (dom.mantraChip) {
      dom.mantraChip.addEventListener('click', cycleMantra);
    }

    if (dom.btnShake) {
      dom.btnShake.addEventListener('click', function () {
        setShakeActive(!state.shakeEnabled);
      });
    }

    if (dom.btnAuto) {
      dom.btnAuto.addEventListener('click', function () {
        var idx = AUTO_ORDER.indexOf(state.autoMode);
        var nextMode = AUTO_ORDER[(idx + 1) % AUTO_ORDER.length];
        setAutoMode(nextMode);
      });
    }

    if (dom.btnPhrase) {
      dom.btnPhrase.addEventListener('click', function () {
        openSettingsModal(true);
      });
    }

    if (dom.btnTimbre) {
      dom.btnTimbre.addEventListener('click', function () {
        var idx = TIMBRE_ORDER.indexOf(state.timbre);
        var nextTimbre = TIMBRE_ORDER[(idx + 1) % TIMBRE_ORDER.length];
        setTimbre(nextTimbre);
      });
    }

    if (dom.btnCard) {
      dom.btnCard.addEventListener('click', openCardModal);
    }

    // 摇一摇灵敏度快捷键（主面板 + 设置弹层）
    for (var s1 = 0; s1 < dom.sensPills.length; s1 += 1) {
      dom.sensPills[s1].addEventListener('click', function (event) {
        setShakeSensitivity(event.currentTarget.getAttribute('data-sens'));
      });
    }
    for (var s2 = 0; s2 < dom.setSensChips.length; s2 += 1) {
      dom.setSensChips[s2].addEventListener('click', function (event) {
        setShakeSensitivity(event.currentTarget.getAttribute('data-set-sens'));
      });
    }

    // 设置弹层内部交互
    if (dom.btnCloseSettings) {
      dom.btnCloseSettings.addEventListener('click', closeSettingsModal);
    }
    if (dom.settingsModal) {
      dom.settingsModal.addEventListener('click', function (event) {
        if (event.target === dom.settingsModal) {
          closeSettingsModal();
        }
      });
    }

    if (dom.setSoundToggle) {
      dom.setSoundToggle.addEventListener('click', toggleSound);
    }
    if (dom.setVibrateToggle) {
      dom.setVibrateToggle.addEventListener('click', toggleVibrate);
    }
    if (dom.setShakeToggle) {
      dom.setShakeToggle.addEventListener('click', function () {
        setShakeActive(!state.shakeEnabled);
      });
    }
    if (dom.setSaveToggle) {
      dom.setSaveToggle.addEventListener('click', toggleSaveHistory);
    }

    for (var tc = 0; tc < dom.themeChips.length; tc += 1) {
      dom.themeChips[tc].addEventListener('click', function (event) {
        setTheme(event.currentTarget.getAttribute('data-theme'));
      });
    }

    for (var t = 0; t < dom.timbreChips.length; t += 1) {
      dom.timbreChips[t].addEventListener('click', function (event) {
        setTimbre(event.currentTarget.getAttribute('data-timbre'));
      });
    }

    for (var a = 0; a < dom.autoChips.length; a += 1) {
      dom.autoChips[a].addEventListener('click', function (event) {
        setAutoMode(event.currentTarget.getAttribute('data-auto'));
      });
    }

    if (dom.phrasePresetGrid) {
      dom.phrasePresetGrid.addEventListener('click', function (event) {
        var target = event.target;
        if (!target || typeof target.getAttribute !== 'function') {
          return;
        }
        var phrase = target.getAttribute('data-phrase');
        if (phrase) {
          setMantra(phrase);
        }
      });
    }

    if (dom.btnOpenCustomPhrase) {
      dom.btnOpenCustomPhrase.addEventListener('click', openPhraseModal);
    }
    if (dom.btnClosePhrase) {
      dom.btnClosePhrase.addEventListener('click', closePhraseModal);
    }
    if (dom.btnCancelPhrase) {
      dom.btnCancelPhrase.addEventListener('click', closePhraseModal);
    }
    if (dom.phraseModal) {
      dom.phraseModal.addEventListener('click', function (event) {
        if (event.target === dom.phraseModal) {
          closePhraseModal();
        }
      });
    }
    if (dom.customPhraseInput) {
      dom.customPhraseInput.addEventListener('input', function () {
        if (dom.phraseError) {
          dom.phraseError.textContent = '';
        }
        updatePhraseCounter();
      });
    }
    if (dom.customPhraseForm) {
      dom.customPhraseForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var raw = dom.customPhraseInput ? dom.customPhraseInput.value : '';
        var trimmed = String(raw || '').trim();
        var len = countChars(trimmed);
        if (!trimmed) {
          if (dom.phraseError) {
            dom.phraseError.textContent = '请输入至少 1 个字';
          }
          return;
        }
        if (len > 12) {
          if (dom.phraseError) {
            dom.phraseError.textContent = '短语请控制在 12 个字以内';
          }
          return;
        }
        setMantra(trimmed);
        closePhraseModal();
      });
    }

    // 清零与重置确认弹窗
    if (dom.btnResetToday) {
      dom.btnResetToday.addEventListener('click', function () {
        openConfirmModal('清零今日功德', '确定将「今日功德」和「本轮敲击」归零吗？累计功德将保留。', function () {
          state.todayMerits = 0;
          state.sessionMerits = 0;
          runtime.loadFailedProtect = false;
          renderCounts();
          scheduleSave(true);
          setStatus('已清零今日功德');
        });
      });
    }
    if (dom.btnResetAll) {
      dom.btnResetAll.addEventListener('click', function () {
        openConfirmModal('重置全部功德', '确定将今日功德、累计功德与本轮敲击全部清零吗？此操作不可撤销。', function () {
          state.todayMerits = 0;
          state.totalMerits = 0;
          state.sessionMerits = 0;
          runtime.loadFailedProtect = false;
          renderCounts();
          scheduleSave(true);
          setStatus('已重置全部功德计数');
        });
      });
    }
    if (dom.btnConfirmCancel) {
      dom.btnConfirmCancel.addEventListener('click', closeConfirmModal);
    }
    if (dom.confirmModal) {
      dom.confirmModal.addEventListener('click', function (event) {
        if (event.target === dom.confirmModal) {
          closeConfirmModal();
        }
      });
    }
    if (dom.btnConfirmOk) {
      dom.btnConfirmOk.addEventListener('click', function () {
        var fn = runtime.confirmAction;
        closeConfirmModal();
        if (typeof fn === 'function') {
          fn();
        }
      });
    }

    // 功德卡预览弹窗按钮
    if (dom.btnCloseCard) {
      dom.btnCloseCard.addEventListener('click', closeCardModal);
    }
    if (dom.cardModal) {
      dom.cardModal.addEventListener('click', function (event) {
        if (event.target === dom.cardModal) {
          closeCardModal();
        }
      });
    }
    if (dom.btnCardSave) {
      dom.btnCardSave.addEventListener('click', function () {
        handleCardAction('save');
      });
    }
    if (dom.btnCardNote) {
      dom.btnCardNote.addEventListener('click', function () {
        handleCardAction('note');
      });
    }
    if (dom.btnCardComment) {
      dom.btnCardComment.addEventListener('click', function () {
        handleCardAction('comment');
      });
    }
    if (dom.btnCardShare) {
      dom.btnCardShare.addEventListener('click', function () {
        handleCardAction('share');
      });
    }
    if (dom.btnCardShareCard) {
      dom.btnCardShareCard.addEventListener('click', function () {
        handleCardAction('share-card');
      });
    }

    // 生命周期与视口同步
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        if (runtime.autoTimerId !== null) {
          stopAutoTimer();
          runtime.autoPausedByHidden = true;
        }
        if (swingDetector) {
          swingDetector.reset();
        }
        applyEnergyVisual(0);
        flushSave();
      } else {
        rolloverDayIfNeeded();
        syncViewportHeight();
        if (swingDetector) {
          swingDetector.reset();
        }
        var bridge = getBridge();
        if (bridge && typeof bridge.applyWindowLayout === 'function') {
          bridge.applyWindowLayout();
        }
        if (runtime.autoPausedByHidden && state.autoMode !== 'off') {
          runtime.autoPausedByHidden = false;
          startAutoTimerIfNeeded();
        }
        renderAll();
      }
    });

    window.addEventListener('pagehide', function () {
      stopAutoTimer();
      flushSave();
    });

    window.addEventListener('resize', syncViewportHeight);
    if (window.visualViewport && typeof window.visualViewport.addEventListener === 'function') {
      window.visualViewport.addEventListener('resize', syncViewportHeight);
    }
  }

  function applyLoadedState(data) {
    if (!data || typeof data !== 'object') {
      return;
    }

    var saveHist = data.saveHistory !== false;
    var loadedTotal = toSafeInt(data.totalMerits);
    var loadedToday = data.todayDate === state.todayDate ? toSafeInt(data.todayMerits) : 0;

    if (!runtime.userTouchedPrefsDuringBoot) {
      if (typeof data.soundEnabled === 'boolean') {
        state.soundEnabled = data.soundEnabled;
        var engine = getEngine();
        if (engine && typeof engine.setMuted === 'function') {
          engine.setMuted(!state.soundEnabled);
        }
      }
      if (typeof data.timbre === 'string' && TIMBRE_LABELS[data.timbre]) {
        state.timbre = data.timbre;
      }
      if (data.theme === 'light' || data.theme === 'dark') {
        state.theme = data.theme;
      }
      if (typeof data.vibrateEnabled === 'boolean') {
        state.vibrateEnabled = data.vibrateEnabled;
      }
      if (typeof data.shakeSensitivity === 'string' && SENS_LABELS[data.shakeSensitivity]) {
        state.shakeSensitivity = data.shakeSensitivity;
        if (swingDetector) {
          swingDetector.setSensitivity(state.shakeSensitivity);
        }
      }
      if (typeof data.mantra === 'string') {
        var cleanMantra = truncateChars(data.mantra.trim(), 12);
        if (cleanMantra) {
          state.mantra = cleanMantra;
        }
      }
      if (Array.isArray(data.customPhrases)) {
        var cleaned = [];
        for (var i = 0; i < data.customPhrases.length; i += 1) {
          if (typeof data.customPhrases[i] === 'string') {
            var item = truncateChars(data.customPhrases[i].trim(), 12);
            if (item && cleaned.indexOf(item) === -1 && cleaned.length < 4) {
              cleaned.push(item);
            }
          }
        }
        state.customPhrases = cleaned;
      }
      state.saveHistory = saveHist;
    }

    if (saveHist) {
      state.totalMerits = loadedTotal + state.sessionMerits;
      state.todayMerits = loadedToday + state.sessionMerits;
    }
  }

  async function initContainerAndStorage() {
    var bridge = getBridge();
    if (!bridge || typeof bridge.init !== 'function') {
      runtime.storageStatus = 'unavailable';
      renderControls();
      return;
    }

    try {
      var bridgeInfo = await bridge.init();
      if (bridgeInfo && typeof bridgeInfo === 'object') {
        runtime.inContainer = !!bridgeInfo.inContainer;
        runtime.clientVersion = bridgeInfo.clientVersion;
        if (bridgeInfo.capabilities && typeof bridgeInfo.capabilities === 'object') {
          runtime.capabilities = Object.assign({}, runtime.capabilities, bridgeInfo.capabilities);
        }
      }

      if (typeof bridge.applyWindowLayout === 'function') {
        await bridge.applyWindowLayout();
      }

      if (!runtime.capabilities.storage || typeof bridge.loadState !== 'function') {
        runtime.storageStatus = 'unavailable';
        renderControls();
        return;
      }

      var loadRes = await bridge.loadState(STORAGE_KEY);
      if (loadRes && loadRes.ok) {
        runtime.storageStatus = 'ok';
        runtime.loadFailedProtect = false;
        if (loadRes.reason === 'ok' && loadRes.data) {
          applyLoadedState(loadRes.data);
        }
      } else if (loadRes && loadRes.reason === 'unavailable') {
        runtime.storageStatus = 'unavailable';
      } else {
        runtime.storageStatus = 'error';
        runtime.loadFailedProtect = true;
        setStatus('读取历史功德失败，暂保留当前计数');
      }
    } catch (error) {
      runtime.storageStatus = 'error';
      runtime.loadFailedProtect = true;
    }

    renderAll();
  }

  function init() {
    if (supportsFlexGap() && document.documentElement && document.documentElement.classList) {
      document.documentElement.classList.add('supports-flex-gap');
    }
    ensureCssEnvFallback();
    syncViewportHeight();

    var engine = getEngine();
    if (engine && typeof engine.createSwingDetector === 'function') {
      swingDetector = engine.createSwingDetector({
        sensitivity: state.shakeSensitivity,
        cooldownMs: 240,
        rearmTimeoutMs: 420,
        onStrike: function (info) {
          performKnock('shake', info);
        },
        onMotion: function (level01) {
          scheduleEnergyVisual(level01);
        }
      });
    }

    bindEvents();
    applyTheme();
    renderAll();
    initContainerAndStorage();
  }

  init();
}());
