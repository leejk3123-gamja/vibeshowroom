/* ============================================================
   바이브 벤처 웹 전시관 — 설정 파일
   ★ 보통은 이 파일만 수정하면 됩니다.
   ============================================================ */
window.GALLERY_CONFIG = {
  // 1) Apps Script 웹 앱 URL (…/exec 로 끝나는 주소). 비워두면 DEMO 모드로 동작합니다.
  API_URL: '',
  // API_URL: 'https://script.google.com/macros/s/AKfycbze-OY6CZdJ-CRhTQj9UdjGOicjJxWqSsekXKvkQEqa1o9UH3rfMR3ZIGemizBIDs1N/exec',
   
  // 2) 문구
  TITLE: '바이브 벤처 학생 작품 전시관',
  SUBTITLE: 'INNODG / VIBE-VENTURE',
  TAGLINE: '학생들이 한 달 동안 만든 앱을 한 곳에서 관람하고, 응원의 방명록을 남겨 주세요.',
  NOTICE: '우리 학생들이 한 달간 열심히 달려온 결과물입니다! 아직은 서툴고 수정할 곳이 많지만, 학생들의 노력에 아낌없는 격려와 응원을 보내 주세요.',

  // 3) 표시 옵션
  SHOW_DEVELOPER: true,          // false 면 개발자 이름을 숨기고 학교만 표시
  MAX_CLAPS_PER_PROJECT: 5,      // 한 사람(브라우저)이 한 작품에 보낼 수 있는 박수 수
  SLIDESHOW_INTERVAL: 7000,      // 슬라이드쇼 전환 간격(ms)

  // 4) 스크린샷
  //  - THUMB_DIR : GitHub Actions 가 생성한 스크린샷 폴더 (thumbs/월키/번호.jpg)
  //  - LIVE_SHOT : 저장된 스크린샷이 없을 때 쓰는 실시간 미리보기 서비스
  //                'mshots'(무료·키 불필요, 첫 요청은 생성 중 이미지) | 'thumio' | 'none'
  THUMB_DIR: 'thumbs',
  LIVE_SHOT: 'mshots',

  // 5) iframe 삽입이 차단되는 것으로 알려진 호스트 → 스크린샷 + 바로가기 버튼으로 대신 표시
  BLOCKED_IFRAME_HOSTS: ['azurewebsites.net', 'github.com', 'script.google.com', 'notion.site']
};
