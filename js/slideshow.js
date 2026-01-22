/**
 * 投影片控制器
 */

export class Slideshow {
  constructor(config) {
    this.config = config;
    this.currentIndex = 0;
    this.totalSlides = config.totalSlides || 55;
    this.isAnimating = false;

    this.elements = {
      image: document.getElementById('slide-image'),
      currentPage: document.getElementById('current-page'),
      totalPages: document.getElementById('total-pages'),
      progressFill: document.getElementById('progress-fill'),
      interactionLayer: document.getElementById('interaction-layer'),
      prevBtn: document.getElementById('btn-prev'),
      nextBtn: document.getElementById('btn-next')
    };

    this.elements.totalPages.textContent = this.totalSlides;

    // 預載入圖片
    this.preloadImages();
  }

  preloadImages() {
    // 預載入前後各 3 張圖片
    const preloadRange = 3;
    const start = Math.max(0, this.currentIndex - preloadRange);
    const end = Math.min(this.totalSlides - 1, this.currentIndex + preloadRange);

    for (let i = start; i <= end; i++) {
      const img = new Image();
      img.src = this.config.slides[i].image;
    }
  }

  async loadSlide(index, direction = 'forward') {
    if (index < 0 || index >= this.totalSlides) return;
    if (this.isAnimating) return;

    this.isAnimating = true;
    const slide = this.config.slides[index];
    const image = this.elements.image;

    // 移除載入完成狀態
    image.classList.remove('loaded');

    // 添加退場動畫
    if (this.currentIndex !== index) {
      const exitClass = direction === 'forward' ? 'slide-exit' : 'slide-exit-reverse';
      image.classList.add(exitClass);
      await this.wait(200);
      image.classList.remove(exitClass);
    }

    // 載入新圖片
    image.src = slide.image;

    // 等待圖片載入
    await new Promise((resolve) => {
      if (image.complete) {
        resolve();
      } else {
        image.onload = resolve;
        image.onerror = resolve;
      }
    });

    // 添加進場動畫
    const enterClass = direction === 'forward' ? 'slide-enter' : 'slide-enter-reverse';
    image.classList.add(enterClass);
    image.classList.add('loaded');

    // 更新狀態
    this.currentIndex = index;
    this.updateUI();

    // 觸發頁面切換事件（讓螢光筆清除）
    document.dispatchEvent(new CustomEvent('slideChanged', { detail: { index } }));

    // 載入互動元素
    this.loadInteractionElements(slide);

    // 預載入相鄰圖片
    this.preloadImages();

    // 移除動畫類別
    await this.wait(400);
    image.classList.remove(enterClass);

    this.isAnimating = false;
  }

  loadInteractionElements(slide) {
    const layer = this.elements.interactionLayer;
    layer.innerHTML = '';

    // 根據投影片類型載入不同的互動元素
    switch (slide.type) {
      case 'vocabulary':
        this.loadVocabularyButtons(slide);
        break;
      case 'matching':
        // 連連看由 matching-game.js 處理
        this.dispatchEvent('loadMatching', slide);
        break;
      case 'dialogue':
        this.loadDialogueButtons(slide);
        break;
    }
  }

  loadVocabularyButtons(slide) {
    if (!slide.vocabulary || slide.vocabulary.length === 0) return;

    const layer = this.elements.interactionLayer;

    slide.vocabulary.forEach(vocab => {
      const btn = document.createElement('button');
      btn.className = 'audio-btn';
      btn.style.left = vocab.position?.x || '50%';
      btn.style.top = vocab.position?.y || '50%';
      btn.style.transform = 'translate(-50%, -50%)';
      btn.setAttribute('aria-label', `播放 ${vocab.word} 發音`);
      btn.setAttribute('data-audio', vocab.audioFile || '');
      btn.setAttribute('data-word', vocab.word);

      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
        </svg>
      `;

      // 如果沒有音檔，添加 disabled 狀態
      if (!vocab.audioFile) {
        btn.classList.add('disabled');
        btn.setAttribute('title', '音檔即將加入');
      } else {
        btn.addEventListener('click', () => this.playAudio(vocab.audioFile, btn));
      }

      layer.appendChild(btn);
    });
  }

  loadDialogueButtons(slide) {
    if (!slide.dialogues) return;

    const layer = this.elements.interactionLayer;

    slide.dialogues.forEach(dialogue => {
      const btn = document.createElement('button');
      btn.className = 'audio-btn';
      btn.style.left = dialogue.position?.x || '90%';
      btn.style.top = dialogue.position?.y || '50%';
      btn.style.transform = 'translate(-50%, -50%)';
      btn.setAttribute('aria-label', `播放對話`);

      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
        </svg>
      `;

      if (!dialogue.audioFile) {
        btn.classList.add('disabled');
        btn.setAttribute('title', '音檔即將加入');
      } else {
        btn.addEventListener('click', () => this.playAudio(dialogue.audioFile, btn));
      }

      layer.appendChild(btn);
    });
  }

  async playAudio(audioFile, buttonEl) {
    const audio = document.getElementById('audio-player');

    // 停止當前播放
    audio.pause();
    audio.currentTime = 0;

    // 移除其他按鈕的播放狀態
    document.querySelectorAll('.audio-btn.playing').forEach(btn => {
      btn.classList.remove('playing');
    });

    try {
      audio.src = audioFile;
      buttonEl.classList.add('playing');

      await audio.play();

      audio.onended = () => {
        buttonEl.classList.remove('playing');
      };
    } catch (error) {
      console.error('播放音檔失敗:', error);
      buttonEl.classList.remove('playing');
    }
  }

  updateUI() {
    // 更新頁碼
    this.elements.currentPage.textContent = this.currentIndex + 1;

    // 更新進度條
    const progress = ((this.currentIndex + 1) / this.totalSlides) * 100;
    this.elements.progressFill.style.width = `${progress}%`;

    // 更新按鈕狀態
    this.elements.prevBtn.disabled = this.currentIndex === 0;
    this.elements.nextBtn.disabled = this.currentIndex === this.totalSlides - 1;

    // 更新目錄活動狀態
    document.querySelectorAll('.toc-item').forEach(item => {
      item.classList.toggle('active', parseInt(item.dataset.slideIndex) === this.currentIndex);
    });
  }

  async nextSlide() {
    if (this.currentIndex < this.totalSlides - 1) {
      await this.loadSlide(this.currentIndex + 1, 'forward');
    }
  }

  async prevSlide() {
    if (this.currentIndex > 0) {
      await this.loadSlide(this.currentIndex - 1, 'backward');
    }
  }

  async goToSlide(index) {
    const direction = index > this.currentIndex ? 'forward' : 'backward';
    await this.loadSlide(index, direction);
  }

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  dispatchEvent(eventName, data) {
    const event = new CustomEvent(eventName, { detail: data });
    document.dispatchEvent(event);
  }

  getCurrentSlide() {
    return this.config.slides[this.currentIndex];
  }

  getCurrentIndex() {
    return this.currentIndex;
  }
}
