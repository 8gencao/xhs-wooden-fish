(function (root) {
  'use strict';

  var TIMBRE_PROFILES = {
    sandalwood: {
      duration: 0.21,
      main: {
        type: 'sine',
        startFreq: 1040,
        bodyFreq: 585,
        tailFreq: 560,
        dropTime: 0.018,
        gain: 0.58,
        decay: 0.18
      },
      harmonic: {
        type: 'sine',
        startFreq: 1460,
        endFreq: 1320,
        dropTime: 0.016,
        gain: 0.22,
        decay: 0.075
      },
      overtone: {
        type: 'sine',
        startFreq: 2180,
        endFreq: 1960,
        dropTime: 0.012,
        gain: 0.09,
        decay: 0.032
      },
      noise: {
        freq: 2300,
        q: 2.6,
        gain: 0.34,
        decay: 0.016
      }
    },
    temple: {
      duration: 0.30,
      main: {
        type: 'sine',
        startFreq: 560,
        bodyFreq: 318,
        tailFreq: 302,
        dropTime: 0.026,
        gain: 0.66,
        decay: 0.27
      },
      harmonic: {
        type: 'sine',
        startFreq: 720,
        endFreq: 655,
        dropTime: 0.022,
        gain: 0.24,
        decay: 0.13
      },
      overtone: {
        type: 'sine',
        startFreq: 1120,
        endFreq: 1020,
        dropTime: 0.016,
        gain: 0.10,
        decay: 0.055
      },
      noise: {
        freq: 1350,
        q: 2.2,
        gain: 0.28,
        decay: 0.020
      }
    },
    bell: {
      duration: 0.95,
      main: {
        type: 'sine',
        startFreq: 940,
        bodyFreq: 880,
        tailFreq: 878,
        dropTime: 0.012,
        gain: 0.42,
        decay: 0.90
      },
      harmonic: {
        type: 'sine',
        startFreq: 2428,
        endFreq: 2420,
        dropTime: 0.020,
        gain: 0.18,
        decay: 0.52
      },
      overtone: {
        type: 'sine',
        startFreq: 883.8,
        endFreq: 883.5,
        dropTime: 0.040,
        gain: 0.16,
        decay: 0.78
      },
      noise: {
        freq: 3400,
        q: 3.5,
        gain: 0.20,
        decay: 0.012
      }
    }
  };

  var SENSITIVITY_THRESHOLDS = {
    high: 2.2,
    medium: 3.2,
    low: 4.5
  };

  var DEFAULT_COOLDOWN_MS = 240;
  var DEFAULT_REARM_TIMEOUT_MS = 420;
  var REARM_HYSTERESIS_RATIO = 0.55;
  var PITCH_BOOST_FACTOR = 1.15;
  var INTENSITY_MIN = 0.65;
  var INTENSITY_MAX = 1.15;
  var INTENSITY_SPAN_RATIO = 1.5;
  var MAX_ACTIVE_VOICES = 24;
  var MAX_SUSPENDED_QUEUED = 3;

  var audioCtx = null;
  var masterGain = null;
  var masterCompressor = null;
  var noiseBuffer = null;
  var mutedState = false;
  var activeVoices = 0;
  var suspendedQueued = 0;

  function getAudioContextCtor() {
    if (!root) {
      return null;
    }
    return root.AudioContext || root.webkitAudioContext || null;
  }

  function buildNoiseBuffer(ctx) {
    if (typeof ctx.createBuffer !== 'function') {
      return null;
    }
    try {
      var sampleRate = ctx.sampleRate || 44100;
      var length = Math.max(1, Math.floor(sampleRate * 0.08));
      var buffer = ctx.createBuffer(1, length, sampleRate);
      var data = buffer.getChannelData(0);
      var i;
      for (i = 0; i < length; i += 1) {
        data[i] = Math.random() * 2 - 1;
      }
      return buffer;
    } catch (e) {
      return null;
    }
  }

  function setupMasterBus(ctx) {
    try {
      masterGain = ctx.createGain();
      masterGain.gain.value = mutedState ? 0 : 0.9;
      masterGain.connect(ctx.destination);
    } catch (e) {
      masterGain = null;
      masterCompressor = null;
      return;
    }

    if (typeof ctx.createDynamicsCompressor === 'function') {
      try {
        masterCompressor = ctx.createDynamicsCompressor();
        masterCompressor.threshold.value = -14;
        masterCompressor.knee.value = 12;
        masterCompressor.ratio.value = 6;
        masterCompressor.attack.value = 0.002;
        masterCompressor.release.value = 0.12;
        masterCompressor.connect(masterGain);
      } catch (e) {
        masterCompressor = null;
      }
    }
  }

  function getOutputNode(ctx) {
    return masterCompressor || masterGain || ctx.destination;
  }

  function ensureContext() {
    var AudioCtx = getAudioContextCtor();
    if (!AudioCtx) {
      return null;
    }

    if (audioCtx && audioCtx.state === 'closed') {
      audioCtx = null;
      masterGain = null;
      masterCompressor = null;
      noiseBuffer = null;
      activeVoices = 0;
      suspendedQueued = 0;
    }

    if (!audioCtx) {
      try {
        audioCtx = new AudioCtx();
      } catch (e) {
        audioCtx = null;
        return null;
      }
      setupMasterBus(audioCtx);
      noiseBuffer = buildNoiseBuffer(audioCtx);
    }

    return audioCtx;
  }

  function tryResume(ctx) {
    if (!ctx || typeof ctx.resume !== 'function') {
      return;
    }
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
      try {
        var res = ctx.resume();
        if (res && typeof res.catch === 'function') {
          res.catch(function () {});
        }
      } catch (e) {
        // Ignore resume failure outside active user gesture.
      }
    }
  }

  function unlockAudio() {
    var ctx = ensureContext();
    if (!ctx) {
      return false;
    }

    tryResume(ctx);

    if (ctx.state === 'running') {
      suspendedQueued = 0;
    } else if (
      typeof ctx.createBuffer === 'function' &&
      typeof ctx.createBufferSource === 'function' &&
      typeof ctx.createGain === 'function'
    ) {
      try {
        var silentBuffer = ctx.createBuffer(1, 1, ctx.sampleRate || 44100);
        var silentSrc = ctx.createBufferSource();
        silentSrc.buffer = silentBuffer;
        var silentGain = ctx.createGain();
        silentGain.gain.value = 0;
        silentSrc.connect(silentGain);
        silentGain.connect(ctx.destination);
        silentSrc.onended = function () {
          try {
            silentSrc.disconnect();
            silentGain.disconnect();
          } catch (err) {}
        };
        silentSrc.start(0);
      } catch (e) {
        // Ignore silent buffer unlock error on restricted environments.
      }
    }

    return true;
  }

  function normalizeTimbre(timbre) {
    if (timbre === 'sandalwood' || timbre === 'temple' || timbre === 'bell') {
      return timbre;
    }
    return 'sandalwood';
  }

  function normalizeIntensity(intensity) {
    if (typeof intensity !== 'number' || !Number.isFinite(intensity)) {
      return 1;
    }
    if (intensity < 0.5) {
      return 0.5;
    }
    if (intensity > 1.2) {
      return 1.2;
    }
    return intensity;
  }

  function playKnock(timbre, intensity) {
    if (mutedState) {
      return false;
    }

    var ctx = ensureContext();
    if (!ctx || typeof ctx.createOscillator !== 'function' || typeof ctx.createGain !== 'function') {
      return false;
    }

    if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
      tryResume(ctx);
      if (suspendedQueued >= MAX_SUSPENDED_QUEUED) {
        return false;
      }
      suspendedQueued += 1;
    } else {
      suspendedQueued = 0;
    }

    if (activeVoices >= MAX_ACTIVE_VOICES) {
      return false;
    }

    var profile = TIMBRE_PROFILES[normalizeTimbre(timbre)];
    var amp = normalizeIntensity(intensity);
    var now = typeof ctx.currentTime === 'number' ? ctx.currentTime : 0;
    var nodes = [];
    var cleaned = false;
    var fallbackTimer = null;

    function cleanup() {
      if (cleaned) {
        return;
      }
      cleaned = true;
      if (fallbackTimer !== null) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      if (activeVoices > 0) {
        activeVoices -= 1;
      }
      var i;
      for (i = 0; i < nodes.length; i += 1) {
        try {
          nodes[i].disconnect();
        } catch (err) {}
      }
      nodes.length = 0;
    }

    try {
      activeVoices += 1;

      var voiceGain = ctx.createGain();
      voiceGain.gain.setValueAtTime(1, now);
      voiceGain.connect(getOutputNode(ctx));
      nodes.push(voiceGain);

      // Primary hollow-cavity resonance oscillator with pitch drop.
      var mainOsc = ctx.createOscillator();
      var mainGain = ctx.createGain();
      mainOsc.type = profile.main.type;
      mainOsc.frequency.setValueAtTime(profile.main.startFreq, now);
      mainOsc.frequency.exponentialRampToValueAtTime(
        profile.main.bodyFreq,
        now + profile.main.dropTime
      );
      mainOsc.frequency.exponentialRampToValueAtTime(
        profile.main.tailFreq,
        now + profile.main.decay
      );
      mainGain.gain.setValueAtTime(0.0001, now);
      mainGain.gain.linearRampToValueAtTime(profile.main.gain * amp, now + 0.002);
      mainGain.gain.exponentialRampToValueAtTime(0.0001, now + profile.main.decay);
      mainGain.gain.linearRampToValueAtTime(0, now + profile.duration);
      mainOsc.connect(mainGain);
      mainGain.connect(voiceGain);
      nodes.push(mainOsc, mainGain);

      // Harmonic overtone partial.
      var harmOsc = ctx.createOscillator();
      var harmGain = ctx.createGain();
      harmOsc.type = profile.harmonic.type;
      harmOsc.frequency.setValueAtTime(profile.harmonic.startFreq, now);
      harmOsc.frequency.exponentialRampToValueAtTime(
        profile.harmonic.endFreq,
        now + profile.harmonic.dropTime
      );
      harmGain.gain.setValueAtTime(0.0001, now);
      harmGain.gain.linearRampToValueAtTime(profile.harmonic.gain * amp, now + 0.0015);
      harmGain.gain.exponentialRampToValueAtTime(0.0001, now + profile.harmonic.decay);
      harmGain.gain.linearRampToValueAtTime(0, now + profile.harmonic.decay + 0.008);
      harmOsc.connect(harmGain);
      harmGain.connect(voiceGain);
      nodes.push(harmOsc, harmGain);

      // Secondary upper / shimmer partial.
      var overOsc = ctx.createOscillator();
      var overGain = ctx.createGain();
      overOsc.type = profile.overtone.type;
      overOsc.frequency.setValueAtTime(profile.overtone.startFreq, now);
      overOsc.frequency.exponentialRampToValueAtTime(
        profile.overtone.endFreq,
        now + profile.overtone.dropTime
      );
      overGain.gain.setValueAtTime(0.0001, now);
      overGain.gain.linearRampToValueAtTime(profile.overtone.gain * amp, now + 0.0015);
      overGain.gain.exponentialRampToValueAtTime(0.0001, now + profile.overtone.decay);
      overGain.gain.linearRampToValueAtTime(0, now + profile.overtone.decay + 0.008);
      overOsc.connect(overGain);
      overGain.connect(voiceGain);
      nodes.push(overOsc, overGain);

      // Short mallet strike bandpass noise transient.
      var noiseSrc = null;
      if (noiseBuffer && typeof ctx.createBufferSource === 'function') {
        noiseSrc = ctx.createBufferSource();
        noiseSrc.buffer = noiseBuffer;
        var noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.0001, now);
        noiseGain.gain.linearRampToValueAtTime(profile.noise.gain * amp, now + 0.001);
        noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + profile.noise.decay);
        noiseGain.gain.linearRampToValueAtTime(0, now + profile.noise.decay + 0.006);

        if (typeof ctx.createBiquadFilter === 'function') {
          var noiseFilter = ctx.createBiquadFilter();
          noiseFilter.type = 'bandpass';
          noiseFilter.frequency.setValueAtTime(profile.noise.freq, now);
          noiseFilter.Q.setValueAtTime(profile.noise.q, now);
          noiseSrc.connect(noiseFilter);
          noiseFilter.connect(noiseGain);
          nodes.push(noiseFilter);
        } else {
          noiseSrc.connect(noiseGain);
        }
        noiseGain.connect(voiceGain);
        nodes.push(noiseSrc, noiseGain);
      }

      mainOsc.onended = cleanup;
      fallbackTimer = setTimeout(cleanup, Math.ceil((profile.duration + 0.25) * 1000));

      mainOsc.start(now);
      harmOsc.start(now);
      overOsc.start(now);
      if (noiseSrc) {
        noiseSrc.start(now);
        noiseSrc.stop(now + profile.noise.decay + 0.015);
      }

      harmOsc.stop(now + profile.harmonic.decay + 0.015);
      overOsc.stop(now + profile.overtone.decay + 0.015);
      mainOsc.stop(now + profile.duration + 0.02);

      return true;
    } catch (e) {
      cleanup();
      return false;
    }
  }

  function setMuted(muted) {
    mutedState = Boolean(muted);
    if (audioCtx && masterGain && masterGain.gain) {
      var now = typeof audioCtx.currentTime === 'number' ? audioCtx.currentTime : 0;
      try {
        if (mutedState && typeof masterGain.gain.setTargetAtTime === 'function') {
          masterGain.gain.setTargetAtTime(0, now, 0.01);
        } else if (!mutedState && typeof masterGain.gain.setValueAtTime === 'function') {
          masterGain.gain.setValueAtTime(0.9, now);
        } else {
          masterGain.gain.value = mutedState ? 0 : 0.9;
        }
      } catch (e) {
        try {
          masterGain.gain.value = mutedState ? 0 : 0.9;
        } catch (err) {}
      }
    }
    return mutedState;
  }

  function isMuted() {
    return mutedState;
  }

  function resolveSensitivityLevel(level) {
    if (level === 'high' || level === 'medium' || level === 'low') {
      return level;
    }
    return 'medium';
  }

  function createSwingDetector(options) {
    var opts = (options && typeof options === 'object') ? options : {};
    var sensitivity = resolveSensitivityLevel(opts.sensitivity);
    var threshold = SENSITIVITY_THRESHOLDS[sensitivity];
    var cooldownMs = (typeof opts.cooldownMs === 'number' && Number.isFinite(opts.cooldownMs) && opts.cooldownMs >= 0)
      ? opts.cooldownMs
      : DEFAULT_COOLDOWN_MS;
    var rearmTimeoutMs = (typeof opts.rearmTimeoutMs === 'number' && Number.isFinite(opts.rearmTimeoutMs) && opts.rearmTimeoutMs >= 0)
      ? opts.rearmTimeoutMs
      : DEFAULT_REARM_TIMEOUT_MS;
    var onStrike = typeof opts.onStrike === 'function' ? opts.onStrike : null;
    var onMotion = typeof opts.onMotion === 'function' ? opts.onMotion : null;

    var armed = true;
    var lastStrikeAt = -Infinity;
    var lastSpeed = 0;
    var smoothedMotion = 0;

    function handleFrame(frame) {
      if (!frame || typeof frame !== 'object') {
        return false;
      }

      var x = frame.x;
      var y = frame.y;
      var z = frame.z;
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        return false;
      }

      var mag = Math.sqrt(x * x + y * y + z * z);
      var pitchBoost = Math.abs(x) * PITCH_BOOST_FACTOR;
      var effective = Math.max(mag, pitchBoost);
      if (!Number.isFinite(effective)) {
        return false;
      }

      lastSpeed = effective;

      var raw01 = threshold > 0 ? (effective / threshold) : 0;
      if (raw01 < 0) {
        raw01 = 0;
      } else if (raw01 > 1) {
        raw01 = 1;
      }

      var alpha = raw01 >= smoothedMotion ? 0.72 : 0.35;
      smoothedMotion = smoothedMotion + alpha * (raw01 - smoothedMotion);
      if (raw01 === 0 && smoothedMotion < 0.005) {
        smoothedMotion = 0;
      }
      if (smoothedMotion < 0) {
        smoothedMotion = 0;
      } else if (smoothedMotion > 1) {
        smoothedMotion = 1;
      }

      if (onMotion) {
        try {
          onMotion(smoothedMotion);
        } catch (e) {}
      }

      var now = Date.now();
      if (lastStrikeAt !== -Infinity && now < lastStrikeAt) {
        lastStrikeAt = -Infinity;
      }
      var elapsed = now - lastStrikeAt;

      if (!armed) {
        if (effective < threshold * REARM_HYSTERESIS_RATIO || elapsed >= rearmTimeoutMs) {
          armed = true;
        }
      }

      if (armed && effective >= threshold && elapsed >= cooldownMs) {
        var vibrateType;
        if (effective < threshold * 1.35) {
          vibrateType = 'light';
        } else if (effective < threshold * 1.9) {
          vibrateType = 'medium';
        } else {
          vibrateType = 'heavy';
        }

        var ratio = threshold > 0 ? (effective - threshold) / (threshold * INTENSITY_SPAN_RATIO) : 0;
        if (ratio < 0) {
          ratio = 0;
        } else if (ratio > 1) {
          ratio = 1;
        }
        var strikeIntensity = Math.round((INTENSITY_MIN + ratio * (INTENSITY_MAX - INTENSITY_MIN)) * 1000) / 1000;

        armed = false;
        lastStrikeAt = now;

        if (onStrike) {
          try {
            onStrike({
              speed: effective,
              intensity: strikeIntensity,
              vibrateType: vibrateType
            });
          } catch (e) {}
        }
        return true;
      }

      return false;
    }

    function reset() {
      armed = true;
      lastStrikeAt = -Infinity;
      lastSpeed = 0;
      smoothedMotion = 0;
    }

    function setSensitivity(level) {
      if (level === 'high' || level === 'medium' || level === 'low') {
        sensitivity = level;
        threshold = SENSITIVITY_THRESHOLDS[level];
      }
      return threshold;
    }

    function getLastSpeed() {
      return lastSpeed;
    }

    function getThreshold() {
      return threshold;
    }

    return {
      handleFrame: handleFrame,
      reset: reset,
      setSensitivity: setSensitivity,
      getLastSpeed: getLastSpeed,
      getThreshold: getThreshold
    };
  }

  var engine = {
    unlockAudio: unlockAudio,
    playKnock: playKnock,
    setMuted: setMuted,
    isMuted: isMuted,
    createSwingDetector: createSwingDetector
  };

  if (root) {
    root.WoodenFishEngine = engine;
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : null));
