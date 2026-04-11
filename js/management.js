function updateChapterSelects() {
  const currentChapters = appData.chapters.filter(ch => ch.bookId === appData.currentBookId);
  ['chapter-select', 'csv-chapter-select', 'progress-chapter-select', 'filter-chapter-select'].forEach(id => {
    const s = document.getElementById(id);
    if(!s) return;
    const current = s.value;
    s.innerHTML = '';
    if (id === 'filter-chapter-select' || id === 'progress-chapter-select') {
      s.innerHTML += '<option value="all">🌐 全範囲</option>';
    }
    currentChapters.forEach(ch => { s.innerHTML += `<option value="${ch.id}">${ch.name}</option>`; });
    if (current && Array.from(s.options).some(opt => opt.value === current)) s.value = current;
    else if (s.options.length > 0) s.value = s.options[0].value;

    if (id === 'filter-chapter-select') {
      const savedWordList = getSavedWordListViewState();
      if (savedWordList && savedWordList.filterChapterId && Array.from(s.options).some(opt => opt.value === savedWordList.filterChapterId)) {
        s.value = savedWordList.filterChapterId;
      }
    }
  });

  const box = document.getElementById('quiz-chapter-checkboxes');
  if (box) {
    box.innerHTML = `<label style="display:block; margin-bottom:10px; font-weight:bold; color:#2980b9; cursor:pointer; background:#fff; padding:12px; border-radius:8px; border:1px solid #e2e8f0;">
      <input type="checkbox" id="quiz-select-all" checked onchange="toggleAllQuizChapters(this)"> 🌐 全範囲
    </label>`;
    currentChapters.forEach(ch => {
      box.innerHTML += `<label style="display:block; margin-bottom:8px; cursor:pointer; padding:8px 12px; background:#fff; border-radius:8px; border:1px solid #e2e8f0;"><input type="checkbox" name="quiz-chapters" class="quiz-chapter-cb" value="${ch.id}" checked onchange="updateQuizSelectAll()"> ${ch.name}</label>`;
    });
  }
}

function toggleAllQuizChapters(source) { document.querySelectorAll('.quiz-chapter-cb').forEach(cb => cb.checked = source.checked); }
function updateQuizSelectAll() {
  const allChecked = Array.from(document.querySelectorAll('.quiz-chapter-cb')).every(cb => cb.checked);
  const selectAllCb = document.getElementById('quiz-select-all');
  if (selectAllCb) selectAllCb.checked = allChecked;
}

function renderChapterList(movedId = null) {
  const list = document.getElementById('chapter-list');
  if (!list) return;

  // ▼ 変更：背景を灰色（#f8f9fa）にして、余白などを整えました
  list.style.maxHeight = '50vh';
  list.style.overflowY = 'auto';
  list.style.backgroundColor = 'var(--bg-muted)';
  list.style.padding = '10px';            // 内側に少し余白を持たせて綺麗に
  list.style.borderRadius = '8px';        // 角を少しだけ丸く

  list.innerHTML = '';
  const currentChapters = appData.chapters.filter(ch => ch.bookId === appData.currentBookId);
  currentChapters.forEach((ch, idx) => {
    // ▼ 変更：点線（border-bottom）を削除してスッキリさせました
    list.innerHTML += `<li style="margin-bottom: 10px;">
      <strong style="display:block; margin-bottom:10px; font-size:16px;">${ch.name}</strong>
      <div class="chapter-actions">
        <button class="small-btn reset" onclick="resetChapterProgress('${ch.id}')">リセット</button>
        <button class="edit-btn" onclick="editChapter('${ch.id}')">･･･</button>
        <button class="small-btn" onclick="moveChapter('${ch.id}', -1)" ${idx===0?'disabled':''}>↑</button>
        <button class="small-btn" onclick="moveChapter('${ch.id}', 1)" ${idx===currentChapters.length-1?'disabled':''}>↓</button>
        <button class="delete" onclick="deleteChapter('${ch.id}')">削除</button>
      </div>
    </li>`;
  });
}

function createWordListItemElement(word, now, targetThreshold) {
  const isMastered = (word.streak || 0) >= targetThreshold;
  const rem = (word.nextReviewTime || 0) - now;
  const timeText = rem > 0 ? '(復習まであと ' + getRemTime(rem) + ')' : '(復習可能)';
  const remText = isMastered ? `<span class="time-display" data-next-time="${word.nextReviewTime}" data-format="list">${timeText}</span>` : '';

  const li = document.createElement('li');
  li.innerHTML = `
    <div class="word-info">
      <strong style="font-size:1.1em; color:#2c3e50;">${word.en}</strong> - ${word.ja}<br>
      <small style="color:#7f8c8d;">${word.ex||''}</small><br>
      ${isMastered ? `<span class="badge mastered">習熟済 ${remText}</span>` : `<span class="badge">習得度: ${word.streak||0}/${targetThreshold}</span>`}
    </div>
    <div class="word-actions">
      <div>
        <button class="small-btn reset" onclick="resetWordProgress('${word.id}')">🔄</button>
        <button class="edit-btn" onclick="editWord('${word.id}')" style="margin:0;">･･･</button>
      </div>
      <button class="delete" onclick="deleteWord('${word.id}')">削除</button>
    </div>
  `;
  return li;
}

