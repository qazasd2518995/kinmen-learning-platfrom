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

export { API_BASE };
