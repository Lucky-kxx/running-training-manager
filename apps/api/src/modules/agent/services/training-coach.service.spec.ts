import { readCoachFeedback } from './training-coach.service';

describe('readCoachFeedback', () => {
  it.each([
    ['我今天跑完这个10k感觉非常累，rpe8', 0.8, 10000],
    ['今天跑了十公里，RPE八。', 0.8, 10000],
    ['3.5 km easy, RPE 4.5/10', 0.45, 3500],
    ['跑完 ５公里，ＲＰＥ：０', 0, 5000],
  ])('reads %s', (message, rpe, distance) => {
    expect(readCoachFeedback(message)).toEqual({
      rpe,
      distance,
      multipleDistances: false,
    });
  });

  it.each([
    'RPE 18',
    'RPE 7.8',
    'RPE 10.5',
    'RPE 8/20',
    'RPE 8 还是 RPE 9',
    'RPE 8 可以吗？',
    '不要记录 RPE 8',
  ])('does not write from %s', (message) =>
    expect(readCoachFeedback(message)).toBeNull(),
  );
});
