import Phaser from 'phaser';
import { AudioGuide } from './AudioGuide';
import { generateQuestionSet } from './questions';
import type {
  BallColor,
  GameSettings,
  MathQuestion,
  NarrationLanguage,
  PlayerId,
  PlayerMode,
} from './types';

const GAME_WIDTH = 1600;
const GAME_HEIGHT = 900;
const FLOOR_Y = 786;
const HOOP_X = 1137;
const HOOP_Y = 264;
const QUESTION_COUNT = 15;
const ACTIVE_X = 262;
const ACTIVE_BOTTOM_Y = 808;
const COMPANION_X = 438;
const COMPANION_BOTTOM_Y = 806;

const BALL_COLORS: Record<BallColor, { base: number; dark: number; light: number }> = {
  pink: { base: 0xf36f9b, dark: 0xa93664, light: 0xffb2c9 },
  orange: { base: 0xf58b23, dark: 0xa94f13, light: 0xffc56b },
  yellow: { base: 0xf6bd31, dark: 0xb57912, light: 0xffe27d },
};

let persistedSettings: GameSettings = { playerMode: 'pair', ballColor: 'pink', narrationLanguage: 'en' };

const PLAYER_SCALE: Record<PlayerId, number> = {
  rae: 0.45,
  zoe: 0.41,
};

const COMPANION_SCALE: Record<PlayerId, number> = {
  rae: 0.35,
  zoe: 0.32,
};

const FAMILY_SUPPORTERS = [
  { key: 'daddy', x: 598, scale: 0.56 },
  { key: 'mummy', x: 704, scale: 0.53 },
  { key: 'ah-gong', x: 810, scale: 0.54 },
  { key: 'popo', x: 916, scale: 0.54 },
  { key: 'ah-ma', x: 1018, scale: 0.55 },
  { key: 'gu-zhang', x: 1112, scale: 0.52 },
  { key: 'gugu', x: 1210, scale: 0.52 },
  { key: 'aunty-white', x: 1306, scale: 0.52 },
  { key: 'aunty-navy', x: 1398, scale: 0.52 },
] as const;

type AnswerState = 'neutral' | 'correct' | 'wrong';

type BasketballDebugState = {
  activePlayer: PlayerId;
  answer: number;
  ballColor: BallColor;
  choices: number[];
  firstTryScore: number;
  inputEnabled: boolean;
  operation: string;
  narrationLanguage: NarrationLanguage;
  playerMode: PlayerMode;
  questionIndex: number;
  recapActive: boolean;
  score: number;
  started: boolean;
  wrongAttempts: number;
  zeroQuestionCount: number;
};

type BasketballDebugWindow = Window & {
  __mbgDebug?: BasketballDebugState;
};

export class BasketballScene extends Phaser.Scene {
  private settings: GameSettings = { ...persistedSettings };
  private audio = new AudioGuide(this.settings.narrationLanguage);
  private questions: MathQuestion[] = [];
  private questionIndex = 0;
  private score = 0;
  private firstTryScore = 0;
  private wrongAttempts = 0;
  private started = false;
  private paused = false;
  private recapActive = false;
  private inputEnabled = false;
  private activePlayerId: PlayerId = 'rae';
  private activePlayer?: Phaser.GameObjects.Image;
  private companion?: Phaser.GameObjects.Image;
  private dribbleBall?: Phaser.GameObjects.Image;
  private dribbleTween?: Phaser.Tweens.Tween;
  private shotTrackers: Array<{ value: number }> = [];
  private activePose = '';
  private net?: Phaser.GameObjects.Container;
  private scoreText?: Phaser.GameObjects.Text;
  private shotText?: Phaser.GameObjects.Text;
  private shooterText?: Phaser.GameObjects.Text;
  private equationText?: Phaser.GameObjects.Text;
  private feedbackText?: Phaser.GameObjects.Text;
  private cueContainer?: Phaser.GameObjects.Container;
  private answerButtons: Phaser.GameObjects.Container[] = [];
  private progressDots: Phaser.GameObjects.Arc[] = [];
  private startOverlay?: Phaser.GameObjects.Container;
  private pauseOverlay?: Phaser.GameObjects.Container;
  private recapOverlay?: Phaser.GameObjects.Container;
  private recapScoreText?: Phaser.GameObjects.Text;
  private recapFirstTryText?: Phaser.GameObjects.Text;
  private eventCleanups: Array<() => void> = [];

  constructor() {
    super('BasketballScene');
  }

  init(data: { settings?: Partial<GameSettings> } = {}) {
    this.settings = { ...persistedSettings, ...data.settings };
    persistedSettings = { ...this.settings };
  }

