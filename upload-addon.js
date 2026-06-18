(function () {
  "use strict";

  const WORKER_URL = "./assets/whisper.worker-BoccgKEl.js";
  const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";
  const GEMINI_MODEL = "gemini-2.5-flash";
  const TARGET_SAMPLE_RATE = 16000;

  let worker = null;
  let workerReadyModel = "";
  let busy = false;

  const state = {
    transcript: "",
    summary: null,
    fileName: "",
  };
  const pendingDeleteKeys = new Set();

  if (window.IDBObjectStore?.prototype?.delete) {
    const originalIdbDelete = window.IDBObjectStore.prototype.delete;
    window.IDBObjectStore.prototype.delete = function patchedIdbDelete(key) {
      if (this.name === "meetings" && key != null) {
        pendingDeleteKeys.add(String(key));
      }
      return originalIdbDelete.call(this, key);
    };
  }

  const originalConfirm = window.confirm.bind(window);
  window.confirm = function patchedConfirm(message) {
    const result = originalConfirm(message);
    if (result && typeof message === "string" && message.includes("회의록을 삭제할까요")) {
      const title = message.match(/"(.+?)"/)?.[1] || getVisibleMeetingTitle();
      setTimeout(() => purgeDeletedMeeting(title), 300);
    }
    return result;
  };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function getApiKey() {
    return (localStorage.getItem("geminiApiKey") || "").trim();
  }

  function setStatus(text, progress) {
    const status = document.getElementById("upload-addon-status");
    const bar = document.getElementById("upload-addon-progress-bar");
    if (status) status.textContent = text || "";
    if (bar && typeof progress === "number") {
      bar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
    }
  }

  function setBusy(nextBusy) {
    busy = nextBusy;
    document.querySelectorAll("[data-upload-addon-busy]").forEach((node) => {
      node.disabled = busy;
    });
  }

  function getVisibleMeetingTitle() {
    const titleNode = document.querySelector(".summary-header-left > div > div:first-child");
    return (titleNode?.textContent || "").trim();
  }

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  async function deleteMatchingRecords(dbName, title, keys) {
    const db = await requestToPromise(indexedDB.open(dbName));
    try {
      const storeNames = Array.from(db.objectStoreNames).filter((name) => name === "meetings");
      if (!storeNames.length || !title) return 0;

      let deleted = 0;
      const transaction = db.transaction(storeNames, "readwrite");
      for (const storeName of storeNames) {
        const store = transaction.objectStore(storeName);
        const cursorRequest = store.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const value = cursor.value || {};
          const valueId = value.id == null ? "" : String(value.id);
          const cursorKey = cursor.key == null ? "" : String(cursor.key);
          if (value.title === title || valueId === title || keys.has(valueId) || keys.has(cursorKey)) {
            cursor.delete();
            deleted += 1;
          }
          cursor.continue();
        };
      }
      await transactionDone(transaction);
      return deleted;
    } finally {
      db.close();
    }
  }

  async function purgeDeletedMeeting(title) {
    if (!window.indexedDB) return;
    const keys = new Set(pendingDeleteKeys);
    pendingDeleteKeys.clear();
    if (!title && keys.size === 0) return;
    try {
      if (typeof indexedDB.databases === "function") {
        const databases = await indexedDB.databases();
        await Promise.all(
          databases
            .map((db) => db.name)
            .filter(Boolean)
            .map((dbName) => deleteMatchingRecords(dbName, title, keys))
        );
      } else {
        await deleteMatchingRecords("MeetNoteDB", title, keys).catch(() => {});
        await deleteMatchingRecords("meetnote", title, keys).catch(() => {});
      }
    } catch (error) {
      console.warn("Failed to purge deleted meeting", error);
    }
  }

  function createWorker() {
    if (worker) return worker;
    worker = new Worker(WORKER_URL, { type: "module" });
    return worker;
  }

  function waitForWorker(type) {
    return new Promise((resolve, reject) => {
      const activeWorker = createWorker();
      const onMessage = (event) => {
        const message = event.data || {};
        if (message.type === "LOAD_PROGRESS") {
          const payload = message.payload || {};
          setStatus(payload.message || "모델 준비 중...", payload.progress || 0);
        }
        if (message.type === type) {
          cleanup();
          resolve(message.payload);
        }
        if (message.type === "MODEL_ERROR" || message.type === "TRANSCRIPT_ERROR") {
          cleanup();
          reject(new Error(message.payload || "처리 중 오류가 발생했습니다."));
        }
      };
      const cleanup = () => activeWorker.removeEventListener("message", onMessage);
      activeWorker.addEventListener("message", onMessage);
    });
  }

  async function loadModel(model) {
    if (workerReadyModel === model) return;
    const activeWorker = createWorker();
    const ready = waitForWorker("MODEL_READY");
    activeWorker.postMessage({ type: "LOAD_MODEL", payload: { model } });
    await ready;
    workerReadyModel = model;
  }

  async function transcribe(audio, language) {
    const activeWorker = createWorker();
    const result = waitForWorker("TRANSCRIPT_RESULT");
    activeWorker.postMessage({
      type: "TRANSCRIBE",
      payload: { audio, language },
    });
    return result;
  }

  function downmixToMono(buffer) {
    if (buffer.numberOfChannels === 1) {
      return buffer.getChannelData(0).slice();
    }
    const length = buffer.length;
    const mono = new Float32Array(length);
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        mono[i] += data[i] / buffer.numberOfChannels;
      }
    }
    return mono;
  }

  function resampleAudio(input, sourceRate, targetRate) {
    if (sourceRate === targetRate) return input;
    const ratio = sourceRate / targetRate;
    const newLength = Math.round(input.length / ratio);
    const output = new Float32Array(newLength);
    for (let i = 0; i < newLength; i += 1) {
      const position = i * ratio;
      const left = Math.floor(position);
      const right = Math.min(left + 1, input.length - 1);
      const mix = position - left;
      output[i] = input[left] * (1 - mix) + input[right] * mix;
    }
    return output;
  }

  async function decodeAudio(file) {
    const arrayBuffer = await file.arrayBuffer();
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error("이 브라우저는 오디오 파일 디코딩을 지원하지 않습니다.");
    }
    const context = new AudioContextClass();
    try {
      const decoded = await context.decodeAudioData(arrayBuffer.slice(0));
      const mono = downmixToMono(decoded);
      return resampleAudio(mono, decoded.sampleRate, TARGET_SAMPLE_RATE);
    } finally {
      if (typeof context.close === "function") {
        await context.close();
      }
    }
  }

  function summaryPrompt(transcript, detail) {
    const detailGuide = detail === "brief"
      ? "간략하게 핵심만 정리하세요."
      : detail === "detailed"
        ? "가능한 한 자세히 정리하세요."
        : "적절한 수준으로 정리하세요.";

    return `당신은 한국어 회의록 분석 전문가입니다. ${detailGuide}
다음 음성 파일 전사 내용을 분석하여 반드시 아래 JSON 형식으로만 응답하세요. JSON 외 다른 텍스트는 절대 포함하지 마세요.

{
  "agenda": ["핵심 안건"],
  "discussions": ["주요 논의 내용"],
  "decisions": ["결정 사항"],
  "actionItems": [{"assignee": "담당자 또는 null", "task": "할 일", "deadline": "기한 또는 null"}],
  "keywords": ["키워드"]
}

전사 내용:
${transcript}`;
  }

  async function summarizeTranscript(transcript, apiKey, detail) {
    const response = await fetch(`${GEMINI_URL}/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: summaryPrompt(transcript, detail) }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error?.error?.message || response.statusText || "Gemini API 오류");
    }
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return JSON.parse(text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
  }

  function renderSummary(summary) {
    const lines = [];
    if (summary.agenda?.length) {
      lines.push("## 핵심 안건", ...summary.agenda.map((item) => `- ${item}`), "");
    }
    if (summary.discussions?.length) {
      lines.push("## 주요 논의 내용", ...summary.discussions.map((item, index) => `${index + 1}. ${item}`), "");
    }
    if (summary.decisions?.length) {
      lines.push("## 결정 사항", ...summary.decisions.map((item) => `- ${item}`), "");
    }
    if (summary.actionItems?.length) {
      lines.push("## 액션 아이템", "| 담당자 | 할 일 | 기한 |", "|---|---|---|");
      summary.actionItems.forEach((item) => {
        lines.push(`| ${item.assignee || "-"} | ${item.task || "-"} | ${item.deadline || "-"} |`);
      });
      lines.push("");
    }
    if (summary.keywords?.length) {
      lines.push("## 키워드", summary.keywords.map((item) => `\`${item}\``).join(" "), "");
    }
    return lines.join("\n").trim();
  }

  function updateOutput() {
    const transcriptNode = document.getElementById("upload-addon-transcript");
    const summaryNode = document.getElementById("upload-addon-summary");
    if (transcriptNode) transcriptNode.value = state.transcript;
    if (summaryNode) summaryNode.value = state.summary ? renderSummary(state.summary) : "";
  }

  async function handleProcess() {
    if (busy) return;
    const fileInput = document.getElementById("upload-addon-file");
    const language = document.getElementById("upload-addon-language")?.value || "ko";
    const model = document.getElementById("upload-addon-model")?.value || "base";
    const detail = document.getElementById("upload-addon-detail")?.value || "normal";
    const file = fileInput?.files?.[0];
    if (!file) {
      setStatus("요약할 음성 파일을 먼저 선택하세요.", 0);
      return;
    }
    const apiKey = getApiKey();
    if (!apiKey) {
      setStatus("Gemini API 키가 없습니다. Streamlib Secrets 또는 설정에서 키를 등록하세요.", 0);
      return;
    }

    setBusy(true);
    state.fileName = file.name;
    state.transcript = "";
    state.summary = null;
    updateOutput();

    try {
      setStatus("오디오 파일을 읽는 중...", 8);
      const audio = await decodeAudio(file);
      setStatus("Whisper 모델을 준비하는 중...", 15);
      await loadModel(model);
      setStatus("음성 파일을 전사하는 중... 긴 파일은 시간이 걸릴 수 있습니다.", 55);
      state.transcript = await transcribe(audio, language);
      updateOutput();
      if (!state.transcript.trim()) {
        throw new Error("전사된 텍스트가 없습니다. 다른 파일을 사용해보세요.");
      }
      setStatus("AI 요약을 생성하는 중...", 82);
      state.summary = await summarizeTranscript(state.transcript, apiKey, detail);
      updateOutput();
      setStatus("요약 완료", 100);
    } catch (error) {
      setStatus(error?.message || "처리 중 오류가 발생했습니다.", 0);
    } finally {
      setBusy(false);
    }
  }

  function downloadMarkdown() {
    const summaryText = document.getElementById("upload-addon-summary")?.value || "";
    const transcriptText = document.getElementById("upload-addon-transcript")?.value || "";
    const title = state.fileName || "uploaded-audio";
    const content = [
      `# ${title}`,
      "",
      summaryText,
      "",
      "## 전체 전사 내용",
      "",
      transcriptText,
      "",
    ].join("\n");
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.replace(/\.[^.]+$/, "")}_summary.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function buildModal() {
    const overlay = el("div", "upload-addon-overlay");
    overlay.id = "upload-addon-overlay";

    const modal = el("div", "upload-addon-modal");
    const head = el("div", "upload-addon-head");
    head.append(el("div", "upload-addon-title", "음성 파일 업로드 요약"));
    const close = el("button", "upload-addon-close", "x");
    close.type = "button";
    close.addEventListener("click", () => overlay.classList.remove("open"));
    head.append(close);

    const body = el("div", "upload-addon-body");
    body.innerHTML = `
      <label class="upload-addon-field">
        <span class="upload-addon-label">음성 파일</span>
        <input id="upload-addon-file" class="upload-addon-input" type="file" accept="audio/*,video/*" />
      </label>
      <label class="upload-addon-field">
        <span class="upload-addon-label">언어</span>
        <select id="upload-addon-language" class="upload-addon-select">
          <option value="ko">한국어</option>
          <option value="en">English</option>
          <option value="auto">자동 감지</option>
        </select>
      </label>
      <label class="upload-addon-field">
        <span class="upload-addon-label">Whisper 모델</span>
        <select id="upload-addon-model" class="upload-addon-select">
          <option value="base">Base - 균형</option>
          <option value="tiny">Tiny - 빠름</option>
          <option value="small">Small - 고품질</option>
        </select>
      </label>
      <label class="upload-addon-field">
        <span class="upload-addon-label">요약 상세 수준</span>
        <select id="upload-addon-detail" class="upload-addon-select">
          <option value="normal">보통</option>
          <option value="brief">간략</option>
          <option value="detailed">상세</option>
        </select>
      </label>
      <div id="upload-addon-status" class="upload-addon-status"></div>
      <div class="upload-addon-progress"><span id="upload-addon-progress-bar"></span></div>
      <label class="upload-addon-field">
        <span class="upload-addon-label">요약 결과</span>
        <textarea id="upload-addon-summary" class="upload-addon-textarea" readonly></textarea>
      </label>
      <label class="upload-addon-field">
        <span class="upload-addon-label">전체 전사 내용</span>
        <textarea id="upload-addon-transcript" class="upload-addon-textarea" readonly></textarea>
      </label>
    `;

    const foot = el("div", "upload-addon-foot");
    const download = el("button", "upload-addon-action", "MD 저장");
    download.type = "button";
    download.addEventListener("click", downloadMarkdown);
    const process = el("button", "upload-addon-action primary", "전사 및 요약");
    process.type = "button";
    process.dataset.uploadAddonBusy = "1";
    process.addEventListener("click", handleProcess);
    foot.append(download, process);

    modal.append(head, body, foot);
    overlay.append(modal);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay && !busy) overlay.classList.remove("open");
    });
    document.body.append(overlay);
  }

  function init() {
    if (document.getElementById("upload-addon-open")) return;
    buildModal();
    const button = el("button", "upload-addon-btn", "파일 업로드 요약");
    button.id = "upload-addon-open";
    button.type = "button";
    button.addEventListener("click", () => {
      document.getElementById("upload-addon-overlay")?.classList.add("open");
    });
    document.body.append(button);
    placeUploadButton();
    const observer = new MutationObserver(placeUploadButton);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function placeUploadButton() {
    const button = document.getElementById("upload-addon-open");
    const newMeetingButton = document.querySelector(".new-meeting-btn");
    if (!button || !newMeetingButton) return;

    let row = document.querySelector(".meeting-action-row");
    if (!row) {
      row = document.createElement("div");
      row.className = "meeting-action-row";
      newMeetingButton.parentNode.insertBefore(row, newMeetingButton);
      row.appendChild(newMeetingButton);
    }
    if (button.parentElement !== row) {
      row.appendChild(button);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
