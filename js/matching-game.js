/**
 * 連連看遊戲
 */

export class MatchingGame {
  constructor() {
    this.container = null;
    this.svg = null;
    this.pairs = [];
    this.connections = [];
    this.currentLine = null;
    this.startPoint = null;
    this.isActive = false;

    this.init();
  }

  init() {
    // 監聽載入連連看事件
    document.addEventListener('loadMatching', (e) => {
      this.setup(e.detail);
    });
  }

  setup(slideData) {
    if (!slideData.matchingData) return;

    this.pairs = slideData.matchingData.pairs || [];
    this.connections = [];
    this.isActive = true;

    const layer = document.getElementById('interaction-layer');
    this.container = layer;

    // 建立 SVG 連線層
    this.createSVGLayer();

    // 建立連線點
    this.createMatchPoints(slideData.matchingData);

    // 建立控制按鈕
    this.createControls();
  }

  createSVGLayer() {
    // 移除舊的 SVG
    const existingSvg = this.container.querySelector('.connection-layer');
    if (existingSvg) existingSvg.remove();

    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.classList.add('connection-layer');
    this.svg.style.cssText = 'position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;';
    this.container.appendChild(this.svg);
  }

  createMatchPoints(data) {
    const leftPoints = data.leftPoints || [];
    const rightPoints = data.rightPoints || [];

    // 建立左側點（漢字）
    leftPoints.forEach((point, index) => {
      const el = this.createPoint(point, 'left', index);
      this.container.appendChild(el);
    });

    // 建立右側點（台羅拼音）
    rightPoints.forEach((point, index) => {
      const el = this.createPoint(point, 'right', index);
      this.container.appendChild(el);
    });
  }

  createPoint(point, side, index) {
    const el = document.createElement('div');
    el.className = 'match-point';
    el.dataset.side = side;
    el.dataset.index = index;
    el.dataset.value = point.value;
    el.style.left = point.x;
    el.style.top = point.y;

    // 事件綁定
    el.addEventListener('mousedown', (e) => this.startConnection(e, el));
    el.addEventListener('touchstart', (e) => this.startConnection(e, el), { passive: false });

    return el;
  }

  startConnection(e, pointEl) {
    if (!this.isActive) return;
    if (pointEl.classList.contains('connected')) return;

    e.preventDefault();

    this.startPoint = pointEl;
    pointEl.classList.add('active');

    // 取得起始座標
    const rect = this.container.getBoundingClientRect();
    const pointRect = pointEl.getBoundingClientRect();
    const startX = pointRect.left + pointRect.width / 2 - rect.left;
    const startY = pointRect.top + pointRect.height / 2 - rect.top;

    // 建立連線
    this.currentLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    this.currentLine.setAttribute('x1', startX);
    this.currentLine.setAttribute('y1', startY);
    this.currentLine.setAttribute('x2', startX);
    this.currentLine.setAttribute('y2', startY);
    this.currentLine.classList.add('connection-line', 'drawing');
    this.svg.appendChild(this.currentLine);

    // 監聽滑鼠/觸控移動
    const moveHandler = (e) => this.updateConnection(e);
    const endHandler = (e) => this.endConnection(e, moveHandler, endHandler);

    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('mouseup', endHandler);
    document.addEventListener('touchmove', moveHandler, { passive: false });
    document.addEventListener('touchend', endHandler);
  }

  updateConnection(e) {
    if (!this.currentLine) return;

    e.preventDefault();

    const rect = this.container.getBoundingClientRect();
    let x, y;

    if (e.touches) {
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
    } else {
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    }

    this.currentLine.setAttribute('x2', x);
    this.currentLine.setAttribute('y2', y);
  }

  endConnection(e, moveHandler, endHandler) {
    document.removeEventListener('mousemove', moveHandler);
    document.removeEventListener('mouseup', endHandler);
    document.removeEventListener('touchmove', moveHandler);
    document.removeEventListener('touchend', endHandler);

    if (!this.currentLine || !this.startPoint) {
      this.cleanup();
      return;
    }

    // 檢查是否放在有效的端點上
    const endPoint = this.findEndPoint(e);

    if (endPoint && endPoint.dataset.side !== this.startPoint.dataset.side) {
      // 完成連線
      this.completeConnection(this.startPoint, endPoint);
    } else {
      // 取消連線
      this.currentLine.remove();
    }

    this.cleanup();
  }

