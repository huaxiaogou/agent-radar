const LLM_ANALYSIS_MODES = new Set(["openai", "deepseek"]);

const MINIMUM_HAN_CHARACTERS = {
  title: 2,
  summary: 8,
  implication: 8,
};

const MINIMUM_HAN_RATIOS = {
  title: 0.15,
  summary: 0.35,
  implication: 0.35,
};

const JAPANESE_KANA = /[\u3040-\u30ff\u31f0-\u31ff\uff66-\uff9f]/;

function letterCounts(value) {
  const letters = String(value || "").match(/\p{L}/gu) || [];
  const han = letters.filter((letter) => /\p{Script_Extensions=Han}/u.test(letter)).length;
  return { han, total: letters.length };
}

export function chineseEditorialIssue(editorial) {
  for (const [field, minimum] of Object.entries(MINIMUM_HAN_CHARACTERS)) {
    const value = String(editorial?.[field] || "");
    if (JAPANESE_KANA.test(value)) return `${field} 含有明显日文假名，不是中文编辑结果`;
    const { han: count, total: letterCount } = letterCounts(value);
    if (count < minimum) {
      return `${field} 中文内容不足：至少需要 ${minimum} 个汉字，当前 ${count} 个`;
    }
    const ratio = count / letterCount;
    if (ratio < MINIMUM_HAN_RATIOS[field]) {
      return `${field} 不是中文主导内容：汉字占全部 Unicode 字母的比例至少需要 ${Math.round(MINIMUM_HAN_RATIOS[field] * 100)}%`;
    }
  }
  return null;
}

export function hasChineseEditorialFields(editorial) {
  return chineseEditorialIssue(editorial) === null;
}

export function assertChineseEditorialFields(editorial) {
  const issue = chineseEditorialIssue(editorial);
  if (issue) throw new Error(`中文编辑校验失败：${issue}`);
  return editorial;
}

export function isLlmEditorialReady(editorial) {
  const analysisMode = editorial?.analysisMode || editorial?.analysis_mode;
  return LLM_ANALYSIS_MODES.has(analysisMode) && hasChineseEditorialFields(editorial);
}
