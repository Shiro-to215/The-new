const firebaseConfig = {
  apiKey: "AIzaSyAVnQ9FEGauhQLv0h4UoPUcnmffRzFtQTQ",
  authDomain: "vocabulary-94c2c.firebaseapp.com",
  projectId: "vocabulary-94c2c",
  storageBucket: "vocabulary-94c2c.firebasestorage.app",
  messagingSenderId: "582162080523",
  appId: "1:582162080523:web:ba74e39e8e64835dedf80e"
};

let db = null;
let currentUser = null;
// ここに貼り付け！
let isSpeechUnlocked = false;

function unlockSpeech() {
    if (isSpeechUnlocked) return;
    const utterance = new SpeechSynthesisUtterance('');
    window.speechSynthesis.speak(utterance);
    isSpeechUnlocked = true;
}

// ▼▼ 微調整版 playVoice 関数（スマホの制限対策版） ▼▼
function playVoice(text) {
    if (!text) return;
    
    // 前の音声が鳴っていたら直ちにキャンセル
    window.speechSynthesis.cancel(); 
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US'; // アメリカ英語
    
    // 1. 設定画面（global-voice-speed）から速度を読み取る
    const speedEl = document.getElementById('global-voice-speed');
    // もし設定画面の要素が見つかればその値を、なければデフォルトの0.9にする
    utterance.rate = speedEl ? parseFloat(speedEl.value) : 0.9; 

    // 2. スマホのブロックを回避するため、setTimeoutを外して直接発音！
    window.speechSynthesis.speak(utterance);
}
// ▲▲ ここまで ▲▲

try {
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  firebase.auth().onAuthStateChanged((user) => {
    currentUser = user;
    if (user) {
      showToast(`✅ ${user.displayName || 'ユーザー'} さんとして同期中`);
      loadFromCloud();
    }
    updateAccountUI();
  });
} catch(e) {}

function loadFromCloud() {
  if (!db || !currentUser) return;
  db.collection("users").doc(currentUser.uid).get()
    .then((doc) => {
      if (doc.exists && doc.data().appData) {
        appData = doc.data().appData;
        if (!appData.themeMode) appData.themeMode = 'light';
        if (!appData.books) appData.books = [];
        if (appData.books.length === 0) {
          const defaultBookId = "book_" + Date.now();
          appData.books.push({ id: defaultBookId, name: "デフォルト単語帳" });
          appData.currentBookId = defaultBookId;
        }
        if (appData.books.length > 0 && appData.chapters) {
          appData.chapters.forEach(ch => {
            if (!ch.bookId) ch.bookId = appData.books[0].id;
          });
        }
        if (appData.books.length > 0) {
          appData.books.forEach(b => {
            if (!b.masteryThreshold) b.masteryThreshold = appData.masteryThreshold || 5;
          });
        }
        localStorage.setItem('vocabApp_Ultimate_V10', JSON.stringify(appData));
        applyThemeMode();
        updateChapterSelects();
        renderChapterList();
        renderWordList();
        initBookScreen(); 
        showToast("☁️ クラウドからデータを同期しました");
      } else {
        syncToCloud(appData);
      }
    });
}

function updateAccountUI() {
  const loggedOutDiv = document.getElementById('auth-logged-out');
  if (!loggedOutDiv) return;
  if (currentUser) {
    loggedOutDiv.classList.add('hidden');
    document.getElementById('auth-logged-in').classList.remove('hidden');
    document.getElementById('user-name-display').innerText = currentUser.displayName || '名無し';
  } else {
    loggedOutDiv.classList.remove('hidden');
    document.getElementById('auth-logged-in').classList.add('hidden');
  }
}

function openAccountModal() { document.getElementById('account-modal').classList.remove('hidden'); updateAccountUI(); }
function closeAccountModal() { document.getElementById('account-modal').classList.add('hidden'); }

function fbSignUp() {
  const name = document.getElementById('auth-name').value;
  const email = document.getElementById('auth-email').value;
  const pass = document.getElementById('auth-pass').value;
  if (!name || !email || !pass) return alert("必須項目を入力してください");
  if (pass.length < 6) return alert("パスワードは6文字以上で入力してください");
  firebase.auth().createUserWithEmailAndPassword(email, pass)
    .then((userCredential) => userCredential.user.updateProfile({ displayName: name }))
    .then(() => {
      alert("登録が完了しました");
      if (currentUser) currentUser.displayName = name;
      document.getElementById('user-name-display').innerText = name;
    })
    .catch((error) => alert("エラー: " + error.message));
}

function fbSignIn() {
  const email = document.getElementById('auth-email').value;
  const pass = document.getElementById('auth-pass').value;
  if (!email || !pass) return alert("入力してください");
  firebase.auth().signInWithEmailAndPassword(email, pass)
    .then(() => alert("ログインしました"))
    .catch(() => alert("ログインエラー"));
}

function fbSignOut() {
  firebase.auth().signOut().then(() => showToast("ログアウトしました"));
}

function fbDeleteAccount() {
  if (!currentUser) return;
  if (!confirm("本当にアカウントを削除しますか？")) return;
  const user = firebase.auth().currentUser;
  const uid = user.uid;
  db.collection("users").doc(uid).delete()
    .then(() => user.delete())
    .then(() => alert("アカウントを削除しました"))
    .catch((error) => alert("削除失敗: 再ログインが必要です"));
}

