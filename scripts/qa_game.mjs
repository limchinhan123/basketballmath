import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const BASE_URL = process.env.MBG_BASE_URL ?? 'http://127.0.0.1:5176/';
const QA_DIR = new URL('../qa/', import.meta.url);
const ANSWER_X = [586, 790, 994];
const ANSWER_Y = 740;
const SCALE = 0.8;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const canvas = page.locator('canvas');
const errors = [];
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});

const debug = () => page.evaluate(() => window.__mbgDebug);
const screenshot = async (name) => {
  await page.screenshot({ path: fileURLToPath(new URL(name, QA_DIR)) });
};
const answerAt = async (index) => {
  await canvas.click({ position: { x: ANSWER_X[index] * SCALE, y: ANSWER_Y * SCALE } });
};
const correctAnswer = async () => {
  const state = await debug();
  const index = state.choices.indexOf(state.answer);
  if (index < 0) throw new Error(`Missing correct answer for ${JSON.stringify(state)}`);
  await answerAt(index);
};
const waitForInput = async () => {
  await page.waitForFunction(() => window.__mbgDebug?.inputEnabled === true, null, { timeout: 5000 });
};
const waitForNextShot = async (shot) => {
  try {
    if (shot === 14) {
      await page.waitForFunction(() => window.__mbgDebug?.recapActive === true, null, { timeout: 8000 });
    } else {
      await page.waitForFunction((nextShot) => window.__mbgDebug?.questionIndex === nextShot, shot + 1, { timeout: 8000 });
    }
  } catch (error) {
    await screenshot(`failure-shot-${shot + 1}.png`);
    throw new Error(`Shot ${shot + 1} did not finish: ${JSON.stringify(await debug())}`, { cause: error });
  }
};
const startGame = async () => {
  await canvas.click({ position: { x: 640, y: 443 } });
  await waitForInput();
};

await mkdir(QA_DIR, { recursive: true });
await page.goto(BASE_URL);
await page.waitForFunction(() => window.__mbgDebug?.questionIndex === 0, null, { timeout: 8000 });
await screenshot('01-start-overlay.png');

await startGame();
await page.waitForTimeout(330);
await screenshot('02-dribble.png');

const firstQuestion = await debug();
const wrongIndex = firstQuestion.choices.findIndex((value) => value !== firstQuestion.answer);
await answerAt(wrongIndex);
await page.waitForTimeout(430);
await screenshot('03-missed-shot.png');
await waitForInput();
await screenshot('04-retry-feedback.png');
const retryState = await debug();
if (retryState.questionIndex !== 0 || retryState.wrongAttempts !== 1) {
  throw new Error(`Wrong answer did not preserve the question for retry: ${JSON.stringify(retryState)}`);
}

await correctAnswer();
await page.waitForTimeout(1230);
await screenshot('05-net-swish.png');
await page.waitForFunction(() => window.__mbgDebug?.questionIndex === 1, null, { timeout: 5000 });
const rotationState = await debug();
if (rotationState.activePlayer !== 'zoe') {
  throw new Error(`Pair mode did not rotate to Zoe: ${JSON.stringify(rotationState)}`);
}
await screenshot('06-zoe-turn.png');

await page.locator('button[aria-label="Yellow basketball"]').click();
await page.waitForTimeout(350);
const yellowState = await debug();
if (yellowState.ballColor !== 'yellow') {
  throw new Error(`Ball color did not update: ${JSON.stringify(yellowState)}`);
}
await screenshot('07-yellow-ball.png');

await page.locator('button[aria-label="Orange basketball"]').click();
await page.waitForTimeout(250);
const orangeState = await debug();
if (orangeState.ballColor !== 'orange') {
  throw new Error(`Orange ball color did not update: ${JSON.stringify(orangeState)}`);
}
await screenshot('07b-orange-ball.png');

await page.locator('button[aria-label="Mandarin narration"]').click();
await page.waitForFunction(() => window.__mbgDebug?.narrationLanguage === 'zh', null, { timeout: 5000 });
const mandarinState = await debug();
await screenshot('07c-mandarin-narration.png');

await page.locator('button[aria-label="English narration"]').click();
await page.waitForFunction(() => window.__mbgDebug?.narrationLanguage === 'en', null, { timeout: 5000 });

await page.locator('button[aria-label="Yellow basketball"]').click();
await page.locator('button[aria-label="Zoe player mode"]').click();
await page.waitForTimeout(300);
await page.waitForFunction(() => window.__mbgDebug?.playerMode === 'zoe', null, { timeout: 5000 });
await page.waitForTimeout(300);
const singleZoeState = await debug();
await screenshot('08-single-zoe.png');

await page.locator('button[aria-label="Rae player mode"]').click();
await page.waitForFunction(() => window.__mbgDebug?.playerMode === 'rae', null, { timeout: 5000 });
await page.waitForTimeout(300);
const singleRaeState = await debug();
await screenshot('08b-single-rae.png');

await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(250);
const portraitHint = await page.locator('.portrait-hint').evaluate((element) => getComputedStyle(element).display);
if (portraitHint !== 'grid') throw new Error(`Portrait hint was not visible: ${portraitHint}`);
await screenshot('09-portrait-hint.png');

await page.setViewportSize({ width: 1280, height: 720 });
await page.locator('button[aria-label="Rae and Zoe player mode"]').click();
await page.locator('button[aria-label="Pink basketball"]').click();
await page.getByRole('button', { name: 'Stop & Reset' }).click();
await page.waitForFunction(() => window.__mbgDebug?.questionIndex === 0 && window.__mbgDebug?.started === false, null, { timeout: 5000 });
await startGame();

for (let shot = 0; shot < 15; shot += 1) {
  await waitForInput();
  const before = await debug();
  if (before.questionIndex !== shot) {
    throw new Error(`Expected question ${shot}, got ${JSON.stringify(before)}`);
  }
  await correctAnswer();
  await waitForNextShot(shot);
}

const recapState = await debug();
if (recapState.score !== 15 || recapState.firstTryScore !== 15 || !recapState.recapActive) {
  throw new Error(`Unexpected recap state: ${JSON.stringify(recapState)}`);
}
await screenshot('10-recap.png');

const summary = {
  firstQuestion,
  retryState,
  rotationState,
  yellowState,
  orangeState,
  mandarinState,
  singleZoeState,
  singleRaeState,
  recapState,
  errors,
};
await writeFile(new URL('qa-summary.json', QA_DIR), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
await browser.close();
