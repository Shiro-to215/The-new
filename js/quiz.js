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
  
  if (typeof cancelQuitQuiz === 'function') cancelQuitQuiz();
  if (typeof autoProceedTimeout !== 'undefined') clearTimeout(autoProceedTimeout);

  document.getElementById('next-btn').classList.add('hidden');
  document.getElementById('result-message').innerText = '';
  const container = document.getElementById('choices-container');
  container.innerHTML = '';
  
  if (qIdx >= quizPool.length) {
      if (typeof endQuiz === 'function') return endQuiz();
      return;
  }
  
  curQ = quizPool[qIdx];
  if (!curQ) return;
  
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
  
  try {
      if (qDirection === 'en-to-ja') {
          playVoice(curQ.en);
      }

      const qCard = document.querySelector('.question-card');
      if (qCard) {
          qCard.style.cursor = 'pointer';
          qCard.onclick = function(event) {
              if (event && typeof event.preventDefault === 'function') event.preventDefault();
              if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
              if (event && typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();

            let textToRead = "";
            const isExampleMode = currentQuestionModeGlobal === 'example';

            if (isExampleMode && curQ && curQ.ex && curQ.ex.trim() !== "") {
              textToRead = curQ.ex;
            } else if (curQ && curQ.en) {
              textToRead = curQ.en;
            }

            if (textToRead) {
              const cleanText = textToRead.replace(/<[^>]*>?/gm, '').trim();
              if (cleanText) playVoice(cleanText);
            }
          };
      }
  } catch(e) { console.log("音声再生エラー:", e); }

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
