/**
 * 金門話學習平台 - API 模組
 * 處理與 AWS 後端的所有 API 通訊
 */

const API_BASE = 'https://ys63zw9mhl.execute-api.ap-southeast-2.amazonaws.com/prod';

/**
 * 取得當前登入的使用者
 */
export function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem('kinmen_user'));
  } catch {
    return null;
  }
}

/**
 * 取得本地進度
 */
export function getLocalProgress() {
  try {
    return JSON.parse(localStorage.getItem('kinmen_progress') || '{}');
  } catch {
    return {};
  }
}

/**
 * 儲存進度到本地
 */
export function saveLocalProgress(progress) {
  localStorage.setItem('kinmen_progress', JSON.stringify(progress));
}

/**
 * 同步進度到伺服器（如果已登入）
 */
export async function syncProgressToServer(progressData) {
  const user = getCurrentUser();
  if (!user) {
    // 未登入，只存本地
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: user.username,
        ...progressData
      })
    });

    if (!response.ok) {
      console.warn('同步進度失敗:', await response.text());
    }
  } catch (error) {
    console.warn('同步進度時發生錯誤:', error);
  }
}

/**
 * 從伺服器取得進度
 */
export async function fetchProgressFromServer() {
  const user = getCurrentUser();
  if (!user) {
    return null;
  }

  try {
    const response = await fetch(`${API_BASE}/api/progress/${user.username}`);
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    return data.progress;
  } catch (error) {
    console.warn('取得進度時發生錯誤:', error);
    return null;
  }
}

/**
 * 儲存詞彙學習進度
 */
export async function saveVocabularyProgress(vocabularyData) {
  const progress = getLocalProgress();
  progress.vocabulary = vocabularyData;
  saveLocalProgress(progress);

  await syncProgressToServer({ vocabulary: vocabularyData });
}

/**
 * 儲存對話學習進度
 */
export async function saveDialogueProgress(dialogueData) {
  const progress = getLocalProgress();
  progress.dialogue = dialogueData;
  saveLocalProgress(progress);

  await syncProgressToServer({ dialogue: dialogueData });
}

/**
 * 儲存練習進度
 */
export async function savePracticeProgress(practiceData) {
  const progress = getLocalProgress();
  progress.practice = practiceData;
  saveLocalProgress(progress);

  await syncProgressToServer({ practice: practiceData });
}

/**
 * 初始化進度（頁面載入時呼叫）
 * 如果已登入，從伺服器取得最新進度並更新本地
 */
export async function initProgress() {
  const user = getCurrentUser();
  if (!user) {
    return getLocalProgress();
  }

  try {
    const serverProgress = await fetchProgressFromServer();
    if (serverProgress) {
      // 合併伺服器進度到本地
      const localProgress = getLocalProgress();
      const mergedProgress = {
        vocabulary: serverProgress.vocabulary || localProgress.vocabulary || {},
        dialogue: serverProgress.dialogue || localProgress.dialogue || {},
        practice: serverProgress.practice || localProgress.practice || {}
      };
      saveLocalProgress(mergedProgress);
      return mergedProgress;
    }
  } catch (error) {
    console.warn('初始化進度失敗:', error);
  }

  return getLocalProgress();
}

// ========================================
// 統計系統
// ========================================

/**
 * 取得統計數據
 */
export function getStatistics() {
  const progress = getLocalProgress();
  return progress.statistics || {
    totalStudyTime: 0,
    vocabularyMastered: [],
    gamesPlayed: {
      matching: 0,
      sorting: 0,
      maze: 0,
      bingo: 0,
      duel: 0
    },
    bestScores: {
      matching: 0,
      sorting: 0,
      duel: 0
    },
    dailyStreak: 0,
    lastStudyDate: null
  };
}

/**
 * 儲存統計數據
 */
export function saveStatistics(stats) {
  const progress = getLocalProgress();
  progress.statistics = stats;
  saveLocalProgress(progress);
}

/**
 * 記錄遊戲完成
 */
export function recordGamePlayed(gameType, score = 0) {
  const stats = getStatistics();

  // 增加遊戲次數
  if (stats.gamesPlayed[gameType] !== undefined) {
    stats.gamesPlayed[gameType]++;
  }

  // 更新最高分
  if (stats.bestScores[gameType] !== undefined && score > stats.bestScores[gameType]) {
    stats.bestScores[gameType] = score;
  }

  // 更新連續學習天數
  updateDailyStreak(stats);

  saveStatistics(stats);

  // 檢查成就
  checkAchievements();

  return stats;
}

/**
 * 記錄詞彙學習
 */
export function recordVocabularyLearned(vocabId) {
  const stats = getStatistics();

  if (!stats.vocabularyMastered.includes(vocabId)) {
    stats.vocabularyMastered.push(vocabId);
  }

  updateDailyStreak(stats);
  saveStatistics(stats);

  // 檢查成就
  checkAchievements();

  return stats;
}

/**
 * 更新連續學習天數
 */
function updateDailyStreak(stats) {
  const today = new Date().toDateString();
  const lastDate = stats.lastStudyDate;

  if (!lastDate) {
    stats.dailyStreak = 1;
  } else if (lastDate === today) {
    // 同一天，不更新
  } else {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (lastDate === yesterday.toDateString()) {
      stats.dailyStreak++;
    } else {
      stats.dailyStreak = 1;
    }
  }

  stats.lastStudyDate = today;
}

// ========================================
// 成就系統
// ========================================