function clearWordListVisibleItems(list, topSpacer, bottomSpacer) {
  let node = topSpacer.nextSibling;
  while (node && node !== bottomSpacer) {
    const next = node.nextSibling;
    list.removeChild(node);
    node = next;
  }
}

function updateWordListChunkSpacers() {
  if (!wordListChunkState) return;
  const { topSpacerEl, bottomSpacerEl, estimatedItemHeight, startIndex, endIndex, words } = wordListChunkState;
  if (!topSpacerEl || !bottomSpacerEl) return;
  topSpacerEl.style.height = `${Math.max(0, startIndex * estimatedItemHeight)}px`;
  bottomSpacerEl.style.height = `${Math.max(0, (words.length - endIndex) * estimatedItemHeight)}px`;
}

function appendWordListChunkForward(count = RENDER_BATCH_SIZE) {
  if (!wordListChunkState) return;
  const { list, words, now, targetThreshold, token, bottomSpacerEl } = wordListChunkState;
  if (!list || !bottomSpacerEl || token !== wordListRenderToken) return;

  const from = wordListChunkState.endIndex;
  const to = Math.min(words.length, from + count);
  if (from >= to) return;

  const fragment = document.createDocumentFragment();
  for (let i = from; i < to; i++) {
    fragment.appendChild(createWordListItemElement(words[i], now, targetThreshold));
  }
  list.insertBefore(fragment, bottomSpacerEl);
  wordListChunkState.endIndex = to;
  updateWordListChunkSpacers();
}

function appendWordListChunkBackward(count = RENDER_BATCH_SIZE) {
  if (!wordListChunkState) return;
  const { list, words, now, targetThreshold, token, topSpacerEl, bottomSpacerEl } = wordListChunkState;
  if (!list || !topSpacerEl || !bottomSpacerEl || token !== wordListRenderToken) return;

  const prevStart = wordListChunkState.startIndex;
  const nextStart = Math.max(0, prevStart - count);
  if (nextStart >= prevStart) return;

  const nodes = [];
  const fragment = document.createDocumentFragment();
  for (let i = nextStart; i < prevStart; i++) {
    const node = createWordListItemElement(words[i], now, targetThreshold);
    nodes.push(node);
    fragment.appendChild(node);
  }

  const firstVisible = topSpacerEl.nextSibling && topSpacerEl.nextSibling !== bottomSpacerEl ? topSpacerEl.nextSibling : bottomSpacerEl;
  list.insertBefore(fragment, firstVisible);

  let addedHeight = 0;
  for (const node of nodes) addedHeight += node.offsetHeight;

  wordListChunkState.startIndex = nextStart;
  updateWordListChunkSpacers();
  if (addedHeight > 0) list.scrollTop += addedHeight;
}

function ensureWordListChunkCoverage() {
  if (!wordListChunkState) return;
  const { list, words, estimatedItemHeight } = wordListChunkState;
  if (!list || !estimatedItemHeight || words.length === 0) return;

  const buffer = 6;
  const firstVisible = Math.max(0, Math.floor(list.scrollTop / estimatedItemHeight));
  const lastVisible = Math.max(firstVisible, Math.floor((list.scrollTop + list.clientHeight) / estimatedItemHeight));
  const neededStart = Math.max(0, firstVisible - buffer);
  const neededEnd = Math.min(words.length, lastVisible + buffer + 1);

  const missingBefore = Math.max(0, wordListChunkState.startIndex - neededStart);
  const missingAfter = Math.max(0, neededEnd - wordListChunkState.endIndex);
  if (missingBefore > 0 || missingAfter > INITIAL_RENDER_BATCH_SIZE) {
    const { now, targetThreshold, topSpacerEl, bottomSpacerEl } = wordListChunkState;
    if (topSpacerEl && bottomSpacerEl) {
      const half = Math.floor(INITIAL_RENDER_BATCH_SIZE / 2);
      const anchorStart = Math.max(0, firstVisible - half);
      const anchorEnd = Math.min(words.length, anchorStart + INITIAL_RENDER_BATCH_SIZE);
      clearWordListVisibleItems(list, topSpacerEl, bottomSpacerEl);
      const fragment = document.createDocumentFragment();
      for (let i = anchorStart; i < anchorEnd; i++) {
        fragment.appendChild(createWordListItemElement(words[i], now, targetThreshold));
      }
      list.insertBefore(fragment, bottomSpacerEl);
      wordListChunkState.startIndex = anchorStart;
      wordListChunkState.endIndex = anchorEnd;
      updateWordListChunkSpacers();
      return;
    }
  }

  let guard = 0;
  while (wordListChunkState && wordListChunkState.endIndex < neededEnd && guard < 20) {
    appendWordListChunkForward(RENDER_BATCH_SIZE);
    guard++;
  }
}

