/**
 * 老師模式功能
 */

export class TeacherMode {
  constructor() {
    this.isActive = false;
    this.highlighterActive = false;
    this.eraserActive = false;
    this.timerInterval = null;
    this.timerSeconds = 30;
    this.isTimerRunning = false;

    this.elements = {
      toolbar: document.getElementById('teacher-toolbar'),
      toggleBtn: document.getElementById('btn-teacher-mode'),
      showAnswersBtn: document.getElementById('btn-show-answers'),
      highlighterBtn: document.getElementById('btn-highlighter'),
      eraserBtn: document.getElementById('btn-eraser'),
      clearBtn: document.getElementById('btn-clear-canvas'),
      timerBtn: document.getElementById('btn-timer'),
      timerDisplay: document.getElementById('timer-display'),
      timerValue: document.getElementById('timer-value'),
      timerStart: document.getElementById('btn-timer-start'),
      timerReset: document.getElementById('btn-timer-reset'),
      canvas: document.getElementById('highlighter-canvas')
    };

    this.ctx = null;
    this.isDrawing = false;
    this.lastX = 0;
    this.lastY = 0;

    this.init();
  }

  init() {
    // 綁定事件
    this.elements.showAnswersBtn?.addEventListener('click', () => this.toggleAnswers());
    this.elements.highlighterBtn?.addEventListener('click', () => this.toggleHighlighter());
    this.elements.eraserBtn?.addEventListener('click', () => this.toggleEraser());
    this.elements.clearBtn?.addEventListener('click', () => this.clearHighlighter());
    this.elements.timerBtn?.addEventListener('click', () => this.toggleTimer());
    this.elements.timerStart?.addEventListener('click', () => this.startTimer());
    this.elements.timerReset?.addEventListener('click', () => this.resetTimer());

    // 初始化畫布
    this.initCanvas();

    // 監聽頁面切換事件，切換頁面時清除螢光筆
    document.addEventListener('slideChanged', () => this.clearHighlighter());
  }

  toggle() {
    this.isActive = !this.isActive;

    if (this.isActive) {
      this.activate();
    } else {
      this.deactivate();
    }
  }

  activate() {
    document.body.classList.add('teacher-mode');
    this.elements.toolbar.classList.remove('hidden');
    this.elements.toolbar.classList.add('visible');
    this.elements.toggleBtn.classList.add('active');

    // 顯示提示
    this.showToast('老師模式已啟用');
  }

  deactivate() {
    document.body.classList.remove('teacher-mode');
    this.elements.toolbar.classList.remove('visible');
    this.elements.toolbar.classList.add('hidden');
    this.elements.toggleBtn.classList.remove('active');

    // 關閉所有功能
    this.hideAnswers();
    this.deactivateHighlighter();
    this.deactivateEraser();
    this.pauseTimer();
    this.elements.timerDisplay?.classList.add('hidden');

    this.showToast('老師模式已關閉');
  }

  // ========================================
  // 顯示答案功能
  // ========================================
  toggleAnswers() {
    const btn = this.elements.showAnswersBtn;
    const isShowing = btn.classList.contains('active');

    if (isShowing) {
      this.hideAnswers();
    } else {
      this.showAnswers();
    }
  }

  showAnswers() {
    this.elements.showAnswersBtn?.classList.add('active');

    // 觸發顯示答案事件
    document.dispatchEvent(new CustomEvent('showAnswers'));

    // 為連連看添加答案提示
    document.querySelectorAll('.match-point').forEach(point => {
      point.setAttribute('data-show-answer', 'true');
    });
  }

  hideAnswers() {
    this.elements.showAnswersBtn?.classList.remove('active');

    document.dispatchEvent(new CustomEvent('hideAnswers'));

    document.querySelectorAll('.match-point').forEach(point => {
      point.removeAttribute('data-show-answer');
    });
  }

  // ========================================
  // 螢光筆功能
  // ========================================
  initCanvas() {
    const canvas = this.elements.canvas;
    if (!canvas) return;

    this.ctx = canvas.getContext('2d');

    // 調整畫布大小
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    // 繪圖事件
    canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
    canvas.addEventListener('mousemove', (e) => this.draw(e));
    canvas.addEventListener('mouseup', () => this.stopDrawing());
    canvas.addEventListener('mouseout', () => this.stopDrawing());

    // 觸控支援
    canvas.addEventListener('touchstart', (e) => this.startDrawing(e), { passive: false });
    canvas.addEventListener('touchmove', (e) => this.draw(e), { passive: false });
    canvas.addEventListener('touchend', () => this.stopDrawing());
  }

  resizeCanvas() {
    const canvas = this.elements.canvas;
    const frame = document.querySelector('.slide-frame');
    if (!canvas || !frame) return;

    // 保存當前畫布內容
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    tempCtx.drawImage(canvas, 0, 0);

    // 調整大小
    canvas.width = frame.offsetWidth;
    canvas.height = frame.offsetHeight;

    // 恢復內容（如果有的話）
    if (tempCanvas.width > 0 && tempCanvas.height > 0) {
      this.ctx.drawImage(tempCanvas, 0, 0, tempCanvas.width, tempCanvas.height, 0, 0, canvas.width, canvas.height);
    }
  }

