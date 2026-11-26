// 브라우저 저장소(localStorage) 래퍼.
// 사생활 보호 모드·저장 차단 등으로 실패할 수 있어 모든 접근을 try/catch로 감쌉니다.
// 저장한 내용은 이 기기·이 브라우저에만 남으므로, 백업(내보내기/가져오기)을 제공합니다.

const PREFIX = "maple-tracker:";
const APP_ID = "maple-tracker";
export const BACKUP_VERSION = 1;

function storage(s) {
  if (s) return s;
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export function load(key, fallback, s) {
  try {
    const v = storage(s)?.getItem(PREFIX + key);
    return v == null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}

export function save(key, value, s) {
  try { storage(s).setItem(PREFIX + key, JSON.stringify(value)); return true; } catch { return false; }
}

export function remove(key, s) {
  try { storage(s).removeItem(PREFIX + key); } catch { /* 무시 */ }
}

export function available(s) {
  const st = storage(s);
  try { st.setItem(PREFIX + "__t", "1"); st.removeItem(PREFIX + "__t"); return true; } catch { return false; }
}

export function exportAll(s) {
  const data = {};
  const st = storage(s);
  try {
    for (let i = 0; i < st.length; i++) {
      const k = st.key(i);
      if (k?.startsWith(PREFIX) && k !== PREFIX + "__t") {
        try { data[k.slice(PREFIX.length)] = JSON.parse(st.getItem(k)); } catch { /* 깨진 값은 건너뜀 */ }
      }
    }
  } catch { /* 저장소 없음 */ }
  return { app: APP_ID, version: BACKUP_VERSION, exported_at: new Date().toISOString(), data };
}

/** 백업 객체를 저장소에 씁니다. 반환: 저장한 항목 수. 형식이 틀리면 Error */
export function importAll(obj, s) {
  if (!obj || obj.app !== APP_ID || typeof obj.data !== "object" || obj.data === null) {
    throw new Error("메이플 트래커 백업 파일이 아닙니다.");
  }
  if (obj.version > BACKUP_VERSION) throw new Error("더 새로운 버전에서 만든 백업입니다. 페이지를 새로고침한 뒤 다시 시도하세요.");
  let n = 0;
  for (const [k, v] of Object.entries(obj.data)) if (save(k, v, s)) n++;
  return n;
}