function renderWordList() {
  wordListRenderToken++;
  const list = document.getElementById('word-list');
  if (!list) return;

  const fEl = document.getElementById('filter-chapter-select');
  const f = fEl ? fEl.value : 'all';
  const stateKey = `${appData.currentBookId || 'no-book'}|${f}`;
  const saved = getSavedWordListViewState();
  const savedScrollTop = (saved.lastKey === stateKey && typeof saved.scrollTop === 'number') ? saved.scrollTop : 0;

  saveWordListViewState({ filterChapterId: f, lastKey: stateKey });

  const currentChapterIds = appData.chapters.filter(ch => ch.bookId === appData.currentBookId).map(ch => ch.id);
  const chapterOrderMap = {};
  currentChapterIds.forEach((id, index) => {
    chapterOrderMap[id] = index;
  });

  let words = f === 'all'
    ? appData.words.filter(w => currentChapterIds.includes(w.chapterId))
    : appData.words.filter(w => w.chapterId === f);

  if (f === 'all') {
    words = [...words].sort((a, b) => {
      const orderA = chapterOrderMap[a.chapterId] !== undefined ? chapterOrderMap[a.chapterId] : 9999;
      const orderB = chapterOrderMap[b.chapterId] !== undefined ? chapterOrderMap[b.chapterId] : 9999;
      return orderA - orderB;
    });
  }

  if (words.length === 0) {
    wordListVirtualState = null;
    wordListChunkState = null;
    list.innerHTML = '<li style="background: transparent; border: none; box-shadow: none; margin: 0; padding: 10px; color: var(--text-secondary);">単語がありません</li>';
    list.scrollTop = 0;
    return;
  }

  wordListVirtualState = null;
  wordListChunkState = null;
  if (wordListSettleTimer) {
    clearTimeout(wordListSettleTimer);
    wordListSettleTimer = null;
  }

  list.innerHTML = '';
  const now = Date.now();
  const targetThreshold = getCurrentMasteryThreshold();
  const currentToken = wordListRenderToken;
  const estimatedItemHeight = 110;
  const anchorIndex = Math.max(0, Math.min(words.length - 1, Math.floor(savedScrollTop / estimatedItemHeight)));
  const half = Math.floor(INITIAL_RENDER_BATCH_SIZE / 2);
  const startIndex = Math.max(0, anchorIndex - half);
  const endIndex = Math.min(words.length, startIndex + INITIAL_RENDER_BATCH_SIZE);

  const topSpacer = document.createElement('li');
  topSpacer.style.margin = '0';
  topSpacer.style.padding = '0';
  topSpacer.style.border = 'none';
  topSpacer.style.boxShadow = 'none';
  topSpacer.style.background = 'transparent';

  const bottomSpacer = document.createElement('li');
  bottomSpacer.style.margin = '0';
  bottomSpacer.style.padding = '0';
  bottomSpacer.style.border = 'none';
  bottomSpacer.style.boxShadow = 'none';
  bottomSpacer.style.background = 'transparent';

  list.appendChild(topSpacer);
  list.appendChild(bottomSpacer);

  wordListChunkState = {
    list,
    words,
    now,
    targetThreshold,
    token: currentToken,
    estimatedItemHeight,
    startIndex,
    endIndex: startIndex,
    topSpacerEl: topSpacer,
    bottomSpacerEl: bottomSpacer
  };

  updateWordListChunkSpacers();
  appendWordListChunkForward(endIndex - startIndex);

  const restoreTarget = Math.max(0, savedScrollTop);
  list.scrollTop = restoreTarget;
  ensureWordListChunkCoverage();
  setTimeout(() => { suppressWordListScrollSave = false; }, 0);
}

