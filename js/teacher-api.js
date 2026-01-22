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

    // 如果後端尚未實作，使用模擬數據
    try {
      return await this.request(`/api/teacher/classes`);
    } catch (error) {
      console.warn('使用模擬數據');
      return this.getMockClasses();
    }
  },

  /**
   * 取得班級學生列表
   */
  async getClassStudents(classId) {
    try {
      return await this.request(`/api/teacher/classes/${classId}/students`);
    } catch (error) {
      console.warn('使用模擬數據');
      return this.getMockClassStudents(classId);
    }
  },

  /**
   * 取得學生詳細資料
   */
  async getStudentDetail(username) {
    try {
      return await this.request(`/api/teacher/students/${username}`);
    } catch (error) {
      console.warn('使用模擬數據');
      return this.getMockStudentDetail(username);
    }
  },

  /**
   * 取得班級分析數據
   */
  async getClassAnalytics(classId = null) {
    try {
      const endpoint = classId
        ? `/api/teacher/classes/${classId}/analytics`
        : '/api/teacher/analytics';
      return await this.request(endpoint);
    } catch (error) {
      console.warn('使用模擬數據');
      return this.getMockAnalytics();
    }
  },

  /**
   * 匯出班級數據
   */
  async exportClassData(classId, format = 'csv') {
    try {
      return await this.request(`/api/teacher/export/${classId}?format=${format}`);
    } catch (error) {
      throw error;
    }
  },

  // ========================================
  // 模擬數據（後端尚未實作時使用）
  // ========================================

  getMockClasses() {
    return {
      success: true,
      classes: [
        {
          classId: 'class_2026_a',
          className: '一年甲班',
          studentCount: 25,
          activeCount: 22,
          avgProgress: 68,
          avgStudyTime: 7200,
          attentionStudents: [
            {
              username: 'student_mei',
              displayName: '小美',
              classId: 'class_2026_a',
              type: 'inactive',
              reason: '超過 7 天未學習'
            },
            {
              username: 'student_qiang',
              displayName: '小強',
              classId: 'class_2026_a',
              type: 'progress',
              reason: '進度落後 (25%)'
            }
          ]
        },
        {
          classId: 'class_2026_b',
          className: '一年乙班',
          studentCount: 23,
          activeCount: 20,
          avgProgress: 55,
          avgStudyTime: 5400,
          attentionStudents: []
        }
      ]
    };
  },

  getMockClassStudents(classId) {
    const mockStudents = [
      {
        username: 'student_ming',
        displayName: '小明',
        lastActive: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
        vocabularyProgress: { viewed: 20, mastered: 15, total: 27, percent: 74 },
        dialogueProgress: { completed: 5, total: 7 },
        totalStudyTime: 7200,
        gamesPlayed: 26,
        dailyStreak: 7,
        achievementsUnlocked: 4
      },
      {
        username: 'student_hua',
        displayName: '小華',
        lastActive: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
        vocabularyProgress: { viewed: 16, mastered: 10, total: 27, percent: 59 },
        dialogueProgress: { completed: 4, total: 7 },
        totalStudyTime: 5400,
        gamesPlayed: 18,
        dailyStreak: 3,
        achievementsUnlocked: 3
      },
      {
        username: 'student_mei',
        displayName: '小美',
        lastActive: new Date(Date.now() - 1000 * 60 * 60 * 24 * 8).toISOString(),
        vocabularyProgress: { viewed: 7, mastered: 4, total: 27, percent: 26 },
        dialogueProgress: { completed: 2, total: 7 },
        totalStudyTime: 1800,
        gamesPlayed: 5,
        dailyStreak: 0,
        achievementsUnlocked: 1
      },
      {
        username: 'student_qiang',
        displayName: '小強',
        lastActive: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
        vocabularyProgress: { viewed: 8, mastered: 5, total: 27, percent: 30 },
        dialogueProgress: { completed: 1, total: 7 },
        totalStudyTime: 2400,
        gamesPlayed: 8,
        dailyStreak: 1,
        achievementsUnlocked: 2
      },
      {
        username: 'student_li',
        displayName: '小麗',
        lastActive: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
        vocabularyProgress: { viewed: 27, mastered: 24, total: 27, percent: 100 },
        dialogueProgress: { completed: 7, total: 7 },
        totalStudyTime: 14400,
        gamesPlayed: 45,
        dailyStreak: 14,
        achievementsUnlocked: 8
      },
      {
        username: 'student_wei',
        displayName: '小偉',
        lastActive: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
        vocabularyProgress: { viewed: 18, mastered: 12, total: 27, percent: 67 },
        dialogueProgress: { completed: 4, total: 7 },
        totalStudyTime: 6000,
        gamesPlayed: 20,
        dailyStreak: 5,
        achievementsUnlocked: 4
      },
      {
        username: 'student_fang',
        displayName: '小芳',
        lastActive: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
        vocabularyProgress: { viewed: 22, mastered: 18, total: 27, percent: 81 },
        dialogueProgress: { completed: 6, total: 7 },
        totalStudyTime: 9600,
        gamesPlayed: 32,
        dailyStreak: 8,
        achievementsUnlocked: 6
      }
    ];

    const classNames = {
      'class_2026_a': '一年甲班',
      'class_2026_b': '一年乙班'
    };

    return {
      success: true,
      className: classNames[classId] || '班級',
      students: mockStudents
    };
  },

  getMockStudentDetail(username) {
    const mockData = {
      student_ming: {
        student: { username: 'student_ming', displayName: '小明' },
        vocabulary: {
          viewed: 20,
          mastered: 15,
          total: 27,
          byCategory: {
            fruit: { viewed: 10, mastered: 8, total: 12 },
            vegetable: { viewed: 8, mastered: 5, total: 13 },
            item: { viewed: 2, mastered: 2, total: 2 }
          }
        },
        dialogue: {
          completed: 5,
          total: 7,
          scenarios: [
            { id: 'greeting', status: 'completed' },
            { id: 'pricing', status: 'completed' },
            { id: 'bargaining', status: 'completed' },
            { id: 'quantity', status: 'completed' },
            { id: 'payment', status: 'completed' },
            { id: 'thanks', status: 'not_started' },
            { id: 'farewell', status: 'not_started' }
          ]
        },
        games: {
          matching: { played: 8, bestScore: 100 },
          sorting: { played: 5, bestScore: 95 },
          maze: { played: 3, bestScore: 67, completionRate: 67 },
          bingo: { played: 4, bestScore: 75, winRate: 75 },
          duel: { played: 6, bestScore: 120 }
        },
        statistics: {
          totalStudyTime: 7200,
          dailyStreak: 7,
          lastStudyDate: new Date().toISOString()
        },
        achievements: {
          unlocked: ['first_word', 'vocab_10', 'game_first', 'streak_3'],
          total: 9
        }
      }
    };

    // 為其他用戶生成預設數據
    const defaultData = {
      student: { username, displayName: username },
      vocabulary: {
        viewed: 10,
        mastered: 6,
        total: 27,
        byCategory: {
          fruit: { viewed: 5, mastered: 3, total: 12 },
          vegetable: { viewed: 4, mastered: 2, total: 13 },
          item: { viewed: 1, mastered: 1, total: 2 }
        }
      },
      dialogue: {
        completed: 3,
        total: 7,
        scenarios: []
      },
      games: {
        matching: { played: 4, bestScore: 80 },
        sorting: { played: 2, bestScore: 70 },
        maze: { played: 1, bestScore: 50 },
        bingo: { played: 2, bestScore: 50 },
        duel: { played: 3, bestScore: 60 }
      },
      statistics: {
        totalStudyTime: 3600,
        dailyStreak: 2,
        lastStudyDate: new Date().toISOString()
      },
      achievements: {
        unlocked: ['first_word', 'game_first'],
        total: 9
      }
    };

    return {
      success: true,
      ...(mockData[username] || defaultData)
    };
  },

  getMockAnalytics() {
    return {
      success: true,
      progressDistribution: [3, 5, 8, 12, 7], // 0-20%, 21-40%, 41-60%, 61-80%, 81-100%
      vocabMastery: [45, 38, 8], // 水果, 蔬菜, 用品 (平均掌握百分比)
      gamePreferences: [120, 85, 45, 60, 95], // 連連看, 分類, 迷宮, 賓果, 決鬥 (總遊玩次數)
      timeData: [45, 60, 55, 70, 65, 30, 25] // 週一到週日平均學習時間（分鐘）
    };
  }
};

export default TeacherAPI;
