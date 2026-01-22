/**
 * Lambda Function: student-detail
 * 取得單一學生詳細學習資料
 *
 * GET /api/teacher/students/{username}
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

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

// 詞彙分類資訊
const VOCABULARY_CATEGORIES = {
  fruit: {
    name: '水果',
    items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    total: 12
  },
  vegetable: {
    name: '蔬菜',
    items: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25],
    total: 13
  },
  item: {
    name: '用品',
    items: [26, 27],
    total: 2
  }
};

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
    const username = event.pathParameters?.username;

    if (!username) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: '請提供學生使用者名稱' })
      };
    }

    // 取得學生資料和進度
    const [userResult, progressResult] = await Promise.all([
      docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { kinmen: `USER#${username}` }
      })),
      docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { kinmen: `PROGRESS#${username}` }
      }))
    ]);

    if (!userResult.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: '找不到該學生' })
      };
    }

    const user = userResult.Item;
    const progress = progressResult.Item || {};

    // 計算詞彙分類統計
    const viewedCards = progress.vocabulary?.viewedCards || [];
    const masteredCards = progress.vocabulary?.masteredCards || [];

    const byCategory = {};
    for (const [categoryId, category] of Object.entries(VOCABULARY_CATEGORIES)) {
      const viewed = category.items.filter(id => viewedCards.includes(id)).length;
      const mastered = category.items.filter(id => masteredCards.includes(id)).length;
      byCategory[categoryId] = {
        viewed,
        mastered,
        total: category.total
      };
    }

    // 組織詞彙數據
    const vocabulary = {
      viewed: viewedCards.length,
      mastered: masteredCards.length,
      total: 27,
      byCategory
    };

    // 組織對話數據
    const dialogueScenarios = progress.dialogue?.completedScenarios || [];
    const allScenarios = ['greeting', 'pricing', 'bargaining', 'quantity', 'payment', 'thanks', 'farewell'];
    const dialogue = {
      completed: dialogueScenarios.length,
      total: 7,
      scenarios: allScenarios.map(id => ({
        id,
        status: dialogueScenarios.includes(id) ? 'completed' : 'not_started'
      }))
    };

    // 組織遊戲數據
    const gamesPlayed = progress.statistics?.gamesPlayed || {};
    const bestScores = progress.statistics?.bestScores || {};
    const games = {
      matching: {
        played: gamesPlayed.matching || 0,
        bestScore: bestScores.matching || 0
      },
      sorting: {
        played: gamesPlayed.sorting || 0,
        bestScore: bestScores.sorting || 0
      },
      maze: {
        played: gamesPlayed.maze || 0,
        bestScore: bestScores.maze || 0,
        completionRate: gamesPlayed.maze > 0 ? Math.round((bestScores.maze || 0)) : 0
      },
      bingo: {
        played: gamesPlayed.bingo || 0,
        bestScore: bestScores.bingo || 0,
        winRate: gamesPlayed.bingo > 0 ? Math.round((bestScores.bingo || 0)) : 0
      },
      duel: {
        played: gamesPlayed.duel || 0,
        bestScore: bestScores.duel || 0
      }
    };

    // 組織統計數據
    const statistics = {
      totalStudyTime: progress.statistics?.totalStudyTime || 0,
      dailyStreak: progress.statistics?.dailyStreak || 0,
      lastStudyDate: progress.statistics?.lastStudyDate || null
    };

    // 組織成就數據
    const achievements = {
      unlocked: progress.achievements?.unlocked || [],
      unlockedAt: progress.achievements?.unlockedAt || {},
      total: 9
    };

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        student: {
          username: user.username,
          displayName: user.displayName || user.username
        },
        vocabulary,
        dialogue,
        games,
        statistics,
        achievements
      })
    };

  } catch (error) {
    console.error('Student detail error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: '取得學生資料失敗' })
    };
  }
};
