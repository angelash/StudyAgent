import type { ClassroomAnswerDisposition, ClassroomAnswerReceipt, ClassroomSelectionMode } from './classroom';

/** Normalizes order only. Invalid, duplicated or contradictory selections remain errors. */
export function normalizeClassroomSelection(mode: ClassroomSelectionMode, optionCount: number, selection: unknown,
  disposition: ClassroomAnswerDisposition): number[] {
  if (!['single', 'multiple'].includes(mode) || !Number.isInteger(optionCount) || optionCount < 2 || optionCount > (mode === 'multiple' ? 8 : 21))
    throw new RangeError('本题选择方式或选项结构暂不可用');
  if (!Array.isArray(selection) || selection.length > optionCount || selection.some(value => !Number.isInteger(value) || value < 0 || value >= optionCount))
    throw new RangeError('选项无效，请核对本题可选范围');
  if (new Set(selection).size !== selection.length) throw new RangeError('同一个选项不能重复提交');
  if (!['answered', 'skip', 'dont_know'].includes(disposition)) throw new RangeError('作答状态无效');
  if (disposition !== 'answered' && selection.length) throw new RangeError('跳过或不会时不能同时提交已选选项');
  if (disposition === 'answered' && !selection.length) throw new RangeError('请先选择本题答案');
  if (mode === 'single' && selection.length > 1) throw new RangeError('本题只选择一个选项');
  return [...selection].sort((a, b) => a - b);
}

/** Old frozen single-choice receipts retain their original meaning without a migration. */
export function classroomReceiptSelection(receipt: Pick<ClassroomAnswerReceipt, 'selectedIndex' | 'selectedIndices'>): number[] {
  return receipt.selectedIndices ? [...receipt.selectedIndices] : receipt.selectedIndex === null ? [] : [receipt.selectedIndex];
}
