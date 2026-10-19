export type TeachingAuthor = (id: string, explanation: string, prompt: string, steps: string[], conclusion: string,
  observation: string, alternatives: string[], checks: [string, string, string, string]) => void;

/** Shared lesson rhythm; concepts, examples, misconceptions and transfer checks are authored per point. */
export function mathematicalLesson(author: TeachingAuthor, prefix: string) {
  return (code: string, explanation: string, prompt: string, steps: string[], conclusion: string,
    observation: string, cause: string, understanding: string, transfer: string) => author(prefix + code, explanation, prompt,
    steps, conclusion, observation, [cause, '也可能已经理解关系，但读数、计算或记录出现遗漏，应分开检查。'],
    [understanding, '撤去示范，用新数值独立完成同一操作，记录关键步骤，再用逆运算、实物或图形核对。', transfer,
      '三天后更换数值与材料，用基础题和新情境各检查一次；不先给提示，分别保留步骤与受助记录。']);
}

export function languageLesson(author: TeachingAuthor, prefix: string) {
  return (code: string, explanation: string, prompt: string, steps: string[], conclusion: string,
    observation: string, cause: string, understanding: string, transfer: string) => author(prefix + code, explanation, prompt,
    steps, conclusion, observation, [cause, '也可能是个别词语、读写负担或表达方式造成困难，先降低无关负担再对照。'],
    [understanding, '撤去例句，换一段同难度的新材料，先定位关键词句，再独立判断或表达；不补造材料外的信息。', transfer,
      '间隔三天换新主题和新词句，不先提供同句示范；分别记录独立完成、提示与需要复核的部分。']);
}
