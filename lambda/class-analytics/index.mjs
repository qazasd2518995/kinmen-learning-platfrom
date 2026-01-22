/**
 * Lambda Function: class-analytics
 * 班級數據分析 API
 *
 * GET /api/teacher/classes/{classId}/analytics - 特定班級分析
 * GET /api/teacher/analytics - 所有班級綜合分析
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: 'ap-southeast-2' });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = 'kinmen';

// CORS 標頭
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

// 驗證 JWT token
function verifyToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

    // 檢查是否過期
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

// 取得班級的所有學生進度
async function getStudentsProgress(classId, teacherUsername) {
  let studentUsernames = [];

  if (classId) {
    // 取得特定班級
    const classResult = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { kinmen: `CLASS#${classId}` }
    }));

    if (!classResult.Item) {
      throw new Error('班級不存在');
    }

    studentUsernames = classResult.Item.studentUsernames || [];
  } else {
    // 取得教師所有班級的學生
    const teacherResult = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { kinmen: `USER#${teacherUsername}` }
    }));

    const classIds = teacherResult.Item?.classIds || [];

    if (classIds.length > 0) {
      const classKeys = classIds.map(id => ({ kinmen: `CLASS#${id}` }));
      const classesResult = await docClient.send(new BatchGetCommand({
        RequestItems: { [TABLE_NAME]: { Keys: classKeys } }
      }));

      const classes = classesResult.Responses?.[TABLE_NAME] || [];
      classes.forEach(cls => {
        studentUsernames.push(...(cls.studentUsernames || []));
      });

      // 去重
      studentUsernames = [...new Set(studentUsernames)];
    }
  }

  if (studentUsernames.length === 0) {
    return [];
  }

  // 批次取得學生進度
  const progressKeys = studentUsernames.map(u => ({ kinmen: `PROGRESS#${u}` }));
  const progressResult = await docClient.send(new BatchGetCommand({
    RequestItems: { [TABLE_NAME]: { Keys: progressKeys } }
  }));

  return progressResult.Responses?.[TABLE_NAME] || [];
}

// 計算進度分佈
function calculateProgressDistribution(progressList) {
  const distribution = [0, 0, 0, 0, 0]; // 0-20%, 21-40%, 41-60%, 61-80%, 81-100%

  progressList.forEach(progress => {
    const vocabViewed = progress.vocabulary?.flashcards?.viewed || 0;
    const percent = Math.round((vocabViewed / 27) * 100);

    if (percent <= 20) distribution[0]++;
    else if (percent <= 40) distribution[1]++;
    else if (percent <= 60) distribution[2]++;
    else if (percent <= 80) distribution[3]++;
    else distribution[4]++;
  });

  return distribution;
}

// 計算詞彙掌握情況
function calculateVocabMastery(progressList) {
  const categoryTotals = { fruit: 12, vegetable: 13, item: 2 };
  const categoryMastery = { fruit: 0, vegetable: 0, item: 0 };

  progressList.forEach(progress => {
    const masteredCards = progress.vocabulary?.masteredCards || [];

    // 假設 1-12 是水果，13-25 是蔬菜，26-27 是用品
    const fruitMastered = masteredCards.filter(id => id >= 1 && id <= 12).length;
    const vegMastered = masteredCards.filter(id => id >= 13 && id <= 25).length;
    const itemMastered = masteredCards.filter(id => id >= 26 && id <= 27).length;

    categoryMastery.fruit += fruitMastered;
    categoryMastery.vegetable += vegMastered;
    categoryMastery.item += itemMastered;
  });

  const studentCount = progressList.length || 1;

  return [
    Math.round((categoryMastery.fruit / (studentCount * categoryTotals.fruit)) * 100),
    Math.round((categoryMastery.vegetable / (studentCount * categoryTotals.vegetable)) * 100),
    Math.round((categoryMastery.item / (studentCount * categoryTotals.item)) * 100)
  ];
}

// 計算遊戲偏好
function calculateGamePreferences(progressList) {
  const gameTypes = ['matching', 'sorting', 'maze', 'bingo', 'duel'];
  const totals = gameTypes.map(type => {
    return progressList.reduce((sum, progress) => {
      return sum + (progress.statistics?.gamesPlayed?.[type] || 0);
    }, 0);
  });

  return totals;
}

// 計算本週學習時間趨勢
function calculateTimeData(progressList) {
  // 由於我們沒有按日儲存學習時間，這裡返回模擬數據
  // 實際實作需要在進度更新時記錄每日學習時間
  const avgTimePerStudent = progressList.reduce((sum, p) => {
    return sum + (p.statistics?.totalStudyTime || 0);
  }, 0) / (progressList.length || 1);

  const avgMinutes = Math.round(avgTimePerStudent / 60);

  // 模擬週間分佈（可以根據實際數據調整）
  const weekdayFactors = [0.8, 1.0, 0.9, 1.1, 1.0, 0.5, 0.4];
  return weekdayFactors.map(factor => Math.round(avgMinutes * factor / 7));
}

export const handler = async (event) => {
  // 處理 CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  // 驗證 token
  const tokenPayload = verifyToken(event.headers?.Authorization || event.headers?.authorization);
  if (!tokenPayload || tokenPayload.role !== 'teacher') {
    return {
      statusCode: 401,
      headers: corsHeaders,
      body: JSON.stringify({ error: '未授權的訪問' })
    };
  }

  try {
    const classId = event.pathParameters?.classId || null;

    // 取得學生進度資料
    const progressList = await getStudentsProgress(classId, tokenPayload.username);

    if (progressList.length === 0) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          progressDistribution: [0, 0, 0, 0, 0],
          vocabMastery: [0, 0, 0],
          gamePreferences: [0, 0, 0, 0, 0],
          timeData: [0, 0, 0, 0, 0, 0, 0]
        })
      };
    }

    // 計算各項分析數據
    const progressDistribution = calculateProgressDistribution(progressList);
    const vocabMastery = calculateVocabMastery(progressList);
    const gamePreferences = calculateGamePreferences(progressList);
    const timeData = calculateTimeData(progressList);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        progressDistribution,
        vocabMastery,
        gamePreferences,
        timeData
      })
    };

  } catch (error) {
    console.error('Analytics error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message || '取得分析數據失敗' })
    };
  }
};