function syncToCloud(data) {
  if (!db || !currentUser) return;
  db.collection("users").doc(currentUser.uid).set({
    appData: data, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

let appData = { books: [], currentBookId: null, chapters: [], words: [], masteryThreshold: 5, quizSessionId: 0, deviceLayout: 'iphone', themeMode: 'light' };
let editingWordId = null;
let toastTimeout = null;
let countdownTimer = null;
let currentQuizTimeLimit = 0;
let currentQuestionModeGlobal = '';
let cloudSyncTimer = null;
let currentWordRenderIndex = 0;
let currentWordRenderTarget = [];
let quizPool = [], qIdx = 0, qMode = '', qDirection = '', curQ = null, timer = null, correctCount = 0;
let progressVirtualState = null;
let progressScrollRafPending = false;
let wordListVirtualState = null;
let wordListScrollRafPending = false;
let progressChunkState = null;
let wordListChunkState = null;
let lastProgressStateSaveAt = 0;
let lastWordListStateSaveAt = 0;
let progressTableRenderToken = 0;
let progressScrollSaveTimer = null;
let wordListScrollSaveTimer = null;
let wordListSettleTimer = null;
let progressSettleTimer = null;
let wordListRenderToken = 0;
let hasNormalizedInlineStyles = false;
let suppressWordListScrollSave = false;
let suppressProgressScrollSave = false;
let tabSwitchAnimationTimer = null;
let tabSwitchScrollTimer = null;
let tabSwitchPostTimer = null;
let tabSwitchTarget = null;

const RENDER_BATCH_SIZE = 50;
const INITIAL_RENDER_BATCH_SIZE = 100;
const TABLE_RENDER_BATCH_SIZE = 60;

const PROGRESS_VIEW_STATE_KEY = 'vocabProgressViewState_V1';
const WORD_LIST_VIEW_STATE_KEY = 'vocabWordListViewState_V1';

function getSavedProgressViewState() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_VIEW_STATE_KEY) || '{}');
  } catch (e) {
    return {};
  }
}

function saveProgressViewState(nextState) {
  const current = getSavedProgressViewState();
  const merged = { ...current, ...nextState };
  try {
    localStorage.setItem(PROGRESS_VIEW_STATE_KEY, JSON.stringify(merged));
  } catch (e) {}
}

function applySavedProgressFilters() {
  const saved = getSavedProgressViewState();
  const applySelectValue = (id, value) => {
    const el = document.getElementById(id);
    if (!el || value === undefined || value === null) return;
    if (Array.from(el.options).some(opt => opt.value === value)) el.value = value;
  };
  applySelectValue('progress-chapter-select', saved.chapterId);
  applySelectValue('display-mode-select', saved.displayMode);
  applySelectValue('sort-order-select', saved.sortOrder);
  applySelectValue('layout-mode-select', saved.layoutMode);
  applySelectValue('filter-weak-select', saved.weakFilter);
  const searchInput = document.getElementById('progress-search-input');
  if (searchInput && typeof saved.searchQuery === 'string') searchInput.value = saved.searchQuery;
}

function getProgressViewConfig() {
  const chSelect = document.getElementById('progress-chapter-select');
  const searchInput = document.getElementById('progress-search-input');
  return {
    chapterId: chSelect ? chSelect.value : 'all',
    displayMode: document.getElementById('display-mode-select') ? document.getElementById('display-mode-select').value : 'all',
    sortOrder: document.getElementById('sort-order-select') ? document.getElementById('sort-order-select').value : 'default',
    layoutMode: document.getElementById('layout-mode-select') ? document.getElementById('layout-mode-select').value : 'list',
    weakFilter: document.getElementById('filter-weak-select') ? document.getElementById('filter-weak-select').value : 'all',
    searchQuery: searchInput ? searchInput.value.trim().toLowerCase() : ''
  };
}

function getProgressScrollKey(config) {
  return JSON.stringify({
    chapterId: config.chapterId,
    sortOrder: config.sortOrder,
    layoutMode: config.layoutMode,
    weakFilter: config.weakFilter,
    searchQuery: config.searchQuery
  });
}

function getSavedWordListViewState() {
  try {
    return JSON.parse(localStorage.getItem(WORD_LIST_VIEW_STATE_KEY) || '{}');
  } catch (e) {
    return {};
  }
}

function saveWordListViewState(nextState) {
  const current = getSavedWordListViewState();
  const merged = { ...current, ...nextState };
  try {
    localStorage.setItem(WORD_LIST_VIEW_STATE_KEY, JSON.stringify(merged));
  } catch (e) {}
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.innerText = message;
  toast.className = "show";
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { toast.className = toast.className.replace("show", ""); }, 3000);
}

function triggerVibration(pattern) { if (navigator.vibrate) navigator.vibrate(pattern); }

function saveData() {
  localStorage.setItem('vocabApp_Ultimate_V10', JSON.stringify(appData));
  if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(() => {
    if (typeof syncToCloud === 'function') syncToCloud(appData);
  }, 3000);
}

function getCurrentMasteryThreshold() {
  if (!appData.currentBookId || !appData.books) return 5;
  const book = appData.books.find(b => b.id === appData.currentBookId);
  return book && book.masteryThreshold ? book.masteryThreshold : (appData.masteryThreshold || 5);
}

function loadData() {
  const saved = localStorage.getItem('vocabApp_Ultimate_V10') || localStorage.getItem('vocabApp_Ultimate_V9') || localStorage.getItem('vocabApp_Ultimate_V8');
  if (saved) {
    appData = JSON.parse(saved);
    if (!appData.masteryThreshold) appData.masteryThreshold = 5;
    if (appData.quizSessionId === undefined) appData.quizSessionId = 0;
    if (!appData.deviceLayout) appData.deviceLayout = 'iphone';
    if (!appData.themeMode) appData.themeMode = 'light';
    if (!appData.books) appData.books = [];
    if (appData.books.length === 0) {
      const defaultBookId = "book_" + Date.now();
      appData.books.push({ id: defaultBookId, name: "デフォルト単語帳", masteryThreshold: appData.masteryThreshold });
      appData.currentBookId = defaultBookId;
    }
    if (appData.books.length > 0) {
      let isFixed = false;
      if (appData.chapters) {
        appData.chapters.forEach(ch => {
          if (!ch.bookId) { ch.bookId = appData.books[0].id; isFixed = true; }
        });
      }
      appData.books.forEach(b => {
        if (!b.masteryThreshold) { b.masteryThreshold = appData.masteryThreshold || 5; isFixed = true; }
      });
      if (isFixed) saveData();
    }
  } else {
    if (appData.books.length === 0) {
      const defaultBookId = "book_" + Date.now();
      appData.books.push({ id: defaultBookId, name: "デフォルト単語帳", masteryThreshold: 5 });
      appData.currentBookId = defaultBookId;
    }
  }
  
  const thresholdInput = document.getElementById('mastery-threshold-input');
  if (thresholdInput) thresholdInput.value = getCurrentMasteryThreshold();
  const layoutSelect = document.getElementById('device-layout-select');
  if (layoutSelect) layoutSelect.value = appData.deviceLayout;
  syncThemeControl(appData.themeMode || 'light');
  
  applyThemeMode();
  applyDeviceLayout();
  initBookScreen(); 
}

