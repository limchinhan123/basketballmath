import Phaser from 'phaser';
import { BasketballScene } from './BasketballScene';

export function createMathBasketballGame(parent: HTMLElement) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 1600,
    height: 900,
    backgroundColor: '#8fdfff',
    scale: {
      mode: Phaser.Scale.EXPAND,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      fullscreenTarget: parent,
    },
    render: {
      antialias: true,
      pixelArt: false,
    },
    scene: [BasketballScene],
  });
}
