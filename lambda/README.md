# AWS Lambda 函數部署指南

## 概述

這些 Lambda 函數用於金門話學習平台的後端 API：

- `auth-register` - 用戶註冊
- `auth-login` - 用戶登入
- `progress-get` - 取得學習進度
- `progress-update` - 更新學習進度

## AWS 設定

### DynamoDB

- Region: `ap-southeast-2`
- Table Name: `kinmen`
- Partition Key: `kinmen` (String)

### 資料結構

**用戶資料** (`kinmen: USER#username`)
```json
{
  "kinmen": "USER#john123",
  "username": "john123",
  "passwordHash": "sha256...",
  "displayName": "小明",
  "createdAt": "2025-01-21T...",
  "updatedAt": "2025-01-21T..."
}
```

**學習進度** (`kinmen: PROGRESS#username`)
```json
{
  "kinmen": "PROGRESS#john123",
  "username": "john123",
  "vocabulary": {
    "flashcards": { "viewed": 10, "total": 26 },
    "viewedCards": [0, 1, 2, ...]
  },
  "dialogue": {
    "scenarios": { "completed": 3, "total": 7 },
    "viewedScenarios": ["pricing", "inquiry", ...]
  },
  "practice": {
    "shopping": { "completed": true },
    "calculation": { "score": 4, "total": 5 }
  },
  "createdAt": "2025-01-21T...",
  "updatedAt": "2025-01-21T..."
}
```

## 部署步驟

### 1. 建立 DynamoDB 表

```bash
aws dynamodb create-table \
  --table-name kinmen \
  --attribute-definitions AttributeName=kinmen,AttributeType=S \
  --key-schema AttributeName=kinmen,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region ap-southeast-2
```

### 2. 部署 Lambda 函數

每個函數目錄內：

```bash
# 安裝依賴（如果需要）
npm init -y
npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb

# 打包
zip -r function.zip .

# 建立函數
aws lambda create-function \
  --function-name kinmen-auth-register \
  --runtime nodejs20.x \
  --handler index.handler \
  --zip-file fileb://function.zip \
  --role arn:aws:iam::YOUR_ACCOUNT:role/YOUR_LAMBDA_ROLE \
  --region ap-southeast-2
```

### 3. 設定 API Gateway

建立 REST API：

```
POST /api/auth/register  -> auth-register Lambda
POST /api/auth/login     -> auth-login Lambda
GET  /api/progress/{username} -> progress-get Lambda
POST /api/progress       -> progress-update Lambda
```

啟用 CORS：
- 允許來源：`*`
- 允許方法：`GET, POST, PUT, OPTIONS`
- 允許標頭：`Content-Type`

### 4. 更新前端 API URL

在前端程式碼中更新 `API_BASE` 變數：

```javascript
const API_BASE = 'https://YOUR_API_ID.execute-api.ap-southeast-2.amazonaws.com/prod';
```

## IAM 權限

Lambda 執行角色需要以下權限：

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query"
      ],
      "Resource": "arn:aws:dynamodb:ap-southeast-2:*:table/kinmen"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "*"
    }
  ]
}
```

## 測試

```bash
# 註冊
curl -X POST https://YOUR_API/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"123456","displayName":"測試用戶"}'

# 登入
curl -X POST https://YOUR_API/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"123456"}'

# 取得進度
curl https://YOUR_API/api/progress/test

# 更新進度
curl -X POST https://YOUR_API/api/progress \
  -H "Content-Type: application/json" \
  -d '{"username":"test","vocabulary":{"flashcards":{"viewed":5,"total":26}}}'
```
