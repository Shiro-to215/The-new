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
