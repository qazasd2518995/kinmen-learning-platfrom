/**
 * 金門話學習平台 - 教師 API 模組
 * 處理教師後台與 AWS 後端的所有 API 通訊
 */

const API_BASE = 'https://ys63zw9mhl.execute-api.ap-southeast-2.amazonaws.com/prod';

/**
 * 教師 API 類別
 */
export const TeacherAPI = {
  /**
   * 取得當前登入的教師
   */
  getCurrentTeacher() {
    try {
      return JSON.parse(localStorage.getItem('kinmen_teacher'));
    } catch {
      return null;
    }
  },

  /**
   * 取得 JWT token
   */
  getToken() {
    const teacher = this.getCurrentTeacher();
    return teacher?.token;
  },

  /**
   * 登出
   */
  logout() {
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
   * 教師登入
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
    return await this.request('/api/teacher/classes');
  },

  /**
   * 取得班級學生列表
   */
  async getClassStudents(classId) {
    return await this.request(`/api/teacher/classes/${classId}/students`);
  },

  /**
   * 取得學生詳細資料
   */
  async getStudentDetail(username) {
    return await this.request(`/api/teacher/students/${username}`);
  },

  /**
   * 取得班級分析數據
   */
  async getClassAnalytics(classId = null) {
    const endpoint = classId
      ? `/api/teacher/classes/${classId}/analytics`
      : '/api/teacher/analytics';
    return await this.request(endpoint);
  },

  /**
   * 建立新班級
   */
  async createClass(className) {
    return this.request('/api/teacher/classes', {
      method: 'POST',
      body: JSON.stringify({ className })
    });
  },

  /**
   * 更新班級名稱
   */
  async updateClass(classId, className) {
    return this.request(`/api/teacher/classes/${classId}`, {
      method: 'PUT',
      body: JSON.stringify({ className })
    });
  },

  /**
   * 刪除班級
   */
  async deleteClass(classId) {
    return this.request(`/api/teacher/classes/${classId}`, {
      method: 'DELETE'
    });
  },

  /**
   * 從班級移除學生
   */
  async removeStudent(classId, username) {
    return this.request(`/api/teacher/classes/${classId}/students/${username}`, {
      method: 'DELETE'
    });
  }
};

export default TeacherAPI;
