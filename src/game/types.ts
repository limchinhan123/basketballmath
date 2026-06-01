export type PlayerMode = 'pair' | 'rae' | 'zoe';

export type BallColor = 'pink' | 'orange' | 'yellow';

export type NarrationLanguage = 'en' | 'zh';

export type PlayerId = 'rae' | 'zoe';

export type Operation = '+' | '-';

export interface MathQuestion {
  id: string;
  left: number;
  operation: Operation;
  right: number;
  answer: number;
  choices: number[];
}

export interface GameSettings {
  playerMode: PlayerMode;
  ballColor: BallColor;
  narrationLanguage: NarrationLanguage;
}
