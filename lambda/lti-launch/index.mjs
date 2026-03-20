/**
 * LTI 1.3 Launch Handler
 * 金門語教材 - LTI Tool Provider
 *
 * 接收 Platform 的 ID Token (JWT)
 * 驗證並建立本地 session（存入 DynamoDB）
 * 重導向用戶到學習內容
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import {
  decodeJwt,
  validateJwtTimeClaims,
  createLtiSession,
  LTI_CLAIMS,
  TOOL_CONFIG,
  createResponse,
  createHtmlResponse,
  createRedirectResponse
} from '../shared/lti-utils.mjs';

const client = new DynamoDBClient({ region: 'ap-southeast-2' });
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = 'kinmen';

const TOOL_FRONTEND_URL = process.env.TOOL_FRONTEND_URL || 'https://kinmen-learning-platfrom.vercel.app';

export async function handler(event) {
  console.log('LTI Launch:', JSON.stringify(event, null, 2));

  try {
    // 處理 OPTIONS
    if (event.httpMethod === 'OPTIONS') {
      return createResponse(200, '');
    }

    // 解析 form_post 請求
    let body = {};
    if (event.body) {
      if (event.isBase64Encoded) {
        body = Object.fromEntries(
          new URLSearchParams(Buffer.from(event.body, 'base64').toString('utf8'))
        );
      } else {
        try {
          body = JSON.parse(event.body);
        } catch {
          body = Object.fromEntries(new URLSearchParams(event.body));
        }
      }
    }

    const { id_token, state } = body;

    if (!id_token) {
      return createResponse(400, {
        error: 'invalid_request',
        error_description: 'Missing id_token'
      });
    }

    // 驗證 state（如果有提供，從 DynamoDB 取出並刪除）
    if (state) {
      const stateResult = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { kinmen: `LTI_STATE#${state}` }
      }));

      if (stateResult.Item) {
        // State 有效，刪除（防止重放）
        await docClient.send(new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { kinmen: `LTI_STATE#${state}` }
        }));
      }
    }

    // 解碼 JWT
    const { header, payload } = decodeJwt(id_token);

    console.log('JWT Header:', header);
    console.log('JWT Payload keys:', Object.keys(payload));

    // 驗證時間相關的 claims
    try {
      validateJwtTimeClaims(payload);
    } catch (error) {
      console.error('JWT time validation failed:', error.message);
    }

    // 驗證 message type
    const messageType = payload[LTI_CLAIMS.MESSAGE_TYPE];
    if (!messageType) {
      return createResponse(400, {
        error: 'invalid_request',
        error_description: 'Missing LTI message type'
      });
    }

    // 建立 LTI session
    const ltiSession = createLtiSession(payload);

    // 儲存 session 到 DynamoDB（24 小時過期）
    const ttl = Math.floor(new Date(ltiSession.expiresAt).getTime() / 1000);
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        kinmen: `LTI_SESSION#${ltiSession.sessionId}`,
        ...ltiSession,
        ttl
      }
    }));

    console.log('LTI Session saved to DynamoDB:', ltiSession.sessionId);

    // 自動註冊/更新用戶到課程（用於教師後台查詢）
    const courseId = ltiSession.context?.id;
    if (courseId && ltiSession.platformUserId) {
      const now = new Date().toISOString();
      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          kinmen: `LTI_USER#${ltiSession.platformUserId}`,
          platformUserId: ltiSession.platformUserId,
          displayName: ltiSession.name || ltiSession.platformUserId,
          email: ltiSession.email || null,
          role: ltiSession.userRole,
          courseId,
          courseName: ltiSession.context?.title || ltiSession.context?.label || null,
          lastActiveAt: now,
          createdAt: now,
          updatedAt: now
        }
      }));
      console.log('LTI User registered:', ltiSession.platformUserId, 'course:', courseId);
    }

    // 根據 message type 決定重導向目標
    if (messageType === 'LtiDeepLinkingRequest') {
      const deepLinkUrl = `${TOOL_FRONTEND_URL}/lti-content-picker.html?session=${ltiSession.sessionId}`;
      return createLaunchRedirect(deepLinkUrl, ltiSession);
    }

    // Resource Link Launch：根據角色導向不同頁面
    const customParams = payload[LTI_CLAIMS.CUSTOM] || {};
    let targetUrl;

    if (ltiSession.userRole === 'teacher' || ltiSession.userRole === 'admin') {
      // 教師/管理員 → 教師後台
      targetUrl = `${TOOL_FRONTEND_URL}/teacher-dashboard.html`;
    } else if (customParams.unit) {
      // 學生帶單元參數
      targetUrl = `${TOOL_FRONTEND_URL}/unit-${customParams.unit}.html`;
    } else {
      // 學生 → 首頁
      targetUrl = TOOL_FRONTEND_URL;
    }

    // 添加 session 參數
    const finalUrl = new URL(targetUrl);
    finalUrl.searchParams.set('lti_session', ltiSession.sessionId);

    return createLaunchRedirect(finalUrl.toString(), ltiSession);

  } catch (error) {
    console.error('LTI Launch error:', error);
    return createResponse(500, {
      error: 'server_error',
      error_description: 'Failed to process LTI launch: ' + error.message
    });
  }
}

/**
 * 建立啟動重導向
 * 直接 redirect 到前端，session 資料透過 URL hash 傳遞
 * 前端在自己的域名下寫入 localStorage
 */
function createLaunchRedirect(targetUrl, session) {
  const sessionData = {
    sessionId: session.sessionId,
    platformUserId: session.platformUserId,
    name: session.name,
    email: session.email,
    userRole: session.userRole,
    roles: session.roles,
    context: session.context,
    resourceLink: session.resourceLink,
    agsEndpoint: session.agsEndpoint,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    platformUrl: 'https://beyondbridge.onrender.com',
    toolId: 'kinmen-language-tool',
    courseId: session.context?.id || null
  };

  // 把 session 資料編碼到 URL hash 中
  const encodedSession = encodeURIComponent(JSON.stringify(sessionData));
  const finalUrl = `${targetUrl}${targetUrl.includes('?') ? '&' : '?'}lti_session=${session.sessionId}#lti_data=${encodedSession}`;

  return createRedirectResponse(finalUrl);
}
