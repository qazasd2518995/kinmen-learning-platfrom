/**
 * 金門話學習平台 - 教師 API 模組
 * 支援 LTI 模式：從 BeyondBridge 平台整合的資料查詢
 * 支援獨立模式：直接使用 AWS Lambda API
 */

const API_BASE = 'https://ys63zw9mhl.execute-api.ap-southeast-2.amazonaws.com/prod';

// 自動從 URL hash 讀取 LTI session 資料並存入 localStorage
(function initLtiFromHash() {
  const hash = window.location.hash;
  if (hash && hash.includes('lti_data=')) {
    try {
      const encoded = hash.split('lti_data=')[1];
      const sessionData = JSON.parse(decodeURIComponent(encoded));
      if (sessionData && sessionData.sessionId) {
        localStorage.setItem('lti_session', JSON.stringify(sessionData));
        localStorage.setItem('lti_active', 'true');
        history.replaceState(null, '', window.location.pathname + window.location.search);
        console.log('[LTI] Teacher session initialized:', sessionData.name, sessionData.userRole);
      }
    } catch (e) {
      console.warn('[LTI] Failed to parse session from URL hash:', e);
    }
  }
})();

/**
 * 取得 LTI session（如果有）
 */
function getLtiSession() {
  try {
    const session = JSON.parse(localStorage.getItem('lti_session'));
    if (session && session.expiresAt && new Date(session.expiresAt) > new Date()) {
      return session;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 判斷是否為 LTI 模式
 */
function isLtiMode() {
  return !!getLtiSession();
}

/**
 * 教師 API 類別
 */
export const TeacherAPI = {
  /**
   * 取得當前教師資訊（LTI 或獨立模式）
   */
  getCurrentTeacher() {
    // LTI 模式：從 LTI session 取得
    const ltiSession = getLtiSession();
    if (ltiSession && (ltiSession.userRole === 'teacher' || ltiSession.userRole === 'admin')) {
      return {
        username: ltiSession.platformUserId,
        displayName: ltiSession.name || '教師',
        role: 'teacher',
        token: null, // LTI 模式不用 JWT token
        ltiSession: true,
        courseId: ltiSession.courseId,
        courseName: ltiSession.context?.title || ltiSession.context?.label || null,
        platformUrl: ltiSession.platformUrl
      };
    }

    // 獨立模式
    try {
      return JSON.parse(localStorage.getItem('kinmen_teacher'));
    } catch {
      return null;
    }
  },

  /**
   * 取得 JWT token（獨立模式用）
   */
  getToken() {
    if (isLtiMode()) return null;
    const teacher = this.getCurrentTeacher();
    return teacher?.token;
  },

  /**
   * 登出
   */
  logout() {
    if (isLtiMode()) {
      // LTI 模式：清除 session 並導回 BeyondBridge
      const session = getLtiSession();
      localStorage.removeItem('lti_session');
      localStorage.removeItem('lti_active');
      if (session?.platformUrl) {
        window.location.href = session.platformUrl;
      } else {
        window.location.href = '/';
      }
      return;
    }
    localStorage.removeItem('kinmen_teacher');
  },

  /**
   * 通用 API 請求方法
   */
  async request(endpoint, options = {}) {
    const token = this.getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers
    };

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '請求失敗');
      }

      return data;
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error);
      throw error;
    }
  },

  /**
   * 教師登入（僅獨立模式）
   */
  async login(username, password) {
    return this.request('/api/teacher/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  },

  /**
   * 取得教師的班級列表
   */
  async getClasses() {
    const teacher = this.getCurrentTeacher();
    if (!teacher) throw new Error('未登入');

    if (teacher.ltiSession) {
      // LTI 模式：用課程資訊作為「班級」
      const ltiSession = getLtiSession();
      const courseId = ltiSession.courseId;
      const courseName = ltiSession.context?.title || ltiSession.context?.label || '課程';

      // 從 kinmen 表取得這個課程的學生進度統計
      try {
        const result = await this.request(`/api/lti/course/${courseId}/stats`);
        return {
          success: true,
          classes: [{
            classId: courseId,
            className: courseName,
            inviteCode: null,
            studentCount: result.studentCount || 0,
            activeCount: result.activeCount || 0,
            avgProgress: result.avgProgress || 0,
            avgStudyTime: result.avgStudyTime || 0,
            attentionStudents: result.attentionStudents || []
          }]
        };
      } catch {
        // API 尚未就緒時，返回基本課程資訊
        return {
          success: true,
          classes: [{
            classId: courseId,
            className: courseName,
            inviteCode: null,
            studentCount: 0,
            activeCount: 0,
            avgProgress: 0,
            avgStudyTime: 0,
            attentionStudents: []
          }]
        };
      }
    }

    return await this.request('/api/teacher/classes');
  },

  /**
   * 取得班級學生列表
   */
  async getClassStudents(classId) {
    const teacher = this.getCurrentTeacher();

    if (teacher?.ltiSession) {
      // LTI 模式：從 kinmen 表取得該課程的學生
      try {
        return await this.request(`/api/lti/course/${classId}/students`);
      } catch {
        return { success: true, className: '課程', students: [] };
      }
    }

    return await this.request(`/api/teacher/classes/${classId}/students`);
  },

  /**
   * 取得學生詳細資料
   */
  async getStudentDetail(username) {
    const teacher = this.getCurrentTeacher();

    if (teacher?.ltiSession) {
      try {
        return await this.request(`/api/lti/student/${username}/detail`);
      } catch {
        return { success: false, error: '無法取得學生資料' };
      }
    }

    return await this.request(`/api/teacher/students/${username}`);
  },

  /**
   * 取得班級分析數據
   */
  async getClassAnalytics(classId = null) {
    const teacher = this.getCurrentTeacher();

    if (teacher?.ltiSession) {
      const courseId = classId || getLtiSession()?.courseId;
      try {
        return await this.request(`/api/lti/course/${courseId}/analytics`);
      } catch {
        return {
          success: true,
          progressDistribution: [0, 0, 0, 0, 0],
          vocabMastery: [0, 0, 0],
          gamePreferences: [0, 0, 0, 0, 0],
          timeData: [0, 0, 0, 0, 0, 0, 0]
        };
      }
    }

    const endpoint = classId
      ? `/api/teacher/classes/${classId}/analytics`
      : '/api/teacher/analytics';
    return await this.request(endpoint);
  },

  /**
   * 建立新班級（僅獨立模式）
   */
  async createClass(className) {
    return this.request('/api/teacher/classes', {
      method: 'POST',
      body: JSON.stringify({ className })
    });
  },

  /**
   * 更新班級名稱（僅獨立模式）
   */
  async updateClass(classId, className) {
    return this.request(`/api/teacher/classes/${classId}`, {
      method: 'PUT',
      body: JSON.stringify({ className })
    });
  },

  /**
   * 刪除班級（僅獨立模式）
   */
  async deleteClass(classId) {
    return this.request(`/api/teacher/classes/${classId}`, {
      method: 'DELETE'
    });
  },

  /**
   * 從班級移除學生（僅獨立模式）
   */
  async removeStudent(classId, username) {
    return this.request(`/api/teacher/classes/${classId}/students/${username}`, {
      method: 'DELETE'
    });
  },

  /**
   * 是否為 LTI 模式
   */
  isLtiMode() {
    return isLtiMode();
  }
};

export default TeacherAPI;
