/**
 * Lambda Function: auth-login
 * 用戶登入 API
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import crypto from 'crypto';

const client = new DynamoDBClient({ region: 'ap-southeast-2' });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = 'kinmen';

// 簡單的密碼雜湊
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
    const { username, password } = body;

    // 驗證輸入
    if (!username || !password) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: '請輸入使用者名稱和密碼' })
      };
    }

    // 查找使用者
    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { kinmen: `USER#${username}` }
    }));

    if (!result.Item) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: '使用者不存在' })
      };
    }

    // 驗證密碼
    const passwordHash = hashPassword(password);
    if (result.Item.passwordHash !== passwordHash) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: '密碼錯誤' })
      };
    }

    // 取得學習進度
    const progressResult = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { kinmen: `PROGRESS#${username}` }
    }));

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        user: {
          username: result.Item.username,
          displayName: result.Item.displayName
        },
        progress: progressResult.Item || null
      })
    };

  } catch (error) {
    console.error('Login error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: '登入失敗，請稍後再試' })
    };
  }
};
