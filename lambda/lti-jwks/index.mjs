/**
 * LTI 1.3 JWKS Endpoint
 * 金門語教材 - LTI Tool Provider
 *
 * 提供 Tool 的公鑰供 Platform 驗證 Tool 簽發的 JWT
 * （用於 Deep Linking 回應等場景）
 */

import crypto from 'crypto';
import { createResponse } from '../shared/lti-utils.mjs';

// 工具金鑰快取
let toolKeys = null;

/**
 * 生成工具的 RSA 金鑰對
 */
function generateToolKeyPair() {
  const keyId = `kinmen_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;

  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

  return { keyId, publicKey, privateKey };
}

/**
 * 將 PEM 公鑰轉換為 JWK 格式
 */
function pemToJwk(pemPublicKey, keyId) {
  // 從 PEM 提取 DER 編碼的公鑰
  const pemContent = pemPublicKey
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s/g, '');

  const derBuffer = Buffer.from(pemContent, 'base64');

  // 解析 SPKI 格式的 DER 編碼
  // RSA 公鑰結構: SEQUENCE { SEQUENCE { OID, NULL }, BIT STRING { RSA params } }
  // 我們需要提取 n 和 e 參數

  // 簡化處理：使用 Node.js crypto 創建 KeyObject 並導出
  const keyObject = crypto.createPublicKey(pemPublicKey);
  const jwk = keyObject.export({ format: 'jwk' });

  return {
    ...jwk,
    kid: keyId,
    alg: 'RS256',
    use: 'sig'
  };
}

/**
 * 確保有可用的金鑰
 */
function ensureKeys() {
  if (!toolKeys) {
    // 檢查環境變數是否有預設金鑰
    if (process.env.LTI_TOOL_PUBLIC_KEY && process.env.LTI_TOOL_PRIVATE_KEY) {
      toolKeys = {
        keyId: process.env.LTI_TOOL_KEY_ID || 'kinmen_default',
        publicKey: process.env.LTI_TOOL_PUBLIC_KEY,
        privateKey: process.env.LTI_TOOL_PRIVATE_KEY
      };
    } else {
      // 動態生成金鑰（注意：Lambda 重啟會導致金鑰變更）
      console.log('Generating new tool key pair...');
      toolKeys = generateToolKeyPair();
    }
  }
  return toolKeys;
}

export async function handler(event) {
  console.log('JWKS Request:', JSON.stringify(event, null, 2));

  try {
    // 確保有金鑰
    const keys = ensureKeys();

    // 轉換為 JWK 格式
    const jwk = pemToJwk(keys.publicKey, keys.keyId);

    // 回傳 JWKS
    const jwks = {
      keys: [jwk]
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(jwks)
    };

  } catch (error) {
    console.error('JWKS error:', error);
    return createResponse(500, {
      error: 'server_error',
      error_description: 'Failed to generate JWKS'
    });
  }
}

/**
 * 取得當前的金鑰對（供其他 Lambda 使用）
 */
export function getToolKeys() {
  return ensureKeys();
}

/**
 * 使用工具私鑰簽署 JWT（用於 Deep Linking 回應）
 */
export async function signToolJwt(payload) {
  const keys = ensureKeys();

  // 這裡需要使用 jose 庫來簽署 JWT
  // 由於 Lambda 環境可能沒有 jose，我們提供簡化實作

  const header = {
    alg: 'RS256',
    typ: 'JWT',
    kid: keys.keyId
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');

  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signatureInput);
  const signature = sign.sign(keys.privateKey, 'base64url');

  return `${signatureInput}.${signature}`;
}