  toggleHighlighter() {
    // 如果橡皮擦是啟用的，先關閉
    if (this.eraserActive) {
      this.deactivateEraser();
    }

    if (this.highlighterActive) {
      this.deactivateHighlighter();
    } else {
      this.activateHighlighter();
    }
  }

  activateHighlighter() {
    this.highlighterActive = true;
    this.eraserActive = false;
    this.elements.highlighterBtn?.classList.add('active');
    this.elements.eraserBtn?.classList.remove('active');
    this.elements.canvas?.classList.add('active');

    // 設定螢光筆樣式
    if (this.ctx) {
      this.ctx.globalCompositeOperation = 'source-over';
      this.ctx.strokeStyle = 'rgba(212, 168, 75, 0.4)';
      this.ctx.lineWidth = 20;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
    }
  }

  deactivateHighlighter() {
    this.highlighterActive = false;
    this.elements.highlighterBtn?.classList.remove('active');

    // 只有在橡皮擦也未啟用時才關閉畫布
    if (!this.eraserActive) {
      this.elements.canvas?.classList.remove('active');
    }
  }

  // ========================================
  // 橡皮擦功能
  // ========================================
  toggleEraser() {
    // 如果螢光筆是啟用的，先關閉
    if (this.highlighterActive) {
      this.deactivateHighlighter();
    }

    if (this.eraserActive) {
      this.deactivateEraser();
    } else {
      this.activateEraser();
    }
  }

  activateEraser() {
    this.eraserActive = true;
    this.highlighterActive = false;
    this.elements.eraserBtn?.classList.add('active');
    this.elements.highlighterBtn?.classList.remove('active');
    this.elements.canvas?.classList.add('active');
    this.elements.canvas?.classList.add('eraser-mode');

    // 設定橡皮擦樣式
    if (this.ctx) {
      this.ctx.globalCompositeOperation = 'destination-out';
      this.ctx.lineWidth = 30;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
    }
  }

  deactivateEraser() {
    this.eraserActive = false;
    this.elements.eraserBtn?.classList.remove('active');
    this.elements.canvas?.classList.remove('eraser-mode');

    // 只有在螢光筆也未啟用時才關閉畫布
    if (!this.highlighterActive) {
      this.elements.canvas?.classList.remove('active');
    }

    // 恢復正常繪圖模式
    if (this.ctx) {
      this.ctx.globalCompositeOperation = 'source-over';
    }
  }

  startDrawing(e) {
    if (!this.highlighterActive && !this.eraserActive) return;

    e.preventDefault();
    this.isDrawing = true;

    const pos = this.getPosition(e);
    this.lastX = pos.x;
    this.lastY = pos.y;
  }

  draw(e) {
    if (!this.isDrawing) return;
    if (!this.highlighterActive && !this.eraserActive) return;

    e.preventDefault();

    const pos = this.getPosition(e);

    this.ctx.beginPath();
    this.ctx.moveTo(this.lastX, this.lastY);
    this.ctx.lineTo(pos.x, pos.y);
    this.ctx.stroke();

    this.lastX = pos.x;
    this.lastY = pos.y;
  }

  stopDrawing() {
    this.isDrawing = false;
  }

  getPosition(e) {
    const canvas = this.elements.canvas;
    const rect = canvas.getBoundingClientRect();

    if (e.touches) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    }

    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  clearHighlighter() {
    if (!this.ctx || !this.elements.canvas) return;
    this.ctx.clearRect(0, 0, this.elements.canvas.width, this.elements.canvas.height);
  }

  // ========================================
  // 計時器功能
  // ========================================
  toggleTimer() {
    const display = this.elements.timerDisplay;
    if (display.classList.contains('hidden')) {
      display.classList.remove('hidden');
    } else {
      display.classList.add('hidden');
      this.pauseTimer();
    }
  }

  startTimer() {
    if (this.isTimerRunning) {
      this.pauseTimer();
      return;
    }

    this.isTimerRunning = true;
    this.elements.timerStart.textContent = '暫停';

    this.timerInterval = setInterval(() => {
      this.timerSeconds--;

      if (this.timerSeconds <= 0) {
        this.timerComplete();
      } else {
        this.updateTimerDisplay();
      }
    }, 1000);
  }

  pauseTimer() {
    this.isTimerRunning = false;
    this.elements.timerStart.textContent = '開始';

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  resetTimer() {
    this.pauseTimer();
    this.timerSeconds = 30;
    this.updateTimerDisplay();
  }

  updateTimerDisplay() {
    const minutes = Math.floor(this.timerSeconds / 60);
    const seconds = this.timerSeconds % 60;
    this.elements.timerValue.textContent =
      `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  timerComplete() {
    this.pauseTimer();
    this.timerSeconds = 0;
    this.updateTimerDisplay();

    // 播放提示音或動畫
    this.showToast('時間到！');
  }

  // ========================================
  // 工具函數
  // ========================================
  showToast(message, type = '') {
    const toast = document.createElement('div');
    toast.className = `progress-toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });

    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }
}
