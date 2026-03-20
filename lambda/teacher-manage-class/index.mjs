/**
 * Lambda Function: teacher-manage-class
 * 班級管理 API - 編輯班級名稱、刪除班級、移除學生
 *
 * 端點：
 * - PUT    /api/teacher/classes/{classId}                    - 更新班級名稱
 * - DELETE /api/teacher/classes/{classId}                    - 刪除班級
 * - DELETE /api/teacher/classes/{classId}/students/{username} - 從班級移除學生
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import crypto from 'crypto';

const client = new DynamoDBClient({ region: 'ap-southeast-2' });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = 'kinmen';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'PUT, DELETE, OPTIONS'
};

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
    const secret = process.env.JWT_SECRET || 'kinmen-teacher-secret-key';
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${parts[0]}.${parts[1]}`)
      .digest('base64url');

    if (parts[2] !== expectedSignature) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(body)
  };
}

// 更新班級名稱
async function updateClass(classId, className, teacherUsername) {
  // 取得班級資料
  const classResult = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { kinmen: `CLASS#${classId}` }
  }));

  if (!classResult.Item) {
    return response(404, { error: '班級不存在' });
  }

  if (classResult.Item.teacherUsername !== teacherUsername) {
    return response(403, { error: '無權限操作此班級' });
  }

  if (!className || className.trim().length === 0) {
    return response(400, { error: '請輸入班級名稱' });
  }

  if (className.length > 50) {
    return response(400, { error: '班級名稱過長（最多50個字元）' });
  }

  const now = new Date().toISOString();

  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { kinmen: `CLASS#${classId}` },
    UpdateExpression: 'SET className = :name, updatedAt = :now',
    ExpressionAttributeValues: {
      ':name': className.trim(),
      ':now': now
    }
  }));

  // 同步更新邀請碼索引的班級名稱
  if (classResult.Item.inviteCode) {
    await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { kinmen: `INVITE#${classResult.Item.inviteCode}` },
      UpdateExpression: 'SET className = :name',
      ExpressionAttributeValues: {
        ':name': className.trim()
      }
    }));
  }

  return response(200, {
    success: true,
    class: {
      classId,
      className: className.trim(),
      updatedAt: now
    }
  });
}

// 刪除班級
async function deleteClass(classId, teacherUsername) {
  const classResult = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { kinmen: `CLASS#${classId}` }
  }));

  if (!classResult.Item) {
    return response(404, { error: '班級不存在' });
  }

  if (classResult.Item.teacherUsername !== teacherUsername) {
    return response(403, { error: '無權限操作此班級' });
  }

  const cls = classResult.Item;

  // 清除學生的 classId 和 className
  const studentUsernames = cls.studentUsernames || [];
  if (studentUsernames.length > 0) {
    await Promise.all(studentUsernames.map(username =>
      docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { kinmen: `USER#${username}` },
        UpdateExpression: 'REMOVE classId, className SET updatedAt = :now',
        ExpressionAttributeValues: { ':now': new Date().toISOString() }
      }))
    ));
  }

  // 刪除邀請碼索引
  if (cls.inviteCode) {
    await docClient.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { kinmen: `INVITE#${cls.inviteCode}` }
    }));
  }

  // 刪除班級記錄
  await docClient.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: { kinmen: `CLASS#${classId}` }
  }));

  // 從教師的 classIds 中移除
  const teacherResult = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { kinmen: `USER#${teacherUsername}` }
  }));

  if (teacherResult.Item) {
    const classIds = (teacherResult.Item.classIds || []).filter(id => id !== classId);
    await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { kinmen: `USER#${teacherUsername}` },
      UpdateExpression: 'SET classIds = :ids, updatedAt = :now',
      ExpressionAttributeValues: {
        ':ids': classIds,
        ':now': new Date().toISOString()
      }
    }));
  }

  return response(200, { success: true });
}

// 從班級移除學生
async function removeStudent(classId, studentUsername, teacherUsername) {
  const classResult = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { kinmen: `CLASS#${classId}` }
  }));

  if (!classResult.Item) {
    return response(404, { error: '班級不存在' });
  }

  if (classResult.Item.teacherUsername !== teacherUsername) {
    return response(403, { error: '無權限操作此班級' });
  }

  const studentUsernames = classResult.Item.studentUsernames || [];
  if (!studentUsernames.includes(studentUsername)) {
    return response(404, { error: '學生不在此班級中' });
  }

  const now = new Date().toISOString();

  // 從班級的學生列表中移除
  const updatedStudents = studentUsernames.filter(u => u !== studentUsername);
  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { kinmen: `CLASS#${classId}` },
    UpdateExpression: 'SET studentUsernames = :students, updatedAt = :now',
    ExpressionAttributeValues: {
      ':students': updatedStudents,
      ':now': now
    }
  }));

  // 清除學生的班級關聯
  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { kinmen: `USER#${studentUsername}` },
    UpdateExpression: 'REMOVE classId, className SET updatedAt = :now',
    ExpressionAttributeValues: { ':now': now }
  }));

  return response(200, { success: true });
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  const tokenPayload = verifyToken(event.headers?.Authorization || event.headers?.authorization);
  if (!tokenPayload || tokenPayload.role !== 'teacher') {
    return response(401, { error: '未授權的訪問' });
  }

  try {
    const classId = event.pathParameters?.classId;
    const studentUsername = event.pathParameters?.username;
    const method = event.httpMethod;

    if (!classId) {
      return response(400, { error: '缺少班級 ID' });
    }

    // DELETE /api/teacher/classes/{classId}/students/{username}
    if (method === 'DELETE' && studentUsername) {
      return await removeStudent(classId, studentUsername, tokenPayload.username);
    }

    // PUT /api/teacher/classes/{classId}
    if (method === 'PUT') {
      const body = JSON.parse(event.body || '{}');
      return await updateClass(classId, body.className, tokenPayload.username);
    }

    // DELETE /api/teacher/classes/{classId}
    if (method === 'DELETE') {
      return await deleteClass(classId, tokenPayload.username);
    }

    return response(400, { error: '不支援的操作' });

  } catch (error) {
    console.error('Manage class error:', error);
    return response(500, { error: error.message || '操作失敗，請稍後再試' });
  }
};