function renderWordListVirtualWindow() {
  const list = document.getElementById('word-list');
  if (!list || !wordListVirtualState) return;

  const now = Date.now();
  const targetThreshold = getCurrentMasteryThreshold();
  const { words, startIndex, endIndex, estimatedItemHeight } = wordListVirtualState;

  if (!wordListVirtualState.topSpacerEl || !wordListVirtualState.bottomSpacerEl || !wordListVirtualState.topSpacerEl.isConnected || !wordListVirtualState.bottomSpacerEl.isConnected) {
    list.innerHTML = '';
    const topSpacer = document.createElement('li');
    topSpacer.style.margin = '0';
    topSpacer.style.padding = '0';
    topSpacer.style.border = 'none';
    topSpacer.style.boxShadow = 'none';
    topSpacer.style.background = 'transparent';

    const bottomSpacer = document.createElement('li');
    bottomSpacer.style.margin = '0';
    bottomSpacer.style.padding = '0';
    bottomSpacer.style.border = 'none';
    bottomSpacer.style.boxShadow = 'none';
    bottomSpacer.style.background = 'transparent';

    list.appendChild(topSpacer);
    list.appendChild(bottomSpacer);

    wordListVirtualState.topSpacerEl = topSpacer;
    wordListVirtualState.bottomSpacerEl = bottomSpacer;
    wordListVirtualState.renderedStart = null;
    wordListVirtualState.renderedEnd = null;
  }

  const topSpacer = wordListVirtualState.topSpacerEl;
  const bottomSpacer = wordListVirtualState.bottomSpacerEl;

  const applyWordListSpacerHeights = () => {
    const topH = wordListVirtualState.startIndex * wordListVirtualState.estimatedItemHeight;
    const bottomH = Math.max(0, (words.length - wordListVirtualState.endIndex) * wordListVirtualState.estimatedItemHeight);
    topSpacer.style.height = `${topH}px`;
    bottomSpacer.style.height = `${bottomH}px`;
  };

  applyWordListSpacerHeights();

  if (wordListVirtualState.renderedStart === null || wordListVirtualState.renderedEnd === null) {
    clearWordListVisibleItems(list, topSpacer, bottomSpacer);
    for (let i = startIndex; i < endIndex; i++) {
      list.insertBefore(createWordListItemElement(words[i], now, targetThreshold), bottomSpacer);
    }
    wordListVirtualState.renderedStart = startIndex;
    wordListVirtualState.renderedEnd = endIndex;
    return;
  }

  const renderedStart = wordListVirtualState.renderedStart;
  const renderedEnd = wordListVirtualState.renderedEnd;
  const largeJump = Math.abs(startIndex - renderedStart) > wordListVirtualState.windowSize;

  if (largeJump) {
    clearWordListVisibleItems(list, topSpacer, bottomSpacer);
    for (let i = startIndex; i < endIndex; i++) {
      list.insertBefore(createWordListItemElement(words[i], now, targetThreshold), bottomSpacer);
    }
    wordListVirtualState.renderedStart = startIndex;
    wordListVirtualState.renderedEnd = endIndex;
    return;
  }

  let currentStart = renderedStart;
  let currentEnd = renderedEnd;

  while (currentStart > startIndex) {
    currentStart--;
    list.insertBefore(createWordListItemElement(words[currentStart], now, targetThreshold), topSpacer.nextSibling);
  }

  while (currentEnd < endIndex) {
    list.insertBefore(createWordListItemElement(words[currentEnd], now, targetThreshold), bottomSpacer);
    currentEnd++;
  }

  while (currentStart < startIndex) {
    const firstVisible = topSpacer.nextSibling;
    if (!firstVisible || firstVisible === bottomSpacer) break;
    list.removeChild(firstVisible);
    currentStart++;
  }

  while (currentEnd > endIndex) {
    const lastVisible = bottomSpacer.previousSibling;
    if (!lastVisible || lastVisible === topSpacer) break;
    list.removeChild(lastVisible);
    currentEnd--;
  }

  wordListVirtualState.renderedStart = currentStart;
  wordListVirtualState.renderedEnd = currentEnd;

  // Visible rows are measured to continuously refine spacer estimation and reduce stop-time offset.
  let measuredTotal = 0;
  let measuredCount = 0;
  let el = topSpacer.nextSibling;
  while (el && el !== bottomSpacer) {
    measuredTotal += el.offsetHeight;
    measuredCount++;
    el = el.nextSibling;
  }
  if (measuredCount > 0 && (Date.now() - (wordListVirtualState.lastScrollAt || 0)) > 120) {
    const measuredAverage = measuredTotal / measuredCount;
    const prev = wordListVirtualState.estimatedItemHeight;
    const next = prev * 0.8 + measuredAverage * 0.2;
    if (Math.abs(next - prev) >= 0.5) {
      wordListVirtualState.estimatedItemHeight = next;
      applyWordListSpacerHeights();
    }
  }
}

function getWordListFirstVisibleIndex(list, state) {
  const topSpacer = state.topSpacerEl;
  const bottomSpacer = state.bottomSpacerEl;
  if (!topSpacer || !bottomSpacer || state.renderedStart === null) {
    return Math.max(0, Math.floor(list.scrollTop / state.estimatedItemHeight));
  }

  const viewTop = list.scrollTop;
  let idx = 0;
  let node = topSpacer.nextSibling;
  while (node && node !== bottomSpacer) {
    if ((node.offsetTop + node.offsetHeight) > viewTop) {
      return state.renderedStart + idx;
    }
    idx++;
    node = node.nextSibling;
  }

  return Math.max(0, Math.floor(list.scrollTop / state.estimatedItemHeight));
}

