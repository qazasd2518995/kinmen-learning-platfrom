/**
 * Lambda Function: teacher-create-class
 * 教師建立班級 API - 自動產生邀請碼
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import crypto from 'crypto';

const client = new DynamoDBClient({ region: 'ap-southeast-2' });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = 'kinmen';

// CORS 標頭
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
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

// 產生唯一邀請碼 (6-8位，以 KM 開頭)
function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 排除容易混淆的字元 0, O, I, 1
  let code = 'KM';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// 產生唯一 classId
function generateClassId() {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString('hex');
  return `class_${timestamp}_${random}`;
}

// 檢查邀請碼是否已存在
async function isInviteCodeExists(inviteCode) {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { kinmen: `INVITE#${inviteCode}` }
    }));
    return !!result.Item;
  } catch {
    return false;
  }
}

// 產生唯一的邀請碼（確保不重複）
async function generateUniqueInviteCode() {
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const code = generateInviteCode();
    const exists = await isInviteCodeExists(code);
    if (!exists) {
      return code;
    }
    attempts++;
  }

  // 如果多次嘗試後仍重複，加入時間戳
  return `KM${Date.now().toString(36).toUpperCase().slice(-6)}`;
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
    const body = JSON.parse(event.body || '{}');
    const { className } = body;

    // 驗證輸入
    if (!className || className.trim().length === 0) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: '請輸入班級名稱' })
      };
    }

    if (className.length > 50) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: '班級名稱過長（最多50個字元）' })
      };
    }

    const teacherUsername = tokenPayload.username;
    const now = new Date().toISOString();

    // 產生唯一 ID 和邀請碼
    const classId = generateClassId();
    const inviteCode = await generateUniqueInviteCode();

    // 建立班級記錄
    const classItem = {
      kinmen: `CLASS#${classId}`,
      classId,
      className: className.trim(),
      teacherUsername,
      inviteCode,
      studentUsernames: [],
      createdAt: now,
      updatedAt: now
    };

    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: classItem
    }));

    // 建立邀請碼索引記錄
    const inviteItem = {
      kinmen: `INVITE#${inviteCode}`,
      classId,
      teacherUsername,
      className: className.trim(),
      createdAt: now
    };

    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: inviteItem
    }));

    // 更新教師的 classIds 陣列
    await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { kinmen: `USER#${teacherUsername}` },
      UpdateExpression: 'SET classIds = list_append(if_not_exists(classIds, :empty), :newClass), updatedAt = :now',
      ExpressionAttributeValues: {
        ':empty': [],
        ':newClass': [classId],
        ':now': now
      }
    }));

    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        class: {
          classId,
          className: className.trim(),
          inviteCode,
          studentCount: 0,
          createdAt: now
        }
      })
    };

  } catch (error) {
    console.error('Create class error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: '建立班級失敗，請稍後再試' })
    };
  }
};
