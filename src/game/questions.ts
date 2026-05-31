import type { MathQuestion, Operation } from './types';

const QUESTION_COUNT = 15;

const shuffle = <T,>(items: T[]) => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
};

const createQuestion = (left: number, operation: Operation, right: number): MathQuestion => {
  const answer = operation === '+' ? left + right : left - right;
  const choicePool = Array.from({ length: 11 }, (_, value) => value)
    .filter((value) => value !== answer)
    .sort((a, b) => Math.abs(a - answer) - Math.abs(b - answer) || Math.random() - 0.5)
    .slice(0, 6);
  const distractors = shuffle(choicePool).slice(0, 2);

  return {
    id: `${left}${operation}${right}-${Math.random().toString(36).slice(2)}`,
    left,
    operation,
    right,
    answer,
    choices: shuffle([answer, ...distractors]),
  };
};

export function generateQuestionSet(): MathQuestion[] {
  const additions: Array<[number, Operation, number]> = [];
  const subtractions: Array<[number, Operation, number]> = [];
  const zeroConcepts: Array<[number, Operation, number]> = [];

  for (let left = 0; left <= 10; left += 1) {
    for (let right = 0; right <= 10; right += 1) {
      if (left > 0 && right > 0 && left + right <= 10) additions.push([left, '+', right]);
      if (left > right && right > 0) subtractions.push([left, '-', right]);
      if (
        (left + right <= 10 && left + right > 0 && (left === 0 || right === 0))
        || (left > 0 && (right === 0 || left === right))
      ) {
        zeroConcepts.push([left, left >= right ? '-' : '+', right]);
      }
    }
  }

  const zeroQuestion = Math.random() < 0.35 ? shuffle(zeroConcepts)[0] : undefined;
  const additionCount = zeroQuestion?.[1] === '+' ? 7 : 8;
  const subtractionCount = zeroQuestion?.[1] === '-' ? 6 : 7;
  const mixed = shuffle([
    ...shuffle(additions).slice(0, additionCount),
    ...shuffle(subtractions).slice(0, subtractionCount),
    ...(zeroQuestion ? [zeroQuestion] : []),
  ]);

  return mixed.slice(0, QUESTION_COUNT).map(([left, operation, right]) => (
    createQuestion(left, operation, right)
  ));
}
