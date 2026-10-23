# 회원가입·회원 전용 첨부파일 설정

이 사이트는 Firebase Authentication으로 이메일·비밀번호 계정을 만들고 이메일 인증을 확인합니다. 가입·로그인 시 회원 이름, 이메일, Firebase UID, 인증 여부, 가입일 및 로그인일을 Google 스프레드시트의 `회원` 탭에 기록합니다. 관리자는 `status.html`의 관리자 패널에서 회원 목록을 볼 수 있습니다.

프로젝트 첨부파일은 Google Drive의 `edgacst-member-files` 폴더에 비공개로 저장합니다. 파일을 내려받을 때 Apps Script가 Firebase 계정과 이메일 인증 여부를 확인하고, 해당 파일이 프로젝트에 등록되어 있는지 검사합니다. 관리자 프로젝트 편집에서 PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, HWP/HWPX, ZIP, TXT, CSV를 추가할 수 있습니다. 파일당 5MB, 프로젝트당 최대 5개입니다. 기존 프로젝트 이미지는 현재 방식대로 공개 이미지 URL을 사용합니다.

## 1. Firebase 프로젝트 만들기

1. [Firebase Console](https://console.firebase.google.com/)에서 프로젝트를 만들거나 기존 프로젝트를 선택합니다.
2. `Authentication` → `Sign-in method`에서 `Email/Password`를 사용 설정합니다.
3. `Authentication` 설정의 승인된 도메인에 실제 사이트 도메인을 추가합니다. 예: `edgcst.com`, `www.edgcst.com`. 테스트 중에는 사용할 로컬 개발 도메인도 추가합니다.
4. `Authentication`의 이메일 템플릿에서 발신자와 이메일 인증 안내를 확인합니다.
5. 프로젝트 설정의 `General` 페이지에서 웹 API 키를 복사합니다.

Firebase는 브라우저의 이메일 가입·로그인, 계정 조회, 이메일 인증, 계정 삭제 REST API를 사용합니다. 비밀번호는 Firebase Auth에 전달되고 Google Sheets에는 저장하지 않습니다. 이 구현은 브라우저에서 짧게 쓰는 ID 토큰과 갱신 토큰을 `sessionStorage`에만 저장합니다.

## 2. 사이트 설정

1. `js/config.js`의 `FIREBASE_CONFIG.API_KEY`를 Firebase 웹 API 키로 바꿉니다.
2. 비밀번호나 서비스 계정 키를 `js/config.js`에 넣지 마세요. Firebase 웹 API 키는 브라우저용 식별 키이며, Firebase 승인 도메인 설정으로 사이트 사용 범위를 제한하세요.
3. `js/config.js`의 `GOOGLE_CONFIG.SCRIPT_URL`이 배포한 Apps Script 웹 앱 URL을 가리키는지 확인합니다.

## 3. Apps Script 설정

1. 프로젝트 스프레드시트에서 `확장 프로그램` → `Apps Script`를 엽니다.
2. 프로젝트의 `Code.gs`를 배포 파일의 `Code.gs`로 교체합니다. `appsscript.json` 표시를 켜고 배포 파일의 manifest 내용도 적용합니다. manifest는 스프레드시트·Drive 및 Firebase 인증 서버 요청 권한을 선언합니다.
3. 저장 후 스프레드시트를 새로고침합니다. 상단 `edgacst` 메뉴에서 `보안 설정 (관리자 비밀번호·Firebase 키)`을 실행합니다.
4. 32자 이상의 무작위 관리자 비밀번호와 같은 Firebase 웹 API 키를 입력합니다. 관리자 비밀번호는 비밀번호 관리자에서 생성해 보관하세요. 소스 코드나 공개 저장소에는 넣지 않습니다.
5. `edgacst` → `연결 테스트 (Drive 포함)`을 실행하고 요청된 스프레드시트·Drive·외부 요청 권한을 승인합니다. 이 과정에서 `회원` 탭과 비공개 첨부파일 폴더가 준비됩니다.
6. `배포` → `배포 관리`에서 웹 앱 배포를 수정하고 새 버전을 배포합니다. 실행 주체는 스프레드시트 소유자, 액세스는 모든 사용자로 설정합니다. 배포 URL이 바뀌면 `js/config.js`의 `SCRIPT_URL`도 바꾸세요.

## 4. 동작 확인

1. 사이트의 `회원가입/로그인` 페이지에서 테스트 계정을 만들고 이메일 인증 링크를 누릅니다.
2. Firebase Authentication 사용자 목록과 스프레드시트의 `회원` 탭에 계정이 표시되는지 확인합니다. 관리자 로그인 후 `status.html`의 `회원가입 정보` 표에서도 볼 수 있습니다.
3. 관리자 패널에서 프로젝트를 편집하고 허용된 문서를 첨부해 저장합니다.
4. 로그아웃 상태에서는 다운로드가 거부되는지 확인합니다. 테스트 계정으로 로그인하고 이메일 인증을 마치면 다운로드되어야 합니다.
5. 회원 페이지의 `계정 삭제`도 확인할 수 있습니다. Firebase 계정 및 `회원` 시트 행이 함께 삭제됩니다.

계정 데이터는 스프레드시트 `회원` 탭에 있습니다. 관리자 계정 비밀번호를 바꾸려면 스프레드시트 메뉴에서 보안 설정을 다시 실행하면 됩니다. 설정을 완료하기 전에는 Firebase 키가 placeholder라 회원가입·로그인 기능이 작동하지 않습니다.

참고: [Firebase Authentication REST API](https://firebase.google.com/docs/reference/rest/auth/), [Apps Script Drive 폴더 권한](https://developers.google.com/apps-script/reference/drive/folder#setSharing(Access,Permission))
