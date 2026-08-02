const plan = JSON.parse(process.env.RADAR_TEST_BACKFILL_PLAN || "[]");
let cursor = 0;

function validAnalysis(title) {
  return {
    title,
    summary: "官方材料说明了检查点、审批和工具调用恢复的完整工程机制。",
    implication: "团队应保留原文链接，并在真实代码库中验证中断恢复和权限边界。",
    topic: "工程",
    conceptSlug: "agent-harness",
    stage: "Emerging",
    accent: "engineering",
    tags: ["agent-harness", "durable-execution"],
    publishDecision: "publish",
    editorialScore: 82,
    relevanceScore: 90,
    noveltyScore: 76,
    evidenceScore: 88,
    eventKey: "agent-harness:backfill-cli-recovery",
    candidateConcept: "",
  };
}

globalThis.fetch = async (input) => {
  const url = String(input);
  if (!url.includes("/chat/completions")) throw new Error(`测试 Provider 拒绝非分析请求：${url}`);
  const step = plan[cursor];
  cursor += 1;
  if (!step) throw new Error(`测试 Provider 缺少第 ${cursor} 个响应`);
  if (step.status) {
    return new Response(step.body || "planned provider failure", {
      status: step.status,
      headers: { "content-type": "text/plain" },
    });
  }
  return new Response(JSON.stringify({
    choices: [{
      finish_reason: "stop",
      message: { content: JSON.stringify(validAnalysis(step.title)) },
    }],
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