function handleWordListVirtualScroll() {
  const list = document.getElementById('word-list');
  if (!list) return;
  if (suppressWordListScrollSave) return;

  if (wordListScrollSaveTimer) clearTimeout(wordListScrollSaveTimer);
  wordListScrollSaveTimer = setTimeout(() => {
    const stateKey = wordListVirtualState ? wordListVirtualState.stateKey : `${appData.currentBookId || 'no-book'}|${(document.getElementById('filter-chapter-select') ? document.getElementById('filter-chapter-select').value : 'all')}`;
    saveWordListViewState({
      lastKey: stateKey,
      scrollTop: list.scrollTop,
      filterChapterId: document.getElementById('filter-chapter-select') ? document.getElementById('filter-chapter-select').value : 'all'
    });
    lastWordListStateSaveAt = Date.now();
    wordListScrollSaveTimer = null;
  }, 220);

  if (wordListChunkState) {
    ensureWordListChunkCoverage();
    return;
  }

  if (!wordListVirtualState) return;
  wordListVirtualState.lastScrollAt = Date.now();
  if (wordListScrollRafPending) return;

  wordListScrollRafPending = true;
  requestAnimationFrame(() => {
    wordListScrollRafPending = false;
    if (!wordListVirtualState) return;

    const { words, preloadBuffer, windowSize } = wordListVirtualState;
    const total = words.length;
    if (total === 0) return;

    const nowTs = performance.now();
    const prevTop = typeof wordListVirtualState.lastScrollTop === 'number' ? wordListVirtualState.lastScrollTop : list.scrollTop;
    const prevTime = typeof wordListVirtualState.lastScrollTime === 'number' ? wordListVirtualState.lastScrollTime : nowTs;
    const dt = Math.max(1, nowTs - prevTime);
    const velocity = Math.abs(list.scrollTop - prevTop) / dt;
    wordListVirtualState.lastScrollTop = list.scrollTop;
    wordListVirtualState.lastScrollTime = nowTs;

    const maxVisible = total - 1;
    const roughVisible = Math.max(0, Math.min(maxVisible, Math.floor(list.scrollTop / wordListVirtualState.estimatedItemHeight)));
    const baseStep = Math.max(1, wordListVirtualState.updateStep || 1);
    let mode = wordListVirtualState.scrollStepMode || 1;
    if (mode === 1 && velocity > 2.0) mode = 2;
    else if (mode === 2 && velocity > 2.8) mode = 3;
    else if (mode === 2 && velocity < 1.2) mode = 1;
    else if (mode === 3 && velocity < 2.0) mode = 2;
    wordListVirtualState.scrollStepMode = mode;

    const dynamicStep = mode === 3 ? baseStep * 3 : (mode === 2 ? baseStep * 2 : 1);
    const firstVisible = mode === 1 ? roughVisible : Math.floor(roughVisible / dynamicStep) * dynamicStep;
    const maxStart = Math.max(0, total - windowSize);
    const nextStart = Math.max(0, Math.min(maxStart, firstVisible - preloadBuffer));
    const nextEnd = Math.min(total, Math.max(nextStart + windowSize, firstVisible + preloadBuffer));

    if (dynamicStep > 1 && Math.abs(nextStart - wordListVirtualState.startIndex) < dynamicStep && Math.abs(nextEnd - wordListVirtualState.endIndex) < dynamicStep) {
      return;
    }

    if (nextStart !== wordListVirtualState.startIndex || nextEnd !== wordListVirtualState.endIndex) {
      wordListVirtualState.startIndex = nextStart;
      wordListVirtualState.endIndex = nextEnd;
      renderWordListVirtualWindow();
    }
  });

  if (wordListSettleTimer) clearTimeout(wordListSettleTimer);
  wordListSettleTimer = setTimeout(() => {
    if (!wordListVirtualState) return;
    wordListVirtualState.lastScrollAt = 0;
    wordListVirtualState.scrollStepMode = 1;
    const total = wordListVirtualState.words.length;
    if (total === 0) return;
    const maxVisible = total - 1;
    const roughVisible = Math.max(0, Math.min(maxVisible, Math.floor(list.scrollTop / wordListVirtualState.estimatedItemHeight)));
    const stableFirst = roughVisible;
    const maxStart = Math.max(0, total - wordListVirtualState.windowSize);
    const nextStart = Math.max(0, Math.min(maxStart, stableFirst - wordListVirtualState.preloadBuffer));
    const nextEnd = Math.min(total, Math.max(nextStart + wordListVirtualState.windowSize, stableFirst + wordListVirtualState.preloadBuffer));
    if (nextStart !== wordListVirtualState.startIndex || nextEnd !== wordListVirtualState.endIndex) {
      wordListVirtualState.startIndex = nextStart;
      wordListVirtualState.endIndex = nextEnd;
      renderWordListVirtualWindow();
    }
    wordListSettleTimer = null;
  }, 90);
}

function addChapter() {
  const name = document.getElementById('new-chapter-name').value.trim();
  if (!name) return;
  appData.chapters.push({ id: Date.now().toString(), name: name, bookId: appData.currentBookId });
  document.getElementById('new-chapter-name').value = '';
  saveData(); updateChapterSelects(); renderChapterList();
  showToast(`章「${name}」を追加しました`);
}

function deleteChapter(id) {
  if (!confirm('削除しますか？')) return;
  appData.chapters = appData.chapters.filter(c => c.id !== id);
  appData.words = appData.words.filter(w => w.chapterId !== id);
  saveData(); updateChapterSelects(); renderChapterList(); renderWordList();
  showToast('章を削除しました');
}

function editChapter(id) {
  const ch = appData.chapters.find(c => c.id === id);
  const n = prompt('章の名前:', ch.name);
  if (n) { ch.name = n; saveData(); updateChapterSelects(); renderChapterList(); }
}

