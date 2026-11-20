(function (global) {
  'use strict';

  var CARD_WIDTH = 750;
  var CARD_HEIGHT = 1000;
  var FONT_STACK = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';

  function toSafeCount(value) {
    var num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
      return 0;
    }
    return Math.floor(num);
  }

  function formatCount(value) {
    return String(toSafeCount(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function formatTodayDate() {
    var now = new Date();
    var y = String(now.getFullYear());
    var m = String(now.getMonth() + 1).padStart(2, '0');
    var d = String(now.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  function normalizeText(value, fallback) {
    if (typeof value !== 'string') {
      return fallback;
    }
    var trimmed = value.trim();
    return trimmed ? trimmed : fallback;
  }

  function drawRoundedRectPath(ctx, x, y, width, height, radius) {
    var r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function fitFontSize(ctx, text, maxWidth, startSize, minSize, weight) {
    var size = startSize;
    var fontWeight = weight || '600';
    while (size > minSize) {
      ctx.font = fontWeight + ' ' + size + 'px ' + FONT_STACK;
      if (ctx.measureText(text).width <= maxWidth) {
        return size;
      }
      size -= 2;
    }
    ctx.font = fontWeight + ' ' + minSize + 'px ' + FONT_STACK;
    return minSize;
  }

  function drawBackground(ctx, isLight) {
    var bgGrad = ctx.createLinearGradient(0, 0, 0, CARD_HEIGHT);
    if (isLight) {
      bgGrad.addColorStop(0, '#fcf8f0');
      bgGrad.addColorStop(0.5, '#f5ede0');
      bgGrad.addColorStop(1, '#ebe0cc');
    } else {
      bgGrad.addColorStop(0, '#18130e');
      bgGrad.addColorStop(0.45, '#100d0a');
      bgGrad.addColorStop(1, '#080706');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    // Warm ambient Zen glow behind wooden fish
    var aura = ctx.createRadialGradient(375, 345, 24, 375, 345, 340);
    if (isLight) {
      aura.addColorStop(0, 'rgba(204, 146, 56, 0.22)');
      aura.addColorStop(0.45, 'rgba(186, 128, 46, 0.08)');
      aura.addColorStop(1, 'rgba(186, 128, 46, 0)');
    } else {
      aura.addColorStop(0, 'rgba(226, 178, 86, 0.22)');
      aura.addColorStop(0.45, 'rgba(196, 142, 54, 0.09)');
      aura.addColorStop(1, 'rgba(196, 142, 54, 0)');
    }
    ctx.fillStyle = aura;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    // Subtle lower warm glow behind hero number
    var bottomAura = ctx.createRadialGradient(375, 675, 20, 375, 675, 250);
    bottomAura.addColorStop(0, isLight ? 'rgba(194, 134, 48, 0.1)' : 'rgba(218, 170, 82, 0.09)');
    bottomAura.addColorStop(1, isLight ? 'rgba(194, 134, 48, 0)' : 'rgba(218, 170, 82, 0)');
    ctx.fillStyle = bottomAura;
    ctx.fillRect(0, 420, CARD_WIDTH, 560);
  }

  function drawCornerBracket(ctx, x, y, dx, dy, isLight) {
    ctx.save();
    ctx.strokeStyle = isLight ? '#b57b28' : '#e2be76';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x, y + dy * 30);
    ctx.lineTo(x, y);
    ctx.lineTo(x + dx * 30, y);
    ctx.stroke();

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = isLight ? 'rgba(181, 123, 40, 0.72)' : 'rgba(226, 190, 118, 0.78)';
    ctx.beginPath();
    ctx.moveTo(x + dx * 8, y + dy * 20);
    ctx.lineTo(x + dx * 8, y + dy * 8);
    ctx.lineTo(x + dx * 20, y + dy * 8);
    ctx.stroke();

    ctx.fillStyle = isLight ? '#b87a24' : '#e7c680';
    ctx.beginPath();
    ctx.arc(x + dx * 14, y + dy * 14, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawZenFrame(ctx, isLight) {
    // Outer subtle border
    ctx.save();
    ctx.strokeStyle = isLight ? 'rgba(168, 116, 42, 0.28)' : 'rgba(216, 174, 94, 0.26)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(26, 26, CARD_WIDTH - 52, CARD_HEIGHT - 52);

    // Inner main gold border
    ctx.strokeStyle = isLight ? 'rgba(168, 116, 42, 0.52)' : 'rgba(216, 174, 94, 0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 40, CARD_WIDTH - 80, CARD_HEIGHT - 80);

    drawCornerBracket(ctx, 40, 40, 1, 1, isLight);
    drawCornerBracket(ctx, CARD_WIDTH - 40, 40, -1, 1, isLight);
    drawCornerBracket(ctx, 40, CARD_HEIGHT - 40, 1, -1, isLight);
    drawCornerBracket(ctx, CARD_WIDTH - 40, CARD_HEIGHT - 40, -1, -1, isLight);

    // Top and bottom mid diamond accents
    var diamondColor = isLight ? '#b57b28' : '#e2be76';
    drawDiamond(ctx, CARD_WIDTH / 2, 40, 6, diamondColor);
    drawDiamond(ctx, CARD_WIDTH / 2, CARD_HEIGHT - 40, 6, diamondColor);
    ctx.restore();
  }

  function drawDiamond(ctx, cx, cy, radius, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx + radius, cy);
    ctx.lineTo(cx, cy + radius);
    ctx.lineTo(cx - radius, cy);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawHeader(ctx, isLight) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Top pill badge
    drawRoundedRectPath(ctx, 245, 68, 260, 34, 17);
    ctx.fillStyle = isLight ? 'rgba(184, 118, 31, 0.1)' : 'rgba(216, 174, 94, 0.1)';
    ctx.fill();
    ctx.strokeStyle = isLight ? 'rgba(168, 116, 42, 0.42)' : 'rgba(216, 174, 94, 0.35)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.font = '500 18px ' + FONT_STACK;
    ctx.fillStyle = isLight ? '#7d5320' : '#cfa962';
    ctx.fillText('电子木鱼 · 静心修持', CARD_WIDTH / 2, 85);

    // Main title with gold gradient
    var titleGrad = ctx.createLinearGradient(220, 118, 530, 166);
    if (isLight) {
      titleGrad.addColorStop(0, '#6e4214');
      titleGrad.addColorStop(0.5, '#9b5f16');
      titleGrad.addColorStop(1, '#b8761f');
    } else {
      titleGrad.addColorStop(0, '#fae7ba');
      titleGrad.addColorStop(0.5, '#e2b65e');
      titleGrad.addColorStop(1, '#c38f39');
    }

    ctx.shadowColor = isLight ? 'rgba(155, 95, 22, 0.16)' : 'rgba(226, 182, 94, 0.28)';
    ctx.shadowBlur = 14;
    ctx.font = '700 46px ' + FONT_STACK;
    ctx.fillStyle = titleGrad;
    ctx.fillText('今日功德签', CARD_WIDTH / 2, 140);
    ctx.shadowBlur = 0;

    // Symmetrical ornamental divider
    var leftLine = ctx.createLinearGradient(110, 180, 336, 180);
    leftLine.addColorStop(0, isLight ? 'rgba(168, 116, 42, 0)' : 'rgba(216, 174, 94, 0)');
    leftLine.addColorStop(1, isLight ? 'rgba(168, 116, 42, 0.65)' : 'rgba(216, 174, 94, 0.65)');
    ctx.strokeStyle = leftLine;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(110, 180);
    ctx.lineTo(336, 180);
    ctx.stroke();

    var rightLine = ctx.createLinearGradient(414, 180, 640, 180);
    rightLine.addColorStop(0, isLight ? 'rgba(168, 116, 42, 0.65)' : 'rgba(216, 174, 94, 0.65)');
    rightLine.addColorStop(1, isLight ? 'rgba(168, 116, 42, 0)' : 'rgba(216, 174, 94, 0)');
    ctx.strokeStyle = rightLine;
    ctx.beginPath();
    ctx.moveTo(414, 180);
    ctx.lineTo(640, 180);
    ctx.stroke();

    drawDiamond(ctx, CARD_WIDTH / 2, 180, 6, isLight ? '#b57b28' : '#e2be76');
    ctx.beginPath();
    ctx.arc(CARD_WIDTH / 2 - 22, 180, 2.2, 0, Math.PI * 2);
    ctx.arc(CARD_WIDTH / 2 + 22, 180, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = isLight ? '#a06a22' : '#cfa962';
    ctx.fill();

    ctx.restore();
  }

  function drawWoodenFishIllustration(ctx) {
    ctx.save();
    var cx = 375;
    var cy = 344;

    // Concentric Zen halo rings
    var ringRadii = [116, 152, 190];
    var ringAlphas = [0.22, 0.13, 0.06];
    for (var i = 0; i < ringRadii.length; i += 1) {
      ctx.beginPath();
      ctx.arc(cx, cy, ringRadii[i], 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(226, 186, 106, ' + ringAlphas[i] + ')';
      ctx.lineWidth = i === 0 ? 1.8 : 1.2;
      ctx.stroke();
    }

    // Dashed inner enso accent circle
    ctx.save();
    ctx.setLineDash([4, 9]);
    ctx.beginPath();
    ctx.arc(cx, cy, 134, -Math.PI * 0.85, Math.PI * 0.88);
    ctx.strokeStyle = 'rgba(236, 198, 122, 0.28)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // Meditation cushion (蒲团)
    var cushionGrad = ctx.createLinearGradient(cx, 412, cx, 456);
    cushionGrad.addColorStop(0, '#442818');
    cushionGrad.addColorStop(0.5, '#2b180e');
    cushionGrad.addColorStop(1, '#170c06');

    ctx.beginPath();
    ctx.ellipse(cx, 434, 138, 22, 0, 0, Math.PI * 2);
    ctx.fillStyle = cushionGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(216, 174, 94, 0.45)';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Inner cushion rim highlight
    ctx.beginPath();
    ctx.ellipse(cx, 430, 114, 14, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(232, 194, 118, 0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Soft cast shadow on cushion
    ctx.beginPath();
    ctx.ellipse(cx - 4, 424, 98, 13, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fill();

    // Wooden fish body (centered slightly left to balance tail curl)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(270, 355);
    ctx.bezierCurveTo(266, 294, 314, 260, 378, 262);
    ctx.bezierCurveTo(434, 264, 476, 296, 488, 342);
    // Tail notch & curl
    ctx.bezierCurveTo(494, 364, 484, 392, 464, 405);
    ctx.bezierCurveTo(440, 421, 398, 424, 354, 423);
    ctx.bezierCurveTo(302, 422, 272, 396, 270, 355);
    ctx.closePath();

    var bodyGrad = ctx.createRadialGradient(346, 304, 18, 376, 352, 138);
    bodyGrad.addColorStop(0, '#be7a3f');
    bodyGrad.addColorStop(0.38, '#874b20');
    bodyGrad.addColorStop(0.76, '#53290e');
    bodyGrad.addColorStop(1, '#2b1305');

    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = bodyGrad;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Gold contour rim on wooden fish
    ctx.strokeStyle = '#dfb566';
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // Subtle wood-grain sheen on upper dome
    ctx.beginPath();
    ctx.moveTo(304, 298);
    ctx.quadraticCurveTo(366, 266, 434, 292);
    ctx.strokeStyle = 'rgba(255, 232, 182, 0.28)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Acoustic slit (鱼口) + resonator eye hole
    ctx.beginPath();
    ctx.moveTo(271, 356);
    ctx.bezierCurveTo(304, 350, 344, 354, 378, 360);
    ctx.bezierCurveTo(388, 361, 394, 366, 394, 371);
    ctx.bezierCurveTo(394, 377, 386, 380, 376, 379);
    ctx.bezierCurveTo(342, 375, 304, 372, 273, 367);
    ctx.closePath();
    ctx.fillStyle = '#180a04';
    ctx.fill();
    ctx.strokeStyle = 'rgba(232, 186, 102, 0.42)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Resonator circular hole connected to acoustic slit
    ctx.beginPath();
    ctx.arc(394, 369, 13.5, 0, Math.PI * 2);
    ctx.fillStyle = '#140803';
    ctx.fill();
    ctx.strokeStyle = 'rgba(235, 193, 114, 0.62)';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Carved scroll/scale motif on right side
    ctx.beginPath();
    ctx.moveTo(426, 336);
    ctx.bezierCurveTo(446, 332, 464, 344, 462, 362);
    ctx.bezierCurveTo(460, 377, 444, 384, 432, 376);
    ctx.strokeStyle = 'rgba(230, 186, 104, 0.5)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(436, 394);
    ctx.quadraticCurveTo(458, 392, 474, 376);
    ctx.strokeStyle = 'rgba(230, 186, 104, 0.36)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();

    // Wooden mallet (木槌) poised at top-right of dome
    ctx.save();
    ctx.translate(422, 250);
    ctx.rotate(-0.46);

    // Mallet handle
    ctx.beginPath();
    ctx.moveTo(8, -5);
    ctx.lineTo(126, -7);
    ctx.quadraticCurveTo(133, 0, 126, 7);
    ctx.lineTo(8, 5);
    ctx.closePath();

    var handleGrad = ctx.createLinearGradient(8, -7, 8, 7);
    handleGrad.addColorStop(0, '#c68447');
    handleGrad.addColorStop(0.5, '#864a1f');
    handleGrad.addColorStop(1, '#482209');
    ctx.fillStyle = handleGrad;
    ctx.fill();
    ctx.strokeStyle = '#dfb566';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Gold ferrule ring
    ctx.fillStyle = '#e7c378';
    ctx.fillRect(10, -5.5, 8, 11);

    // Striker head
    var headGrad = ctx.createRadialGradient(-6, -5, 2, 0, 0, 20);
    headGrad.addColorStop(0, '#fff0cc');
    headGrad.addColorStop(0.45, '#e2b666');
    headGrad.addColorStop(1, '#9d6a22');
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fillStyle = headGrad;
    ctx.fill();
    ctx.strokeStyle = '#fae1aa';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();

    // Subtle strike sound waves & 4-point sparkle
    ctx.save();
    ctx.strokeStyle = 'rgba(250, 224, 158, 0.55)';
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(404, 260, 26, -Math.PI * 0.85, -Math.PI * 0.35);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(250, 224, 158, 0.32)';
    ctx.beginPath();
    ctx.arc(404, 260, 38, -Math.PI * 0.82, -Math.PI * 0.38);
    ctx.stroke();

    // Tiny 4-point sparkle
    var sx = 398;
    var sy = 248;
    ctx.fillStyle = '#fce8b2';
    ctx.beginPath();
    ctx.moveTo(sx, sy - 8);
    ctx.quadraticCurveTo(sx + 1.5, sy - 1.5, sx + 8, sy);
    ctx.quadraticCurveTo(sx + 1.5, sy + 1.5, sx, sy + 8);
    ctx.quadraticCurveTo(sx - 1.5, sy + 1.5, sx - 8, sy);
    ctx.quadraticCurveTo(sx - 1.5, sy - 1.5, sx, sy - 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  function drawMantraPlaque(ctx, mantra, isLight) {
    ctx.save();
    var text = '「 ' + mantra + ' 」';
    var boxX = 95;
    var boxY = 486;
    var boxW = CARD_WIDTH - 190;
    var boxH = 74;

    drawRoundedRectPath(ctx, boxX, boxY, boxW, boxH, 37);
    var plaqueGrad = ctx.createLinearGradient(boxX, boxY, boxX + boxW, boxY);
    if (isLight) {
      plaqueGrad.addColorStop(0, 'rgba(184, 118, 31, 0.06)');
      plaqueGrad.addColorStop(0.5, 'rgba(184, 118, 31, 0.14)');
      plaqueGrad.addColorStop(1, 'rgba(184, 118, 31, 0.06)');
    } else {
      plaqueGrad.addColorStop(0, 'rgba(216, 174, 94, 0.05)');
      plaqueGrad.addColorStop(0.5, 'rgba(216, 174, 94, 0.14)');
      plaqueGrad.addColorStop(1, 'rgba(216, 174, 94, 0.05)');
    }
    ctx.fillStyle = plaqueGrad;
    ctx.fill();

    ctx.strokeStyle = isLight ? 'rgba(168, 116, 42, 0.44)' : 'rgba(226, 188, 114, 0.45)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitFontSize(ctx, text, boxW - 56, 30, 18, '600');
    ctx.fillStyle = isLight ? '#5c3814' : '#fae7bc';
    ctx.fillText(text, CARD_WIDTH / 2, boxY + boxH / 2 + 1);
    ctx.restore();
  }

  function drawStatsSection(ctx, stats, isLight) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Hero stat: Today's Merits
    ctx.font = '500 22px ' + FONT_STACK;
    ctx.fillStyle = isLight ? '#7d582b' : '#c4a66d';
    ctx.fillText('今 日 功 德', CARD_WIDTH / 2, 598);

    var todayStr = formatCount(stats.todayMerits);
    var heroSize = fitFontSize(ctx, todayStr, 600, 78, 42, '700');
    var heroGrad = ctx.createLinearGradient(230, 622, 520, 704);
    if (isLight) {
      heroGrad.addColorStop(0, '#704112');
      heroGrad.addColorStop(0.5, '#9b5f16');
      heroGrad.addColorStop(1, '#ba7a22');
    } else {
      heroGrad.addColorStop(0, '#fff3d2');
      heroGrad.addColorStop(0.5, '#e7bd67');
      heroGrad.addColorStop(1, '#c79036');
    }

    ctx.shadowColor = isLight ? 'rgba(155, 95, 22, 0.16)' : 'rgba(231, 189, 103, 0.25)';
    ctx.shadowBlur = 16;
    ctx.font = '700 ' + heroSize + 'px ' + FONT_STACK;
    ctx.fillStyle = heroGrad;
    ctx.fillText(todayStr, CARD_WIDTH / 2, 666);
    ctx.shadowBlur = 0;

    // Secondary stats container (Total & Session)
    var cardX = 76;
    var cardY = 732;
    var cardW = CARD_WIDTH - 152;
    var cardH = 112;

    drawRoundedRectPath(ctx, cardX, cardY, cardW, cardH, 18);
    ctx.fillStyle = isLight ? 'rgba(184, 118, 31, 0.06)' : 'rgba(255, 236, 194, 0.045)';
    ctx.fill();
    ctx.strokeStyle = isLight ? 'rgba(168, 116, 42, 0.28)' : 'rgba(216, 174, 94, 0.26)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Vertical divider
    ctx.beginPath();
    ctx.moveTo(CARD_WIDTH / 2, cardY + 22);
    ctx.lineTo(CARD_WIDTH / 2, cardY + cardH - 22);
    ctx.strokeStyle = isLight ? 'rgba(168, 116, 42, 0.25)' : 'rgba(216, 174, 94, 0.24)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    var leftCx = cardX + cardW * 0.25;
    var rightCx = cardX + cardW * 0.75;

    ctx.font = '500 20px ' + FONT_STACK;
    ctx.fillStyle = isLight ? '#7e5d38' : '#a8926a';
    ctx.fillText('累计功德', leftCx, cardY + 34);
    ctx.fillText('本轮敲击', rightCx, cardY + 34);

    var totalStr = formatCount(stats.totalMerits);
    var sessionStr = formatCount(stats.sessionMerits);

    fitFontSize(ctx, totalStr, cardW * 0.42, 36, 20, '700');
    ctx.fillStyle = isLight ? '#4a2e14' : '#f3ddb2';
    ctx.fillText(totalStr, leftCx, cardY + 76);

    fitFontSize(ctx, sessionStr, cardW * 0.42, 36, 20, '700');
    ctx.fillStyle = isLight ? '#4a2e14' : '#f3ddb2';
    ctx.fillText(sessionStr, rightCx, cardY + 76);

    ctx.restore();
  }

  function drawFooterAndSeal(ctx, dateText, modeLabel, isLight) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Date and mode metadata tag
    var metaText = dateText + '  ·  ' + modeLabel;
    fitFontSize(ctx, metaText, 440, 20, 15, '500');
    ctx.fillStyle = isLight ? '#6e4f2d' : '#bca375';
    ctx.fillText(metaText, CARD_WIDTH / 2, 880);

    // Zen footer text
    ctx.font = '500 18px ' + FONT_STACK;
    ctx.fillStyle = isLight ? 'rgba(125, 84, 34, 0.78)' : 'rgba(212, 176, 108, 0.65)';
    ctx.fillText('心静一念 · 功德随行', CARD_WIDTH / 2, 914);

    // Personal watermark
    ctx.font = '500 15px ' + FONT_STACK;
    ctx.fillStyle = isLight ? 'rgba(125, 84, 34, 0.64)' : 'rgba(212, 176, 108, 0.48)';
    ctx.fillText('made by 八根草', CARD_WIDTH / 2, 944);

    // Traditional vermilion Zen seal stamp at bottom-right
    var stampX = 632;
    var stampY = 876;
    var stampSize = 48;

    ctx.save();
    drawRoundedRectPath(ctx, stampX, stampY, stampSize, stampSize, 6);
    ctx.fillStyle = isLight ? 'rgba(184, 59, 44, 0.1)' : 'rgba(176, 52, 42, 0.16)';
    ctx.fill();
    ctx.strokeStyle = isLight ? '#b83b2c' : '#c44536';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = '700 17px ' + FONT_STACK;
    ctx.fillStyle = isLight ? '#b83b2c' : '#d45445';
    ctx.fillText('功', stampX + stampSize / 2, stampY + 15);
    ctx.fillText('德', stampX + stampSize / 2, stampY + 34);
    ctx.restore();

    ctx.restore();
  }

  function renderMeritCard(stats) {
    var input = (stats && typeof stats === 'object') ? stats : {};
    var isLight = input.theme === 'light';
    var normalized = {
      totalMerits: toSafeCount(input.totalMerits),
      todayMerits: toSafeCount(input.todayMerits),
      sessionMerits: toSafeCount(input.sessionMerits),
      mantra: normalizeText(input.mantra, '功德 +1'),
      dateText: normalizeText(input.dateText, formatTodayDate()),
      modeLabel: normalizeText(input.modeLabel, '静心敲击')
    };

    var canvas = document.createElement('canvas');
    canvas.width = CARD_WIDTH;
    canvas.height = CARD_HEIGHT;

    var ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('无法获取 Canvas 2D 上下文');
    }

    drawBackground(ctx, isLight);
    drawZenFrame(ctx, isLight);
    drawHeader(ctx, isLight);
    drawWoodenFishIllustration(ctx);
    drawMantraPlaque(ctx, normalized.mantra, isLight);
    drawStatsSection(ctx, normalized, isLight);
    drawFooterAndSeal(ctx, normalized.dateText, normalized.modeLabel, isLight);

    return canvas;
  }

  global.WoodenFishShareCard = {
    renderMeritCard: renderMeritCard
  };
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : global));
