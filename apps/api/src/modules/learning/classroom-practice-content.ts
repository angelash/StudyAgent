import { practiceUnit1 } from './classroom-practice-u1';
import { practiceUnit2 } from './classroom-practice-u2';
import { practiceUnit3 } from './classroom-practice-u3';
import { practiceUnit4 } from './classroom-practice-u4';
import { practiceUnit5 } from './classroom-practice-u5';
import type { PracticeUnit } from './classroom-practice-model';

export const CLASSROOM_PRACTICE_VERSION = '2026-10-24.1';
export const practiceVariations: PracticeUnit = { ...practiceUnit1, ...practiceUnit2, ...practiceUnit3, ...practiceUnit4, ...practiceUnit5 };
