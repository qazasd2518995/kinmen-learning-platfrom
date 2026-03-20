/**
 * Lambda Function: lti-course-data
 * LTI 課程數據查詢 API
 *
 * 端點：
 * - GET /api/lti/course/{courseId}/stats     - 課程統計概覽
 * - GET /api/lti/course/{courseId}/students   - 學生列表與進度
 * - GET /api/lti/course/{courseId}/analytics  - 課程分析數據
 * - GET /api/lti/student/{userId}/detail      - 學生詳細資料
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, ScanCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: 'ap-southeast-2' });
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = 'kinmen';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

function response(statusCode, body) {
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(body)
  };
}

// 取得課程內的所有 LTI 用戶（學生）
async function getCourseUsers(courseId) {
  const result = await docClient.send(new ScanCommand({
    TableName: TABLE_NAME,
    FilterExpression: 'begins_with(kinmen, :prefix) AND courseId = :courseId AND #r = :student',
    ExpressionAttributeNames: { '#r': 'role' },
    ExpressionAttributeValues: {
      ':prefix': 'LTI_USER#',
      ':courseId': courseId,
      ':student': 'student'
    }
  }));
  return result.Items || [];
}

// 取得用戶的進度記錄
async function getUserProgress(username) {
  const result = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { kinmen: `PROGRESS#${username}` }
  }));
  return result.Item || {};
}

// 批次取得多個用戶的進度
async function getBatchProgress(userIds) {
  if (userIds.length === 0) return {};

  const keys = userIds.map(id => ({ kinmen: `PROGRESS#${id}` }));
  // BatchGet 一次最多 100 個
  const batches = [];
  for (let i = 0; i < keys.length; i += 100) {
    batches.push(keys.slice(i, i + 100));
  }

  const progressMap = {};
  for (const batch of batches) {
    const result = await docClient.send(new BatchGetCommand({
      RequestItems: { [TABLE_NAME]: { Keys: batch } }
    }));
    (result.Responses?.[TABLE_NAME] || []).forEach(p => {
      progressMap[p.username || p.kinmen?.replace('PROGRESS#', '')] = p;
    });
  }
  return progressMap;
}

// 計算詞彙進度百分比
function calcVocabPercent(progress) {
  const viewed = progress?.vocabulary?.flashcards?.viewed || 0;
  return Math.round((viewed / 27) * 100);
}

// GET /api/lti/course/{courseId}/stats
async function getCourseStats(courseId) {
  const users = await getCourseUsers(courseId);
  const userIds = users.map(u => u.platformUserId);
  const progressMap = await getBatchProgress(userIds);

  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let totalProgress = 0;
  let totalTime = 0;
  let activeCount = 0;
  const attentionStudents = [];

  users.forEach(user => {
    const progress = progressMap[user.platformUserId] || {};
    const vocabPercent = calcVocabPercent(progress);
    totalProgress += vocabPercent;
    totalTime += progress.statistics?.totalStudyTime || 0;

    const lastActive = progress.statistics?.lastStudyDate ?
      new Date(progress.statistics.lastStudyDate).getTime() : 0;

    if (lastActive > oneWeekAgo) {
      activeCount++;
    } else if (lastActive > 0) {
      attentionStudents.push({
        username: user.platformUserId,
        displayName: user.displayName,
        classId: courseId,
        type: 'inactive',
        reason: '超過 7 天未學習'
      });
    }

    if (vocabPercent < 30 && !attentionStudents.find(s => s.username === user.platformUserId)) {
      attentionStudents.push({
        username: user.platformUserId,
        displayName: user.displayName,
        classId: courseId,
        type: 'progress',
        reason: `進度落後 (${vocabPercent}%)`
      });
    }
  });

  const studentCount = users.length;
  return response(200, {
    success: true,
    studentCount,
    activeCount,
    avgProgress: studentCount > 0 ? Math.round(totalProgress / studentCount) : 0,
    avgStudyTime: studentCount > 0 ? Math.round(totalTime / studentCount) : 0,
    attentionStudents: attentionStudents.slice(0, 5)
  });
}

// GET /api/lti/course/{courseId}/students
async function getCourseStudents(courseId) {
  const users = await getCourseUsers(courseId);
  const userIds = users.map(u => u.platformUserId);
  const progressMap = await getBatchProgress(userIds);

  const students = users.map(user => {
    const progress = progressMap[user.platformUserId] || {};

    const vocabViewed = progress.vocabulary?.flashcards?.viewed || 0;
    const vocabMastered = progress.vocabulary?.masteredCards?.length || 0;
    const dialogueCompleted = progress.dialogue?.scenarios?.completed || 0;
    const gamesPlayed = progress.statistics?.gamesPlayed ?
      Object.values(progress.statistics.gamesPlayed).reduce((a, b) => a + b, 0) : 0;

    return {
      username: user.platformUserId,
      displayName: user.displayName,
      lastActive: progress.statistics?.lastStudyDate || progress.updatedAt || user.lastActiveAt,
      vocabularyProgress: {
        viewed: vocabViewed,
        mastered: vocabMastered,
        total: 27,
        percent: Math.round((vocabViewed / 27) * 100)
      },
      dialogueProgress: { completed: dialogueCompleted, total: 7 },
      totalStudyTime: progress.statistics?.totalStudyTime || 0,
      gamesPlayed,
      dailyStreak: progress.statistics?.dailyStreak || 0,
      achievementsUnlocked: progress.achievements?.unlocked?.length || 0
    };
  });

  students.sort((a, b) => {
    const timeA = a.lastActive ? new Date(a.lastActive).getTime() : 0;
    const timeB = b.lastActive ? new Date(b.lastActive).getTime() : 0;
    return timeB - timeA;
  });

  return response(200, {
    success: true,
    className: users[0]?.courseName || '課程',
    students
  });
}

// GET /api/lti/course/{courseId}/analytics
async function getCourseAnalytics(courseId) {
  const users = await getCourseUsers(courseId);
  const userIds = users.map(u => u.platformUserId);
  const progressMap = await getBatchProgress(userIds);

  const distribution = [0, 0, 0, 0, 0]; // 0-20, 21-40, 41-60, 61-80, 81-100
  let fruitTotal = 0, vegTotal = 0, itemTotal = 0;
  const gameCounts = { matching: 0, sorting: 0, maze: 0, bingo: 0, duel: 0 };
  const dayTotals = [0, 0, 0, 0, 0, 0, 0]; // 週一到週日
  let studentCount = 0;

  users.forEach(user => {
    const progress = progressMap[user.platformUserId] || {};
    const vocabPercent = calcVocabPercent(progress);
    studentCount++;

    // 進度分佈
    const bucket = Math.min(4, Math.floor(vocabPercent / 20.01));
    distribution[bucket]++;

    // 詞彙掌握（使用 viewedCards 近似）
    const viewed = progress.vocabulary?.viewedCards || [];
    fruitTotal += viewed.filter(id => id >= 1 && id <= 12).length;
    vegTotal += viewed.filter(id => id >= 13 && id <= 25).length;
    itemTotal += viewed.filter(id => id >= 26 && id <= 27).length;

    // 遊戲偏好
    const games = progress.statistics?.gamesPlayed || {};
    Object.keys(gameCounts).forEach(g => { gameCounts[g] += games[g] || 0; });
  });

  return response(200, {
    success: true,
    progressDistribution: distribution,
    vocabMastery: studentCount > 0 ? [
      Math.round((fruitTotal / (studentCount * 12)) * 100),
      Math.round((vegTotal / (studentCount * 13)) * 100),
      Math.round((itemTotal / (studentCount * 2)) * 100)
    ] : [0, 0, 0],
    gamePreferences: [gameCounts.matching, gameCounts.sorting, gameCounts.maze, gameCounts.bingo, gameCounts.duel],
    timeData: dayTotals // 暫時回傳 0，需要更細緻的時間追蹤
  });
}

// GET /api/lti/student/{userId}/detail
async function getStudentDetail(userId) {
  const progress = await getUserProgress(userId);

  // 取得用戶基本資料
  const userResult = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { kinmen: `LTI_USER#${userId}` }
  }));
  const user = userResult.Item || { platformUserId: userId, displayName: userId };

  const vocabViewed = progress.vocabulary?.flashcards?.viewed || 0;
  const vocabMastered = progress.vocabulary?.masteredCards?.length || 0;
  const viewedCards = progress.vocabulary?.viewedCards || [];

  // 詞彙分類統計
  const byCategory = {
    fruit: { viewed: viewedCards.filter(id => id >= 1 && id <= 12).length, mastered: 0, total: 12 },
    vegetable: { viewed: viewedCards.filter(id => id >= 13 && id <= 25).length, mastered: 0, total: 13 },
    item: { viewed: viewedCards.filter(id => id >= 26 && id <= 27).length, mastered: 0, total: 2 }
  };

  // 遊戲成績
  const gamesPlayed = progress.statistics?.gamesPlayed || {};
  const bestScores = progress.statistics?.bestScores || {};
  const games = {};
  ['matching', 'sorting', 'maze', 'bingo', 'duel'].forEach(g => {
    games[g] = { played: gamesPlayed[g] || 0, bestScore: bestScores[g] || 0 };
  });

  return response(200, {
    success: true,
    student: { username: userId, displayName: user.displayName },
    vocabulary: { viewed: vocabViewed, mastered: vocabMastered, total: 27, byCategory },
    dialogue: {
      completed: progress.dialogue?.scenarios?.completed || 0,
      total: 7,
      scenarios: progress.dialogue?.completedScenarios?.map(id => ({ id, status: 'completed' })) || []
    },
    games,
    statistics: {
      totalStudyTime: progress.statistics?.totalStudyTime || 0,
      dailyStreak: progress.statistics?.dailyStreak || 0,
      lastStudyDate: progress.statistics?.lastStudyDate || null
    },
    achievements: {
      unlocked: progress.achievements?.unlocked || [],
      total: 9
    }
  });
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  try {
    const path = event.path || '';
    const courseId = event.pathParameters?.courseId;
    const userId = event.pathParameters?.userId;

    // /api/lti/student/{userId}/detail
    if (userId && path.includes('/detail')) {
      return await getStudentDetail(userId);
    }

    if (!courseId) {
      return response(400, { error: '缺少課程 ID' });
    }

    // /api/lti/course/{courseId}/stats
    if (path.includes('/stats')) {
      return await getCourseStats(courseId);
    }

    // /api/lti/course/{courseId}/students
    if (path.includes('/students')) {
      return await getCourseStudents(courseId);
    }

    // /api/lti/course/{courseId}/analytics
    if (path.includes('/analytics')) {
      return await getCourseAnalytics(courseId);
    }

    return response(400, { error: '不支援的端點' });

  } catch (error) {
    console.error('LTI course data error:', error);
    return response(500, { error: '查詢失敗: ' + error.message });
  }
};
