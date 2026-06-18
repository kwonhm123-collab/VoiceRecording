# MeetNote

AI 기반 실시간 회의 녹취 및 자동 요약 웹앱입니다.

## 실행

이 폴더는 정적 빌드 결과물입니다. 로컬에서 확인하려면 아래 명령으로 정적 서버를 실행하세요.

```powershell
python -m http.server 8000
```

브라우저에서 다음 주소를 엽니다.

```text
http://localhost:8000/
```

## Streamlib / Streamlit 배포

Streamlib에서 GitHub 저장소를 연결한 뒤 아래 값을 사용하세요.

```text
Main file path: streamlit_app.py
Requirements file: requirements.txt
Branch: main
```

`index.html`은 정적 웹앱 파일이므로 Main file path에 직접 넣지 않습니다.

### Secrets

Streamlib App settings의 Secrets에는 아래 형식으로 Gemini API 키를 등록하세요.

```toml
GEMINI_API_KEY = "AIza..."
```

이 값은 배포된 앱 실행 시 브라우저 앱의 `localStorage`에 자동으로 설정됩니다.
