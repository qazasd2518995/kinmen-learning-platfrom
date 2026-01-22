/**
 * Lambda Function: auth-register
 * 用戶註冊 API
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
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
    const { username, password, displayName } = body;

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

    // 建立新使用者
    const now = new Date().toISOString();
    const userItem = {
      kinmen: `USER#${username}`,
      username,
      passwordHash: hashPassword(password),
      displayName: displayName || username,
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
      createdAt: now,
      updatedAt: now
    };

    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: progressItem
    }));

    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        user: {
          username,
          displayName: displayName || username
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