function initBookScreen() {
  const screen = document.getElementById('book-select-screen');
  if(screen) screen.style.display = 'block';
  renderBookCards();
}

function renderBookCards() {
  const container = document.getElementById('book-card-container');
  if (!container || !appData.books) return;
  container.innerHTML = '';
  appData.books.forEach(b => {
    const chaptersInBook = appData.chapters.filter(ch => ch.bookId === b.id).map(ch => ch.id);
    const wordCount = appData.words.filter(w => chaptersInBook.includes(w.chapterId)).length;
    container.innerHTML += `
      <div class="book-card-item" onclick="enterBookById('${b.id}')">
        <div style="flex: 1;">
          <h2 style="margin: 0; border: none; padding: 0; font-size: 20px; color: #2c3e50; font-weight: bold;">${b.name}</h2>
          <p style="margin: 6px 0 0 0; color: #7f8c8d; font-size: 13px;">収録単語: ${wordCount}語</p>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <button class="edit-btn" onclick="editBook('${b.id}', event)" style="margin:0;">編集</button>
          <button class="delete" onclick="deleteBook('${b.id}', event)" style="margin:0;">削除</button>
        </div>
      </div>
    `;
  });
}

function enterBookById(bookId) {
  const book = appData.books.find(b => b.id === bookId);
  if (!book) return;
  enterBook(book.id, book.name);
}

function enterBook(bookId, bookName) {
  appData.currentBookId = bookId;
  const titleEl = document.getElementById('header-book-title');
  if (titleEl) titleEl.innerText = bookName;
  const screen = document.getElementById('book-select-screen');
  if (!screen) return;
  const activePanel = document.querySelector('.panel.active');
  if (activePanel) {
    activePanel.style.opacity = '0';
    activePanel.style.animation = 'none';
  }
  screen.style.animation = 'fadeOutDown 0.25s cubic-bezier(0.2, 0.8, 0.2, 1) forwards';
  setTimeout(() => {
    screen.style.display = 'none';
    screen.style.animation = '';
    if (activePanel) {
      activePanel.style.opacity = '';
      activePanel.style.animation = 'slideInUp 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) forwards';
    }
    showToast(bookName + " を開きました");
    setTimeout(() => {
      updateChapterSelects();
      renderChapterList();
      renderWordList();
      const thInput = document.getElementById('mastery-threshold-input');
      if (thInput) thInput.value = getCurrentMasteryThreshold();
      const progressPanel = document.getElementById('progress-panel');
      if (progressPanel && progressPanel.classList.contains('active')) renderProgressView();
      saveData();
    }, 350);
  }, 250);
}

function goToBookSelect() {
  const activePanel = document.querySelector('.panel.active');
  const screen = document.getElementById('book-select-screen');
  if (activePanel) activePanel.style.animation = 'slideOutDown 0.2s cubic-bezier(0.2, 0.8, 0.2, 1) forwards';
  setTimeout(() => {
    if (screen) {
      screen.style.display = 'block';
      screen.style.opacity = '0';
      screen.style.animation = 'fadeInScale 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) forwards';
    }
    renderBookCards();
    if (activePanel) {
      activePanel.style.animation = 'none';
      activePanel.style.opacity = '0';
    }
  }, 200);
}

function addBookFromStart() {
  const nameInput = document.getElementById('new-book-name-start');
  const name = nameInput.value.trim();
  if (!name) return showToast('名前を入力してください');
  if (!appData.books) appData.books = [];
  appData.books.push({ id: "book_" + Date.now(), name: name, masteryThreshold: 7 });
  nameInput.value = ''; 
  saveData();
  renderBookCards();
  showToast(`「${name}」を作成しました`);
}

function editBook(id, event) {
  event.stopPropagation();
  const book = appData.books.find(b => b.id === id);
  if (!book) return;
  const newName = prompt('単語帳の新しい名前:', book.name);
  if (newName && newName.trim() !== '') {
    book.name = newName.trim();
    saveData();
    renderBookCards();
    showToast('名前を変更しました');
  }
}

function deleteBook(id, event) {
  event.stopPropagation();
  if (appData.books.length <= 1) return alert('最後の単語帳は削除できません');
  if (!confirm('本当に削除しますか？\n※章と単語も完全に消去されます')) return;
  const chaptersToDelete = appData.chapters.filter(ch => ch.bookId === id).map(ch => ch.id);
  appData.words = appData.words.filter(w => !chaptersToDelete.includes(w.chapterId));
  appData.chapters = appData.chapters.filter(ch => ch.bookId !== id);
  appData.books = appData.books.filter(b => b.id !== id);
  saveData();
  renderBookCards();
  showToast('単語帳を削除しました');
}

function updateDeviceLayout() {
  const select = document.getElementById('device-layout-select');
  if (!select) return;
  appData.deviceLayout = select.value;
  saveData(); applyDeviceLayout(); showToast('レイアウトを切り替えました');
}

function syncThemeControl(mode) {
  const control = document.getElementById('theme-mode-select');
  const stateLabel = document.getElementById('theme-mode-state');
  if (control) {
    if (control.type === 'checkbox') control.checked = mode === 'dark';
    else if (control.value !== mode) control.value = mode;
  }
  if (stateLabel) {
    stateLabel.innerText = mode === 'dark' ? '🌙 ダークモード' : '☀️ ライトモード';
  }
}

function getSelectedThemeMode() {
  const control = document.getElementById('theme-mode-select');
  if (!control) return 'light';
  if (control.type === 'checkbox') return control.checked ? 'dark' : 'light';
  return control.value === 'dark' ? 'dark' : 'light';
}

function updateThemeMode() {
  appData.themeMode = getSelectedThemeMode();
  saveData();
  applyThemeMode();
  showToast(`${appData.themeMode === 'dark' ? 'ダーク' : 'ライト'}モードに切り替えました`);
}