// SVG 圖標路徑
const ACHIEVEMENT_ICONS = {
  seedling: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22v-7"/><path d="M9 15c-3 0-5.5-2.5-5.5-5.5 0-2 1-3.5 2.5-4.5C7 4 8.5 3 10.5 3c1 0 2 .5 2.5 1"/><path d="M15 15c3 0 5.5-2.5 5.5-5.5 0-2-1-3.5-2.5-4.5C17 4 15.5 3 13.5 3c-1 0-2 .5-2.5 1"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>',
  gamepad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="15" y1="13" x2="15.01" y2="13"/><line x1="18" y1="11" x2="18.01" y2="11"/><rect x="2" y="6" width="20" height="12" rx="2"/></svg>',
  target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  zap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  fire: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
  crown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/><path d="M3 20h18"/></svg>'
};

const ACHIEVEMENTS = [
  { id: 'first_word', name: '初學者', description: '學習第 1 個詞彙', icon: 'seedling', condition: (s) => s.vocabularyMastered.length >= 1 },
  { id: 'vocab_10', name: '詞彙達人', description: '學習 10 個詞彙', icon: 'book', condition: (s) => s.vocabularyMastered.length >= 10 },
  { id: 'vocab_all', name: '詞彙大師', description: '學習全部 27 個詞彙', icon: 'trophy', condition: (s) => s.vocabularyMastered.length >= 27 },
  { id: 'game_first', name: '遊戲新手', description: '完成第 1 個遊戲', icon: 'gamepad', condition: (s) => Object.values(s.gamesPlayed).some(v => v > 0) },
  { id: 'game_all', name: '遊戲專家', description: '玩過所有 5 種遊戲', icon: 'target', condition: (s) => Object.values(s.gamesPlayed).every(v => v > 0) },
  { id: 'perfect_match', name: '完美配對', description: '連連看獲得滿分', icon: 'star', condition: (s) => s.bestScores.matching >= 100 },
  { id: 'speed_demon', name: '閃電反應', description: '決鬥遊戲獲得 100 分以上', icon: 'zap', condition: (s) => s.bestScores.duel >= 100 },
  { id: 'streak_3', name: '堅持學習', description: '連續 3 天學習', icon: 'fire', condition: (s) => s.dailyStreak >= 3 },
  { id: 'streak_7', name: '學習週冠', description: '連續 7 天學習', icon: 'crown', condition: (s) => s.dailyStreak >= 7 }
];

/**
 * 取得成就數據
 */
export function getAchievements() {
  const progress = getLocalProgress();
  return progress.achievements || {
    unlocked: [],
    unlockedAt: {}
  };
}

/**
 * 儲存成就數據
 */
export function saveAchievements(achievements) {
  const progress = getLocalProgress();
  progress.achievements = achievements;
  saveLocalProgress(progress);
}

/**
 * 取得所有成就定義
 */
export function getAllAchievementDefinitions() {
  return ACHIEVEMENTS;
}

/**
 * 檢查並解鎖成就
 * 返回新解鎖的成就列表
 */
export function checkAchievements() {
  const stats = getStatistics();
  const achievements = getAchievements();
  const newlyUnlocked = [];

  ACHIEVEMENTS.forEach(achievement => {
    if (!achievements.unlocked.includes(achievement.id)) {
      if (achievement.condition(stats)) {
        achievements.unlocked.push(achievement.id);
        achievements.unlockedAt[achievement.id] = new Date().toISOString();
        newlyUnlocked.push(achievement);
      }
    }
  });

  if (newlyUnlocked.length > 0) {
    saveAchievements(achievements);

    // 顯示 Toast 通知
    newlyUnlocked.forEach(achievement => {
      showAchievementToast(achievement);
    });
  }

  return newlyUnlocked;
}

/**
 * 顯示成就解鎖 Toast
 */
function showAchievementToast(achievement) {
  // 創建 toast 元素
  const toast = document.createElement('div');
  toast.className = 'achievement-toast';
  const iconSvg = ACHIEVEMENT_ICONS[achievement.icon] || '';
  toast.innerHTML = `
    <span class="achievement-toast-icon">${iconSvg}</span>
    <div class="achievement-toast-content">
      <div class="achievement-toast-title">成就解鎖！</div>
      <div class="achievement-toast-name">${achievement.name}</div>
    </div>
  `;

  // 添加樣式（如果尚未存在）
  if (!document.getElementById('achievement-toast-styles')) {
    const style = document.createElement('style');
    style.id = 'achievement-toast-styles';
    style.textContent = `
      .achievement-toast {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%) translateY(100px);
        background: linear-gradient(135deg, #D4A84B 0%, #8B6914 100%);
        color: white;
        padding: 16px 24px;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(61, 50, 41, 0.3);
        display: flex;
        align-items: center;
        gap: 12px;
        z-index: 10000;
        animation: toastSlideUp 0.4s ease-out forwards;
      }
      .achievement-toast.hiding {
        animation: toastSlideDown 0.3s ease-in forwards;
      }
      @keyframes toastSlideUp {
        to { transform: translateX(-50%) translateY(0); }
      }
      @keyframes toastSlideDown {
        from { transform: translateX(-50%) translateY(0); }
        to { transform: translateX(-50%) translateY(100px); opacity: 0; }
      }
      .achievement-toast-icon {
        width: 40px;
        height: 40px;
        flex-shrink: 0;
      }
      .achievement-toast-icon svg {
        width: 100%;
        height: 100%;
      }
      .achievement-toast-content {
        display: flex;
        flex-direction: column;
      }
      .achievement-toast-title {
        font-size: 0.75rem;
        opacity: 0.9;
      }
      .achievement-toast-name {
        font-size: 1.125rem;
        font-weight: 700;
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(toast);

  // 3 秒後移除
  setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

export { API_BASE, ACHIEVEMENT_ICONS };