function moveChapter(id, dir) {
  const currentChapters = appData.chapters.filter(ch => ch.bookId === appData.currentBookId);
  const idx = currentChapters.findIndex(c => c.id === id);
  if (idx < 0 || idx + dir < 0 || idx + dir >= currentChapters.length) return;

  const listItems = document.querySelectorAll('#chapter-list li');
  const targetItem = listItems[idx];
  const swapItem = listItems[idx + dir];

  if (targetItem && swapItem) {
    const targetRect = targetItem.getBoundingClientRect();
    const swapRect = swapItem.getBoundingClientRect();
    const distance = swapRect.top - targetRect.top;

    targetItem.style.transition = 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1), box-shadow 0.3s ease';
    swapItem.style.transition = 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)';

    targetItem.style.zIndex = '10';
    targetItem.style.boxShadow = '0 5px 15px rgba(0,0,0,0.15)';
    swapItem.style.zIndex = '5';

    targetItem.style.transform = `translateY(${distance}px)`;
    swapItem.style.transform = `translateY(${-distance}px)`;

    setTimeout(() => {
      targetItem.style.transition = '';
      swapItem.style.transition = '';
      targetItem.style.transform = '';
      swapItem.style.transform = '';
      targetItem.style.zIndex = '';
      targetItem.style.boxShadow = '';
      swapItem.style.zIndex = '';

      const actualIdx1 = appData.chapters.findIndex(c => c.id === currentChapters[idx].id);
      const actualIdx2 = appData.chapters.findIndex(c => c.id === currentChapters[idx + dir].id);
      [appData.chapters[actualIdx1], appData.chapters[actualIdx2]] = [appData.chapters[actualIdx2], appData.chapters[actualIdx1]];
      
      saveData();
      updateChapterSelects();
      renderChapterList();
    }, 300);
    
  } else {
    const actualIdx1 = appData.chapters.findIndex(c => c.id === currentChapters[idx].id);
    const actualIdx2 = appData.chapters.findIndex(c => c.id === currentChapters[idx + dir].id);
    [appData.chapters[actualIdx1], appData.chapters[actualIdx2]] = [appData.chapters[actualIdx2], appData.chapters[actualIdx1]];
    saveData(); updateChapterSelects(); renderChapterList();
  }
}

function resetChapterProgress(id) {
  if (!confirm('進捗をリセットしますか？')) return;
  appData.words.forEach(w => { if(w.chapterId === id) { w.streak = 0; w.nextReviewTime = 0; } });
  saveData(); renderWordList();
  if(document.getElementById('progress-panel').classList.contains('active')) renderProgressView();
  showToast('進捗をリセットしました');
}

function addWord() {
  const chId = document.getElementById('chapter-select').value;
  const en = document.getElementById('new-en').value.trim();
  const ja = document.getElementById('new-ja').value.trim();
  if (!chId || !en || !ja) return showToast('必須項目を入力してください');

  const currentChapterIds = appData.chapters.filter(ch => ch.bookId === appData.currentBookId).map(ch => ch.id);
  const isDuplicate = appData.words.some(w => currentChapterIds.includes(w.chapterId) && w.en.toLowerCase() === en.toLowerCase() && w.id !== editingWordId);
  if (isDuplicate) return showToast('この単語は既に登録されています');
  
  if (editingWordId) {
    const w = appData.words.find(x => x.id === editingWordId);
    if (w) Object.assign(w, { chapterId: chId, en, ja, ex: document.getElementById('new-ex').value, exJa: document.getElementById('new-ex-ja').value });
    cancelEditWord();
    showToast('単語を更新しました');
  } else {
    appData.words.push({ id: Date.now().toString(), chapterId: chId, en, ja, ex: document.getElementById('new-ex').value, exJa: document.getElementById('new-ex-ja').value, streak: 0, nextReviewTime: 0 });
    ['new-en', 'new-ja', 'new-ex', 'new-ex-ja'].forEach(id => document.getElementById(id).value = '');
    showToast('単語を追加しました');
  }
  saveData(); renderWordList();
  if (document.activeElement && typeof document.activeElement.blur === 'function') {
    document.activeElement.blur();
  }
}

function editWord(id) {
  const w = appData.words.find(x => x.id === id);
  editingWordId = id;
  document.getElementById('chapter-select').value = w.chapterId;
  document.getElementById('new-en').value = w.en;
  document.getElementById('new-ja').value = w.ja;
  document.getElementById('new-ex').value = w.ex || '';
  document.getElementById('new-ex-ja').value = w.exJa || '';
  document.getElementById('word-form-title').innerText = '✏ 単語の編集';
  document.getElementById('btn-add-word').innerText = '更新する';
  document.getElementById('btn-cancel-edit').classList.remove('hidden');
  window.scrollTo({ top: document.getElementById('word-form-title').offsetTop - 80, behavior: 'smooth' });
}

function cancelEditWord() {
  editingWordId = null;
  document.getElementById('word-form-title').innerText = '✏ 単語の追加 (1件ずつ)';
  document.getElementById('btn-add-word').innerText = '単語を追加';
  document.getElementById('btn-cancel-edit').classList.add('hidden');
  ['new-en', 'new-ja', 'new-ex', 'new-ex-ja'].forEach(id => document.getElementById(id).value = '');
}

function deleteWord(id) {
  if(confirm('削除しますか？')){
    appData.words = appData.words.filter(w=>w.id!==id);
    saveData(); renderWordList(); showToast('削除しました');
  }
}

