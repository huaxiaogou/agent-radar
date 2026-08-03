const plan = JSON.parse(process.env.RADAR_TEST_CONCEPT_BACKFILL_PLAN || "[]");
let cursor = 0;

globalThis.fetch = async (input) => {
  const url = String(input);
  if (!url.includes("/chat/completions")) {
    throw new Error(`概念回填测试 Provider 拒绝非分析请求：${url}`);
  }
  const payload = plan[cursor];
  cursor += 1;
  if (!payload) {
    throw new Error(`概念回填测试 Provider 不应收到第 ${cursor} 次请求`);
  }
  return new Response(JSON.stringify({
    choices: [{
      finish_reason: "stop",
      message: { content: JSON.stringify(payload) },
    }],
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
