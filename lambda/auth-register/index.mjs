/**
 * Lambda Function: auth-register
 * 用戶註冊 API - 需要邀請碼才能註冊
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import crypto from 'crypto';

const client = new DynamoDBClient({ region: 'ap-southeast-2' });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = 'kinmen';

// 簡單的密碼雜湊（生產環境應使用 bcrypt）
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// CORS 標頭
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// 驗證邀請碼並取得班級資訊
async function validateInviteCode(inviteCode) {
  if (!inviteCode || inviteCode.trim().length === 0) {
    return { valid: false, error: '請輸入班級邀請碼' };
  }

  const normalizedCode = inviteCode.trim().toUpperCase();

  try {
    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { kinmen: `INVITE#${normalizedCode}` }
    }));

    if (!result.Item) {
      return { valid: false, error: '邀請碼不存在或已失效' };
    }

    return {
      valid: true,
      classId: result.Item.classId,
      className: result.Item.className,
      teacherUsername: result.Item.teacherUsername
    };
  } catch (error) {
    console.error('Validate invite code error:', error);
    return { valid: false, error: '驗證邀請碼失敗' };
  }
}

// 將學生加入班級
async function addStudentToClass(classId, username) {
  const now = new Date().toISOString();

  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { kinmen: `CLASS#${classId}` },
    UpdateExpression: 'SET studentUsernames = list_append(if_not_exists(studentUsernames, :empty), :newStudent), updatedAt = :now',
    ExpressionAttributeValues: {
      ':empty': [],
      ':newStudent': [username],
      ':now': now
    }
  }));
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

  try {
    const body = JSON.parse(event.body || '{}');
    const { username, password, displayName, inviteCode } = body;

    // 驗證輸入
    if (!username || username.length < 3) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: '使用者名稱至少需要3個字元' })
      };
    }

    if (!password || password.length < 6) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: '密碼至少需要6個字元' })
      };
    }

    // 驗證邀請碼（必填）
    const inviteValidation = await validateInviteCode(inviteCode);
    if (!inviteValidation.valid) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: inviteValidation.error })
      };
    }

    // 檢查使用者是否已存在
    const existingUser = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { kinmen: `USER#${username}` }
    }));

    if (existingUser.Item) {
      return {
        statusCode: 409,
        headers: corsHeaders,
        body: JSON.stringify({ error: '此使用者名稱已被使用' })
      };
    }

    // 建立新使用者（包含班級資訊）
    const now = new Date().toISOString();
    const userItem = {
      kinmen: `USER#${username}`,
      username,
      passwordHash: hashPassword(password),
      displayName: displayName || username,
      classId: inviteValidation.classId,
      className: inviteValidation.className,
      role: 'student',
      createdAt: now,
      updatedAt: now
    };

    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: userItem
    }));

    // 初始化學習進度
    const progressItem = {
      kinmen: `PROGRESS#${username}`,
      username,
      vocabulary: {
        flashcards: { viewed: 0, total: 26 },
        viewedCards: []
      },
      dialogue: {
        scenarios: { completed: 0, total: 7 },
        viewedScenarios: []
      },
      practice: {},
      statistics: {
        totalStudyTime: 0,
        dailyStreak: 0,
        lastStudyDate: null,
        gamesPlayed: {}
      },
      achievements: {
        unlocked: [],
        total: 9
      },
      createdAt: now,
      updatedAt: now
    };

    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: progressItem
    }));

    // 將學生加入班級
    await addStudentToClass(inviteValidation.classId, username);

    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        user: {
          username,
          displayName: displayName || username,
          classId: inviteValidation.classId,
          className: inviteValidation.className
        }
      })
    };

  } catch (error) {
    console.error('Registration error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: '註冊失敗，請稍後再試' })
    };
  }
};
