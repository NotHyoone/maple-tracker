// 스타포스 모의 시행을 화면과 분리된 스레드에서 실행
import { simulate } from "./starforce.js";

self.onmessage = (e) => {
  const { id, rules, params } = e.data;
  try {
    const result = simulate(rules, params, { runs: 10000, maxSteps: 2e7, deadline: Date.now() + 3000 });
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
