/**
 * Lambda Function: progress-get
 * 取得學習進度 API
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: 'ap-southeast-2' });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = 'kinmen';

// CORS 標頭
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
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
    // 從路徑參數或查詢字串取得 username
    const username = event.pathParameters?.username ||
                     event.queryStringParameters?.username;

    if (!username) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: '請提供使用者名稱' })
      };
    }

    // 查詢進度
    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { kinmen: `PROGRESS#${username}` }
    }));

    if (!result.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: '找不到學習進度' })
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        progress: {
          vocabulary: result.Item.vocabulary,
          dialogue: result.Item.dialogue,
          practice: result.Item.practice,
          lastAccess: result.Item.updatedAt
        }
      })
    };

  } catch (error) {
    console.error('Get progress error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: '取得進度失敗，請稍後再試' })
    };
  }
};
