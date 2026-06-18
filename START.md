# Anti Meeting App 시작 방법

이 폴더는 빌드된 정적 웹 앱(`dist`)입니다. `index.html`이 `/assets/...` 경로와 서비스 워커를 사용하므로 파일을 직접 더블클릭하지 말고 로컬 웹 서버로 실행하세요.

## 실행

PowerShell에서 이 폴더로 이동한 뒤 다음 명령을 실행합니다.

```powershell
cd C:\Users\won12\Desktop\anti_meetingapp\dist
python -m http.server 8000
```

브라우저에서 아래 주소를 엽니다.

```text
http://localhost:8000/
```

## 다른 포트 사용

8000번 포트가 이미 사용 중이면 다른 포트를 지정합니다.

```powershell
python -m http.server 8010
```

그 경우 브라우저 주소도 포트에 맞춰 엽니다.

```text
http://localhost:8010/
```

## 종료

서버를 실행한 PowerShell 창에서 `Ctrl+C`를 누르면 종료됩니다.
