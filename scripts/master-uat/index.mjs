import { CHAPTER_01, CHAPTER_02 } from './chapter01-02.mjs';
import { CHAPTER_03 } from './chapter03.mjs';
import { CHAPTER_04, CHAPTER_05 } from './chapter04-05.mjs';
import { CHAPTER_06 } from './chapter06-07.mjs';
import { CHAPTER_07 } from './chapter07-procurement.mjs';
import { CHAPTER_08 } from './chapter08-investment.mjs';
import { CHAPTER_09, CHAPTER_10, CHAPTER_11 } from './chapter08-10.mjs';
import { CHAPTER_12 } from './chapter11.mjs';
import { EXCLUDED_FEATURES } from './helpers.mjs';

/** @type {import('./helpers.mjs').UatChapter[]} */
export const CHAPTERS = [
  CHAPTER_01,
  CHAPTER_02,
  CHAPTER_03,
  CHAPTER_04,
  CHAPTER_05,
  CHAPTER_06,
  CHAPTER_07,
  CHAPTER_08,
  CHAPTER_09,
  CHAPTER_10,
  CHAPTER_11,
  CHAPTER_12,
];

export const ALL_CASES = CHAPTERS.flatMap((c) => c.cases);

export function getCoverageSummary() {
  const chapters = CHAPTERS.map((ch) => {
    const moduleNames = [...new Set(ch.cases.map((c) => c.module))];
    const notImplemented = ch.cases.filter((c) => c.notImplemented).length;
    return {
      chapter: ch.number,
      title: ch.title,
      idRange: ch.idRange,
      total: ch.cases.length,
      notImplemented,
      modules: moduleNames.join(', '),
    };
  });

  const totalCases = ALL_CASES.length;
  const totalNotImplemented = ALL_CASES.filter((c) => c.notImplemented).length;
  const implementedCases = totalCases - totalNotImplemented;

  return {
    chapters,
    totalCases,
    implementedCases,
    notImplementedCases: totalNotImplemented,
    excludedFeatures: EXCLUDED_FEATURES,
    modulesCovered: [...new Set(ALL_CASES.map((c) => c.module))].sort(),
  };
}

export { EXCLUDED_FEATURES };
