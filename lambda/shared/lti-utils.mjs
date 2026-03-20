/**
 * LTI 1.3 共用工具模組
 * 金門語教材 - LTI Tool Provider
 */

import crypto from 'crypto';

// 平台配置（BeyondBridge）
export const PLATFORM_CONFIG = {
  issuer: process.env.LTI_PLATFORM_ISSUER || 'https://beyondbridge.edu',
  jwksUri: process.env.LTI_PLATFORM_JWKS_URI || 'https://beyondbridge.onrender.com/api/lti/13/jwks',
  authorizationEndpoint: process.env.LTI_PLATFORM_AUTH_URL || 'https://beyondbridge.onrender.com/api/lti/13/authorize',
  tokenEndpoint: process.env.LTI_PLATFORM_TOKEN_URL || 'https://beyondbridge.onrender.com/api/lti/13/token'
};

// 工具配置
export const TOOL_CONFIG = {
  clientId: process.env.LTI_CLIENT_ID || 'kinmen-tool-client',
  deploymentId: process.env.LTI_DEPLOYMENT_ID || 'kinmen-deployment-1',
  publicKey: process.env.LTI_TOOL_PUBLIC_KEY || null,
  privateKey: process.env.LTI_TOOL_PRIVATE_KEY || null
};

// LTI Claims 命名空間
export const LTI_CLAIMS = {
  MESSAGE_TYPE: 'https://purl.imsglobal.org/spec/lti/claim/message_type',
  VERSION: 'https://purl.imsglobal.org/spec/lti/claim/version',
  DEPLOYMENT_ID: 'https://purl.imsglobal.org/spec/lti/claim/deployment_id',
  TARGET_LINK_URI: 'https://purl.imsglobal.org/spec/lti/claim/target_link_uri',
  RESOURCE_LINK: 'https://purl.imsglobal.org/spec/lti/claim/resource_link',
  ROLES: 'https://purl.imsglobal.org/spec/lti/claim/roles',
  CONTEXT: 'https://purl.imsglobal.org/spec/lti/claim/context',
  PLATFORM: 'https://purl.imsglobal.org/spec/lti/claim/tool_platform',
  LAUNCH_PRESENTATION: 'https://purl.imsglobal.org/spec/lti/claim/launch_presentation',
  CUSTOM: 'https://purl.imsglobal.org/spec/lti/claim/custom',
  AGS_ENDPOINT: 'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint',
  NRPS_ENDPOINT: 'https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice',
  DEEP_LINKING_SETTINGS: 'https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings'
};

/**
 * 生成隨機 state
 */
export function generateState() {
  return crypto.randomBytes(24).toString('base64url');
}

/**
 * 生成隨機 nonce
 */
export function generateNonce() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * 從 JWT 提取 claims（不驗證簽名，僅解碼）
 */
export function decodeJwt(token) {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));

  return { header, payload };
}

/**
 * 驗證 JWT 時間相關的 claims
 */
export function validateJwtTimeClaims(payload) {
  const now = Math.floor(Date.now() / 1000);

  // 檢查過期時間
  if (payload.exp && payload.exp < now) {
    throw new Error('Token has expired');
  }

  // 檢查生效時間
  if (payload.nbf && payload.nbf > now) {
    throw new Error('Token is not yet valid');
  }

  // 檢查簽發時間（允許 5 分鐘時鐘偏差）
  if (payload.iat && payload.iat > now + 300) {
    throw new Error('Token issued in the future');
  }

  return true;
}

/**
 * 提取用戶角色（從 LTI roles claim）
 */
export function extractUserRole(roles) {
  if (!roles || !Array.isArray(roles)) {
    return 'student';
  }

  // 檢查是否為教師/講師
  const instructorRoles = [
    'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor',
    'http://purl.imsglobal.org/vocab/lis/v2/institution/person#Instructor',
    'http://purl.imsglobal.org/vocab/lis/v2/institution/person#Faculty',
    'Instructor',
    'Teacher'
  ];

  for (const role of roles) {
    if (instructorRoles.some(ir => role.includes(ir) || role === ir)) {
      return 'teacher';
    }
  }

  // 檢查是否為管理員
  const adminRoles = [
    'http://purl.imsglobal.org/vocab/lis/v2/institution/person#Administrator',
    'Administrator',
    'Admin'
  ];

  for (const role of roles) {
    if (adminRoles.some(ar => role.includes(ar) || role === ar)) {
      return 'admin';
    }
  }

  return 'student';
}

/**
 * 建立 LTI session 資料
 */
export function createLtiSession(payload) {
  return {
    sessionId: crypto.randomBytes(16).toString('hex'),
    platformUserId: payload.sub,
    name: payload.name || null,
    email: payload.email || null,
    roles: payload[LTI_CLAIMS.ROLES] || [],
    userRole: extractUserRole(payload[LTI_CLAIMS.ROLES]),
    context: payload[LTI_CLAIMS.CONTEXT] || null,
    resourceLink: payload[LTI_CLAIMS.RESOURCE_LINK] || null,
    platform: payload[LTI_CLAIMS.PLATFORM] || null,
    agsEndpoint: payload[LTI_CLAIMS.AGS_ENDPOINT] || null,
    nrpsEndpoint: payload[LTI_CLAIMS.NRPS_ENDPOINT] || null,
    customParams: payload[LTI_CLAIMS.CUSTOM] || {},
    launchPresentation: payload[LTI_CLAIMS.LAUNCH_PRESENTATION] || null,
    deploymentId: payload[LTI_CLAIMS.DEPLOYMENT_ID],
    messageType: payload[LTI_CLAIMS.MESSAGE_TYPE],
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 小時
  };
}

/**
 * HTTP 回應輔助函數
 */
export function createResponse(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      ...headers
    },
    body: JSON.stringify(body)
  };
}

/**
 * 建立 HTML 回應（用於 form_post）
 */
export function createHtmlResponse(html) {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html',
      'Access-Control-Allow-Origin': '*'
    },
    body: html
  };
}

/**
 * 建立重導向回應
 */
export function createRedirectResponse(url) {
  return {
    statusCode: 302,
    headers: {
      'Location': url,
      'Access-Control-Allow-Origin': '*'
    },
    body: ''
  };
}
