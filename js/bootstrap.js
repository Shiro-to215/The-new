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

function getAutoModeSettings(streak, targetThreshold) {
  const currentStreak = streak || 0;
  const target = targetThreshold || 7;
  const ratio = currentStreak / target;

  if (ratio < 1/7) return { timeLimit: 0,  showExample: true };
  if (ratio < 2/7) return { timeLimit: 10, showExample: true };
  if (ratio < 3/7) return { timeLimit: 5,  showExample: true };
  if (ratio < 4/7) return { timeLimit: 0,  showExample: false };
  if (ratio < 5/7) return { timeLimit: 10, showExample: false };
  if (ratio < 6/7) return { timeLimit: 5,  showExample: false };
  return { timeLimit: 2,  showExample: false };
}

function updateQuizAutoModeUI() {
  const autoToggle = document.getElementById('auto-level-toggle');
  const modeBlock = document.getElementById('quiz-mode-setting-block');
  const timeBlock = document.getElementById('quiz-time-limit-setting-block');
  if (!autoToggle) return;

  const isAuto = !!autoToggle.checked;
  if (modeBlock) modeBlock.style.display = isAuto ? 'none' : '';
  if (timeBlock) timeBlock.style.display = isAuto ? 'none' : '';
}

document.addEventListener('click', function(event) {
    const t = event.target.tagName;
    if (t === 'BUTTON' || t === 'INPUT' || t === 'SELECT' || t === 'A' || event.target.closest('button')) {
        return;
    }

    const quizScreen = document.getElementById('quiz-play');
    if (!quizScreen || quizScreen.classList.contains('hidden')) {
        return;
    }

    if (typeof curQ !== 'undefined' && curQ !== null) {
        let textToRead = "";

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

const progressContainer = document.getElementById('progress-view-container');
if (progressContainer) {
  progressContainer.addEventListener('scroll', handleProgressVirtualScroll, { passive: true });
}

const wordListContainer = document.getElementById('word-list');
if (wordListContainer) {
  wordListContainer.addEventListener('scroll', handleWordListVirtualScroll, { passive: true });
}
