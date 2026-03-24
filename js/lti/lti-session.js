/**
 * LTI Session 管理模組
 * 金門語教材 - LTI Tool Provider
 *
 * 處理 LTI 啟動後的 session 管理
 * 與現有的認證系統整合
 */

(function(window) {
  'use strict';

  const LTI_SESSION_KEY = 'lti_session';
  const LTI_ACTIVE_KEY = 'lti_active';

  /**
   * LTI Session Manager
   */
  const LtiSession = {
    getPlatformUrl() {
      const session = this.getSession();
      if (!session) return null;
      if (session.platformUrl) {
        return session.platformUrl.replace(/\/$/, '');
      }
      if (session.agsEndpoint?.lineitems) {
        try {
          return new URL(session.agsEndpoint.lineitems).origin;
        } catch (error) {
          console.warn('Invalid AGS endpoint URL:', error);
        }
      }
      return null;
    },
    /**
     * 檢查是否為 LTI 啟動
     */
    isLtiLaunch() {
      // 檢查 URL 參數
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('lti_session')) {
        return true;
      }

      // 檢查 localStorage
      return localStorage.getItem(LTI_ACTIVE_KEY) === 'true';
    },

    /**
     * 取得 LTI session 資料
     */
    getSession() {
      try {
        const sessionStr = localStorage.getItem(LTI_SESSION_KEY);
        if (sessionStr) {
          return JSON.parse(sessionStr);
        }
      } catch (e) {
        console.error('Failed to parse LTI session:', e);
      }
      return null;
    },

    /**
     * 設置 LTI session
     */
    setSession(session) {
      localStorage.setItem(LTI_SESSION_KEY, JSON.stringify(session));
      localStorage.setItem(LTI_ACTIVE_KEY, 'true');
    },

    /**
     * 清除 LTI session
     */
    clearSession() {
      localStorage.removeItem(LTI_SESSION_KEY);
      localStorage.removeItem(LTI_ACTIVE_KEY);
    },

    /**
     * 取得用戶資訊（從 LTI session）
     */
    getUser() {
      const session = this.getSession();
      if (!session) return null;

      return {
        userId: session.platformUserId,
        username: session.platformUserId,
        name: session.name || session.platformUserId,
        role: session.userRole || 'student',
        isLtiUser: true,
        context: session.context,
        resourceLink: session.resourceLink
      };
    },

    /**
     * 取得 AGS 端點（用於成績回傳）
     */
    getAgsEndpoint() {
      const session = this.getSession();
      return session?.agsEndpoint || null;
    },

    /**
     * 取得 context（課程資訊）
     */
    getContext() {
      const session = this.getSession();
      return session?.context || null;
    },

    /**
     * 初始化 LTI session
     * 從 URL 參數或 localStorage 載入 session
     */
    init() {
      const urlParams = new URLSearchParams(window.location.search);

      // 如果 URL 有 LTI 參數，更新 session
      if (urlParams.has('lti_session')) {
        const sessionId = urlParams.get('lti_session');
        const userId = urlParams.get('lti_user');
        const role = urlParams.get('lti_role');

        // 如果已有完整 session，只需驗證
        const existingSession = this.getSession();
        if (existingSession && existingSession.sessionId === sessionId) {
          console.log('LTI session already active:', sessionId);
        } else {
          // 建立最小 session（完整資料應從 launch 時設置）
          this.setSession({
            sessionId,
            platformUserId: userId,
            userRole: role || 'student',
            createdAt: new Date().toISOString()
          });
        }

        // 移除 URL 中的 LTI 參數（保持 URL 乾淨）
        urlParams.delete('lti_session');
        urlParams.delete('lti_user');
        urlParams.delete('lti_role');

        const newUrl = urlParams.toString()
          ? `${window.location.pathname}?${urlParams.toString()}`
          : window.location.pathname;

        window.history.replaceState({}, '', newUrl);
      }

      return this.isLtiLaunch();
    },

    /**
     * 與現有 API 模組整合
     * 覆寫 API 的認證方法
     */
    integrateWithApi(api) {
      if (!api) return;

      const session = this.getSession();
      if (!session) return;

      // 標記為 LTI 模式
      api.isLtiMode = true;
      api.ltiSession = session;

      // 覆寫 getUser 方法
      const originalGetUser = api.getUser?.bind(api);
      api.getUser = () => {
        if (this.isLtiLaunch()) {
          return this.getUser();
        }
        return originalGetUser ? originalGetUser() : null;
      };

      // 覆寫 isLoggedIn 方法
      const originalIsLoggedIn = api.isLoggedIn?.bind(api);
      api.isLoggedIn = () => {
        if (this.isLtiLaunch()) {
          return true; // LTI launch 視為已登入
        }
        return originalIsLoggedIn ? originalIsLoggedIn() : false;
      };

      console.log('LTI integrated with API module');
    },

    /**
     * 報告進度到 Platform（透過代理端點）
     */
    async reportProgress(progressData) {
      const session = this.getSession();
      if (!session) {
        console.warn('No LTI session available for progress reporting');
        return null;
      }

      const proxyUrl = this.getPlatformUrl();
      const toolId = session.toolId || 'kinmen-language-tool';
      const resourceLinkId = session.resourceLink?.id || session.resourceLinkId;

      if (!proxyUrl || !session.platformUserId) {
        console.warn('Cannot determine progress proxy URL or platform user');
        return null;
      }

      try {
        const response = await fetch(`${proxyUrl}/api/lti/13/tools/${toolId}/progress`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            sessionId: session.sessionId,
            userId: session.platformUserId,
            courseId: session.courseId || session.context?.id || null,
            resourceLinkId,
            ...progressData
          })
        });

        if (!response.ok) {
          throw new Error(`Progress report failed: ${response.status}`);
        }

        return await response.json();
      } catch (error) {
        console.error('Failed to report progress:', error);
        return null;
      }
    },

    /**
     * 報告完成狀態（觸發成績回傳）
     */
    async reportCompletion(unit, score, maxScore = 100) {
      return this.reportProgress({
        type: 'completion',
        unit,
        score,
        maxScore,
        activityProgress: 'Completed',
        gradingProgress: 'FullyGraded',
        timestamp: new Date().toISOString()
      });
    },

    /**
     * 報告部分進度
     */
    async reportPartialProgress(unit, progress, details = {}) {
      return this.reportProgress({
        type: 'progress',
        unit,
        progress, // 0-100
        activityProgress: progress >= 100 ? 'Completed' : 'InProgress',
        gradingProgress: 'Pending',
        details,
        timestamp: new Date().toISOString()
      });
    }
  };

  // 自動初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => LtiSession.init());
  } else {
    LtiSession.init();
  }

  // 導出到全域
  window.LtiSession = LtiSession;

})(window);
