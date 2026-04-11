function renderProgressView() {
  progressTableRenderToken++;
  const config = getProgressViewConfig();
  const { chapterId: chId, displayMode, sortOrder, layoutMode, weakFilter, searchQuery } = config;

  const container = document.getElementById('progress-view-container');
  if (!container) return;
  container.innerHTML = '';
  const statusDiv = document.getElementById('chapter-mastery-status');
  if (!statusDiv) return;

  if (!chId) {
    progressVirtualState = null;
    progressChunkState = null;
    statusDiv.innerHTML = '章を選択してください';
    return;
  }
  
  const chapterMap = {};
  appData.chapters.forEach(ch => {
    chapterMap[ch.id] = ch.name || ch.title || '章';
  });

  const wordIndexMap = {};
  const chapterCounters = {};
  appData.words.forEach(w => {
    if (!chapterCounters[w.chapterId]) chapterCounters[w.chapterId] = 0;
    chapterCounters[w.chapterId]++;
    wordIndexMap[w.id] = chapterCounters[w.chapterId];
  });

  const currentChapterIds = appData.chapters.filter(ch => ch.bookId === appData.currentBookId).map(ch => ch.id);
  const chapterOrderMap = {};
  currentChapterIds.forEach((id, index) => {
    chapterOrderMap[id] = index;
  });

  let allWordsInChapter = chId === 'all'
    ? [...appData.words.filter(w => currentChapterIds.includes(w.chapterId))]
    : [...appData.words.filter(w => w.chapterId === chId)];
    
  if (chId === 'all') {
    allWordsInChapter.sort((a, b) => {
      const orderA = chapterOrderMap[a.chapterId] !== undefined ? chapterOrderMap[a.chapterId] : 9999;
      const orderB = chapterOrderMap[b.chapterId] !== undefined ? chapterOrderMap[b.chapterId] : 9999;
      return orderA - orderB;
    });
  }

  const totalWords = allWordsInChapter.length;
  const targetThreshold = getCurrentMasteryThreshold();
  const masteredWords = allWordsInChapter.filter(w => (w.streak || 0) >= targetThreshold).length;
  
  if (totalWords > 0) {
    const percent = Math.round((masteredWords / totalWords) * 100);
    statusDiv.innerHTML = `🏆 習得: <span style="font-size: 1.4em; color: #27ae60;">${masteredWords}</span> / ${totalWords} 語 <span style="font-size: 0.9em; color: #7f8c8d;">(${percent}%)</span>`;
  } else {
    statusDiv.innerHTML = `単語がありません`;
  }
  
  let displayWords = [...allWordsInChapter];
  if (weakFilter === 'weak') {
    const currentSession = appData.quizSessionId || 0;
    displayWords = displayWords.filter(w => {
      const notMastered = (w.streak || 0) < targetThreshold;
      const recentlyMistaken = w.lastMistakeQuizId && (currentSession - w.lastMistakeQuizId <= 5);
      return notMastered && recentlyMistaken;
    });
    if (displayWords.length === 0 && totalWords > 0) {
      progressVirtualState = null;
      progressChunkState = null;
      container.innerHTML = '<div style="text-align:center; padding: 20px; font-weight: bold; color: #27ae60;">🎉 苦手な単語はありません</div>';
      return;
    }
  }
  
  if (searchQuery) {
    displayWords = displayWords.filter(w => {
      const enMatch = w.en && w.en.toLowerCase().includes(searchQuery);
      const jaMatch = w.ja && w.ja.toLowerCase().includes(searchQuery);
      return enMatch || jaMatch;
    });
    if (displayWords.length === 0) {
      progressVirtualState = null;
      progressChunkState = null;
      container.innerHTML = '<div style="text-align:center; padding: 20px; color: #7f8c8d;">検索に一致する単語が見つかりません</div>';
      return;
    }
  }
  
  if (sortOrder === 'random') displayWords.sort(() => 0.5 - Math.random());
  if (sortOrder === 'streak') displayWords.sort((a,b) => (b.streak||0) - (a.streak||0));
  if (sortOrder === 'streak-asc') displayWords.sort((a,b) => (a.streak||0) - (b.streak||0));
  
  const savedState = getSavedProgressViewState();
  const viewKey = JSON.stringify(config);
  const scrollKey = getProgressScrollKey(config);
  const savedScrollTop = (savedState.lastScrollKey === scrollKey && typeof savedState.scrollTop === 'number') ? savedState.scrollTop : 0;

  saveProgressViewState({ ...config, lastViewKey: viewKey, lastScrollKey: scrollKey });

  const showEn = displayMode === 'all' || displayMode === 'en-only';
  const showJa = displayMode === 'all' || displayMode === 'ja-only';

  const createVoiceBtn = (text, color = 'var(--text-secondary)', bg = 'var(--bg-soft-button)') => {
    if (!text) return '';
    const safeText = text
      .replace(/<[^>]*>?/gm, '')
      .replace(/'/g, "\\'")
      .replace(/"/g, '&quot;')
      .replace(/\r?\n/g, ' ');
    return `<button onclick="event.stopPropagation(); playVoice('${safeText}')" style="margin-left:8px; background:${bg}; border:none; color:${color}; border-radius:12px; padding:4px 10px; font-size:11px; font-weight:bold; cursor:pointer; flex-shrink:0; vertical-align:middle; box-shadow:0 2px 4px rgba(0,0,0,0.05); letter-spacing:0.5px;">音声</button>`;
  };

  const createListCardHtml = (w, now) => {
    const enText = createMaskableText(w.en, showEn, true);
    const jaText = createMaskableText(w.ja, showJa, false);
    const exEnText = w.ex ? createMaskableText(w.ex, showEn, false, w.en) : '';
    const exJaText = w.exJa ? createMaskableText(w.exJa, showJa, false, w.ja) : '';
    const s = w.streak || 0;
    const target = targetThreshold;
    const width = Math.min(100, (s / target) * 100);
    const rem = (w.nextReviewTime || 0) - now;

    const statusBg = (s >= target) ? (rem <= 0 ? 'var(--review-ready)' : 'var(--success)') : 'var(--border-soft)';
    const statusColor = (s >= target) ? '#fff' : '#7f8c8d';
    const statusText = (s >= target) ? (rem <= 0 ? '復習可' : '待機中') : '学習中';

    return `<div class="progress-card" style="margin-bottom: 15px; background: var(--bg-surface); border-radius: 12px; padding: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid var(--border); box-sizing: border-box;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; gap: 8px;">
        <div style="flex: 1; min-width: 0; overflow-wrap: break-word; word-break: break-word;">
          <span style="font-size:1.2em; font-weight: bold;">${enText}</span>${createVoiceBtn(w.en)}
        </div>
        <span class="${s >= target ? 'time-display' : ''}" data-next-time="${w.nextReviewTime}" style="font-size: 0.8em; padding: 4px 10px; border-radius: 12px; background: ${statusBg}; color: ${statusColor}; font-weight: bold; white-space: nowrap; flex-shrink: 0; margin-top: 4px;">${statusText}</span>
      </div>
      <div style="margin-bottom:8px; word-break: break-word; overflow-wrap: break-word;">${jaText}</div>
      ${w.ex ? `<div style="color:var(--text-secondary); margin-top:4px; overflow-wrap:break-word; word-break:break-word;">${exEnText}${createVoiceBtn(w.ex, 'var(--success)', 'var(--success-soft)')}</div>` : ''}
      ${w.exJa ? `<div style="font-size:0.9em; color:var(--text-secondary); margin-top:2px; word-break:break-word; overflow-wrap:break-word;">${exJaText}</div>` : ''}
      <div style="background: var(--border-soft); border-radius: 10px; height: 6px; width: 100%; margin: 15px 0 8px; overflow: hidden;">
        <div style="background: var(--primary); height: 100%; width: ${width}%;"></div>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 0.8em; color: var(--text-secondary);">
        <span>${chapterMap[w.chapterId]} : ${wordIndexMap[w.id]}</span>
        <span>習得度 ${s}/${target}</span>
      </div>
    </div>`;
  };

  const createTableRowHtml = (w, now) => {
    const enText = createMaskableText(w.en, showEn, true);
    const jaText = createMaskableText(w.ja, showJa, false);
    const exEn = w.ex ? createMaskableText(w.ex, showEn, false, w.en) : '<span style="color: var(--text-secondary);">-</span>';
    const exJa = w.exJa ? createMaskableText(w.exJa, showJa, false, w.ja) : '<span style="color: var(--text-secondary);">-</span>';

    return `<tr>
      <td style="padding:12px; border-bottom:1px solid var(--border); vertical-align:top; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
        <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"><span style="font-weight:bold;">${enText}</span>${createVoiceBtn(w.en)}</div>
      </td>
      <td style="padding:12px; border-bottom:1px solid var(--border); vertical-align:top; overflow-wrap:break-word; word-break:break-word;">${jaText}</td>
      <td style="padding:12px; border-bottom:1px solid var(--border); vertical-align:top; overflow-wrap:break-word; word-break:break-word;">${exEn}${w.ex ? createVoiceBtn(w.ex, 'var(--success)', 'var(--success-soft)') : ''}</td>
      <td style="padding:12px; border-bottom:1px solid var(--border); vertical-align:top; overflow-wrap:break-word; word-break:break-word;">${exJa}</td>
    </tr>`;
  };

  if (layoutMode === 'table') {
    const now = Date.now();
    const currentToken = progressTableRenderToken;
    container.innerHTML = `<div style="overflow-x: auto; border-radius: 12px; border: 1px solid var(--border); background: var(--bg-surface);"><table style="width: 100%; border-collapse: collapse; table-layout: fixed;"><colgroup><col style="width:25%;"><col style="width:25%;"><col style="width:25%;"><col style="width:25%;"></colgroup><thead><tr style="background: var(--bg-muted);"><th style="padding:12px; text-align:left; border-bottom:2px solid var(--border); white-space:nowrap;">英単語</th><th style="padding:12px; text-align:left; border-bottom:2px solid var(--border);">日本語訳</th><th style="padding:12px; text-align:left; border-bottom:2px solid var(--border);">例文</th><th style="padding:12px; text-align:left; border-bottom:2px solid var(--border);">例文訳</th></tr></thead><tbody id="progress-table-body"></tbody></table></div>`;

    const tbody = document.getElementById('progress-table-body');
    if (!tbody) return;

    let index = 0;
    let restoredScroll = false;
    const appendChunk = () => {
      if (currentToken !== progressTableRenderToken) return;
      const end = Math.min(displayWords.length, index + TABLE_RENDER_BATCH_SIZE);
      let html = '';
      for (; index < end; index++) {
        html += createTableRowHtml(displayWords[index], now);
      }
      if (html) tbody.insertAdjacentHTML('beforeend', html);

      if (!restoredScroll) {
        container.scrollTop = savedScrollTop;
        restoredScroll = true;
      }

      if (index < displayWords.length) requestAnimationFrame(appendChunk);
      else if (typeof updateTimeDisplays === 'function') updateTimeDisplays();
    };

    appendChunk();
    progressVirtualState = null;
    progressChunkState = null;
    return;
  }

  progressVirtualState = null;
  progressChunkState = null;
  if (progressSettleTimer) {
    clearTimeout(progressSettleTimer);
    progressSettleTimer = null;
  }

  const currentToken = progressTableRenderToken;
  container.innerHTML = '';
  const now = Date.now();
  const estimatedItemHeight = 210;
  const anchorIndex = Math.max(0, Math.min(displayWords.length - 1, Math.floor(savedScrollTop / estimatedItemHeight)));
  const half = Math.floor(INITIAL_RENDER_BATCH_SIZE / 2);
  const startIndex = Math.max(0, anchorIndex - half);
  const endIndex = Math.min(displayWords.length, startIndex + INITIAL_RENDER_BATCH_SIZE);

  container.innerHTML = '<div id="progress-top-spacer"></div><div id="progress-items-host"></div><div id="progress-bottom-spacer"></div>';
  const topSpacerEl = document.getElementById('progress-top-spacer');
  const hostEl = document.getElementById('progress-items-host');
  const bottomSpacerEl = document.getElementById('progress-bottom-spacer');

  progressChunkState = {
    container,
    words: displayWords,
    token: currentToken,
    renderListCard: createListCardHtml,
    now,
    estimatedItemHeight,
    startIndex,
    endIndex: startIndex,
    topSpacerEl,
    hostEl,
    bottomSpacerEl
  };

  updateProgressChunkSpacers();
  appendProgressChunkForward(endIndex - startIndex);
  container.scrollTop = Math.max(0, savedScrollTop);
  ensureProgressChunkCoverage();
  setTimeout(() => { suppressProgressScrollSave = false; }, 0);

  if (typeof updateTimeDisplays === 'function') updateTimeDisplays();
}

function updateProgressChunkSpacers() {
  if (!progressChunkState) return;
  const { words, startIndex, endIndex, estimatedItemHeight, topSpacerEl, bottomSpacerEl } = progressChunkState;
  if (!topSpacerEl || !bottomSpacerEl) return;
  topSpacerEl.style.height = `${Math.max(0, startIndex * estimatedItemHeight)}px`;
  bottomSpacerEl.style.height = `${Math.max(0, (words.length - endIndex) * estimatedItemHeight)}px`;
}

function appendProgressChunkForward(count = RENDER_BATCH_SIZE) {
  if (!progressChunkState) return;
  const { words, token, renderListCard, now, hostEl } = progressChunkState;
  if (!hostEl || token !== progressTableRenderToken) return;

  const from = progressChunkState.endIndex;
  const end = Math.min(words.length, from + count);
  if (from >= end) return;

  let html = '';
  for (let i = from; i < end; i++) {
    html += renderListCard(words[i], now);
  }
  progressChunkState.endIndex = end;
  if (html) hostEl.insertAdjacentHTML('beforeend', html);
  updateProgressChunkSpacers();
  if (typeof updateTimeDisplays === 'function') updateTimeDisplays();
}

function appendProgressChunkBackward(count = RENDER_BATCH_SIZE) {
  if (!progressChunkState) return;
  const { words, token, renderListCard, now, hostEl, container } = progressChunkState;
  if (!hostEl || !container || token !== progressTableRenderToken) return;

  const prevStart = progressChunkState.startIndex;
  const nextStart = Math.max(0, prevStart - count);
  if (nextStart >= prevStart) return;

  let html = '';
  for (let i = nextStart; i < prevStart; i++) {
    html += renderListCard(words[i], now);
  }
  if (!html) return;

  const marker = document.createElement('div');
  hostEl.insertBefore(marker, hostEl.firstChild);
  marker.insertAdjacentHTML('beforebegin', html);

  let addedHeight = 0;
  let node = hostEl.firstChild;
  while (node && node !== marker) {
    addedHeight += node.offsetHeight;
    node = node.nextSibling;
  }
  marker.remove();

  progressChunkState.startIndex = nextStart;
  updateProgressChunkSpacers();
  if (addedHeight > 0) container.scrollTop += addedHeight;

  if (typeof updateTimeDisplays === 'function') updateTimeDisplays();
}

function ensureProgressChunkCoverage() {
  if (!progressChunkState) return;
  const { container, words, estimatedItemHeight } = progressChunkState;
  if (!container || !estimatedItemHeight || words.length === 0) return;

  const buffer = 4;
  const firstVisible = Math.max(0, Math.floor(container.scrollTop / estimatedItemHeight));
  const lastVisible = Math.max(firstVisible, Math.floor((container.scrollTop + container.clientHeight) / estimatedItemHeight));
  const neededStart = Math.max(0, firstVisible - buffer);
  const neededEnd = Math.min(words.length, lastVisible + buffer + 1);

  const missingBefore = Math.max(0, progressChunkState.startIndex - neededStart);
  const missingAfter = Math.max(0, neededEnd - progressChunkState.endIndex);
  if (missingBefore > 0 || missingAfter > INITIAL_RENDER_BATCH_SIZE) {
    const { hostEl, renderListCard, now } = progressChunkState;
    if (hostEl) {
      const half = Math.floor(INITIAL_RENDER_BATCH_SIZE / 2);
      const anchorStart = Math.max(0, firstVisible - half);
      const anchorEnd = Math.min(words.length, anchorStart + INITIAL_RENDER_BATCH_SIZE);
      let html = '';
      for (let i = anchorStart; i < anchorEnd; i++) {
        html += renderListCard(words[i], now);
      }
      hostEl.innerHTML = html;
      progressChunkState.startIndex = anchorStart;
      progressChunkState.endIndex = anchorEnd;
      updateProgressChunkSpacers();
      if (typeof updateTimeDisplays === 'function') updateTimeDisplays();
      return;
    }
  }

  let guard = 0;
  while (progressChunkState && progressChunkState.endIndex < neededEnd && guard < 20) {
    appendProgressChunkForward(RENDER_BATCH_SIZE);
    guard++;
  }
}

function renderProgressVirtualWindow() {
  const container = document.getElementById('progress-view-container');
  if (!container || !progressVirtualState) return;

  const now = Date.now();
  const { words, startIndex, endIndex, estimatedItemHeight } = progressVirtualState;

  const topSpacer = progressVirtualState.topSpacerEl || document.getElementById('progress-top-spacer');
  const bottomSpacer = progressVirtualState.bottomSpacerEl || document.getElementById('progress-bottom-spacer');
  const host = progressVirtualState.hostEl || document.getElementById('progress-items-host');
  if (!topSpacer || !bottomSpacer || !host) return;

  progressVirtualState.topSpacerEl = topSpacer;
  progressVirtualState.bottomSpacerEl = bottomSpacer;
  progressVirtualState.hostEl = host;

  const applyProgressSpacerHeights = () => {
    const topH = progressVirtualState.startIndex * progressVirtualState.estimatedItemHeight;
    topSpacer.style.height = `${topH}px`;
    bottomSpacer.style.height = `${Math.max(0, (words.length - progressVirtualState.endIndex) * progressVirtualState.estimatedItemHeight)}px`;
  };

  applyProgressSpacerHeights();

  const createCard = (word) => {
    const template = document.createElement('template');
    template.innerHTML = progressVirtualState.renderListCard(word, now).trim();
    return template.content.firstElementChild;
  };

  if (progressVirtualState.renderedStart === null || progressVirtualState.renderedEnd === null) {
    host.innerHTML = '';
    for (let i = startIndex; i < endIndex; i++) {
      const card = createCard(words[i]);
      if (card) host.appendChild(card);
    }
    progressVirtualState.renderedStart = startIndex;
    progressVirtualState.renderedEnd = endIndex;
    return;
  }

  const renderedStart = progressVirtualState.renderedStart;
  const renderedEnd = progressVirtualState.renderedEnd;
  const largeJump = Math.abs(startIndex - renderedStart) > progressVirtualState.windowSize;

  if (largeJump) {
    host.innerHTML = '';
    for (let i = startIndex; i < endIndex; i++) {
      const card = createCard(words[i]);
      if (card) host.appendChild(card);
    }
    progressVirtualState.renderedStart = startIndex;
    progressVirtualState.renderedEnd = endIndex;
    return;
  }

  let currentStart = renderedStart;
  let currentEnd = renderedEnd;

  while (currentStart > startIndex) {
    currentStart--;
    const card = createCard(words[currentStart]);
    if (card) host.insertBefore(card, host.firstChild);
  }

  while (currentEnd < endIndex) {
    const card = createCard(words[currentEnd]);
    if (card) host.appendChild(card);
    currentEnd++;
  }

  while (currentStart < startIndex) {
    if (!host.firstElementChild) break;
    host.removeChild(host.firstElementChild);
    currentStart++;
  }

  while (currentEnd > endIndex) {
    if (!host.lastElementChild) break;
    host.removeChild(host.lastElementChild);
    currentEnd--;
  }

  progressVirtualState.renderedStart = currentStart;
  progressVirtualState.renderedEnd = currentEnd;

  let measuredTotal = 0;
  let measuredCount = 0;
  for (const child of host.children) {
    measuredTotal += child.offsetHeight;
    measuredCount++;
  }
  if (measuredCount > 0 && (Date.now() - (progressVirtualState.lastScrollAt || 0)) > 120) {
    const measuredAverage = measuredTotal / measuredCount;
    const prev = progressVirtualState.estimatedItemHeight;
    const next = prev * 0.8 + measuredAverage * 0.2;
    if (Math.abs(next - prev) >= 0.5) {
      progressVirtualState.estimatedItemHeight = next;
      applyProgressSpacerHeights();
    }
  }
}

function getProgressFirstVisibleIndex(container, state) {
  const host = state.hostEl || document.getElementById('progress-items-host');
  if (!host || state.renderedStart === null) {
    return Math.max(0, Math.floor(container.scrollTop / state.estimatedItemHeight));
  }

  const viewTop = container.scrollTop;
  let idx = 0;
  for (const child of host.children) {
    if ((child.offsetTop + child.offsetHeight) > viewTop) {
      return state.renderedStart + idx;
    }
    idx++;
  }

  return Math.max(0, Math.floor(container.scrollTop / state.estimatedItemHeight));
}

function handleProgressVirtualScroll() {
  const container = document.getElementById('progress-view-container');
  if (!container) return;
  if (suppressProgressScrollSave) return;

  const activeConfig = progressVirtualState ? progressVirtualState.config : getProgressViewConfig();
  const activeKey = progressVirtualState ? progressVirtualState.viewKey : JSON.stringify(activeConfig);
  const activeScrollKey = getProgressScrollKey(activeConfig);
  if (progressScrollSaveTimer) clearTimeout(progressScrollSaveTimer);
  progressScrollSaveTimer = setTimeout(() => {
    saveProgressViewState({ ...activeConfig, lastViewKey: activeKey, lastScrollKey: activeScrollKey, scrollTop: container.scrollTop });
    lastProgressStateSaveAt = Date.now();
    progressScrollSaveTimer = null;
  }, 220);

  if (progressChunkState) {
    ensureProgressChunkCoverage();
    return;
  }

  if (!progressVirtualState || progressVirtualState.layoutMode === 'table') return;
  progressVirtualState.lastScrollAt = Date.now();
  if (progressScrollRafPending) return;

  progressScrollRafPending = true;
  requestAnimationFrame(() => {
    progressScrollRafPending = false;
    if (!progressVirtualState || progressVirtualState.layoutMode === 'table') return;

    const total = progressVirtualState.words.length;
    if (total === 0) return;

    const nowTs = performance.now();
    const prevTop = typeof progressVirtualState.lastScrollTop === 'number' ? progressVirtualState.lastScrollTop : container.scrollTop;
    const prevTime = typeof progressVirtualState.lastScrollTime === 'number' ? progressVirtualState.lastScrollTime : nowTs;
    const dt = Math.max(1, nowTs - prevTime);
    const velocity = Math.abs(container.scrollTop - prevTop) / dt;
    progressVirtualState.lastScrollTop = container.scrollTop;
    progressVirtualState.lastScrollTime = nowTs;

    const preload = progressVirtualState.preloadBuffer;
    const base = progressVirtualState.windowSize;
    const maxVisible = total - 1;
    const roughVisible = Math.max(0, Math.min(maxVisible, Math.floor(container.scrollTop / progressVirtualState.estimatedItemHeight)));
    const baseStep = Math.max(1, progressVirtualState.updateStep || 1);
    let mode = progressVirtualState.scrollStepMode || 1;
    if (mode === 1 && velocity > 2.0) mode = 2;
    else if (mode === 2 && velocity > 2.8) mode = 3;
    else if (mode === 2 && velocity < 1.2) mode = 1;
    else if (mode === 3 && velocity < 2.0) mode = 2;
    progressVirtualState.scrollStepMode = mode;

    const dynamicStep = mode === 3 ? baseStep * 3 : (mode === 2 ? baseStep * 2 : 1);
    const firstVisible = mode === 1 ? roughVisible : Math.floor(roughVisible / dynamicStep) * dynamicStep;
    const maxStart = Math.max(0, total - base);
    const nextStart = Math.max(0, Math.min(maxStart, firstVisible - preload));
    const nextEnd = Math.min(total, Math.max(nextStart + base, firstVisible + preload));

    if (dynamicStep > 1 && Math.abs(nextStart - progressVirtualState.startIndex) < dynamicStep && Math.abs(nextEnd - progressVirtualState.endIndex) < dynamicStep) {
      return;
    }

    if (nextStart !== progressVirtualState.startIndex || nextEnd !== progressVirtualState.endIndex) {
      progressVirtualState.startIndex = nextStart;
      progressVirtualState.endIndex = nextEnd;
      renderProgressVirtualWindow();
    }
  });

  if (progressSettleTimer) clearTimeout(progressSettleTimer);
  progressSettleTimer = setTimeout(() => {
    if (!progressVirtualState || progressVirtualState.layoutMode === 'table') return;
    progressVirtualState.lastScrollAt = 0;
    progressVirtualState.scrollStepMode = 1;
    const total = progressVirtualState.words.length;
    if (total === 0) return;
    const maxVisible = total - 1;
    const roughVisible = Math.max(0, Math.min(maxVisible, Math.floor(container.scrollTop / progressVirtualState.estimatedItemHeight)));
    const stableFirst = roughVisible;
    const maxStart = Math.max(0, total - progressVirtualState.windowSize);
    const nextStart = Math.max(0, Math.min(maxStart, stableFirst - progressVirtualState.preloadBuffer));
    const nextEnd = Math.min(total, Math.max(nextStart + progressVirtualState.windowSize, stableFirst + progressVirtualState.preloadBuffer));
    if (nextStart !== progressVirtualState.startIndex || nextEnd !== progressVirtualState.endIndex) {
      progressVirtualState.startIndex = nextStart;
      progressVirtualState.endIndex = nextEnd;
      renderProgressVirtualWindow();
    }
    progressSettleTimer = null;
  }, 90);
}