function resetWordProgress(id) {
  if (!confirm('進捗をリセットしますか？')) return;
  const w = appData.words.find(x => x.id === id);
  if (w) { w.streak = 0; w.nextReviewTime = 0; }
  saveData(); renderWordList();
  if(document.getElementById('progress-panel').classList.contains('active')) renderProgressView();
  showToast('進捗をリセットしました');
}

function importCSV() {
  const chId = document.getElementById('csv-chapter-select').value;
  const text = document.getElementById('csv-input').value.trim();
  if (!chId || !text) return;
  
  let addedCount = 0;
  let skipCount = 0;
  const currentChapterIds = appData.chapters.filter(ch => ch.bookId === appData.currentBookId).map(ch => ch.id);

  text.split('\n').forEach(line => {
    const p = line.split(',');
    if (p.length >= 2) {
      const en = p[0].trim();
      const isDuplicate = appData.words.some(w => currentChapterIds.includes(w.chapterId) && w.en.toLowerCase() === en.toLowerCase());
      if (!isDuplicate) {
        appData.words.push({ id: Date.now().toString()+Math.random(), chapterId: chId, en: en, ja: p[1].trim(), ex: p[2]?.trim()||'', exJa: p[3]?.trim()||'', streak: 0, nextReviewTime: 0 });
        addedCount++;
      } else {
        skipCount++;
      }
    }
  });
  
  let msg = `${addedCount}件追加`;
  if (skipCount > 0) msg += ` (重複スキップ: ${skipCount})`;
  document.getElementById('csv-input').value = '';
  saveData();
  renderWordList();
  showToast(msg);
}

function switchTab(tab, btnElement) {
  const currentPanel = document.querySelector('.panel.active');
  const nextPanel = document.getElementById(`${tab}-panel`);
  if (!nextPanel) return;

  const activeTab = currentPanel && currentPanel.id ? currentPanel.id.replace('-panel', '') : null;
  if (tabSwitchTarget === tab || (activeTab === tab && tabSwitchTarget === null)) {
    return;
  }

  if (tabSwitchAnimationTimer) { clearTimeout(tabSwitchAnimationTimer); tabSwitchAnimationTimer = null; }
  if (tabSwitchScrollTimer) { clearTimeout(tabSwitchScrollTimer); tabSwitchScrollTimer = null; }
  if (tabSwitchPostTimer) { clearTimeout(tabSwitchPostTimer); tabSwitchPostTimer = null; }
  tabSwitchTarget = tab;

  if (currentPanel && currentPanel !== nextPanel) {
    if (currentPanel.id === 'manage-panel') {
      const list = document.getElementById('word-list');
      if (list) {
        suppressWordListScrollSave = true;
        if (wordListScrollSaveTimer) {
          clearTimeout(wordListScrollSaveTimer);
          wordListScrollSaveTimer = null;
        }
        const fEl = document.getElementById('filter-chapter-select');
        const f = fEl ? fEl.value : 'all';
        const stateKey = `${appData.currentBookId || 'no-book'}|${f}`;
        saveWordListViewState({
          lastKey: stateKey,
          scrollTop: list.scrollTop,
          filterChapterId: f
        });
        list.innerHTML = '';
      }
      wordListChunkState = null;
      wordListVirtualState = null;
    }

    if (currentPanel.id === 'progress-panel') {
      const container = document.getElementById('progress-view-container');
      if (container) {
        suppressProgressScrollSave = true;
        if (progressScrollSaveTimer) {
          clearTimeout(progressScrollSaveTimer);
          progressScrollSaveTimer = null;
        }
        const cfg = getProgressViewConfig();
        const key = JSON.stringify(cfg);
        const scrollKey = getProgressScrollKey(cfg);
        saveProgressViewState({ ...cfg, lastViewKey: key, lastScrollKey: scrollKey, scrollTop: container.scrollTop });
        container.innerHTML = '';
      }
      progressChunkState = null;
      progressVirtualState = null;
    }
  }

  clearInterval(countdownTimer);
  if (typeof triggerVibration === 'function') {
    triggerVibration(20);
  }

  const accBtn = document.querySelector('.app-header .account-btn');
  if (accBtn) {
    accBtn.style.opacity = '1';
    accBtn.style.pointerEvents = 'auto';
  }

  const bottomNav = document.querySelector('.bottom-nav');
  if (bottomNav) {
    bottomNav.style.transform = 'translateY(0)';
    bottomNav.style.opacity = '1';
    bottomNav.style.pointerEvents = 'auto';
  }

  const backBtn = document.querySelector('.back-btn');
  if (backBtn) {
    backBtn.style.opacity = '1';
    backBtn.style.pointerEvents = 'auto';
  }

  if(currentPanel && currentPanel !== nextPanel) {
    currentPanel.style.animation = 'fadeOutDown 0.15s forwards';
    tabSwitchAnimationTimer = setTimeout(() => {
      currentPanel.classList.remove('active');
      currentPanel.style.animation = '';
      nextPanel.classList.add('active');
      nextPanel.style.opacity = '0';
      nextPanel.style.animation = 'slideInUp 0.3s forwards';
      tabSwitchAnimationTimer = null;
    }, 150);
  } else if (!currentPanel) {
    nextPanel.classList.add('active');
  }
  
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  if (btnElement && btnElement.classList) {
    (btnElement.closest('.nav-btn') || btnElement).classList.add('active');
  } else {
    const fallbackBtn = document.querySelector(`.nav-btn[onclick*="${tab}"]`);
    if (fallbackBtn) fallbackBtn.classList.add('active');
  }
  
  if(tab === 'quiz') {
    document.getElementById('quiz-play').classList.add('hidden');
    document.getElementById('quiz-result-screen').classList.add('hidden');
    document.getElementById('quiz-settings').classList.remove('hidden');
  }
  
  tabSwitchScrollTimer = setTimeout(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    tabSwitchScrollTimer = null;
  }, 150);

  tabSwitchPostTimer = setTimeout(() => {
    if(tab === 'manage') {
      const list = document.getElementById('word-list');
      if (list && list.childElementCount === 0) renderWordList();
    }
    if(tab === 'progress') {
      const container = document.getElementById('progress-view-container');
      const host = document.getElementById('progress-items-host');
      const virtualHostEmpty = !!(host && host.childElementCount === 0);
      if (container && (container.childElementCount === 0 || virtualHostEmpty)) {
        applySavedProgressFilters();
        renderProgressView();
      } else if (typeof updateTimeDisplays === 'function') {
        updateTimeDisplays();
      }
    }
    tabSwitchTarget = null;
    tabSwitchPostTimer = null;
  }, 200);
}