function normalizeThemeStyleAttribute(styleText) {
  if (!styleText) return styleText;
  const rules = [
    [/\b(background(?:-color)?\s*:\s*)white\b/gi, '$1var(--bg-surface)'],
    [/\b(background(?:-color)?\s*:\s*)#fff\b/gi, '$1var(--bg-surface)'],
    [/\b(background(?:-color)?\s*:\s*)#ffffff\b/gi, '$1var(--bg-surface)'],
    [/\b(background(?:-color)?\s*:\s*)#f8f9fa\b/gi, '$1var(--bg-muted)'],
    [/\b(background(?:-color)?\s*:\s*)#f1f2f6\b/gi, '$1var(--bg-soft-button)'],
    [/\b(background(?:-color)?\s*:\s*)#e8f4fd\b/gi, '$1var(--primary-soft)'],
    [/\b(background(?:-color)?\s*:\s*)#2c3e50\b/gi, '$1var(--header-bg)'],
    [/\b(background(?:-color)?\s*:\s*)#3498db\b/gi, '$1var(--primary)'],
    [/\b(background(?:-color)?\s*:\s*)#2980b9\b/gi, '$1var(--primary-hover)'],
    [/\b(background(?:-color)?\s*:\s*)#2ecc71\b/gi, '$1var(--success-bright)'],
    [/\b(background(?:-color)?\s*:\s*)#27ae60\b/gi, '$1var(--success)'],
    [/\b(background(?:-color)?\s*:\s*)#1abc9c\b/gi, '$1var(--success)'],
    [/\b(background(?:-color)?\s*:\s*)#e8f8f5\b/gi, '$1var(--success-soft)'],
    [/\b(background(?:-color)?\s*:\s*)#e74c3c\b/gi, '$1var(--danger)'],
    [/\b(background(?:-color)?\s*:\s*)#c0392b\b/gi, '$1var(--danger)'],
    [/\b(background(?:-color)?\s*:\s*)#fff1f0\b/gi, '$1var(--danger-soft-2)'],
    [/\b(background(?:-color)?\s*:\s*)#ffefed\b/gi, '$1var(--danger-soft)'],
    [/\b(background(?:-color)?\s*:\s*)#95a5a6\b/gi, '$1var(--neutral-btn)'],
    [/\b(background(?:-color)?\s*:\s*)#bdc3c7\b/gi, '$1var(--neutral-btn-soft)'],
    [/\b(background(?:-color)?\s*:\s*)#ffeaa7\b/gi, '$1var(--warning-soft)'],
    [/\b(background(?:-color)?\s*:\s*)#ecf0f1\b/gi, '$1var(--border-soft)'],
    [/\b(color\s*:\s*)white\b/gi, '$1var(--text-inverse)'],
    [/\b(color\s*:\s*)#fff\b/gi, '$1var(--text-inverse)'],
    [/\b(color\s*:\s*)#ffffff\b/gi, '$1var(--text-inverse)'],
    [/\b(color\s*:\s*)#333\b/gi, '$1var(--text-body)'],
    [/\b(color\s*:\s*)#2c3e50\b/gi, '$1var(--text-primary)'],
    [/\b(color\s*:\s*)#57606f\b/gi, '$1var(--text-secondary)'],
    [/\b(color\s*:\s*)#7f8c8d\b/gi, '$1var(--text-secondary)'],
    [/\b(color\s*:\s*)#95a5a6\b/gi, '$1var(--text-secondary)'],
    [/\b(color\s*:\s*)#666\b/gi, '$1var(--text-secondary)'],
    [/\b(color\s*:\s*)#2980b9\b/gi, '$1var(--primary)'],
    [/\b(color\s*:\s*)#d35400\b/gi, '$1var(--warning-text)'],
    [/\b(color\s*:\s*)#27ae60\b/gi, '$1var(--success)'],
    [/\b(color\s*:\s*)#f39c12\b/gi, '$1var(--review-ready)'],
    [/\b(color\s*:\s*)#e74c3c\b/gi, '$1var(--danger)'],
    [/\b(border(?:-color)?\s*:\s*(?:\d+px\s+solid\s*)?)#e2e8f0\b/gi, '$1var(--border)'],
    [/\b(border(?:-color)?\s*:\s*(?:\d+px\s+solid\s*)?)#ecf0f1\b/gi, '$1var(--border-soft)'],
    [/\b(border(?:-color)?\s*:\s*(?:\d+px\s+solid\s*)?)#dfe4ea\b/gi, '$1var(--bg-soft-button-hover)'],
    [/\b(border(?:-color)?\s*:\s*(?:\d+px\s+solid\s*)?)#fdcb6e\b/gi, '$1var(--warning-soft-border)'],
    [/\b(border(?:-color)?\s*:\s*(?:\d+px\s+solid\s*)?)#c0392b\b/gi, '$1var(--danger)'],
    [/\b(border(?:-color)?\s*:\s*(?:\d+px\s+solid\s*)?)#27ae60\b/gi, '$1var(--success)'],
    [/\b(border(?:-left|-bottom)?\s*:\s*(?:\d+px\s+(?:solid|dashed)\s*)?)#3498db\b/gi, '$1var(--primary)']
  ];

  return rules.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), styleText);
}

function applyThemeToInlineStyles(root = document) {
  const nodes = [];
  if (root && root.nodeType === 1 && root.hasAttribute('style')) nodes.push(root);
  if (root && typeof root.querySelectorAll === 'function') {
    root.querySelectorAll('[style]').forEach(el => nodes.push(el));
  }
  nodes.forEach(el => {
    const currentStyle = el.getAttribute('style');
    if (!currentStyle) return;
    const normalized = normalizeThemeStyleAttribute(currentStyle);
    if (normalized !== currentStyle) el.setAttribute('style', normalized);
  });
}

let themeMutationObserver = null;
function applyThemeMode() {
  const mode = appData.themeMode === 'dark' ? 'dark' : 'light';
  document.body.classList.toggle('theme-dark', mode === 'dark');
  document.body.classList.toggle('theme-light', mode !== 'dark');
  syncThemeControl(mode);

  // 初回のみ全体を正規化。以降は切替アニメーションの滑らかさを優先。
  if (!hasNormalizedInlineStyles) {
    requestAnimationFrame(() => {
      applyThemeToInlineStyles(document);
      hasNormalizedInlineStyles = true;
    });
  }

  if (!themeMutationObserver && typeof MutationObserver !== 'undefined') {
    themeMutationObserver = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node && node.nodeType === 1) applyThemeToInlineStyles(node);
        });
      });
    });
    themeMutationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
}

function applyDeviceLayout() {
  if (appData.deviceLayout === 'ipad') document.body.classList.add('ipad-mode');
  else document.body.classList.remove('ipad-mode');
}

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
  const targetItem = listItems[idx];         // 移動させたい章
  const swapItem = listItems[idx + dir];     // 入れ替わる相手の章

  if (targetItem && swapItem) {
    // 1. 各要素の現在の位置（座標）を正確に取得
    const targetRect = targetItem.getBoundingClientRect();
    const swapRect = swapItem.getBoundingClientRect();
    
    // 2. 移動すべき「ピクセル距離」を正確に計算（誤差ゼロ！）
    const distance = swapRect.top - targetRect.top;

    // 3. なめらかなアニメーションを設定して移動させる
    targetItem.style.transition = 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1), box-shadow 0.3s ease';
    swapItem.style.transition = 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)';

    targetItem.style.zIndex = '10';
    targetItem.style.boxShadow = '0 5px 15px rgba(0,0,0,0.15)'; // ふわっと浮かす
    swapItem.style.zIndex = '5';

    // 計算したピクセル分だけ正確にスライド
    targetItem.style.transform = `translateY(${distance}px)`;
    swapItem.style.transform = `translateY(${-distance}px)`;

    // 4. アニメーション完了（0.3秒後）にデータを入れ替えて再描画
    setTimeout(() => {
      // スタイルをリセット（これがないと次から動かなくなる）
      targetItem.style.transition = '';
      swapItem.style.transition = '';
      targetItem.style.transform = '';
      swapItem.style.transform = '';
      targetItem.style.zIndex = '';
      targetItem.style.boxShadow = '';
      swapItem.style.zIndex = '';

      // データ入れ替え
      const actualIdx1 = appData.chapters.findIndex(c => c.id === currentChapters[idx].id);
      const actualIdx2 = appData.chapters.findIndex(c => c.id === currentChapters[idx + dir].id);
      [appData.chapters[actualIdx1], appData.chapters[actualIdx2]] = [appData.chapters[actualIdx2], appData.chapters[actualIdx1]];
      
      saveData(); 
      updateChapterSelects(); 
      renderChapterList();
    }, 300);
    
  } else {
    // 要素が見つからなければ即時移動
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

  // ▼ 追加：現在開いている単語帳の章（チャプター）のIDリストを取得する
  const currentChapterIds = appData.chapters.filter(ch => ch.bookId === appData.currentBookId).map(ch => ch.id);

  // ▼ 変更：現在の単語帳に含まれる章の単語の中だけで重複チェックをするように変更
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
  
  // ▼ 追加：現在開いている単語帳の章（チャプター）のIDリストを取得する
  // ※ループの外で1回だけ取得することで、大量の単語を追加する時もサクサク動きます！
  const currentChapterIds = appData.chapters.filter(ch => ch.bookId === appData.currentBookId).map(ch => ch.id);

  text.split('\n').forEach(line => {
    const p = line.split(',');
    if (p.length >= 2) {
      const en = p[0].trim();
      
      // ▼ 変更：現在の単語帳に含まれる章の単語の中だけで重複チェックをするように変更
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

// ▼ 6. タブ切り替え処理（フリッカー防止版）
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
  
  // ▼ 変更：アニメーションが終わった直後に「なめらかスクロール」を発動させる
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
        // 1. 特殊文字のエスケープ
        let safeWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // 2. よくあるスペル変化を許容する
        // 末尾の y を ie に（例: study -> studies, studied をキャッチ）
        if (safeWord.endsWith('y')) {
            safeWord = safeWord.slice(0, -1) + '(?:y|ie)';
        } 
        // 末尾の e の省略を許容（例: make -> making, use -> used をキャッチ）
        else if (safeWord.endsWith('e')) {
            safeWord = safeWord.slice(0, -1) + 'e?';
        }

        // 3. 単語の境界(\b)と、活用語尾(s, es, ed, d, ing)を自動判定する呪文
        // [a-z]? は run -> running のように子音が重なるケースを許容するための隠し味です
        // ※ er(名詞化など) と est を削除しました
        const suffixPattern = '(?:[a-z]?(?:s|es|ed|d|ing))?';
        const regex = new RegExp(`\\b(${safeWord}${suffixPattern})\\b(?![^<]*>)`, 'gi');
        
        // 4. マッチした塊をまるごと太字にする
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

  // 音声再生ボタンを作る便利な関数
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

// ▼ 2. 通常クイズ開始（フラッシュバグ防止版）
function startQuiz() {
  unlockSpeech();
  const selected = Array.from(document.querySelectorAll('input[name="quiz-chapters"]:checked')).map(cb => cb.value);
  if (selected.length === 0) return showToast('章を選んでください');
  qMode = document.getElementById('quiz-mode-toggle').checked ? 'example' : 'normal';
  qDirection = document.getElementById('quiz-direction-toggle').checked ? 'ja-to-en' : 'en-to-ja';
  currentQuizTimeLimit = parseInt(document.getElementById('quiz-time-limit').value);
  const amount = parseInt(document.getElementById('quiz-amount').value);
  let eligible = appData.words.filter(w => selected.includes(w.chapterId) && Date.now() >= (w.nextReviewTime || 0));
  if (eligible.length < 4) return showToast('出題可能な単語が足りません');
  appData.quizSessionId = (appData.quizSessionId || 0) + 1;
  saveData();
  quizPool = eligible.sort(() => 0.5 - Math.random()).slice(0, amount);
  qIdx = 0; correctCount = 0;
  
  const accBtn = document.querySelector('.app-header .account-btn');
  if (accBtn) {
    accBtn.style.transition = 'opacity 0.3s ease';
    accBtn.style.opacity = '0';
    accBtn.style.pointerEvents = 'none';
  }

  const backBtn = document.querySelector('.back-btn');
  if (backBtn) {
    backBtn.style.transition = 'opacity 0.3s ease';
    backBtn.style.opacity = '0';
    backBtn.style.pointerEvents = 'none';
  }
  
  document.getElementById('quiz-settings').classList.add('hidden');
  document.getElementById('quiz-result-screen').classList.add('hidden');
  document.getElementById('quiz-play').classList.remove('hidden');

  const bottomNav = document.querySelector('.bottom-nav');
  if (bottomNav) {
    bottomNav.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
    bottomNav.style.transform = 'translateY(100%)';
    bottomNav.style.opacity = '0';
    bottomNav.style.pointerEvents = 'none';
  }

  nextQuestion();
}

// ▼ 3. 弱点克服クイズ開始（フラッシュバグ防止版）
function startWeakQuiz() {
  unlockSpeech();
  const selected = Array.from(document.querySelectorAll('input[name="quiz-chapters"]:checked')).map(cb => cb.value);
  if (selected.length === 0) return showToast('章を選んでください');
  const currentSession = appData.quizSessionId || 0;
  const targetThreshold = getCurrentMasteryThreshold();
  let eligible = appData.words.filter(w => {
    const inSelected = selected.includes(w.chapterId);
    const notMastered = (w.streak || 0) < targetThreshold;
    const recentlyMistaken = w.lastMistakeQuizId && (currentSession - w.lastMistakeQuizId <= 5);
    return inSelected && notMastered && recentlyMistaken;
  });
  if (eligible.length === 0) return showToast('該当する単語がありません');
  appData.quizSessionId = currentSession + 1;
  saveData();
  qMode = document.getElementById('quiz-mode-toggle').checked ? 'example' : 'normal';
  qDirection = document.getElementById('quiz-direction-toggle').checked ? 'ja-to-en' : 'en-to-ja';
  currentQuizTimeLimit = parseInt(document.getElementById('quiz-time-limit').value);
  const amount = parseInt(document.getElementById('quiz-amount').value);
  eligible.sort((a, b) => (b.lastMistakeQuizId || 0) - (a.lastMistakeQuizId || 0));
  quizPool = eligible.slice(0, amount).sort(() => 0.5 - Math.random());
  qIdx = 0; correctCount = 0;
  
  const accBtn = document.querySelector('.app-header .account-btn');
  if (accBtn) {
    accBtn.style.transition = 'opacity 0.3s ease';
    accBtn.style.opacity = '0';
    accBtn.style.pointerEvents = 'none';
  }

  const backBtn = document.querySelector('.back-btn');
  if (backBtn) {
    backBtn.style.transition = 'opacity 0.3s ease';
    backBtn.style.opacity = '0';
    backBtn.style.pointerEvents = 'none';
  }

  document.getElementById('quiz-settings').classList.add('hidden');
  document.getElementById('quiz-result-screen').classList.add('hidden');
  document.getElementById('quiz-play').classList.remove('hidden');

  const bottomNav = document.querySelector('.bottom-nav');
  if (bottomNav) {
    bottomNav.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
    bottomNav.style.transform = 'translateY(100%)';
    bottomNav.style.opacity = '0';
    bottomNav.style.pointerEvents = 'none';
  }

  nextQuestion();
}

function nextQuestion() {
  clearInterval(timer);
  clearInterval(countdownTimer);
  
  // もしcancelQuitQuizという関数があれば実行（エラー回避）
  if (typeof cancelQuitQuiz === 'function') cancelQuitQuiz();
  if (typeof autoProceedTimeout !== 'undefined') clearTimeout(autoProceedTimeout);

  document.getElementById('next-btn').classList.add('hidden');
  document.getElementById('result-message').innerText = '';
  const container = document.getElementById('choices-container');
  container.innerHTML = '';
  
  // 全問終了していれば終了処理へ（エラー防止）
  if (qIdx >= quizPool.length) {
      if (typeof endQuiz === 'function') return endQuiz();
      return;
  }
  
  curQ = quizPool[qIdx]; // ★ここで現在の単語が決まる
  if (!curQ) return;
  
  // ==========================================
  // ▼▼ オートモードの判定と設定の上書き ▼▼
  // ==========================================
  const toggleEl = document.getElementById('auto-level-toggle');
  const isAutoMode = toggleEl && toggleEl.checked;
  
  let currentQuestionMode = qMode; 
  let currentQuestionTimeLimit = currentQuizTimeLimit;
  currentQuestionModeGlobal = currentQuestionMode;

  if (isAutoMode) {
    const targetThreshold = typeof getCurrentMasteryThreshold === 'function' ? getCurrentMasteryThreshold() : 7;
    const autoSettings = typeof getAutoModeSettings === 'function' ? getAutoModeSettings(curQ.streak, targetThreshold) : { timeLimit: 5, showExample: false };
    currentQuestionTimeLimit = autoSettings.timeLimit;
    currentQuestionMode = autoSettings.showExample ? 'example' : 'normal';
  }
  currentQuestionModeGlobal = currentQuestionMode;
  // ==========================================

  const prog = `<div style="font-size:14px; color:#7f8c8d; margin-top:15px; font-weight:normal;">(${qIdx+1} / ${quizPool.length})</div>`;
  let questionText = '';
  let hintText = '';
  
  if (qDirection === 'ja-to-en') {
    questionText = `<div>${curQ.ja}</div>`;
    if (currentQuestionMode === 'example') {
      questionText += `<div style="font-size:16px; color:#57606f; margin-top:10px;">${curQ.exJa || ''}</div>`;
      hintText = `<div id="hint-box" class="hidden" style="font-size:16px; margin-top:15px; color:#f39c12;">💡 ${curQ.ex || ''}</div>`;
    }
  } else {
    questionText = `<div>${curQ.en}</div>`;
    if (currentQuestionMode === 'example') {
      const displayEx = curQ.ex ? createMaskableText(curQ.ex, true, false, curQ.en || '') : '';
      questionText += `<div style="font-size:16px; color:#57606f; margin-top:10px;">${displayEx}</div>`;
      hintText = `<div id="hint-box" class="hidden" style="font-size:16px; margin-top:15px; color:#f39c12;">💡 ${curQ.exJa || ''}</div>`;
    }
  }
  
  document.getElementById('question-text').innerHTML = questionText + hintText + prog;
  
  // ▼▼ 音声関連の処理（iOSタップ無反応バグを完全突破版） ▼▼
  try {
      if (qDirection === 'en-to-ja') { 
          playVoice(curQ.en); 
      }

      // ▼▼ 白いカードをタップした時の音声再生（超確実版） ▼▼
      const qCard = document.querySelector('.question-card');
      if (qCard) {
          qCard.style.cursor = 'pointer';
          // 問題が進むたびにリスナーが積み上がらないように、毎回上書きする
          qCard.onclick = function() {
              let textToRead = "";

              if (curQ && curQ.ex && curQ.ex.trim() !== "") {
                  textToRead = curQ.ex;
              } else if (curQ && curQ.en) {
                  textToRead = curQ.en;
              }

               if (textToRead) {
                  // 例文に <span> などのHTMLタグが含まれていると音声がバグって無音になるため、
                  // 文字だけを綺麗に抽出してから読み上げさせる！
                  let cleanText = textToRead.replace(/<[^>]*>?/gm, '');
                  playVoice(cleanText);
              }
                };
      }
      // ▲▲ ここまで ▲▲
  } catch(e) { console.log("音声再生エラー:", e); }
  // ▲▲ 音声処理ここまで ▲▲

  const selectedChapters = Array.from(document.querySelectorAll('input[name="quiz-chapters"]:checked')).map(cb => cb.value);
  let dist = appData.words.filter(w => w.id !== curQ.id && selectedChapters.includes(w.chapterId)).sort(() => 0.5 - Math.random()).slice(0, 3);
  if(dist.length < 3) {
    const extraDist = appData.words.filter(w => w.id !== curQ.id && !dist.includes(w)).sort(() => 0.5 - Math.random()).slice(0, 3 - dist.length);
    dist = dist.concat(extraDist);
  }
  
  let choices = [...dist, curQ].sort(() => 0.5 - Math.random());
  choices.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.innerText = (qDirection === 'ja-to-en') ? opt.en : opt.ja;
    btn.onclick = () => checkAnswer(opt.id, btn);
    container.appendChild(btn);
  });
  
  const idkBtn = document.createElement('button');
  idkBtn.className = 'choice-btn'; idkBtn.innerText = 'わからない';
  idkBtn.style.backgroundColor = 'var(--bg-soft-button)'; idkBtn.style.borderColor = 'var(--bg-soft-button-hover)'; idkBtn.style.textAlign = 'center';
  idkBtn.onclick = () => checkAnswer(null, idkBtn);
  container.appendChild(idkBtn);
  
  const timerDisplay = document.getElementById('timer-display');
  
  if (currentQuestionTimeLimit > 0) {
    let timeLeft = currentQuestionTimeLimit;
    timerDisplay.innerText = `⏳ ${timeLeft}秒`;
    countdownTimer = setInterval(() => {
      timeLeft--;
      if (timeLeft > 0) { timerDisplay.innerText = `⏳ ${timeLeft}秒`; }
      else { clearInterval(countdownTimer); timerDisplay.innerText = '時間切れ！'; checkAnswer(null, null, true); }
    }, 1000);
  } else {
    timerDisplay.innerText = ''; 
  }
}

function endQuiz() {
  showResults();
}

// ▼ 1. クイズの正誤判定（習得ポイント半分ペナルティ化）
function checkAnswer(id, btn, isTimeout = false) {
  clearInterval(timer);
  clearInterval(countdownTimer);
  document.querySelectorAll('.choice-btn').forEach(b => b.disabled = true);
  
  const isCorrect = !isTimeout && (id === curQ.id);
  const msg = document.getElementById('result-message');
  if(document.getElementById('hint-box')) document.getElementById('hint-box').classList.remove('hidden');
  
  const correctChoiceText = (qDirection === 'ja-to-en') ? curQ.en : curQ.ja;
  const targetThreshold = getCurrentMasteryThreshold();
  
  if (isCorrect) {
    triggerVibration([30, 50, 30]);
    btn.classList.add('correct'); msg.innerText = '⭕ 正解！'; msg.style.color = 'var(--success)';
    curQ.streak = (curQ.streak || 0) + 1; correctCount++;
    if (curQ.streak >= targetThreshold) curQ.nextReviewTime = Date.now() + 43200000;
  } else {
    triggerVibration(200);
    if (btn) btn.classList.add('wrong');
    msg.innerText = isTimeout ? `⏰ 正解: ${correctChoiceText}` : `❌ 正解: ${correctChoiceText}`;
    msg.style.color = 'var(--danger)';
    
    // 間違えたら0ではなく、現在のポイントを半分（切り捨て）にする！
    curQ.streak = Math.floor((curQ.streak || 0) / 2); 
    curQ.nextReviewTime = 0; 
    
    curQ.lastMistakeQuizId = appData.quizSessionId;
    document.querySelectorAll('.choice-btn').forEach(b => { 
      if(b.innerText === correctChoiceText) b.classList.add('correct'); 
    });
  }
  
  saveData(); qIdx++;
  const nBtn = document.getElementById('next-btn');
  const isLast = qIdx >= quizPool.length;
  nBtn.classList.remove('hidden');
  let sec = 10;
  const updateText = () => nBtn.innerText = (isLast ? '結果を見る' : '次へ') + ` (${sec}s)`;
  updateText();
  timer = setInterval(() => {
    sec--; updateText();
    if(sec <= 0) { clearInterval(timer); isLast ? showResults() : nextQuestion(); }
  }, 1000);
  nBtn.onclick = () => { clearInterval(timer); isLast ? showResults() : nextQuestion(); };
}

// ▼ 4. クイズ結果画面（表示崩れ防止版）
function showResults() {
  clearInterval(timer);
  clearInterval(countdownTimer);
  
  if (typeof triggerVibration === 'function') {
    triggerVibration([50, 50, 50, 50, 200]);
  }
  
  const accBtn = document.querySelector('.app-header .account-btn');
  if (accBtn) {
    accBtn.style.opacity = '0';
    accBtn.style.pointerEvents = 'none';
  }

  const backBtn = document.querySelector('.back-btn');
  if (backBtn) {
    backBtn.style.opacity = '0';
    backBtn.style.pointerEvents = 'none';
  }
  
  document.getElementById('quiz-play').classList.add('hidden');
  
  const score = correctCount;
  const total = quizPool.length;
  const percentage = Math.round((score / total) * 100);
  
  const resultHtml = `
    <div style="text-align: center; padding: 30px 10px; animation: fadeInScale 0.5s ease-out;">
      <h2 style="font-size: 26px; color: #2c3e50; margin-bottom: 20px;">🎉 クイズ完了！ 🎉</h2>
      
      <div style="width: 160px; height: 160px; background: conic-gradient(#2ecc71 ${percentage}%, #ecf0f1 0); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 25px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); position: relative;">
        <div style="width: 130px; height: 130px; background: white; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
          <span style="font-size: 38px; font-weight: 900; color: #2c3e50; line-height: 1;">${score}</span>
          <span style="font-size: 15px; color: #7f8c8d; margin-top: 5px;">/ ${total} 問正解</span>
        </div>
      </div>
      
      <p style="font-size: 18px; font-weight: bold; color: ${percentage === 100 ? '#e74c3c' : '#3498db'}; margin-bottom: 30px;">
        ${percentage === 100 ? ' 素晴らしい！👍' : percentage >= 80 ? 'あともう少し！✨' : 'その調子！'}
      </p>
      
      <button onclick="executeQuitQuiz()" style="width: 100%; padding: 16px; font-size: 16px; border-radius: 12px; box-shadow: 0 8px 15px rgba(52, 152, 219, 0.2); background-color: #3498db; color: white; border: none; font-weight: bold; cursor: pointer;">一覧へ戻る</button>
    </div>
  `;
  
  const resultScreen = document.getElementById('quiz-result-screen');
  resultScreen.innerHTML = resultHtml;
  resultScreen.classList.remove('hidden');
}

function requestQuitQuiz() {
  document.getElementById('quit-btn').classList.add('hidden');
  document.getElementById('quit-confirm-container').classList.remove('hidden');
}

function cancelQuitQuiz() {
  document.getElementById('quit-confirm-container').classList.add('hidden');
  document.getElementById('quit-btn').classList.remove('hidden');
}

// ▼ 5. クイズ終了・中断処理（フリッカー防止版）
function executeQuitQuiz() {
  cancelQuitQuiz();
  clearInterval(timer);
  clearInterval(countdownTimer);
  
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

  document.getElementById('quiz-settings').classList.remove('hidden');
  document.getElementById('quiz-play').classList.add('hidden');
  document.getElementById('quiz-result-screen').classList.add('hidden');
  
  setTimeout(() => { renderWordList(); }, 310);
}

function exportData() {
  const dataStr = JSON.stringify(appData);
  const textarea = document.getElementById('backup-data-input');
  textarea.value = dataStr;
  textarea.select();
  try {
    navigator.clipboard.writeText(dataStr);
    showToast("自動コピーしました！");
  } catch (err) { }
}

function importData() {
  const dataStr = document.getElementById('backup-data-input').value.trim();
  if (!dataStr) return showToast("コードを貼り付けてください");
  if (!confirm("現在のデータはすべて上書きされます。よろしいですか？")) return;
  try {
    const parsed = JSON.parse(dataStr);
    if (parsed && parsed.words && parsed.chapters) {
      appData = parsed;
      if (!appData.themeMode) appData.themeMode = 'light';
      syncThemeControl(appData.themeMode);
      applyThemeMode();
      saveData(); updateChapterSelects(); renderChapterList(); renderWordList();
      showToast("データを復元しました");
      document.getElementById('backup-data-input').value = '';
    }
  } catch (e) { showToast("読み込みに失敗しました"); }
}

try { loadData(); } catch(e) {}
try { updateQuizAutoModeUI(); } catch(e) {}

setInterval(() => { if (typeof updateTimeDisplays === 'function') updateTimeDisplays(); }, 30000);

['touchstart', 'click'].forEach(function(eventType) {
  document.addEventListener(eventType, function(event) {
    const target = event.target;
    if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && target.tagName !== 'SELECT' && target.tagName !== 'BUTTON') {
      if (document.activeElement && typeof document.activeElement.blur === 'function') document.activeElement.blur();
    }
  }, { passive: true });
});

// ▼▼ 変更：目標に対する「割合」でレベルを判定する関数 ▼▼
function getAutoModeSettings(streak, targetThreshold) {
  const currentStreak = streak || 0;
  const target = targetThreshold || 7; // 安全のためのデフォルト値
  const ratio = currentStreak / target; // 進捗の割合（0.0 〜 1.0以上）を計算

  // 1/7 (約14.3%) 刻みで設定を切り替える
  if (ratio < 1/7) return { timeLimit: 0,  showExample: true };
  if (ratio < 2/7) return { timeLimit: 10, showExample: true };
  if (ratio < 3/7) return { timeLimit: 5,  showExample: true };
  if (ratio < 4/7) return { timeLimit: 0,  showExample: false }; // ★ここで補助輪オフ
  if (ratio < 5/7) return { timeLimit: 10, showExample: false };
  if (ratio < 6/7) return { timeLimit: 5,  showExample: false };
  return { timeLimit: 2,  showExample: false };                  // 85%以上 (ほぼ完成)
}
// ▲▲ ここまで ▲▲

function updateQuizAutoModeUI() {
  const autoToggle = document.getElementById('auto-level-toggle');
  const modeBlock = document.getElementById('quiz-mode-setting-block');
  const timeBlock = document.getElementById('quiz-time-limit-setting-block');
  if (!autoToggle) return;

  const isAuto = !!autoToggle.checked;
  if (modeBlock) modeBlock.style.display = isAuto ? 'none' : '';
  if (timeBlock) timeBlock.style.display = isAuto ? 'none' : '';
}

// ▼▼ 最終形態Ver4：クイズ画面中だけ正確に鳴らす ▼▼
document.addEventListener('click', function(event) {
    // ① ボタンなどを押した時はスルー
    const t = event.target.tagName;
    if (t === 'BUTTON' || t === 'INPUT' || t === 'SELECT' || t === 'A' || event.target.closest('button')) {
        return; 
    }

    // ★追加：クイズ画面（quiz-play）が開いていない時は、ここで処理をストップして絶対に鳴らさない！
    const quizScreen = document.getElementById('quiz-play');
    if (!quizScreen || quizScreen.classList.contains('hidden')) {
        return;
    }

    if (typeof curQ !== 'undefined' && curQ !== null) {
        let textToRead = "";

        // グローバル変数で現在のモードを判定して読み上げるテキストを決める
        if (currentQuestionModeGlobal === 'example' && curQ.ex) {
            textToRead = curQ.ex.replace(/<[^>]*>?/gm, '').trim();
        } else if (curQ.en) {
            textToRead = curQ.en.replace(/<[^>]*>?/gm, '');
        }

        if (textToRead) {
            playVoice(textToRead);
        }
    }
});
// ▲▲ ここまで ▲▲


// 進捗画面の変化を監視開始
const progressContainer = document.getElementById('progress-view-container');
if (progressContainer) {
  progressContainer.addEventListener('scroll', handleProgressVirtualScroll, { passive: true });
}

const wordListContainer = document.getElementById('word-list');
if (wordListContainer) {
  wordListContainer.addEventListener('scroll', handleWordListVirtualScroll, { passive: true });
}
// ▲▲ ここまで ▲▲

