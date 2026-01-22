/**
 * Lambda Function: class-students
 * 取得班級學生列表與學習進度
 *
 * 此函數提供兩個端點：
 * - GET /api/teacher/classes - 取得教師的所有班級列表
 * - GET /api/teacher/classes/{classId}/students - 取得特定班級的學生列表
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';

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

// 取得教師的班級列表
async function getTeacherClasses(teacherUsername) {
  // 取得教師資料
  const teacherResult = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { kinmen: `USER#${teacherUsername}` }
  }));

  if (!teacherResult.Item || teacherResult.Item.role !== 'teacher') {
    throw new Error('教師不存在');
  }

  const classIds = teacherResult.Item.classIds || [];

  if (classIds.length === 0) {
    return [];
  }

  // 批次取得班級資料
  const classKeys = classIds.map(id => ({ kinmen: `CLASS#${id}` }));
  const classesResult = await docClient.send(new BatchGetCommand({
    RequestItems: {
      [TABLE_NAME]: { Keys: classKeys }
    }
  }));

  const classes = classesResult.Responses?.[TABLE_NAME] || [];

  // 為每個班級計算統計數據
  const classesWithStats = await Promise.all(classes.map(async (cls) => {
    const students = cls.studentUsernames || [];
    let totalProgress = 0;
    let totalTime = 0;
    let activeCount = 0;
    const attentionStudents = [];
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

    // 取得學生進度
    if (students.length > 0) {
      const progressKeys = students.map(u => ({ kinmen: `PROGRESS#${u}` }));
      const userKeys = students.map(u => ({ kinmen: `USER#${u}` }));

      const [progressResult, usersResult] = await Promise.all([
        docClient.send(new BatchGetCommand({
          RequestItems: { [TABLE_NAME]: { Keys: progressKeys } }
        })),
        docClient.send(new BatchGetCommand({
          RequestItems: { [TABLE_NAME]: { Keys: userKeys } }
        }))
      ]);

      const progressMap = {};
      (progressResult.Responses?.[TABLE_NAME] || []).forEach(p => {
        progressMap[p.username] = p;
      });

      const usersMap = {};
      (usersResult.Responses?.[TABLE_NAME] || []).forEach(u => {
        usersMap[u.username] = u;
      });

      students.forEach(username => {
        const progress = progressMap[username] || {};
        const user = usersMap[username] || {};

        // 計算詞彙進度百分比
        const vocabViewed = progress.vocabulary?.flashcards?.viewed || 0;
        const vocabTotal = 27;
        const vocabPercent = Math.round((vocabViewed / vocabTotal) * 100);

        totalProgress += vocabPercent;
        totalTime += progress.statistics?.totalStudyTime || 0;

        // 檢查活躍狀態
        const lastActive = progress.statistics?.lastStudyDate ?
          new Date(progress.statistics.lastStudyDate).getTime() : 0;

        if (lastActive > oneWeekAgo) {
          activeCount++;
        } else if (lastActive > 0) {
          // 超過 7 天未學習
          attentionStudents.push({
            username,
            displayName: user.displayName || username,
            classId: cls.classId,
            type: 'inactive',
            reason: '超過 7 天未學習'
          });
        }

        // 檢查進度落後
        if (vocabPercent < 30) {
          const existing = attentionStudents.find(s => s.username === username);
          if (!existing) {
            attentionStudents.push({
              username,
              displayName: user.displayName || username,
              classId: cls.classId,
              type: 'progress',
              reason: `進度落後 (${vocabPercent}%)`
            });
          }
        }
      });
    }

    const studentCount = students.length;
    const avgProgress = studentCount > 0 ? Math.round(totalProgress / studentCount) : 0;
    const avgStudyTime = studentCount > 0 ? Math.round(totalTime / studentCount) : 0;

    return {
      classId: cls.classId,
      className: cls.className,
      inviteCode: cls.inviteCode,
      studentCount,
      activeCount,
      avgProgress,
      avgStudyTime,
      attentionStudents: attentionStudents.slice(0, 3) // 最多返回 3 個
    };
  }));

  return classesWithStats;
}

// 取得班級學生列表
async function getClassStudents(classId) {
  // 取得班級資料
  const classResult = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { kinmen: `CLASS#${classId}` }
  }));

  if (!classResult.Item) {
    throw new Error('班級不存在');
  }

  const cls = classResult.Item;
  const studentUsernames = cls.studentUsernames || [];

  if (studentUsernames.length === 0) {
    return {
      className: cls.className,
      inviteCode: cls.inviteCode,
      students: []
    };
  }

  // 批次取得學生和進度資料
  const userKeys = studentUsernames.map(u => ({ kinmen: `USER#${u}` }));
  const progressKeys = studentUsernames.map(u => ({ kinmen: `PROGRESS#${u}` }));

  const [usersResult, progressResult] = await Promise.all([
    docClient.send(new BatchGetCommand({
      RequestItems: { [TABLE_NAME]: { Keys: userKeys } }
    })),
    docClient.send(new BatchGetCommand({
      RequestItems: { [TABLE_NAME]: { Keys: progressKeys } }
    }))
  ]);

  const usersMap = {};
  (usersResult.Responses?.[TABLE_NAME] || []).forEach(u => {
    usersMap[u.username] = u;
  });

  const progressMap = {};
  (progressResult.Responses?.[TABLE_NAME] || []).forEach(p => {
    progressMap[p.username] = p;
  });

  // 組合學生資料
  const students = studentUsernames.map(username => {
    const user = usersMap[username] || { username };
    const progress = progressMap[username] || {};

    const vocabViewed = progress.vocabulary?.flashcards?.viewed || 0;
    const vocabMastered = progress.vocabulary?.masteredCards?.length || 0;
    const vocabTotal = 27;

    const dialogueCompleted = progress.dialogue?.scenarios?.completed || 0;
    const dialogueTotal = 7;

    const gamesPlayed = progress.statistics?.gamesPlayed ?
      Object.values(progress.statistics.gamesPlayed).reduce((a, b) => a + b, 0) : 0;

    return {
      username: user.username,
      displayName: user.displayName || user.username,
      lastActive: progress.statistics?.lastStudyDate || progress.updatedAt || null,
      vocabularyProgress: {
        viewed: vocabViewed,
        mastered: vocabMastered,
        total: vocabTotal,
        percent: Math.round((vocabViewed / vocabTotal) * 100)
      },
      dialogueProgress: {
        completed: dialogueCompleted,
        total: dialogueTotal
      },
      totalStudyTime: progress.statistics?.totalStudyTime || 0,
      gamesPlayed,
      dailyStreak: progress.statistics?.dailyStreak || 0,
      achievementsUnlocked: progress.achievements?.unlocked?.length || 0
    };
  });

  // 按最後活動時間排序（最近的在前）
  students.sort((a, b) => {
    const timeA = a.lastActive ? new Date(a.lastActive).getTime() : 0;
    const timeB = b.lastActive ? new Date(b.lastActive).getTime() : 0;
    return timeB - timeA;
  });

  return {
    className: cls.className,
    inviteCode: cls.inviteCode,
    students
  };
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
    const path = event.path || '';
    const classId = event.pathParameters?.classId;

    // 判斷請求類型
    if (classId) {
      // GET /api/teacher/classes/{classId}/students
      const result = await getClassStudents(classId);
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          ...result
        })
      };
    } else {
      // GET /api/teacher/classes
      const classes = await getTeacherClasses(tokenPayload.username);
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          classes
        })
      };
    }

  } catch (error) {
    console.error('Class students error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message || '取得資料失敗' })
    };
  }
};