  findEndPoint(e) {
    let x, y;

    if (e.changedTouches) {
      x = e.changedTouches[0].clientX;
      y = e.changedTouches[0].clientY;
    } else {
      x = e.clientX;
      y = e.clientY;
    }

    const element = document.elementFromPoint(x, y);
    if (element && element.classList.contains('match-point')) {
      return element;
    }
    return null;
  }

  completeConnection(startPoint, endPoint) {
    // 確定哪個是左邊，哪個是右邊
    const leftPoint = startPoint.dataset.side === 'left' ? startPoint : endPoint;
    const rightPoint = startPoint.dataset.side === 'right' ? startPoint : endPoint;

    // 更新連線終點
    const rect = this.container.getBoundingClientRect();
    const endRect = endPoint.getBoundingClientRect();
    const endX = endRect.left + endRect.width / 2 - rect.left;
    const endY = endRect.top + endRect.height / 2 - rect.top;

    this.currentLine.setAttribute('x2', endX);
    this.currentLine.setAttribute('y2', endY);
    this.currentLine.classList.remove('drawing');

    // 標記為已連接
    leftPoint.classList.add('connected');
    rightPoint.classList.add('connected');

    // 儲存連線資訊
    this.connections.push({
      line: this.currentLine,
      left: leftPoint,
      right: rightPoint,
      leftValue: leftPoint.dataset.value,
      rightValue: rightPoint.dataset.value
    });
  }

  cleanup() {
    if (this.startPoint) {
      this.startPoint.classList.remove('active');
    }
    this.startPoint = null;
    this.currentLine = null;
  }

  createControls() {
    // 移除舊的控制按鈕
    const existingControls = this.container.querySelector('.matching-controls');
    if (existingControls) existingControls.remove();

    const controls = document.createElement('div');
    controls.className = 'matching-controls';
    controls.innerHTML = `
      <button class="match-btn" id="btn-check-match">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        檢查答案
      </button>
      <button class="match-btn" id="btn-reset-match">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
          <path d="M3 3v5h5"/>
        </svg>
        重新開始
      </button>
    `;

    controls.querySelector('#btn-check-match').addEventListener('click', () => this.checkAnswers());
    controls.querySelector('#btn-reset-match').addEventListener('click', () => this.reset());

    this.container.appendChild(controls);
  }

  checkAnswers() {
    let correctCount = 0;

    this.connections.forEach(conn => {
      // 檢查是否匹配（需要在配置中定義正確答案）
      const isCorrect = this.pairs.some(pair => {
        return (pair.left === conn.leftValue && pair.right === conn.rightValue);
      });

      if (isCorrect) {
        conn.line.classList.add('correct');
        conn.left.classList.add('correct');
        conn.right.classList.add('correct');
        correctCount++;
      } else {
        conn.line.classList.add('incorrect');
        conn.left.classList.add('incorrect');
        conn.right.classList.add('incorrect');
      }
    });

    // 顯示結果
    this.showResult(correctCount, this.pairs.length);
  }

  showResult(correct, total) {
    const toast = document.createElement('div');
    toast.className = `progress-toast ${correct === total ? '' : 'info'}`;
    toast.textContent = `答對 ${correct} / ${total} 題！${correct === total ? ' 太棒了！' : ''}`;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });

    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  reset() {
    // 清除所有連線
    this.connections.forEach(conn => {
      conn.line.remove();
      conn.left.classList.remove('connected', 'correct', 'incorrect');
      conn.right.classList.remove('connected', 'correct', 'incorrect');
    });

    this.connections = [];
    this.currentLine = null;
    this.startPoint = null;
  }

  destroy() {
    this.isActive = false;
    this.reset();

    if (this.svg) {
      this.svg.remove();
    }

    const controls = this.container?.querySelector('.matching-controls');
    if (controls) {
      controls.remove();
    }
  }
}
