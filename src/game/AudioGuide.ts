export class AudioGuide {
  private context: AudioContext | null = null;
  private musicTimer: number | null = null;
  private musicStep = 0;
  private muted = false;

  unlock() {
    if (!this.context || this.context.state === 'closed') {
      this.context = new AudioContext();
    }
    if (this.context.state === 'suspended') {
      void this.context.resume().catch(() => undefined);
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) window.speechSynthesis.cancel();
  }

  startMusic() {
    if (this.musicTimer !== null) return;
    const notes = [523.25, 659.25, 783.99, 659.25, 587.33, 739.99, 880, 739.99];
    this.musicTimer = window.setInterval(() => {
      if (this.muted || !this.context || this.context.state !== 'running') return;
      this.tone(notes[this.musicStep % notes.length], 0.1, 0.026, 'triangle');
      if (this.musicStep % 4 === 0) this.tone(261.63, 0.16, 0.02, 'sine');
      this.musicStep += 1;
    }, 190);
  }

  reset() {
    this.stopMusic();
    window.speechSynthesis.cancel();
  }

  stopMusic() {
    if (this.musicTimer === null) return;
    window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  pause() {
    if (this.context?.state === 'running') void this.context.suspend().catch(() => undefined);
  }

  resume() {
    if (!this.muted && this.context?.state === 'suspended') {
      void this.context.resume().catch(() => undefined);
    }
  }

  bounce() {
    this.tone(180, 0.09, 0.04, 'sine');
  }

  rim() {
    this.tone(360, 0.12, 0.075, 'square');
    window.setTimeout(() => this.tone(250, 0.1, 0.04, 'triangle'), 70);
  }

  swish() {
    [659.25, 880, 1174.66, 1567.98].forEach((note, index) => {
      window.setTimeout(() => this.tone(note, 0.12, 0.065, 'triangle'), index * 68);
    });
  }

  speak(text: string, delay = 0) {
    if (this.muted) return;
    window.setTimeout(() => {
      if (this.muted) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.84;
      utterance.pitch = 1.14;
      utterance.volume = 0.72;
      window.speechSynthesis.speak(utterance);
    }, delay);
  }

  destroy() {
    this.stopMusic();
    window.speechSynthesis.cancel();
    const context = this.context;
    this.context = null;
    if (context && context.state !== 'closed') void context.close().catch(() => undefined);
  }

  private tone(frequency: number, duration: number, gainValue: number, type: OscillatorType) {
    if (this.muted) return;
    this.unlock();
    if (!this.context || this.context.state === 'closed') return;

    try {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.frequency.value = frequency;
      oscillator.type = type;
      gain.gain.setValueAtTime(gainValue, this.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(this.context.destination);
      oscillator.start();
      oscillator.stop(this.context.currentTime + duration);
    } catch {
      this.context = null;
    }
  }
}