function updateTimeDisplays() {
  const timeElements = document.querySelectorAll('.time-display');
  const now = Date.now();
  timeElements.forEach(el => {
    const nextTime = parseInt(el.getAttribute('data-next-time'), 10);
    if (!nextTime) return;
    const diff = nextTime - now;
    const isReady = diff <= 0;
    const format = el.getAttribute('data-format');
    
    if (format === 'list') {
      el.innerText = isReady ? "(復習可能)" : "(あと " + getRemTime(diff) + ")";
    } else if (format === 'table') {
      el.innerText = isReady ? '復習可' : '待機中(あと ' + getRemTime(diff) + ')';
      el.style.color = isReady ? 'var(--review-ready)' : 'var(--success)';
    } else if (format === 'card') {
      el.innerText = isReady ? '復習可' : '待機中';
      el.style.background = isReady ? 'var(--warning)' : 'var(--success)';
      el.style.color = 'var(--text-inverse)';
    }
  });
}

function getRemTime(ms) {
  const totalMins = Math.ceil(ms / 60000);
  if (totalMins <= 0) return "復習可能";
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return h > 0 ? `${h}時間${m}分` : `${m}分`;
}

function updateMasteryThreshold() {
  const val = parseInt(document.getElementById('mastery-threshold-input').value);
  if (val < 1) return showToast('1以上を入力してください');
  const book = appData.books.find(b => b.id === appData.currentBookId);
  if (book) {
    book.masteryThreshold = val;
    saveData();
    showToast(`合格基準を ${val}回 に更新しました`);
    renderWordList();
    if(document.getElementById('progress-panel').classList.contains('active')) renderProgressView();
  }
}

function createMaskableText(text, isVisible, isBold = false, highlightWordsStr = '') {
  if (!text) return '';
  let processedText = text;
  if (highlightWordsStr) {
    const words = highlightWordsStr.split(/[,、\s]+/).filter(w => w.trim().length > 0);
    if (words.length > 0) {
      words.sort((a, b) => b.length - a.length);
      words.forEach(word => {
        let safeWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (safeWord.endsWith('y')) {
            safeWord = safeWord.slice(0, -1) + '(?:y|ie)';
        } else if (safeWord.endsWith('e')) {
            safeWord = safeWord.slice(0, -1) + 'e?';
        }

        const suffixPattern = '(?:[a-z]?(?:s|es|ed|d|ing))?';
        const regex = new RegExp(`\\b(${safeWord}${suffixPattern})\\b(?![^<]*>)`, 'gi');
        processedText = processedText.replace(regex, '<strong>$1</strong>');
      });
    }
  }
  if (isVisible) return isBold ? `<strong>${processedText}</strong>` : processedText;
  const encodedText = encodeURIComponent(processedText);
  return `<span class="masked-text" data-encoded-text="${encodedText}" data-bold="${isBold}" onclick="toggleMask(this)" style="background:#ecf0f1; border-radius:4px; padding:2px 8px; color:transparent; cursor:pointer;">--- (Tap)</span>`;
}

function toggleMask(el) {
  const isMasked = el.classList.contains('masked-text');
  const encodedText = el.getAttribute('data-encoded-text');
  const isBold = el.getAttribute('data-bold') === 'true';
  if (isMasked) {
    el.classList.remove('masked-text');
    const decodedText = decodeURIComponent(encodedText);
    el.innerHTML = isBold ? `<strong>${decodedText}</strong>` : decodedText;
    el.style.backgroundColor = 'transparent'; el.style.padding = '0'; el.style.color = 'inherit';
  } else {
    el.classList.add('masked-text');
    el.innerHTML = '--- (Tap)';
    el.style.backgroundColor = 'var(--border-soft)'; el.style.padding = '2px 8px'; el.style.color = 'transparent';
  }
}
