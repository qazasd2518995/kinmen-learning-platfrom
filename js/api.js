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

const ACHIEVEMENTS = [
  { id: 'first_word', name: '初學者', description: '學習第 1 個詞彙', icon: '🌱', condition: (s) => s.vocabularyMastered.length >= 1 },
  { id: 'vocab_10', name: '詞彙達人', description: '學習 10 個詞彙', icon: '📚', condition: (s) => s.vocabularyMastered.length >= 10 },
  { id: 'vocab_all', name: '詞彙大師', description: '學習全部 27 個詞彙', icon: '🏆', condition: (s) => s.vocabularyMastered.length >= 27 },
  { id: 'game_first', name: '遊戲新手', description: '完成第 1 個遊戲', icon: '🎮', condition: (s) => Object.values(s.gamesPlayed).some(v => v > 0) },
  { id: 'game_all', name: '遊戲專家', description: '玩過所有 5 種遊戲', icon: '🎯', condition: (s) => Object.values(s.gamesPlayed).every(v => v > 0) },
  { id: 'perfect_match', name: '完美配對', description: '連連看獲得滿分', icon: '⭐', condition: (s) => s.bestScores.matching >= 100 },
  { id: 'speed_demon', name: '閃電反應', description: '決鬥遊戲獲得 100 分以上', icon: '⚡', condition: (s) => s.bestScores.duel >= 100 },
  { id: 'streak_3', name: '堅持學習', description: '連續 3 天學習', icon: '🔥', condition: (s) => s.dailyStreak >= 3 },
  { id: 'streak_7', name: '學習週冠', description: '連續 7 天學習', icon: '👑', condition: (s) => s.dailyStreak >= 7 }
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
  toast.innerHTML = `
    <span class="achievement-toast-icon">${achievement.icon}</span>
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
        font-size: 2rem;
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

export { API_BASE };