  preload() {
    this.load.image('court', '/assets/backgrounds/hdb-basketball-court.png');
    (['rae', 'zoe'] as const).forEach((player) => {
      ['ready', 'dribble-high', 'dribble-low', 'dribble-recover', 'gather', 'release', 'celebrate'].forEach((pose) => {
        this.load.image(`${player}-${pose}`, `/assets/players/${player}-${pose}.png`);
      });
    });
    FAMILY_SUPPORTERS.forEach((supporter) => {
      [0, 1, 2].forEach((frame) => {
        this.load.image(
          `supporter-${supporter.key}-${frame}`,
          `/assets/npcs/supporter-${supporter.key}-wave-${frame}.png`,
        );
      });
    });
  }

  create() {
    this.questions = generateQuestionSet();
    this.questionIndex = 0;
    this.score = 0;
    this.firstTryScore = 0;
    this.wrongAttempts = 0;
    this.started = false;
    this.paused = false;
    this.recapActive = false;
    this.inputEnabled = false;
    this.audio = new AudioGuide(this.settings.narrationLanguage);

    this.createRuntimeBallTextures();
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'court').setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    this.createFamilySupporters();
    this.createHoopOverlay();
    this.createHud();
    this.createQuestionPanel();
    this.createAnswerButtons();
    this.createOverlays();
    this.createInputs();
    this.createEventBridge();
    this.prepareQuestion();
    this.publishDebugState();
  }

  private createRuntimeBallTextures() {
    (Object.keys(BALL_COLORS) as BallColor[]).forEach((color) => {
      const key = `ball-${color}`;
      if (this.textures.exists(key)) this.textures.remove(key);
      const palette = BALL_COLORS[color];
      const ball = this.make.graphics({ x: 0, y: 0 }, false);
      ball.fillStyle(palette.base, 1);
      ball.fillCircle(60, 60, 52);
      ball.lineStyle(6, palette.dark, 0.95);
      ball.strokeCircle(60, 60, 52);
      ball.lineStyle(4, palette.dark, 0.84);
      ball.strokeEllipse(60, 60, 32, 104);
      ball.strokeEllipse(60, 60, 104, 32);
      ball.beginPath();
      ball.moveTo(16, 30);
      ball.lineTo(104, 90);
      ball.strokePath();
      ball.beginPath();
      ball.moveTo(16, 90);
      ball.lineTo(104, 30);
      ball.strokePath();
      ball.fillStyle(palette.light, 0.72);
      ball.fillCircle(39, 38, 11);
      ball.generateTexture(key, 120, 120);
      ball.destroy();
    });
  }

  private createFamilySupporters() {
    FAMILY_SUPPORTERS.forEach((supporter, index) => {
      const bottomY = 670 + (index % 2) * 10;
      const container = this.add.container(supporter.x, bottomY).setDepth(4);
      const image = this.add.image(0, 0, `supporter-${supporter.key}-0`)
        .setOrigin(0.5, 1)
        .setScale(supporter.scale);
      container.add(image);
      let frame = 0;

      this.tweens.add({
        targets: container,
        y: bottomY - 7,
        duration: 920 + index * 54,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });

      this.time.addEvent({
        delay: 250 + index * 15,
        loop: true,
        callback: () => {
          frame = (frame + 1) % 3;
          image.setTexture(`supporter-${supporter.key}-${frame}`);
        },
      });
    });
  }

  private createHoopOverlay() {
    const net = this.add.container(HOOP_X, HOOP_Y + 16).setDepth(18);
    const mesh = this.add.graphics();
    mesh.lineStyle(4, 0xffffff, 0.92);
    mesh.beginPath();
    mesh.moveTo(-46, 0);
    mesh.lineTo(-24, 92);
    mesh.moveTo(-24, 0);
    mesh.lineTo(-12, 100);
    mesh.moveTo(0, 0);
    mesh.lineTo(0, 104);
    mesh.moveTo(24, 0);
    mesh.lineTo(12, 100);
    mesh.moveTo(46, 0);
    mesh.lineTo(24, 92);
    mesh.strokePath();
    mesh.lineStyle(3, 0xffffff, 0.84);
    [22, 46, 70, 91].forEach((y, index) => {
      const inset = index * 6;
      mesh.strokeEllipse(0, y, 92 - inset * 2, 18);
    });
    net.add(mesh);
    this.net = net;

    const rim = this.add.graphics().setDepth(21);
    rim.lineStyle(9, 0xf07122, 1);
    rim.strokeEllipse(HOOP_X, HOOP_Y + 15, 106, 25);
  }

  private createHud() {
    this.createHudCard(111, 65, 170, 88);
    this.createHudCard(306, 65, 190, 88);
    this.add.text(57, 42, '★', {
      color: '#f36f9b',
      fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
      fontSize: '50px',
      fontStyle: 'bold',
      stroke: '#ffffff',
      strokeThickness: 5,
    }).setOrigin(0.5).setDepth(31);
    this.add.text(102, 38, 'SCORE', {
      color: '#445268',
      fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(31);
    this.scoreText = this.add.text(132, 75, '0', {
      color: '#29323d',
      fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
      fontSize: '38px',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(31);
    this.add.text(245, 42, 'SHOT', {
      color: '#445268',
      fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(31);
    this.shotText = this.add.text(307, 75, '1 / 15', {
      color: '#29323d',
      fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
      fontSize: '32px',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(31);

    for (let index = 0; index < QUESTION_COUNT; index += 1) {
      const dot = this.add.circle(456 + index * 47, 62, 16, 0xe1e8ec, 0.98)
        .setStrokeStyle(6, 0xffffff, 0.98)
        .setDepth(31);
      this.progressDots.push(dot);
    }

    this.shooterText = this.add.text(806, 112, '', {
      color: '#314154',
      fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
      fontSize: '23px',
      fontStyle: 'bold',
      stroke: '#ffffff',
      strokeThickness: 7,
    }).setOrigin(0.5).setDepth(31);
  }

  private createHudCard(x: number, y: number, width: number, height: number) {
    const graphics = this.add.graphics().setDepth(30);
    graphics.fillStyle(0xffffff, 0.94);
    graphics.fillRoundedRect(x - width / 2, y - height / 2, width, height, 20);
    graphics.lineStyle(4, 0xefd8d1, 0.9);
    graphics.strokeRoundedRect(x - width / 2, y - height / 2, width, height, 20);
  }

  private createQuestionPanel() {
    const card = this.add.graphics().setDepth(30);
    card.fillStyle(0xffffff, 0.96);
    card.fillRoundedRect(260, 168, 640, 290, 28);
    card.lineStyle(4, 0xf6b7c9, 0.96);
    card.strokeRoundedRect(260, 168, 640, 290, 28);

    this.equationText = this.add.text(580, 232, '', {
      color: '#26313c',
      fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
      fontSize: '76px',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(31);

    this.cueContainer = this.add.container(580, 355).setDepth(31);
    this.feedbackText = this.add.text(580, 426, '', {
      color: '#b64a72',
      fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(32);
  }

  private createAnswerButtons() {
    [0, 1, 2].forEach((index) => {
      const x = 586 + index * 204;
      const button = this.add.container(x, 740).setDepth(35);
      const background = this.add.graphics();
      const label = this.add.text(0, -4, '', {
        color: '#29323d',
        fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
        fontSize: '66px',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      button.add([background, label]);
      button.setSize(166, 122);
      button.setInteractive({ useHandCursor: true });
      button.setData('background', background);
      button.setData('label', label);
      button.setData('value', 0);
      button.on('pointerdown', () => {
        if (!this.started) {
          this.startGame();
          return;
        }
        if (this.inputEnabled && !this.paused && !this.recapActive) {
          this.submitAnswer(button.getData('value') as number, button);
        }
      });
      button.on('pointerover', () => {
        if (this.inputEnabled) this.tweens.add({ targets: button, scale: 1.04, duration: 90 });
      });
      button.on('pointerout', () => {
        this.tweens.add({ targets: button, scale: 1, duration: 90 });
      });
      this.answerButtons.push(button);
    });
  }

  private createOverlays() {
    this.startOverlay = this.createCenteredOverlay(
      'MATH BASKETBALL',
      'Count the basketballs.\nChoose the answer. Make the shot!',
      'TAP TO PLAY',
      () => this.startGame(),
    );
    this.pauseOverlay = this.createCenteredOverlay(
      'PAUSED',
      'Take your time.',
      'TAP TO RESUME',
      () => this.togglePause(),
    ).setVisible(false);

    this.recapOverlay = this.createCenteredOverlay(
      'HOORAY!',
      '',
      'PLAY AGAIN',
      () => this.restartScene(),
    ).setVisible(false);
    this.recapScoreText = this.add.text(800, 438, '', {
      color: '#de638f',
      fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
      fontSize: '38px',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(104).setVisible(false);
    this.recapFirstTryText = this.add.text(800, 486, '', {
      color: '#53606d',
      fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
      fontSize: '24px',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(104).setVisible(false);
  }

  private createCenteredOverlay(
    title: string,
    copy: string,
    buttonLabel: string,
    action: () => void,
  ) {
    const overlay = this.add.container(0, 0).setDepth(100);
    const veil = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x173746, 0.2);
    const panel = this.add.graphics();
    panel.fillStyle(0xffffff, 0.97);
    panel.fillRoundedRect(540, 280, 520, 340, 30);
    panel.lineStyle(5, 0xf6b7c9, 0.96);
    panel.strokeRoundedRect(540, 280, 520, 340, 30);
    const heading = this.add.text(800, 350, title, {
      color: '#de638f',
      fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
      fontSize: '48px',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    const body = this.add.text(800, 432, copy, {
      align: 'center',
      color: '#53606d',
      fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
      fontSize: '23px',
      fontStyle: 'bold',
      lineSpacing: 7,
    }).setOrigin(0.5);
    const buttonBackground = this.add.graphics();
    buttonBackground.fillStyle(0xf36f9b, 1);
    buttonBackground.fillRoundedRect(650, 522, 300, 66, 18);
    const button = this.add.text(800, 553, buttonLabel, {
      color: '#ffffff',
      fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
      fontSize: '25px',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    const hitArea = this.add.zone(800, 553, 320, 82).setInteractive({ useHandCursor: true });
    hitArea.on('pointerdown', action);
    overlay.add([veil, panel, heading, body, buttonBackground, button, hitArea]);
    return overlay;
  }

  private createInputs() {
    this.input.keyboard?.on('keydown-P', () => this.togglePause());
    this.input.keyboard?.on('keydown-ONE', () => this.answerButtons[0]?.emit('pointerdown'));
    this.input.keyboard?.on('keydown-TWO', () => this.answerButtons[1]?.emit('pointerdown'));
    this.input.keyboard?.on('keydown-THREE', () => this.answerButtons[2]?.emit('pointerdown'));
  }

  private createEventBridge() {
    this.listen('mbg:toggle-pause', () => this.togglePause());
    this.listen('mbg:reset-game', () => this.restartScene());
    this.listen('mbg:set-muted', (event) => {
      const muted = Boolean((event as CustomEvent<{ muted?: boolean }>).detail?.muted);
      this.audio.setMuted(muted);
    });
    this.listen('mbg:set-narration-language', (event) => {
      const language = (event as CustomEvent<{ language?: NarrationLanguage }>).detail?.language;
      if (!language || !['en', 'zh'].includes(language) || language === this.settings.narrationLanguage) return;
      this.settings.narrationLanguage = language;
      persistedSettings = { ...this.settings };
      this.audio.setLanguage(language);
      if (this.started && !this.paused && !this.recapActive) {
        this.narrateQuestion(80);
      } else {
        this.audio.speak(language === 'zh' ? '已选择中文语音。' : 'English voice selected.', 40);
      }
      this.publishDebugState();
    });
    this.listen('mbg:set-player-mode', (event) => {
      const mode = (event as CustomEvent<{ mode?: PlayerMode }>).detail?.mode;
      if (!mode || !['pair', 'rae', 'zoe'].includes(mode) || mode === this.settings.playerMode) return;
      this.settings.playerMode = mode;
      persistedSettings = { ...this.settings };
      this.restartScene();
    });
    this.listen('mbg:set-ball-color', (event) => {
      const color = (event as CustomEvent<{ color?: BallColor }>).detail?.color;
      if (!color || !['pink', 'orange', 'yellow'].includes(color)) return;
      this.settings.ballColor = color;
      persistedSettings = { ...this.settings };
      this.dribbleBall?.setTexture(this.ballTexture);
      this.renderVisualCues(this.currentQuestion);
      this.publishDebugState();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.eventCleanups.forEach((cleanup) => cleanup());
      this.eventCleanups = [];
      this.audio.destroy();
    });
  }

  private listen(name: string, handler: EventListener) {
    window.addEventListener(name, handler);
    this.eventCleanups.push(() => window.removeEventListener(name, handler));
  }

  private prepareQuestion() {
    this.activePlayerId = this.getActivePlayer();
    this.createPlayers();
    this.updateQuestionUi();
    this.startDribble();
  }

  private createPlayers() {
    this.dribbleTween?.stop();
    this.shotTrackers.forEach((tracker) => this.tweens.killTweensOf(tracker));
    this.shotTrackers = [];
    if (this.activePlayer) this.tweens.killTweensOf(this.activePlayer);
    if (this.companion) this.tweens.killTweensOf(this.companion);
    if (this.dribbleBall) this.tweens.killTweensOf(this.dribbleBall);
    this.activePlayer?.destroy();
    this.companion?.destroy();
    this.dribbleBall?.destroy();
    this.activePose = '';

    this.activePlayer = this.add.image(ACTIVE_X, ACTIVE_BOTTOM_Y, `${this.activePlayerId}-dribble-high`)
      .setOrigin(0.5, 1)
      .setScale(PLAYER_SCALE[this.activePlayerId])
      .setDepth(12);
    this.tweens.add({
      targets: this.activePlayer,
      y: ACTIVE_BOTTOM_Y - 3,
      duration: 620,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });

    if (this.settings.playerMode === 'pair') {
      const companionId: PlayerId = this.activePlayerId === 'rae' ? 'zoe' : 'rae';
      this.companion = this.add.image(COMPANION_X, COMPANION_BOTTOM_Y, `${companionId}-celebrate`)
        .setOrigin(0.5, 1)
        .setScale(COMPANION_SCALE[companionId])
        .setDepth(11);
      this.tweens.add({
        targets: this.companion,
        y: COMPANION_BOTTOM_Y - 10,
        duration: 620,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
    }

    this.dribbleBall = this.add.image(0, 0, this.ballTexture)
      .setScale(0.54)
      .setDepth(14);
    this.resetBallToDribble();
  }

  private startGame() {
    if (this.started || this.recapActive) return;
    this.started = true;
    this.inputEnabled = true;
    this.startOverlay?.setVisible(false);
    this.audio.unlock();
    this.audio.startMusic();
    this.narrateQuestion();
    this.publishDebugState();
  }

  private updateQuestionUi() {
    const question = this.currentQuestion;
    this.equationText?.setText(`${question.left} ${question.operation} ${question.right} = ?`);
    this.feedbackText?.setText('');
    this.shotText?.setText(`${this.questionIndex + 1} / ${QUESTION_COUNT}`);
    this.scoreText?.setText(String(this.score));
    this.shooterText?.setText(`${this.activePlayerId === 'rae' ? 'Rae' : 'Zoe'}'s shot`);
    this.renderVisualCues(question);
    this.answerButtons.forEach((button, index) => {
      const value = question.choices[index];
      button.setData('value', value);
      (button.getData('label') as Phaser.GameObjects.Text).setText(String(value));
      this.drawAnswerButton(button, 'neutral');
    });
    this.progressDots.forEach((dot, index) => {
      if (index < this.questionIndex) {
        dot.setFillStyle(BALL_COLORS[this.settings.ballColor].base, 1);
      } else if (index === this.questionIndex) {
        dot.setFillStyle(0xf4bb36, 1);
      } else {
        dot.setFillStyle(0xe1e8ec, 0.98);
      }
    });
    this.publishDebugState();
  }

  private renderVisualCues(question: MathQuestion) {
    this.cueContainer?.removeAll(true);
    if (!this.cueContainer) return;
    if (question.operation === '-') {
      this.addCueGroup(this.cueContainer, question.left, 0, question.right);
      return;
    }

    this.addCueGroup(this.cueContainer, question.left, -158);
    this.cueContainer.add(this.add.text(0, -6, question.operation, {
      color: '#b64a72',
      fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
      fontSize: '52px',
      fontStyle: 'bold',
    }).setOrigin(0.5));
    this.addCueGroup(this.cueContainer, question.right, 158);
  }

  private addCueGroup(
    container: Phaser.GameObjects.Container,
    count: number,
    centerX: number,
    crossedOutCount = 0,
  ) {
    if (count === 0) {
      container.add(this.add.text(centerX, -4, '0', {
        color: '#53606d',
        fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
        fontSize: '44px',
        fontStyle: 'bold',
      }).setOrigin(0.5));
      return;
    }

    const columns = Math.min(5, count);
    const rows = Math.ceil(count / 5);
    const spacing = 42;
    for (let index = 0; index < count; index += 1) {
      const row = Math.floor(index / 5);
      const rowCount = row === rows - 1 ? count - row * 5 : columns;
      const column = index % 5;
      const x = centerX + (column - (rowCount - 1) / 2) * spacing;
      const y = rows === 1 ? -4 : -26 + row * 45;
      container.add(this.add.image(x, y, this.ballTexture).setScale(0.29));
      if (index >= count - crossedOutCount) {
        const strike = this.add.graphics();
        strike.lineStyle(6, 0xb83f5f, 1);
        strike.beginPath();
        strike.moveTo(x - 16, y - 16);
        strike.lineTo(x + 16, y + 16);
        strike.moveTo(x + 16, y - 16);
        strike.lineTo(x - 16, y + 16);
        strike.strokePath();
        container.add(strike);
      }
    }
  }

  private drawAnswerButton(button: Phaser.GameObjects.Container, state: AnswerState) {
    const background = button.getData('background') as Phaser.GameObjects.Graphics;
    background.clear();
    const fill = state === 'correct' ? 0xe8f8dd : state === 'wrong' ? 0xffe1df : 0xffffff;
    const line = state === 'correct' ? 0x70bf61 : state === 'wrong' ? 0xe97872 : 0xf36f9b;
    background.fillStyle(fill, 0.98);
    background.fillRoundedRect(-82, -60, 164, 120, 20);
    background.lineStyle(5, line, 0.98);
    background.strokeRoundedRect(-82, -60, 164, 120, 20);
  }

  private submitAnswer(value: number, selectedButton: Phaser.GameObjects.Container) {
    const question = this.currentQuestion;
    const correct = value === question.answer;
    this.inputEnabled = false;
    this.stopDribble();
    this.answerButtons.forEach((button) => this.drawAnswerButton(button, 'neutral'));
    this.drawAnswerButton(selectedButton, correct ? 'correct' : 'wrong');

    if (correct) {
      if (this.wrongAttempts === 0) this.firstTryScore += 1;
      this.feedbackText?.setText('Great shot!');
      this.audio.speak(this.localized('Great shot!', '投得好！'), 160);
      this.shootBall(true);
    } else {
      this.wrongAttempts += 1;
      const correctButton = this.answerButtons.find((button) => button.getData('value') === question.answer);
      if (correctButton) this.drawAnswerButton(correctButton, 'correct');
      this.feedbackText?.setText(`Almost! The answer is ${question.answer}. Try again.`);
      this.shootBall(false);
    }
    this.publishDebugState();
  }

  private shootBall(isCorrect: boolean) {
    if (!this.dribbleBall || !this.activePlayer) return;
    const ball = this.dribbleBall;
    this.setActivePose('gather');
    ball.setPosition(this.activePlayer.x + this.handOffsetX, ACTIVE_BOTTOM_Y - 190).setDepth(16);
    this.tweens.add({
      targets: ball,
      y: ACTIVE_BOTTOM_Y - 222,
      duration: 220,
      ease: 'Sine.out',
      onComplete: () => {
        this.setActivePose('release');
        const start = { x: ball.x, y: ball.y };
        const rimTarget = isCorrect
          ? { x: HOOP_X, y: HOOP_Y + 4 }
          : { x: HOOP_X - 48, y: HOOP_Y - 4 };
        this.animateBallPath(
          ball,
          [
            start,
            { x: start.x + 280, y: 235 },
            { x: HOOP_X - 280, y: 112 },
            rimTarget,
          ],
          900,
          () => {
            if (isCorrect) {
              this.finishMadeShot(ball);
            } else {
              this.finishMissedShot(ball);
            }
          },
        );
      },
    });
  }

  private finishMadeShot(ball: Phaser.GameObjects.Image) {
    this.audio.swish();
    this.netSwish();
    this.score += 1;
    this.scoreText?.setText(String(this.score));
    this.playSupporterCheer();
    ball.setDepth(17);
    this.animateBallPath(
      ball,
      [
        { x: HOOP_X, y: HOOP_Y + 4 },
        { x: HOOP_X + 4, y: HOOP_Y + 95 },
        { x: HOOP_X + 34, y: FLOOR_Y - 96 },
        { x: HOOP_X + 54, y: FLOOR_Y },
      ],
      560,
      () => this.animateFloorBounces(ball, () => this.advanceQuestion()),
    );
    this.publishDebugState();
  }

  private finishMissedShot(ball: Phaser.GameObjects.Image) {
    this.audio.rim();
    this.rimBounce();
    this.animateBallPath(
      ball,
      [
        { x: HOOP_X - 48, y: HOOP_Y - 4 },
        { x: HOOP_X - 160, y: HOOP_Y + 48 },
        { x: HOOP_X - 262, y: FLOOR_Y - 210 },
        { x: HOOP_X - 330, y: FLOOR_Y },
      ],
      620,
      () => this.animateFloorBounces(ball, () => this.enableRetry()),
    );
  }

  private animateBallPath(
    ball: Phaser.GameObjects.Image,
    points: Array<{ x: number; y: number }>,
    duration: number,
    onComplete: () => void,
  ) {
    const progress = { value: 0 };
    this.shotTrackers.push(progress);
    this.tweens.add({
      targets: progress,
      value: 1,
      duration,
      ease: 'Sine.inOut',
      onUpdate: () => {
        if (!ball.active) return;
        const point = this.cubicBezier(points, progress.value);
        ball.setPosition(point.x, point.y);
        ball.angle += 9;
      },
      onComplete: () => {
        this.shotTrackers = this.shotTrackers.filter((tracker) => tracker !== progress);
        if (ball.active) onComplete();
      },
    });
  }

  private cubicBezier(points: Array<{ x: number; y: number }>, t: number) {
    const [a, b, c, d] = points;
    const inverse = 1 - t;
    return {
      x: inverse ** 3 * a.x + 3 * inverse ** 2 * t * b.x + 3 * inverse * t ** 2 * c.x + t ** 3 * d.x,
      y: inverse ** 3 * a.y + 3 * inverse ** 2 * t * b.y + 3 * inverse * t ** 2 * c.y + t ** 3 * d.y,
    };
  }

  private animateFloorBounces(ball: Phaser.GameObjects.Image, onComplete: () => void) {
    this.audio.bounce();
    this.tweens.add({
      targets: ball,
      x: ball.x + 102,
      y: FLOOR_Y - 104,
      duration: 250,
      ease: 'Quad.out',
      onComplete: () => {
        this.tweens.add({
          targets: ball,
          x: ball.x + 86,
          y: FLOOR_Y,
          duration: 250,
          ease: 'Quad.in',
          onComplete: () => {
            this.audio.bounce();
            this.tweens.add({
              targets: ball,
              x: ball.x + 62,
              y: FLOOR_Y - 48,
              duration: 170,
              ease: 'Quad.out',
              yoyo: true,
              onComplete,
            });
          },
        });
      },
    });
  }

  private enableRetry() {
    this.setActivePose('dribble-high');
    this.resetBallToDribble();
    this.startDribble();
    this.inputEnabled = true;
    this.audio.speak(this.localized(
      `The answer is ${this.currentQuestion.answer}. Try again.`,
      `答案是 ${this.currentQuestion.answer}。再试一次。`,
    ), 120);
    this.publishDebugState();
  }

  private advanceQuestion() {
    if (this.questionIndex >= QUESTION_COUNT - 1) {
      this.showRecap();
      return;
    }

    this.questionIndex += 1;
    this.wrongAttempts = 0;
    this.activePlayerId = this.getActivePlayer();
    this.createPlayers();
    this.updateQuestionUi();
    this.startDribble();
    this.inputEnabled = true;
    this.narrateQuestion();
    this.publishDebugState();
  }

  private narrateQuestion(delay = 180) {
    const question = this.currentQuestion;
    if (this.settings.narrationLanguage === 'zh') {
      const operation = question.operation === '+' ? '加' : '减';
      this.audio.speak(`${question.left} ${operation} ${question.right}。数一数篮球。答案是多少？`, delay);
      return;
    }
    const operation = question.operation === '+' ? 'plus' : 'minus';
    this.audio.speak(`${question.left} ${operation} ${question.right}. Count the basketballs. What is the answer?`, delay);
  }

  private startDribble() {
    if (!this.dribbleBall || !this.activePlayer) return;
    this.dribbleTween?.stop();
    const ball = this.dribbleBall;
    const topY = ACTIVE_BOTTOM_Y - 144;
    const bottomY = FLOOR_Y - 22;
    ball.setVisible(true).setTexture(this.ballTexture).setDepth(14);
    ball.setPosition(this.activePlayer.x + this.handOffsetX, topY);
    this.dribbleTween = this.tweens.add({
      targets: ball,
      y: bottomY,
      angle: 110,
      duration: 360,
      yoyo: true,
      repeat: -1,
      ease: 'Quad.in',
      onUpdate: () => {
        const ratio = Phaser.Math.Clamp((ball.y - topY) / (bottomY - topY), 0, 1);
        this.setActivePose(ratio > 0.58 ? 'dribble-low' : ratio > 0.28 ? 'dribble-recover' : 'dribble-high');
      },
      onYoyo: () => this.audio.bounce(),
    });
  }

  private stopDribble() {
    this.dribbleTween?.stop();
    this.dribbleTween = undefined;
  }

  private resetBallToDribble() {
    if (!this.dribbleBall || !this.activePlayer) return;
    this.dribbleBall
      .setTexture(this.ballTexture)
      .setScale(0.54)
      .setAngle(0)
      .setPosition(this.activePlayer.x + this.handOffsetX, ACTIVE_BOTTOM_Y - 144)
      .setVisible(true)
      .setDepth(14);
  }

  private setActivePose(pose: string) {
    if (!this.activePlayer || this.activePose === pose) return;
    this.activePose = pose;
    this.activePlayer.setTexture(`${this.activePlayerId}-${pose}`);
  }

  private netSwish() {
    if (!this.net) return;
    this.tweens.add({
      targets: this.net,
      y: HOOP_Y + 32,
      scaleY: 1.3,
      angle: 4,
      duration: 150,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.inOut',
      onComplete: () => this.net?.setPosition(HOOP_X, HOOP_Y + 16).setScale(1).setAngle(0),
    });
  }

  private rimBounce() {
    if (!this.net) return;
    this.tweens.add({
      targets: this.net,
      x: HOOP_X - 7,
      angle: -4,
      duration: 90,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.inOut',
      onComplete: () => this.net?.setPosition(HOOP_X, HOOP_Y + 16).setAngle(0),
    });
  }

  private playSupporterCheer() {
    this.setActivePose('celebrate');
    this.companion?.setTexture(`${this.activePlayerId === 'rae' ? 'zoe' : 'rae'}-celebrate`);
    [560, 700, 840, 980, 1120, 1260].forEach((x, index) => {
      const heart = this.add.text(x, 610 - (index % 2) * 24, '♡', {
        color: '#f36f9b',
        fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
        fontSize: '38px',
        fontStyle: 'bold',
        stroke: '#ffffff',
        strokeThickness: 5,
      }).setOrigin(0.5).setDepth(25);
      this.tweens.add({
        targets: heart,
        y: heart.y - 88,
        alpha: 0,
        scale: 1.32,
        duration: 760 + index * 45,
        ease: 'Quad.out',
        onComplete: () => heart.destroy(),
      });
    });
  }

  private showRecap() {
    this.inputEnabled = false;
    this.recapActive = true;
    this.stopDribble();
    this.dribbleBall?.setVisible(false);
    this.progressDots.forEach((dot) => dot.setFillStyle(BALL_COLORS[this.settings.ballColor].base, 1));
    this.recapOverlay?.setVisible(true);
    this.recapScoreText?.setText('15 / 15 baskets').setVisible(true);
    this.recapFirstTryText?.setText(`First try: ${this.firstTryScore} / 15`).setVisible(true);
    this.audio.speak(this.localized(
      `Hooray! You made all 15 baskets. ${this.firstTryScore} on the first try!`,
      `太棒了！你投进了十五个球。第一次就答对了 ${this.firstTryScore} 题！`,
    ), 180);
    this.publishDebugState();
  }

  private togglePause() {
    if (this.recapActive || !this.started) return;
    this.paused = !this.paused;
    this.time.paused = this.paused;
    if (this.paused) {
      this.tweens.pauseAll();
      this.audio.pause();
    } else {
      this.tweens.resumeAll();
      this.audio.resume();
    }
    this.pauseOverlay?.setVisible(this.paused);
    window.dispatchEvent(new CustomEvent('mbg:pause-state', { detail: { paused: this.paused } }));
  }

  private restartScene() {
    this.time.paused = false;
    this.tweens.resumeAll();
    this.audio.reset();
    this.questions = generateQuestionSet();
    this.questionIndex = 0;
    this.score = 0;
    this.firstTryScore = 0;
    this.wrongAttempts = 0;
    this.started = false;
    this.paused = false;
    this.recapActive = false;
    this.inputEnabled = false;
    this.pauseOverlay?.setVisible(false);
    this.recapOverlay?.setVisible(false);
    this.recapScoreText?.setVisible(false);
    this.recapFirstTryText?.setVisible(false);
    this.startOverlay?.setVisible(true);
    this.activePlayerId = this.getActivePlayer();
    this.createPlayers();
    this.updateQuestionUi();
    this.startDribble();
    window.dispatchEvent(new CustomEvent('mbg:pause-state', { detail: { paused: false } }));
  }

  private getActivePlayer(): PlayerId {
    if (this.settings.playerMode === 'rae') return 'rae';
    if (this.settings.playerMode === 'zoe') return 'zoe';
    return this.questionIndex % 2 === 0 ? 'rae' : 'zoe';
  }

  private get currentQuestion() {
    return this.questions[this.questionIndex];
  }

  private get handOffsetX() {
    return this.activePlayerId === 'rae' ? 66 : 56;
  }

  private get ballTexture() {
    return `ball-${this.settings.ballColor}`;
  }

  private localized(english: string, mandarin: string) {
    return this.settings.narrationLanguage === 'zh' ? mandarin : english;
  }

  private publishDebugState() {
    const question = this.currentQuestion;
    if (!question) return;
    (window as BasketballDebugWindow).__mbgDebug = {
      activePlayer: this.activePlayerId,
      answer: question.answer,
      ballColor: this.settings.ballColor,
      choices: question.choices,
      firstTryScore: this.firstTryScore,
      inputEnabled: this.inputEnabled,
      narrationLanguage: this.settings.narrationLanguage,
      operation: `${question.left} ${question.operation} ${question.right}`,
      playerMode: this.settings.playerMode,
      questionIndex: this.questionIndex,
      recapActive: this.recapActive,
      score: this.score,
      started: this.started,
      wrongAttempts: this.wrongAttempts,
      zeroQuestionCount: this.questions.filter(({ left, right, answer }) => (
        left === 0 || right === 0 || answer === 0
      )).length,
    };
  }
}
