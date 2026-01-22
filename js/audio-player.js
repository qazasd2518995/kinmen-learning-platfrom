/**
 * 音檔播放器
 */

export class AudioPlayer {
  constructor() {
    this.audioElement = document.getElementById('audio-player');
    this.currentlyPlaying = null;
    this.isPlaying = false;

    this.init();
  }

  init() {
    // 監聽音檔事件
    this.audioElement.addEventListener('play', () => {
      this.isPlaying = true;
    });

    this.audioElement.addEventListener('pause', () => {
      this.isPlaying = false;
    });

    this.audioElement.addEventListener('ended', () => {
      this.isPlaying = false;
      this.currentlyPlaying = null;
      this.removePlayingState();
    });

    this.audioElement.addEventListener('error', (e) => {
      console.error('音檔載入錯誤:', e);
      this.isPlaying = false;
      this.currentlyPlaying = null;
      this.removePlayingState();
    });

    // 監聯全域播放事件
    document.addEventListener('playAudio', (e) => {
      this.play(e.detail.src, e.detail.button);
    });
  }

  async play(src, buttonEl = null) {
    // 停止當前播放
    this.stop();

    try {
      this.audioElement.src = src;
      this.currentlyPlaying = buttonEl;

      if (buttonEl) {
        buttonEl.classList.add('playing');
      }

      await this.audioElement.play();
    } catch (error) {
      console.error('播放失敗:', error);
      this.removePlayingState();

      // 如果是檔案不存在的錯誤，顯示提示
      if (error.name === 'NotSupportedError' || error.name === 'NotFoundError') {
        this.showNoAudioHint();
      }
    }
  }

  stop() {
    this.audioElement.pause();
    this.audioElement.currentTime = 0;
    this.removePlayingState();
  }

  pause() {
    this.audioElement.pause();
  }

  resume() {
    this.audioElement.play();
  }

  removePlayingState() {
    document.querySelectorAll('.audio-btn.playing').forEach(btn => {
      btn.classList.remove('playing');
    });
    this.currentlyPlaying = null;
  }

  showNoAudioHint() {
    // 顯示提示：音檔即將加入
    const toast = document.createElement('div');
    toast.className = 'progress-toast info';
    toast.textContent = '音檔即將加入，敬請期待！';
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });

    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  setVolume(volume) {
    this.audioElement.volume = Math.max(0, Math.min(1, volume));
  }

  getVolume() {
    return this.audioElement.volume;
  }

  mute() {
    this.audioElement.muted = true;
  }

  unmute() {
    this.audioElement.muted = false;
  }

  toggleMute() {
    this.audioElement.muted = !this.audioElement.muted;
    return this.audioElement.muted;
  }
}
