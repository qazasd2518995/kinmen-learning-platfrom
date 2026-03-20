/**
 * LTI 1.3 OIDC Login Initiation Handler
 * 金門語教材 - LTI Tool Provider
 *
 * 接收來自 Platform 的登入初始化請求
 * 重導向回 Platform 的授權端點
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  generateState,
  generateNonce,
  PLATFORM_CONFIG,
  TOOL_CONFIG,
  createResponse,
  createRedirectResponse
} from '../shared/lti-utils.mjs';

const client = new DynamoDBClient({ region: 'ap-southeast-2' });
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = 'kinmen';

const TOOL_BASE_URL = process.env.TOOL_BASE_URL || 'https://ys63zw9mhl.execute-api.ap-southeast-2.amazonaws.com/prod';

export async function handler(event) {
  console.log('LTI Login Initiation:', JSON.stringify(event, null, 2));

  try {
    // 解析請求參數（支援 GET 和 POST）
    let params = {};
    if (event.httpMethod === 'GET') {
      params = event.queryStringParameters || {};
    } else if (event.httpMethod === 'POST') {
      if (event.body) {
        if (event.isBase64Encoded) {
          params = Object.fromEntries(
            new URLSearchParams(Buffer.from(event.body, 'base64').toString('utf8'))
          );
        } else {
          try {
            params = JSON.parse(event.body);
          } catch {
            params = Object.fromEntries(new URLSearchParams(event.body));
          }
        }
      }
    } else if (event.httpMethod === 'OPTIONS') {
      return createResponse(200, '');
    }

    const {
      iss,
      target_link_uri,
      login_hint,
      lti_message_hint,
      client_id,
      lti_deployment_id
    } = params;

    if (!iss || !login_hint) {
      return createResponse(400, {
        error: 'invalid_request',
        error_description: 'Missing required parameters: iss or login_hint'
      });
    }

    // 驗證 issuer
    const allowedIssuers = [
      PLATFORM_CONFIG.issuer,
      'https://beyondbridge.edu',
      'https://beyondbridge.onrender.com'
    ];

    const normalizedIss = iss.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const isAllowed = allowedIssuers.some(allowed =>
      allowed.replace(/^https?:\/\//, '').replace(/\/$/, '') === normalizedIss ||
      iss === allowed
    );

    if (!isAllowed) {
      console.warn('Unknown issuer:', iss);
    }

    // 生成 state 和 nonce
    const state = generateState();
    const nonce = generateNonce();

    // 儲存 state 到 DynamoDB（5 分鐘過期）
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);

    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        kinmen: `LTI_STATE#${state}`,
        nonce,
        iss,
        login_hint,
        lti_message_hint: lti_message_hint || null,
        client_id: client_id || TOOL_CONFIG.clientId,
        target_link_uri: target_link_uri || null,
        lti_deployment_id: lti_deployment_id || null,
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        ttl: Math.floor(expiresAt.getTime() / 1000) // DynamoDB TTL
      }
    }));

    // 決定授權端點
    let authEndpoint = PLATFORM_CONFIG.authorizationEndpoint;
    if (iss.includes('beyondbridge.onrender.com')) {
      authEndpoint = 'https://beyondbridge.onrender.com/api/lti/13/authorize';
    }

    // Tool 的 launch 端點
    const redirectUri = `${TOOL_BASE_URL}/api/lti/13/launch`;

    // 構建授權請求 URL
    const authParams = new URLSearchParams({
      response_type: 'id_token',
      response_mode: 'form_post',
      scope: 'openid',
      client_id: client_id || TOOL_CONFIG.clientId,
      redirect_uri: redirectUri,
      login_hint,
      state,
      nonce
    });

    if (lti_message_hint) {
      authParams.set('lti_message_hint', lti_message_hint);
    }

    const authUrl = `${authEndpoint}?${authParams.toString()}`;
    console.log('Redirecting to authorization:', authUrl);

    return createRedirectResponse(authUrl);

  } catch (error) {
    console.error('LTI Login error:', error);
    return createResponse(500, {
      error: 'server_error',
      error_description: 'Failed to process login initiation'
    });
  }
}
