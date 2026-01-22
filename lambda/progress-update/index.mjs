/**
 * Lambda Function: progress-update
 * 更新學習進度 API
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: 'ap-southeast-2' });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = 'kinmen';

// CORS 標頭
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, PUT, OPTIONS'
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
    const { username, vocabulary, dialogue, practice } = body;

    if (!username) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: '請提供使用者名稱' })
      };
    }

    // 確認進度記錄存在
    const existingProgress = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { kinmen: `PROGRESS#${username}` }
    }));

    if (!existingProgress.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: '找不到學習進度記錄' })
      };
    }

    // 建立更新表達式
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    if (vocabulary !== undefined) {
      updateExpressions.push('#vocabulary = :vocabulary');
      expressionAttributeNames['#vocabulary'] = 'vocabulary';
      expressionAttributeValues[':vocabulary'] = vocabulary;
    }

    if (dialogue !== undefined) {
      updateExpressions.push('#dialogue = :dialogue');
      expressionAttributeNames['#dialogue'] = 'dialogue';
      expressionAttributeValues[':dialogue'] = dialogue;
    }

    if (practice !== undefined) {
      updateExpressions.push('#practice = :practice');
      expressionAttributeNames['#practice'] = 'practice';
      expressionAttributeValues[':practice'] = practice;
    }

    // 更新時間戳
    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    if (updateExpressions.length === 1) {
      // 只有時間戳，沒有實際更新
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: '請提供要更新的資料' })
      };
    }

    // 執行更新
    const result = await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { kinmen: `PROGRESS#${username}` },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    }));

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        progress: {
          vocabulary: result.Attributes.vocabulary,
          dialogue: result.Attributes.dialogue,
          practice: result.Attributes.practice,
          lastAccess: result.Attributes.updatedAt
        }
      })
    };

  } catch (error) {
    console.error('Update progress error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: '更新進度失敗，請稍後再試' })
    };
  }
};
