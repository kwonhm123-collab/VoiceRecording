# 수정 내용 정리

이 파일은 `kwonhm123-collab/VoiceRecording` 저장소에 등록하기 위해 지금까지 반영한 주요 변경사항을 정리한 문서입니다.

## 1. GitHub 등록 준비

- `dist` 폴더를 Git 저장소로 초기화했습니다.
- GitHub 원격 저장소를 연결했습니다.
- 대상 저장소: `https://github.com/kwonhm123-collab/VoiceRecording`
- 정적 앱 파일 전체를 `main` 브랜치에 푸시했습니다.
- `index.html`의 asset 경로를 상대 경로로 변경했습니다.
  - 기존: `/assets/...`
  - 변경: `./assets/...`

## 2. Streamlib / Streamlit 등록 지원

- Streamlib의 `Main file path`가 Python 파일을 요구해서 `streamlit_app.py`를 추가했습니다.
- Streamlib 등록 값은 아래와 같습니다.

```text
Repository: kwonhm123-collab/VoiceRecording
Branch: main
Main file path: streamlit_app.py
Requirements file: requirements.txt
```

- `requirements.txt`를 추가했습니다.
- `.streamlit/config.toml`을 추가하고 정적 파일 서빙을 활성화했습니다.
- 기존 정적 웹앱을 Streamlit iframe 안에서 실행하도록 구성했습니다.

## 3. Gemini API Key Secrets 연동

- Streamlib App settings의 Secrets에서 Gemini API 키를 읽도록 수정했습니다.
- Secrets에는 아래 형식으로 입력합니다.

```toml
GEMINI_API_KEY = "실제_Gemini_API_키"
```

- `streamlit_app.py`가 `st.secrets` 값을 읽고 브라우저 앱의 `localStorage`에 자동 설정합니다.
- `.streamlit/secrets.toml`은 GitHub에 올라가지 않도록 `.gitignore`에 추가했습니다.

## 4. 휴대폰 반응형 화면 개선

- `mobile.css`를 추가했습니다.
- 모바일 화면에서 사이드바가 상단 영역으로 접히도록 수정했습니다.
- 회의 목록, 녹음 화면, 요약 화면을 작은 화면에 맞게 한 열 중심으로 조정했습니다.
- 설정 모달, 토스트, 요약 표, 녹음 버튼 레이아웃을 모바일에 맞게 보정했습니다.
- `streamlit_app.py`가 배포 시 `mobile.css`도 정적 폴더로 복사하도록 수정했습니다.

## 5. 음성 파일 업로드 요약 기능 추가

- `upload-addon.js`와 `upload-addon.css`를 추가했습니다.
- 사용자가 기존 음성 또는 영상 파일을 업로드해 전사/요약할 수 있게 했습니다.
- 지원 흐름:
  - 음성/영상 파일 선택
  - 브라우저에서 오디오 디코딩
  - 16kHz mono 오디오로 변환
  - Whisper worker로 전사
  - Gemini API로 요약
  - 요약 결과와 전체 전사 내용 표시
  - Markdown 파일 저장
- `index.html`에 업로드 애드온 CSS/JS를 연결했습니다.
- `streamlit_app.py`가 배포 시 업로드 애드온 파일도 복사하도록 수정했습니다.

## 6. 회의록 삭제 보강

- 회의록 삭제 후 브라우저 새로고침 시 다시 나타나는 문제를 줄이기 위해 삭제 보강 로직을 추가했습니다.
- 삭제 확인창이 승인되면 IndexedDB의 `meetings` 저장소를 추가로 검사합니다.
- 삭제 대상 key, cursor key, 회의 제목, `id` 필드를 기준으로 남아 있는 레코드를 제거합니다.

## 7. 파일 업로드 요약 버튼 위치 변경

- `파일 업로드 요약` 버튼을 화면 오른쪽 아래 플로팅 버튼에서 `새 회의 시작` 버튼 옆으로 이동했습니다.
- 모바일에서는 버튼이 세로로 자연스럽게 정렬되도록 조정했습니다.

## 주요 커밋

```text
7d3d36b Fix meeting deletion and upload button placement
5a037fb Add audio file upload summarizer
c4c8b79 Improve mobile layout
a0f2366 Read Gemini key from Streamlit secrets
2282005 Add Streamlit entrypoint
3b2e6ea Initial static app build
```

## 확인한 항목

- `streamlit_app.py` 문법 검사 통과
- `upload-addon.js` 문법 검사 통과
- 정적 파일 응답 확인
  - `index.html`
  - `mobile.css`
  - `upload-addon.js`
  - `upload-addon.css`

