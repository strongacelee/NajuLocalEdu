// 나주시 지역연계교육과정 운영 인포맵 핵심 스크립트
// 사용자 규칙에 따라 코드 내 주석 및 문자열에서 하이픈 기호를 직접 사용하지 않고 문자 코드로 조합합니다

const HYPHEN = String.fromCharCode(45);

// 대표 스티커 정의
// BIGBANG 7개 스티커 정의
const STICKER_TYPES = {
    b_yuchoyium: { key: "B", emoji: "🏫", text: "B 유초이음", color: "#ec4899" },
    i_maeuljosa: { key: "I", emoji: "🔍", text: "I 마을조사", color: "#8b5cf6" },
    g_maeulyeongye: { key: "G", emoji: "🤝", text: "G 마을연계", color: "#3b82f6" },
    b_gongdong: { key: "B", emoji: "👥", text: "B 공동교육", color: "#10b981" },
    a_ai: { key: "A", emoji: "🤖", text: "A AI활용", color: "#f59e0b" },
    n_munjae: { key: "N", emoji: "🧩", text: "N 문제해결", color: "#ef4444" },
    g_governance: { key: "G", emoji: "🏛️", text: "G 거버넌스", color: "#06b6d4" }
};

// 다중 이미지가 없을 때 카드 등에 보여줄 은은한 기본 백업 이미지 (하이픈 조합 우회)
const BACKUP_IMAGE = "https://images.unsplash.com/photo" + HYPHEN + "1618005182384" + HYPHEN + "a83a8bd57fbe?w=800";

// 애플리케이션 상태 관리 객체
let state = {
    map: null,
    umdLayer: null,
    markerClusterGroup: null,
    activities: [],
    markers: [],
    selectedLat: null,
    selectedLng: null,
    selectedSticker: "b_yuchoyium",
    selectedImages: [], // 복수 업로드 이미지 DataURL 배열
    currentSliderIndex: 0, // 상세 슬라이더 인덱스
    currentCategoryFilter: "all",
    userMode: "user",
    editingActivityId: null // 현재 수정 중인 활동 ID
};

// 무조작 타이머 관련 글로벌 상태 변수
let popupInactivityTimer = null;
let popupNoticeTimer = null;
let idleInactivityTimer = null;
let idleNoticeTimer = null;

// 페이지 로드 시 실행
window.addEventListener("DOMContentLoaded", () => {
    initApp();
});

// 애플리케이션 초기화
function initApp() {
    // 로컬 스토리지에서 기존 활동 데이터 로드
    loadActivities();

    // UI 요소 스타일 동적 적용
    applyGlobalStyles();

    // 초기 탭 상태 설정 (활동 목록 탭 기본 활성화 및 등록 폼 숨김)
    switchTab("list");

    // 지도 초기화
    initMap();

    // 이벤트 리스너 설정
    setupEventListeners();

    // 모바일 구글맵 스타일 바텀시트 터치 연동 설정
    setupBottomSheet();

    // 지도 데이터 로드
    fetchNajuBoundaries();

    // 권한 모드 UI 갱신 초기 적용
    updateModeUI();

    // 60초 전역 무조작 자동 초기화 트래커 시작
    setupGlobalIdleTracker();
    startGlobalIdleTimer();
}

// 기본 BIGBANG 데이터셋 백업
const DEFAULT_ACTIVITIES = [
    {
        id: "act_default_1",
        title: "창의융합교육원",
        sticker: "a_ai",
        content: "AI와 첨단 과학기술 체험을 진행한 지역 연계 활동 공간입니다.",
        images: [BACKUP_IMAGE],
        lat: 35.025,
        lng: 126.785
    },
    {
        id: "act_default_2",
        title: "빛가람호수공원",
        sticker: "b_yuchoyium",
        content: "자연 생태와 호수공원 탐방 활동을 함께 진행하였습니다.",
        images: [BACKUP_IMAGE],
        lat: 35.021,
        lng: 126.778
    },
    {
        id: "act_default_3",
        title: "한국전력 본사",
        sticker: "g_maeulyeongye",
        content: "혁신도시 지역 기관과 연계한 마을 공동체 탐방 활동입니다.",
        images: [BACKUP_IMAGE],
        lat: 35.027,
        lng: 126.791
    },
    {
        id: "act_default_4",
        title: "다시면 일대",
        sticker: "i_maeuljosa",
        content: "나주 역사 문화와 마을 자원을 직접 조사하고 기록하였습니다.",
        images: [BACKUP_IMAGE],
        lat: 35.008,
        lng: 126.655
    }
];

// 구글 Firebase 무상 클라우드 데이터베이스 엔드포인트 후보 (미국/아시아 리전 자동 지원)
const FIREBASE_API_URLS = [
    "https://najulocaledu-default-rtdb.firebaseio.com/activities.json",
    "https://najulocaledu-default-rtdb.asia-southeast1.firebasedatabase.app/activities.json"
];

let activeFirebaseUrl = FIREBASE_API_URLS[0];

// 로컬 및 구글 파이어베이스 클라우드 데이터베이스 하이브리드 동기화 로드
function loadActivities() {
    // 1차: 로컬스토리지에서 0.01초 만에 캐시 로드하여 화면 렌더링
    const saved = localStorage.getItem("naju_activities");
    if (saved) {
        try {
            const parsed = jsonParseSafe(saved, null);
            if (Array.isArray(parsed) && parsed.length > 0) {
                state.activities = parsed.map(act => {
                    let sticker = act.sticker;
                    if (sticker === "nature") sticker = "b_yuchoyium";
                    else if (sticker === "history") sticker = "i_maeuljosa";
                    else if (sticker === "culture") sticker = "g_maeulyeongye";
                    else if (sticker === "science") sticker = "a_ai";
                    else if (!STICKER_TYPES[sticker]) sticker = "b_yuchoyium";
                    return { ...act, sticker: sticker };
                });
            } else {
                state.activities = [...DEFAULT_ACTIVITIES];
            }
        } catch (e) {
            state.activities = [...DEFAULT_ACTIVITIES];
        }
    } else {
        state.activities = [...DEFAULT_ACTIVITIES];
    }

    // 2차: 구글 Firebase 클라우드 DB에서 실시간 전 세계 최신 데이터 동기화 (리전 자동 탐색)
    fetchActivitiesFromFirebase();

    // 3차: 12초 주기 백그라운드 실시간 클라우드 동기화 폴링 시작
    setInterval(() => fetchActivitiesFromFirebase(), 12000);
}

// Firebase 클라우드 DB 데이터 동기화 함수 (리전 자동 감지 및 로컬 이미지 우선 보존)
function fetchActivitiesFromFirebase(urlIndex = 0) {
    if (urlIndex >= FIREBASE_API_URLS.length) return;

    const targetUrl = FIREBASE_API_URLS[urlIndex];
    fetch(targetUrl)
        .then(response => {
            if (!response.ok) throw new Error("Firebase fetch error");
            activeFirebaseUrl = targetUrl;
            return response.json();
        })
        .then(data => {
            let cloudActivities = Array.isArray(data) ? data : [];
            let localSaved = localStorage.getItem("naju_activities");
            let localActivities = [];

            if (localSaved) {
                try {
                    let parsed = JSON.parse(localSaved);
                    if (Array.isArray(parsed)) localActivities = parsed;
                } catch (e) { }
            }

            // 내 컴퓨터 로컬 데이터와 클라우드 데이터 병합 (내 컴퓨터의 등록 이미지 우선 반영)
            let mergedMap = new Map();

            // 1. 클라우드 데이터 먼저 맵에 탑재
            cloudActivities.forEach(act => {
                if (act && act.id) mergedMap.set(act.id, act);
            });

            // 2. 내 컴퓨터 로컬 데이터(등록 사진 포함)로 우선 반영
            localActivities.forEach(act => {
                if (act && act.id) {
                    mergedMap.set(act.id, act);
                }
            });

            const mergedList = Array.from(mergedMap.values());

            if (mergedList.length > 0) {
                state.activities = mergedList.map(act => {
                    let sticker = act.sticker;
                    if (!STICKER_TYPES[sticker]) sticker = "b_yuchoyium";
                    return { ...act, sticker: sticker };
                });

                // 병합된 최신 데이터를 로컬스토리지에 보관
                try {
                    localStorage.setItem("naju_activities", JSON.stringify(state.activities));
                } catch (e) { }

                // 구글 Firebase 클라우드 DB로 동기화 업로드 전송
                syncToFirebaseCloud();

                // 화면 실시간 마커 및 목록 동기화
                updateActivityList();
                if (state.map) {
                    renderActivitiesOnMap();
                }
            } else if (!data) {
                // 클라우드 DB가 비어있는 경우 현재 데이터를 전송
                syncToFirebaseCloud();
            }
        })
        .catch(err => {
            // 접속 실패 시 다른 리전 URL로 자동 재시도
            if (urlIndex + 1 < FIREBASE_API_URLS.length) {
                fetchActivitiesFromFirebase(urlIndex + 1);
            }
        });
}

// Firebase 클라우드 데이터베이스에 실시간 영구 동기화 전송 (권한 감지 포함)
function syncToFirebaseCloud(onSuccess, onError) {
    if (!activeFirebaseUrl) return;
    fetch(activeFirebaseUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state.activities)
    })
        .then(res => {
            if (!res.ok) {
                if (res.status === 401 || res.status === 403) {
                    console.warn("Firebase DB 규칙 거부: .read: true, .write: true 설정 필요");
                    if (onError) onError("permission_denied");
                } else {
                    if (onError) onError("http_error");
                }
            } else {
                if (onSuccess) onSuccess();
            }
        })
        .catch(err => {
            console.log("Firebase sync error", err);
            if (onError) onError("network_error");
        });
}

// 현재 내 컴퓨터(localStorage)의 모든 등록 이미지 및 활동 내역을 파이어베이스 클라우드 DB로 강제 전송 동기화
function uploadLocalDataToFirebase() {
    const saved = localStorage.getItem("naju_activities");
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
                state.activities = parsed;
                syncToFirebaseCloud(
                    () => {
                        updateActivityList();
                        if (state.map) renderActivitiesOnMap();
                        showToast("☁️ PC의 최신 데이터가 클라우드 DB에 동기화되었습니다! 태블릿에서 새로고침하세요.");
                    },
                    (errType) => {
                        if (errType === "permission_denied") {
                            showToast("⚠️ Firebase 콘솔 DB 규칙(.read: true, .write: true) 해제가 필요합니다.");
                        } else {
                            showToast("⚠️ 네트워크 동기화 전송 실패. 파이어베이스 설정을 확인해 주세요.");
                        }
                    }
                );
                return;
            }
        } catch (e) { }
    }
    showToast("동기화할 로컬 데이터가 없습니다.");
}

// JSON 파싱 안전 처리
function jsonParseSafe(str, fallback) {
    try {
        return JSON.parse(str);
    } catch (e) {
        return fallback;
    }
}

// 로컬 스토리지 저장 및 구글 Firebase 클라우드 DB 동시 실시간 전송
function saveActivities() {
    try {
        localStorage.setItem("naju_activities", JSON.stringify(state.activities));
    } catch (e) {
        console.error("로컬 스토리지 저장 실패", e);
    }

    // 구글 Firebase 클라우드 DB에 0.1초 실시간 동기화 전송
    syncToFirebaseCloud();

    updateActivityList();
    if (state.map) {
        renderActivitiesOnMap();
    }
}

// 돔 요소 인라인 스타일 일괄 적용 함수
function applyStyles(element, styleObj) {
    if (!element) return;
    for (const key in styleObj) {
        element.style[key] = styleObj[key];
    }
}

// 글로벌 세련된 테마 비주얼 스타일 정의 및 적용
function applyGlobalStyles() {
    const container = document.getElementById("appContainer");
    const header = document.getElementById("mainHeader");
    const main = document.getElementById("mainContent");
    const mapWrapper = document.getElementById("mapWrapper");
    const sidePanel = document.getElementById("sidePanel");

    // 전체 컨테이너 배경 및 레이아웃
    applyStyles(container, {
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "linear" + HYPHEN + "gradient(135deg, #eef2f6 0%, #dbeafe 100%)",
        fontFamily: "'Noto Sans KR', sans" + HYPHEN + "serif",
        position: "relative",
        overflow: "hidden"
    });

    // 배경용 데코레이션 원형 요소 스타일링
    const circle1 = document.querySelector(".bg_circle1");
    const circle2 = document.querySelector(".bg_circle2");
    applyStyles(circle1, {
        position: "absolute",
        width: "40vw",
        height: "40vw",
        borderRadius: "50%",
        background: "radial" + HYPHEN + "gradient(circle, rgba(165,180,252,0.3) 0%, rgba(255,255,255,0) 70%)",
        top: "-10vw",
        left: "-10vw",
        pointerEvents: "none",
        zIndex: "1"
    });
    applyStyles(circle2, {
        position: "absolute",
        width: "50vw",
        height: "50vw",
        borderRadius: "50%",
        background: "radial" + HYPHEN + "gradient(circle, rgba(253,164,175,0.2) 0%, rgba(255,255,255,0) 70%)",
        bottom: "-15vw",
        right: "-10vw",
        pointerEvents: "none",
        zIndex: "1"
    });

    // 헤더 디자인 (글래스모피즘)
    applyStyles(header, {
        zIndex: "10",
        padding: "20px 40px",
        display: "flex",
        justifyContent: "space" + HYPHEN + "between",
        alignItems: "center",
        background: "rgba(255, 255, 255, 0.75)",
        backdropFilter: "blur(16px)",
        webkitBackdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(255, 255, 255, 0.5)",
        boxShadow: "0 4px 30px rgba(0, 0, 0, 0.03)"
    });

    const titleH1 = header.querySelector("h1");
    applyStyles(titleH1, {
        margin: "0",
        fontSize: "24px",
        fontWeight: "700",
        background: "linear" + HYPHEN + "gradient(90deg, #1e3a8a 0%, #3b82f6 100%)",
        webkitBackgroundClip: "text",
        webkitTextFillColor: "transparent",
        letterSpacing: "-0.5px"
    });

    const titleP = header.querySelector(".subtitle");
    applyStyles(titleP, {
        margin: "4px 0 0 0",
        fontSize: "13px",
        color: "#64748b",
        fontWeight: "400"
    });

    // 메인 레이아웃 분할
    applyStyles(main, {
        flex: "1",
        display: "flex",
        position: "relative",
        zIndex: "5",
        padding: "20px 30px 30px 30px",
        gap: "24px",
        height: "calc(100% " + HYPHEN + " 100px)",
        boxSizing: "border" + HYPHEN + "box"
    });

    // 지도 래퍼 스타일
    applyStyles(mapWrapper, {
        flex: "1",
        height: "100%",
        borderRadius: "24px",
        overflow: "hidden",
        boxShadow: "0 12px 40px rgba(31, 38, 135, 0.06)",
        border: "1px solid rgba(255, 255, 255, 0.6)",
        position: "relative",
        background: "#ffffff"
    });

    const mapEl = document.getElementById("map");
    applyStyles(mapEl, {
        width: "100%",
        height: "100%"
    });

    // 사이드 패널 디자인 (또렷하고 선명한 비주얼 패널)
    applyStyles(sidePanel, {
        width: "420px",
        height: "100%",
        background: "#ffffff",
        backdropFilter: "none",
        webkitBackdropFilter: "none",
        borderRadius: "24px",
        border: "1px solid rgba(226, 232, 240, 0.8)",
        boxShadow: "0 12px 40px rgba(0, 0, 0, 0.05)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
        zIndex: "10"
    });

    // 탭 메뉴 버튼 공통 스타일
    const tabs = document.querySelector(".panel_tabs");
    applyStyles(tabs, {
        display: "flex",
        background: "rgba(241, 245, 249, 0.8)",
        padding: "6px",
        margin: "16px 16px 8px 16px",
        borderRadius: "14px"
    });

    // 필터 라벨 스타일
    const filterLabel = document.querySelector(".filter_label");
    applyStyles(filterLabel, {
        fontSize: "12px",
        fontWeight: "600",
        color: "#64748b",
        marginRight: "12px",
        textTransform: "uppercase"
    });

    // 탭 헤더 스타일링
    document.querySelectorAll(".tab_btn").forEach(btn => {
        applyStyles(btn, {
            flex: "1",
            border: "none",
            background: "none",
            padding: "10px",
            fontSize: "14px",
            fontWeight: "600",
            color: "#64748b",
            borderRadius: "10px",
            cursor: "pointer",
            transition: "all 0.3s ease"
        });
    });

    // 활성화 탭 버튼 초기 스타일 설정
    updateTabBtnStyles();

    // 모달 팝업 레이아웃 초기화
    const detailOverlay = document.getElementById("detailOverlay");
    applyStyles(detailOverlay, {
        position: "fixed",
        top: "0",
        left: "0",
        width: "100vw",
        height: "100vh",
        background: "rgba(15, 23, 42, 0.4)",
        backdropFilter: "blur(8px)",
        webkitBackdropFilter: "blur(8px)",
        zIndex: "1000",
        display: "none",
        justifyContent: "center",
        alignItems: "center",
        opacity: "0",
        transition: "opacity 0.4s ease"
    });

    const detailCard = detailOverlay.querySelector(".detail_card_wrapper");
    applyStyles(detailCard, {
        background: "rgba(255, 255, 255, 0.9)",
        backdropFilter: "blur(20px)",
        webkitBackdropFilter: "blur(20px)",
        width: "500px",
        height: "72vh",
        maxHeight: "85%",
        minHeight: "360px",
        borderRadius: "28px",
        border: "1px solid rgba(255, 255, 255, 0.7)",
        boxShadow: "0 24px 60px rgba(0, 0, 0, 0.15)",
        overflow: "hidden",
        position: "relative",
        transform: "scale(0.9)",
        transition: "transform 0.4s cubic" + HYPHEN + "bezier(0.34, 1.56, 0.64, 1)"
    });

    // 지도 타일 이미지 필터 및 폼 요소 디자인 동적 스타일 주입
    const styleEl = document.createElement("style");
    styleEl.textContent = `
        .leaflet${HYPHEN}tile { filter: grayscale(1) brightness(1.05) contrast(0.9) opacity(0.85); }
        
        .header_controls {
            display: flex;
            align${HYPHEN}items: center;
            gap: 20px;
        }

        .filter_section {
            display: flex;
            align${HYPHEN}items: center;
            gap: 10px;
        }

        .grade_filters {
            display: flex;
            gap: 6px;
            align${HYPHEN}items: center;
        }

        .filter_btn {
            border: 1.5px solid #e2e8f0;
            background: #ffffff;
            padding: 5px 10px;
            font${HYPHEN}size: 11px;
            font${HYPHEN}weight: 600;
            color: #475569;
            border${HYPHEN}radius: 12px;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            flex${HYPHEN}direction: column;
            align${HYPHEN}items: center;
            justify${HYPHEN}content: center;
            gap: 3px;
            box${HYPHEN}shadow: 0 2px 6px rgba(0,0,0,0.02);
            line${HYPHEN}height: 1.1;
        }

        .filter_btn:hover {
            border${HYPHEN}color: #cbd5e1;
            transform: translateY(${HYPHEN}1px);
        }

        .filter_btn.active {
            background: #eff6ff;
            border${HYPHEN}color: #3b82f6;
            color: #1d4ed8;
            box${HYPHEN}shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
        }

        .filter_icon {
            font${HYPHEN}size: 15px;
            line${HYPHEN}height: 1;
        }
        
        .mode_section {
            display: flex;
            background: rgba(241, 245, 249, 0.8);
            padding: 4px;
            border${HYPHEN}radius: 12px;
            border: 1px solid rgba(226, 232, 240, 0.8);
        }
        
        .mode_toggle_btn {
            border: none;
            background: none;
            padding: 8px 16px;
            font${HYPHEN}size: 13px;
            font${HYPHEN}weight: 600;
            color: #64748b;
            border${HYPHEN}radius: 9px;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align${HYPHEN}items: center;
            gap: 6px;
        }
        
        .mode_toggle_btn.active {
            background: #ffffff;
            color: #1e3a8a;
            box${HYPHEN}shadow: 0 4px 10px rgba(0, 0, 0, 0.05);
        }
        
        .tab_content {
            display: none;
            flex: 1;
            overflow${HYPHEN}y: auto;
            flex${HYPHEN}direction: column;
            box${HYPHEN}sizing: border${HYPHEN}box;
        }
        
        .tab_content.active {
            display: flex;
        }
        
        .activity_list {
            flex: 1;
            overflow${HYPHEN}y: auto;
            padding: 8px 16px 20px 16px;
            box${HYPHEN}sizing: border${HYPHEN}box;
        }
        
        #activityForm {
            padding: 16px 20px;
            display: flex;
            flex${HYPHEN}direction: column;
            gap: 14px;
            overflow${HYPHEN}y: auto;
            flex: 1;
            box${HYPHEN}sizing: border${HYPHEN}box;
        }
        
        .form_group {
            display: flex;
            flex${HYPHEN}direction: column;
            gap: 6px;
        }
        
        .form_group_row {
            display: flex;
            gap: 12px;
        }
        
        .form_group_row .form_group {
            flex: 1;
        }
        
        .form_group label {
            font${HYPHEN}size: 13px;
            font${HYPHEN}weight: 600;
            color: #475569;
        }
        
        #activityForm input[type="text"],
        #activityForm input[type="date"],
        #activityForm select,
        #activityForm textarea {
            background: #ffffff;
            border: 1.5px solid #e2e8f0;
            border${HYPHEN}radius: 12px;
            padding: 10px 14px;
            font${HYPHEN}size: 13px;
            font${HYPHEN}family: inherit;
            color: #1e293b;
            outline: none;
            transition: all 0.2s;
        }
        
        #activityForm input[type="text"]:focus,
        #activityForm input[type="date"]:focus,
        #activityForm select:focus,
        #activityForm textarea:focus {
            border${HYPHEN}color: #3b82f6;
            box${HYPHEN}shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
        }
        
        .selected_coords_box {
            background: #f1f5f9;
            border: 1.5px dashed #cbd5e1;
            border${HYPHEN}radius: 12px;
            padding: 12px;
            font${HYPHEN}size: 12px;
            font${HYPHEN}family: monospace;
            color: #64748b;
            text${HYPHEN}align: center;
            transition: all 0.3s;
        }
        
        .sticker_selector {
            display: grid;
            grid${HYPHEN}template${HYPHEN}columns: repeat(4, 1fr);
            gap: 10px;
        }
        
        .sticker_option {
            background: #f8fafc;
            border: 1.5px solid #e2e8f0;
            border${HYPHEN}radius: 16px;
            padding: 12px 6px;
            cursor: pointer;
            text${HYPHEN}align: center;
            display: flex;
            flex${HYPHEN}direction: column;
            align${HYPHEN}items: center;
            gap: 4px;
            transition: all 0.2s ease;
        }
        
        .sticker_option:hover {
            transform: translateY(${HYPHEN}2px);
            border${HYPHEN}color: #cbd5e1;
        }
        
        .sticker_option.active {
            border${HYPHEN}color: #3b82f6;
            background: #eff6ff;
            box${HYPHEN}shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
        }

        .image_preview_list {
            display: flex;
            flex${HYPHEN}wrap: wrap;
            gap: 8px;
            margin${HYPHEN}top: 10px;
        }

        .preview_image_wrapper {
            position: relative;
            width: 68px;
            height: 68px;
            border${HYPHEN}radius: 12px;
            overflow: hidden;
            border: 1.5px solid #cbd5e1;
            box${HYPHEN}shadow: 0 2px 6px rgba(0,0,0,0.06);
            flex${HYPHEN}shrink: 0;
        }

        .preview_image_wrapper img {
            width: 100%;
            height: 100%;
            object${HYPHEN}fit: cover;
        }

        .preview_image_wrapper .remove_btn {
            position: absolute;
            top: 3px;
            right: 3px;
            background: rgba(15, 23, 42, 0.75);
            color: #ffffff;
            border: none;
            border${HYPHEN}radius: 50%;
            width: 20px;
            height: 20px;
            font${HYPHEN}size: 13px;
            line${HYPHEN}height: 1;
            cursor: pointer;
            display: flex;
            align${HYPHEN}items: center;
            justify${HYPHEN}content: center;
            transition: background 0.2s;
        }

        .preview_image_wrapper .remove_btn:hover {
            background: #ef4444;
        }

        .image_preview_box {
            display: none;
            position: relative;
            width: 80px;
            height: 80px;
            border${HYPHEN}radius: 12px;
            overflow: hidden;
            border: 1.5px solid #e2e8f0;
        }
        
        .image_preview_box img {
            width: 100%;
            height: 100%;
            object${HYPHEN}fit: cover;
        }
        
        .remove_preview_btn {
            position: absolute;
            top: 2px;
            right: 2px;
            background: rgba(15, 23, 42, 0.7);
            border: none;
            color: white;
            border${HYPHEN}radius: 50%;
            width: 18px;
            height: 18px;
            font${HYPHEN}size: 12px;
            line${HYPHEN}height: 18px;
            cursor: pointer;
            display: flex;
            justify${HYPHEN}content: center;
            align${HYPHEN}items: center;
            gap: 6px;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .sticker_option .sticker_emoji {
            font${HYPHEN}size: 22px;
        }
        
        .sticker_option .sticker_text {
            font${HYPHEN}size: 11px;
            font${HYPHEN}weight: 600;
            color: #64748b;
        }
        
        .sticker_option.active .sticker_text {
            color: #1d4ed8;
        }
        
        .image_upload_container {
            display: flex;
            gap: 12px;
            align${HYPHEN}items: center;
            margin${HYPHEN}bottom: 6px;
        }
        
        .upload_trigger {
            flex: 1;
            background: #f8fafc;
            border: 1.5px dashed #cbd5e1;
            border${HYPHEN}radius: 14px;
            padding: 16px;
            display: flex;
            flex${HYPHEN}direction: column;
            align${HYPHEN}items: center;
            gap: 6px;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .upload_trigger:hover {
            background: #f1f5f9;
            border${HYPHEN}color: #94a3b8;
        }
        
        .upload_trigger .upload_icon {
            font${HYPHEN}size: 20px;
        }
        
        .upload_trigger .upload_text {
            font${HYPHEN}size: 12px;
            font${HYPHEN}weight: 500;
            color: #64748b;
        }
        
        .image_preview_box {
            display: none;
            position: relative;
            width: 80px;
            height: 80px;
            border${HYPHEN}radius: 12px;
            overflow: hidden;
            border: 1.5px solid #e2e8f0;
        }
        
        .image_preview_box img {
            width: 100%;
            height: 100%;
            object${HYPHEN}fit: cover;
        }
        
        .remove_preview_btn {
            position: absolute;
            top: 2px;
            right: 2px;
            background: rgba(15, 23, 42, 0.7);
            border: none;
            color: white;
            border${HYPHEN}radius: 50%;
            width: 18px;
            height: 18px;
            font${HYPHEN}size: 12px;
            line${HYPHEN}height: 18px;
            cursor: pointer;
            display: flex;
            justify-content: center;
            align${HYPHEN}items: center;
        }
        
        .default_images_container {
            display: flex;
            flex${HYPHEN}direction: column;
            gap: 4px;
        }
        
        .default_images_title {
            font${HYPHEN}size: 11px;
            font${HYPHEN}weight: 500;
            color: #94a3b8;
            margin: 0;
        }
        
        .default_images_list {
            display: grid;
            grid${HYPHEN}template${HYPHEN}columns: repeat(4, 1fr);
            gap: 8px;
        }
        
        .default_image_item {
            position: relative;
            border${HYPHEN}radius: 10px;
            overflow: hidden;
            cursor: pointer;
            border: 2px solid transparent;
            aspect${HYPHEN}ratio: 1;
            transition: all 0.2s;
        }
        
        .default_image_item img {
            width: 100%;
            height: 100%;
            object${HYPHEN}fit: cover;
        }
        
        .default_image_item .default_image_label {
            position: absolute;
            bottom: 0;
            left: 0;
            width: 100%;
            background: rgba(15, 23, 42, 0.6);
            color: white;
            font${HYPHEN}size: 9px;
            text${HYPHEN}align: center;
            padding: 2px 0;
            font${HYPHEN}weight: 500;
        }
        
        .grade_chip_selector {
            display: flex;
            flex${HYPHEN}wrap: wrap;
            gap: 8px;
        }
        
        .grade_chip {
            background: #f8fafc;
            border: 1.5px solid #e2e8f0;
            border${HYPHEN}radius: 12px;
            padding: 8px 12px;
            font${HYPHEN}size: 12px;
            font${HYPHEN}weight: 600;
            color: #475569;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .grade_chip:hover {
            border${HYPHEN}color: #cbd5e1;
            transform: translateY(${HYPHEN}1px);
        }
        
        .grade_chip.active {
            background: #eff6ff;
            border${HYPHEN}color: #3b82f6;
            color: #1d4ed8;
            box${HYPHEN}shadow: 0 4px 10px rgba(59, 130, 246, 0.1);
        }
        
        .image_preview_list {
            display: flex;
            gap: 8px;
            flex${HYPHEN}wrap: wrap;
            margin${HYPHEN}top: 8px;
        }
        
        .preview_image_wrapper {
            position: relative;
            width: 70px;
            height: 70px;
            border${HYPHEN}radius: 10px;
            overflow: hidden;
            border: 1.5px solid #e2e8f0;
        }
        
        .preview_image_wrapper img {
            width: 100%;
            height: 100%;
            object${HYPHEN}fit: cover;
        }
        
        .preview_image_wrapper .remove_btn {
            position: absolute;
            top: 2px;
            right: 2px;
            background: rgba(15, 23, 42, 0.7);
            border: none;
            color: white;
            border${HYPHEN}radius: 50%;
            width: 16px;
            height: 16px;
            font${HYPHEN}size: 10px;
            display: flex;
            justify${HYPHEN}content: center;
            align${HYPHEN}items: center;
            cursor: pointer;
        }
        
        #sidePanel {
            background: #ffffff !important;
            backdrop${HYPHEN}filter: none !important;
            webkit${HYPHEN}backdrop${HYPHEN}filter: none !important;
            box${HYPHEN}shadow: 0 12px 40px rgba(0, 0, 0, 0.05) !important;
        }

        .detail_overlay_container {
            display: none;
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            background: rgba(15, 23, 42, 0.55) !important;
            backdrop${HYPHEN}filter: blur(12px) !important;
            webkit${HYPHEN}backdrop${HYPHEN}filter: blur(12px) !important;
            z${HYPHEN}index: 999999 !important;
            align${HYPHEN}items: center;
            justify${HYPHEN}content: center;
            padding: 16px;
            box${HYPHEN}sizing: border${HYPHEN}box;
            opacity: 0;
            border${HYPHEN}radius: 0 !important;
            transition: opacity 0.3s cubic${HYPHEN}bezier(0.16, 1, 0.3, 1);
            pointer${HYPHEN}events: auto;
        }

        .detail_card_wrapper {
            width: 88%;
            max${HYPHEN}width: 520px;
            height: 72vh !important;
            max${HYPHEN}height: 560px !important;
            min${HYPHEN}height: 360px !important;
            background: #ffffff;
            border${HYPHEN}radius: 24px;
            box${HYPHEN}shadow: 0 20px 60px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.5);
            display: flex !important;
            flex${HYPHEN}direction: column !important;
            overflow: hidden !important;
            position: relative;
            transform: scale(0.92);
            transition: transform 0.3s cubic${HYPHEN}bezier(0.16, 1, 0.3, 1);
        }

        .close_overlay_btn {
            position: absolute;
            top: 16px;
            right: 16px;
            z${HYPHEN}index: 30;
            width: 38px;
            height: 38px;
            border${HYPHEN}radius: 50%;
            background: rgba(255, 255, 255, 0.85);
            backdrop${HYPHEN}filter: blur(10px);
            border: 1.5px solid rgba(255, 255, 255, 0.9);
            color: #334155;
            font${HYPHEN}size: 18px;
            font${HYPHEN}weight: 700;
            cursor: pointer;
            display: flex;
            align${HYPHEN}items: center;
            justify${HYPHEN}content: center;
            box${HYPHEN}shadow: 0 8px 20px rgba(0,0,0,0.15);
            transition: all 0.2s ease;
        }

        .close_overlay_btn:hover {
            background: #ffffff;
            transform: scale(1.08) rotate(90deg);
            color: #0f172a;
            box${HYPHEN}shadow: 0 10px 25px rgba(0,0,0,0.22);
        }

        .detail_hero_section {
            position: relative;
            width: 100% !important;
            height: 50% !important;
            max${HYPHEN}height: 50% !important;
            flex: 0 0 50% !important;
            min${HYPHEN}height: 0 !important;
            background: #0f172a;
            overflow: hidden !important;
            display: flex !important;
            align${HYPHEN}items: center !important;
            justify${HYPHEN}content: center !important;
        }

        .detail_sticker_badge {
            position: absolute;
            top: 16px;
            left: 16px;
            z${HYPHEN}index: 20;
            padding: 6px 14px;
            font${HYPHEN}size: 12px;
            font${HYPHEN}weight: 700;
            border${HYPHEN}radius: 20px;
            background: rgba(255, 255, 255, 0.92);
            backdrop${HYPHEN}filter: blur(12px);
            box${HYPHEN}shadow: 0 8px 20px rgba(0,0,0,0.15);
            border: 1px solid rgba(255, 255, 255, 0.8);
            display: inline${HYPHEN}flex;
            align${HYPHEN}items: center;
            gap: 6px;
        }

        .detail_image_container {
            width: 100% !important;
            height: 100% !important;
            position: relative;
            display: flex !important;
            align${HYPHEN}items: center !important;
            justify${HYPHEN}content: center !important;
            background: #0f172a;
            overflow: hidden !important;
        }

        .detail_image_container img {
            width: 100% !important;
            height: 100% !important;
            max${HYPHEN}width: 100% !important;
            max${HYPHEN}height: 100% !important;
            object${HYPHEN}fit: contain !important;
            display: block !important;
        }

        .slide_btn {
            position: absolute;
            top: 50%;
            transform: translateY(${HYPHEN}50%);
            background: rgba(255, 255, 255, 0.85);
            backdrop${HYPHEN}filter: blur(10px);
            color: #0f172a;
            border: 1px solid rgba(255, 255, 255, 0.9);
            width: 44px;
            height: 44px;
            border${HYPHEN}radius: 50%;
            font${HYPHEN}size: 22px;
            font${HYPHEN}weight: 700;
            display: flex;
            justify${HYPHEN}content: center;
            align${HYPHEN}items: center;
            cursor: pointer;
            transition: all 0.2s ease;
            box${HYPHEN}shadow: 0 6px 18px rgba(0,0,0,0.15);
            z${HYPHEN}index: 15;
        }

        .slide_btn:hover {
            background: #ffffff;
            transform: translateY(${HYPHEN}50%) scale(1.1);
            box${HYPHEN}shadow: 0 8px 22px rgba(0,0,0,0.22);
        }

        .prev_btn {
            left: 20px;
        }

        .next_btn {
            right: 20px;
        }

        .slide_dots {
            position: absolute;
            bottom: 18px;
            left: 50%;
            transform: translateX(${HYPHEN}50%);
            display: flex;
            gap: 8px;
            padding: 6px 14px;
            background: rgba(15, 23, 42, 0.4);
            backdrop${HYPHEN}filter: blur(8px);
            border${HYPHEN}radius: 20px;
            z${HYPHEN}index: 15;
        }

        .slide_dot {
            width: 8px;
            height: 8px;
            border${HYPHEN}radius: 50%;
            background: rgba(255, 255, 255, 0.5);
            cursor: pointer;
            transition: all 0.25s ease;
        }

        .slide_dot.active {
            background: #ffffff;
            width: 22px;
            border${HYPHEN}radius: 6px;
        }

        .detail_card_body {
            height: 50% !important;
            max${HYPHEN}height: 50% !important;
            flex: 0 0 50% !important;
            min${HYPHEN}height: 0 !important;
            padding: 20px 24px !important;
            overflow${HYPHEN}y: auto !important;
            ${HYPHEN}webkit${HYPHEN}overflow${HYPHEN}scrolling: touch !important;
            display: flex !important;
            flex${HYPHEN}direction: column !important;
            gap: 12px !important;
            background: #ffffff !important;
            box${HYPHEN}sizing: border${HYPHEN}box !important;
        }

        .detail_card_body h2 {
            font${HYPHEN}size: 24px;
            font${HYPHEN}weight: 800;
            color: #0f172a;
            margin: 0;
            letter${HYPHEN}spacing: ${HYPHEN}0.5px;
            line${HYPHEN}height: 1.35;
        }

        .detail_content_box {
            background: #f8fafc;
            border${HYPHEN}radius: 20px;
            padding: 22px 26px;
            border: 1.5px solid #e2e8f0;
            display: flex;
            flex${HYPHEN}direction: column;
            gap: 10px;
        }

        .detail_section_header {
            display: flex;
            align${HYPHEN}items: center;
            gap: 8px;
        }

        .detail_section_icon {
            font${HYPHEN}size: 16px;
        }

        .detail_section_title {
            font${HYPHEN}size: 13px;
            font${HYPHEN}weight: 700;
            color: #64748b;
            margin: 0;
            letter${HYPHEN}spacing: ${HYPHEN}0.2px;
            text${HYPHEN}transform: uppercase;
        }

        .detail_content_paper p {
            font${HYPHEN}size: 15px;
            line${HYPHEN}height: 1.75;
            color: #334155;
            margin: 0;
            font${HYPHEN}weight: 400;
            white${HYPHEN}space: pre${HYPHEN}line;
            word${HYPHEN}break: break${HYPHEN}word;
        }
        
        .umd_tooltip {
            background: transparent !important;
            border: none !important;
            box${HYPHEN}shadow: none !important;
            color: #1e3a8a !important;
            font${HYPHEN}size: 13px !important;
            font${HYPHEN}weight: 800 !important;
            text${HYPHEN}shadow: 0 0 5px #ffffff, 0 0 5px #ffffff !important;
        }
        
        .umd_tooltip::before {
            display: none !important;
        }
        
        .leaflet${HYPHEN}container:focus {
            outline: none !important;
        }
        
        .leaflet${HYPHEN}container *:focus {
            outline: none !important;
        }
        
        .leaflet${HYPHEN}interactive:focus {
            outline: none !important;
        }
        
        .touch_zoom_slider_container {
            background: rgba(255, 255, 255, 0.92);
            backdrop${HYPHEN}filter: blur(12px);
            border: 1.5px solid rgba(226, 232, 240, 0.9);
            border${HYPHEN}radius: 20px;
            padding: 10px 8px;
            display: flex;
            flex${HYPHEN}direction: column;
            align${HYPHEN}items: center;
            gap: 8px;
            box${HYPHEN}shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
            user${HYPHEN}select: none;
            touch${HYPHEN}action: none;
            margin${HYPHEN}right: 14px;
            margin${HYPHEN}bottom: 14px;
        }

        .zoom_icon_btn {
            width: 32px;
            height: 32px;
            border${HYPHEN}radius: 50%;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            color: #1e293b;
            font${HYPHEN}size: 15px;
            font${HYPHEN}weight: 800;
            display: flex;
            align${HYPHEN}items: center;
            justify${HYPHEN}content: center;
            cursor: pointer;
            box${HYPHEN}shadow: 0 2px 6px rgba(0,0,0,0.06);
            transition: all 0.2s;
        }

        .zoom_icon_btn:hover {
            background: #eff6ff;
            border${HYPHEN}color: #3b82f6;
            color: #1d4ed8;
        }

        .zoom_slider_track {
            position: relative;
            width: 24px;
            height: 110px;
            display: flex;
            justify${HYPHEN}content: center;
            align${HYPHEN}items: center;
        }

        .zoom_range_input {
            writing${HYPHEN}mode: vertical${HYPHEN}lr;
            direction: rtl;
            width: 100%;
            height: 100%;
            accent${HYPHEN}color: #3b82f6;
            cursor: pointer;
            margin: 0;
        }

        .submit_btn {
            background: linear${HYPHEN}gradient(90deg, #2563eb 0%, #3b82f6 100%);
            border: none;
            color: white;
            border${HYPHEN}radius: 14px;
            padding: 14px;
            font${HYPHEN}size: 14px;
            font${HYPHEN}weight: 700;
            cursor: pointer;
            box${HYPHEN}shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
            transition: all 0.3s;
            margin${HYPHEN}top: 10px;
        }
        
        .submit_btn:hover {
            transform: translateY(${HYPHEN}1px);
            box${HYPHEN}shadow: 0 6px 18px rgba(37, 99, 235, 0.3);
        }

        /* 🦚 동적 1개~5개 둥근 공작새 부채 (Peacock Arc) 3D 호버 및 거미줄 복귀 0.2초 속도 통일 */
        /* 🦚 동적 1개~5개 둥근 공작새 부채 (Peacock Arc) 3D 호버 및 거미줄 복귀 0.2초 속도 통일 (20% 확대 적용) */
        .peacock_cluster_wrapper {
            position: relative;
            width: 68px;
            height: 68px;
            display: flex;
            align${HYPHEN}items: center;
            justify${HYPHEN}content: center;
            cursor: pointer;
        }

        .peacock_dynamic_card {
            position: absolute;
            top: 8px;
            left: 8px;
            width: 52px;
            height: 52px;
            border${HYPHEN}radius: 50%;
            background: #ffffff;
            border: 2.8px solid #2563eb;
            box${HYPHEN}shadow: 0 8px 22px rgba(0,0,0,0.3);
            display: flex;
            align${HYPHEN}items: center;
            justify${HYPHEN}content: center;
            opacity: 0;
            transform: scale(0.3) translate(0, 0);
            transition: all 0.2s cubic${HYPHEN}bezier(0.2, 0.9, 0.3, 1) !important;
            pointer${HYPHEN}events: none;
            z${HYPHEN}index: 1;
            overflow: hidden;
        }

        .peacock_cluster_wrapper:hover .peacock_dynamic_card {
            opacity: 1;
            transform: rotate(var(${HYPHEN}${HYPHEN}rot)) translate(var(${HYPHEN}${HYPHEN}tx), var(${HYPHEN}${HYPHEN}ty)) scale(0.92);
            z${HYPHEN}index: var(${HYPHEN}${HYPHEN}zidx);
        }

        .peacock_cluster_main {
            position: relative;
            width: 62px;
            height: 62px;
            border${HYPHEN}radius: 50%;
            background: #ffffff;
            border: 4px solid #2563eb;
            box${HYPHEN}shadow: 0 10px 25px rgba(37, 99, 235, 0.35);
            display: flex;
            align${HYPHEN}items: center;
            justify${HYPHEN}content: center;
            z${HYPHEN}index: 20;
            transition: transform 0.2s ease !important;
        }

        .peacock_cluster_wrapper:hover .peacock_cluster_main {
            transform: scale(1.1);
            box${HYPHEN}shadow: 0 14px 32px rgba(37, 99, 235, 0.5);
        }

        /* 🕷️ 거미줄 펼침 및 복귀(Unspiderfy) 트랜지션 0.2초 초고속 통일 */
        .leaflet${HYPHEN}cluster${HYPHEN}spider${HYPHEN}leg {
            transition: all 0.2s cubic${HYPHEN}bezier(0.2, 0.9, 0.3, 1) !important;
        }

        .leaflet${HYPHEN}marker${HYPHEN}icon {
            transition: transform 0.2s cubic${HYPHEN}bezier(0.2, 0.9, 0.3, 1), opacity 0.2s ease !important;
        }

        /* 📱 세로 화면 (Portrait 태블릿 및 모바일) 완벽 최적화: 수직 바닥 끝까지 자율 스크롤 해제 */
        html, body {
            min${HYPHEN}height: 100vh !important;
            height: auto !important;
            overflow${HYPHEN}y: auto !important;
        }

        /* 모바일 바텀 시트 손잡이 바 기본 숨김 */
        .bottom_sheet_handle {
            display: none;
        }

        /* 📱 세로 화면 (Portrait 태블릿 및 모바일) 구글맵/카카오맵 스타일 네이티브 바텀 시트 적용 */
        @media screen and (orientation: portrait), screen and (max${HYPHEN}width: 900px) {
            #appContainer {
                height: 100vh !important;
                overflow: hidden !important;
                position: relative !important;
                padding${HYPHEN}bottom: 0 !important;
            }

            #mainHeader {
                flex${HYPHEN}direction: column !important;
                align${HYPHEN}items: flex${HYPHEN}start !important;
                gap: 0 !important;
                padding: 8px 12px 6px 12px !important;
            }

            /* 세로모드에서 빅뱅 필터를 제외한 로고 및 메인 타이틀, 필터 라벨 깔끔 숨김 */
            .logo_section, .filter_label {
                display: none !important;
            }

            .header_controls {
                width: 100% !important;
                flex${HYPHEN}direction: column !important;
                align${HYPHEN}items: flex${HYPHEN}start !important;
                gap: 0 !important;
            }

            .filter_section {
                width: 100% !important;
                overflow${HYPHEN}x: auto !important;
                white${HYPHEN}space: nowrap !important;
                padding${HYPHEN}bottom: 0 !important;
            }

            .grade_filters {
                display: flex !important;
                flex${HYPHEN}wrap: nowrap !important;
                overflow${HYPHEN}x: auto !important;
                gap: 6px !important;
                width: max${HYPHEN}content !important;
            }

            .filter_btn {
                flex${HYPHEN}shrink: 0 !important;
            }

            /* 세로모드에서 학생모드 / 관리자모드 섹션 깔끔하게 숨김 */
            .mode_section {
                display: none !important;
            }

            #mainContent {
                flex${HYPHEN}direction: column !important;
                padding: 0 !important;
                gap: 0 !important;
                height: calc(100vh ${HYPHEN} 52px) !important;
                position: relative !important;
            }

            #mapWrapper {
                width: 100% !important;
                height: 100% !important;
                min${HYPHEN}height: 100% !important;
                border${HYPHEN}radius: 0 !important;
                flex: 1 1 100% !important;
            }

            .bottom_sheet_handle {
                display: flex !important;
                flex${HYPHEN}direction: column !important;
                align${HYPHEN}items: center !important;
                justify${HYPHEN}content: center !important;
                padding: 10px 16px 8px 16px !important;
                cursor: pointer !important;
                background: #ffffff !important;
                border${HYPHEN}radius: 28px 28px 0 0 !important;
                touch${HYPHEN}action: none !important;
                user${HYPHEN}select: none !important;
                box${HYPHEN}shadow: 0 ${HYPHEN}4px 12px rgba(0, 0, 0, 0.05);
                z${HYPHEN}index: 100 !important;
                position: relative !important;
                flex${HYPHEN}shrink: 0 !important;
            }

            .handle_pill {
                width: 44px;
                height: 5px;
                background: #cbd5e1;
                border${HYPHEN}radius: 10px;
                margin${HYPHEN}bottom: 6px;
            }

            .handle_info {
                display: flex;
                align${HYPHEN}items: center;
                justify${HYPHEN}content: space${HYPHEN}between;
                width: 100%;
            }

            .handle_hint {
                font${HYPHEN}size: 13px;
                font${HYPHEN}weight: 700;
                color: #2563eb;
            }

            .handle_close_btn {
                font${HYPHEN}size: 12px;
                font${HYPHEN}weight: 700;
                color: #ef4444;
                background: #fee2e2;
                padding: 4px 10px;
                border${HYPHEN}radius: 12px;
                cursor: pointer;
            }

            /* 세로모드에서 중복 탭 타이틀 "활동 목록" 깔끔하게 숨김 처리 */
            .panel_tabs #tabListBtn {
                display: none !important;
            }

            #sidePanel {
                position: fixed !important;
                bottom: 0 !important;
                left: 0 !important;
                width: 100% !important;
                z${HYPHEN}index: 9999 !important;
                background: #ffffff !important;
                border${HYPHEN}radius: 28px 28px 0 0 !important;
                box${HYPHEN}shadow: 0 ${HYPHEN}10px 40px rgba(0, 0, 0, 0.25) !important;
                transition: height 0.3s cubic${HYPHEN}bezier(0.16, 1, 0.3, 1) !important;
                display: flex !important;
                flex${HYPHEN}direction: column !important;
                overflow: hidden !important;
            }

            /* 3단계 바텀시트 고도 상태 */
            #sidePanel.collapsed {
                height: 54px !important;
            }

            #sidePanel.half {
                height: 40vh !important;
            }

            #sidePanel.expanded {
                height: 82vh !important;
            }

            .tab_content {
                flex: 1 !important;
                overflow${HYPHEN}y: auto !important;
                ${HYPHEN}webkit${HYPHEN}overflow${HYPHEN}scrolling: touch !important;
            }

            .activity_list {
                display: flex !important;
                flex${HYPHEN}direction: column !important;
                overflow${HYPHEN}y: auto !important;
                padding: 12px 16px 35px 16px !important;
                gap: 12px !important;
                height: 100% !important;
            }

            .activity_card {
                width: 100% !important;
                min${HYPHEN}width: 100% !important;
                max${HYPHEN}width: 100% !important;
                height: auto !important;
                flex${HYPHEN}shrink: 0 !important;
                box${HYPHEN}sizing: border${HYPHEN}box !important;
            }

            /* 다양한 패드 기기 스크린 높이 비율(68vh) 자동 맞춤 및 설명 내부 독립 스크롤 지정 */
            .detail_card_wrapper {
                width: 92% !important;
                max${HYPHEN}width: 480px !important;
                height: 68vh !important;
                max${HYPHEN}height: 520px !important;
                min${HYPHEN}height: 320px !important;
            }

            .detail_hero_section {
                height: 50% !important;
                max${HYPHEN}height: 50% !important;
                flex: 0 0 50% !important;
                min${HYPHEN}height: 0 !important;
            }

            .detail_card_body {
                height: 50% !important;
                max${HYPHEN}height: 50% !important;
                flex: 0 0 50% !important;
                min${HYPHEN}height: 0 !important;
                padding: 14px 18px !important;
                gap: 10px !important;
                overflow${HYPHEN}y: auto !important;
                ${HYPHEN}webkit${HYPHEN}overflow${HYPHEN}scrolling: touch !important;
            }

            .detail_content_box, .detail_content_paper, .detail_content_text {
                overflow${HYPHEN}y: auto !important;
                ${HYPHEN}webkit${HYPHEN}overflow${HYPHEN}scrolling: touch !important;
                max${HYPHEN}height: 100% !important;
            }

            .detail_card_body h2 {
                font${HYPHEN}size: 18px !important;
            }

            .detail_content_paper p {
                font${HYPHEN}size: 13px !important;
                line${HYPHEN}height: 1.5 !important;
            }
        }
    `;
    document.head.appendChild(styleEl);
}

// 이용자(학생) 모드 및 관리자 모드 상태 전환
function switchUserMode(mode) {
    if (mode === "admin") {
        const pw = prompt("관리자 비밀번호를 입력하세요.");
        if (pw !== "4044") {
            showToast("비밀번호가 올바르지 않습니다.");
            state.userMode = "user";
            updateModeUI();
            return;
        }
    }
    state.userMode = mode;
    updateModeUI();
    showToast(mode === "admin" ? "🔑 관리자 모드로 전환되었습니다." : "👥 학생 모드로 전환되었습니다.");
}

// 모드 상태에 따른 UI 요소 제어 및 노출 여부 관리
function updateModeUI() {
    const userBtn = document.getElementById("modeUserBtn");
    const adminBtn = document.getElementById("modeAdminBtn");
    const tabAddBtn = document.getElementById("tabAddBtn");
    const mapInst = document.getElementById("mapInstruction");
    const syncCloudBtn = document.getElementById("syncCloudBtn");

    // 1. 모드 토글 스위치 액티브 스타일 제어
    if (state.userMode === "admin") {
        userBtn.classList.remove("active");
        adminBtn.classList.add("active");
        applyStyles(adminBtn, {
            background: "#ffffff",
            color: "#1e3a8a",
            boxShadow: "0 4px 10px rgba(0, 0, 0, 0.05)"
        });
        applyStyles(userBtn, {
            background: "transparent",
            color: "#64748b",
            boxShadow: "none"
        });

        // 관리자는 활동 등록 탭 및 클라우드 동기화 도구 노출
        applyStyles(tabAddBtn, { display: "block" });
        if (syncCloudBtn) {
            applyStyles(syncCloudBtn, { display: "inline-flex" });
        }
        if (mapInst) {
            mapInst.innerHTML = "<p>💡 지도의 특정 위치를 클릭하면 새로운 활동을 등록할 수 있습니다.</p>";
        }
    } else {
        userBtn.classList.add("active");
        adminBtn.classList.remove("active");
        applyStyles(userBtn, {
            background: "#ffffff",
            color: "#1e3a8a",
            boxShadow: "0 4px 10px rgba(0, 0, 0, 0.05)"
        });
        applyStyles(adminBtn, {
            background: "transparent",
            color: "#64748b",
            boxShadow: "none"
        });

        // 학생은 활동 등록 탭 및 클라우드 동기화 버튼 완벽 숨김
        applyStyles(tabAddBtn, { display: "none" });
        if (syncCloudBtn) {
            applyStyles(syncCloudBtn, { display: "none" });
        }
        if (mapInst) {
            mapInst.innerHTML = "<p>💡 지도 위의 활동 스티커를 클릭하면 자세한 내용을 볼 수 있습니다.</p>";
        }

        // 만약 현재 활동 등록 탭이 열려있다면 즉시 활동 목록 탭으로 복귀
        const addTab = document.getElementById("tabAdd");
        if (addTab && addTab.classList.contains("active")) {
            switchTab("list");
        }
    }

    // 2. 개별 리스트 카드 내 삭제 버튼 표시 여부 실시간 반영을 위해 리스트 재렌더링
    updateActivityList();
}

// 탭 활성화 여부에 따른 버튼 스타일 갱신
function updateTabBtnStyles() {
    const listBtn = document.getElementById("tabListBtn");
    const addBtn = document.getElementById("tabAddBtn");

    if (listBtn.classList.contains("active")) {
        applyStyles(listBtn, {
            background: "#ffffff",
            color: "#1e3a8a",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.05)"
        });
        applyStyles(addBtn, {
            background: "transparent",
            color: "#64748b",
            boxShadow: "none"
        });
    } else {
        applyStyles(addBtn, {
            background: "#ffffff",
            color: "#1e3a8a",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.05)"
        });
        applyStyles(listBtn, {
            background: "transparent",
            color: "#64748b",
            boxShadow: "none"
        });
    }
}

// 지도 인스턴스 기동 및 부드러운 터치 줌 설정
function initMap() {
    // 나주시의 중심 좌표 및 적절한 줌 레벨
    const najuCenter = [35.016, 126.716];

    state.map = L.map("map", {
        zoomControl: false,
        minZoom: 10,
        maxZoom: 19,
        touchZoom: true,
        bounceAtZoomLimits: false
    }).setView(najuCenter, 11);

    setTimeout(() => {
        state.map.invalidateSize();
    }, 100);

    // 완벽한 한글 지명을 제공하는 오픈스트리트맵 기본 타일 연동
    const tileUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
    const attribution = "&copy; OpenStreetMap contributors";

    L.tileLayer(tileUrl, {
        attribution: attribution,
        maxZoom: 19,
        maxNativeZoom: 19
    }).addTo(state.map);

    // 1번 기능: 스마트 사진 클러스터링 & 🦚 공작새 부채(Peacock Fan) 롤오버 그룹 레이어 세팅
    if (typeof L.markerClusterGroup === "function") {
        state.markerClusterGroup = L.markerClusterGroup({
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true,
            spiderfyOnMaxZoom: true,
            spiderfyDistanceMultiplier: 1.5,
            removeOutsideVisibleBounds: true,
            maxClusterRadius: 40,
            iconCreateFunction: function (cluster) {
                const count = cluster.getChildCount();
                const childMarkers = cluster.getAllChildMarkers();

                // 묶음 내 마커들의 실제 대표 사진 URL 및 스티커 정보 추출
                let cardItems = [];
                childMarkers.forEach(m => {
                    if (m && m.activityId) {
                        const act = state.activities.find(a => a.id === m.activityId);
                        if (act) {
                            const hasRealImg = act.images && act.images.length > 0 && act.images[0] && act.images[0] !== BACKUP_IMAGE;
                            const thumb = hasRealImg ? act.images[0] : null;
                            const sticker = STICKER_TYPES[act.sticker] || STICKER_TYPES.b_yuchoyium;
                            cardItems.push({
                                thumb: thumb,
                                emoji: sticker.emoji,
                                color: sticker.color
                            });
                        }
                    }
                });

                // 최소 1개, 최대 5개까지 유연하게 표시
                const totalDisplay = Math.min(cardItems.length > 0 ? cardItems.length : 1, 5);
                const displayItems = cardItems.length > 0 ? cardItems.slice(0, totalDisplay) : [{ thumb: null, emoji: "📸", color: "#2563eb" }];

                // N개 (1~5개)에 맞춘 부채꼴 각도 및 둥근 아치 궤적 수학 공식 연산
                let fanCardsHtml = "";
                let startAngle = 0;
                let angleStep = 0;

                if (totalDisplay === 1) {
                    startAngle = 0;
                    angleStep = 0;
                } else if (totalDisplay === 2) {
                    startAngle = -26;
                    angleStep = 52;
                } else if (totalDisplay === 3) {
                    startAngle = -42;
                    angleStep = 42;
                } else if (totalDisplay === 4) {
                    startAngle = -51;
                    angleStep = 34;
                } else if (totalDisplay >= 5) {
                    startAngle = -60;
                    angleStep = 30;
                }

                const R = 44; // 떠오르는 아치 반경 (px)

                displayItems.forEach((item, idx) => {
                    const angle = startAngle + (idx * angleStep);
                    const rad = angle * (Math.PI / 180);
                    const tx = Math.round(R * Math.sin(rad));
                    const ty = Math.round(-R * Math.cos(rad));

                    let innerHtml = item.thumb
                        ? `<img src="${item.thumb}" style="width:100%; height:100%; object-fit:cover; border-radius:50%; display:block;" />`
                        : `<span style="font-size:16px;">${item.emoji}</span>`;

                    fanCardsHtml += `
                        <div class="peacock_dynamic_card" style="
                            --tx: ${tx}px;
                            --ty: ${ty}px;
                            --rot: ${angle}deg;
                            --zidx: ${10 + idx};
                            border-color: ${item.color || '#2563eb'};
                        ">
                            ${innerHtml}
                        </div>
                    `;
                });

                const mainThumb = (cardItems.length > 0 && cardItems[0].thumb)
                    ? `<img src="${cardItems[0].thumb}" style="width:100%; height:100%; object-fit:cover; border-radius:50%; display:block;" />`
                    : `<span style="font-size: 20px;">📸</span>`;

                return L.divIcon({
                    html: `
                        <div class="peacock_cluster_wrapper">
                            <!-- 🦚 동적 1개~5개 둥근 공작새 아치 카드들 -->
                            ${fanCardsHtml}

                            <!-- 메인 묶음 마커 -->
                            <div class="peacock_cluster_main">
                                ${mainThumb}
                                <div style="
                                    position: absolute;
                                    top: -4px;
                                    right: -4px;
                                    background: linear-gradient(135deg, #2563eb, #3b82f6);
                                    color: #ffffff;
                                    font-size: 11px;
                                    font-weight: 800;
                                    padding: 2px 7px;
                                    border-radius: 12px;
                                    border: 2px solid #ffffff;
                                    box-shadow: 0 3px 8px rgba(0,0,0,0.22);
                                    z-index: 25;
                                ">${count}</div>
                            </div>
                        </div>
                    `,
                    className: "custom_peacock_cluster_icon",
                    iconSize: [56, 56],
                    iconAnchor: [28, 28]
                });
            }
        });
        state.map.addLayer(state.markerClusterGroup);
    }

    // 구식 +/- 버튼 대신 터치 스크린 전용 부드러운 수직 줌 스크롤 슬라이더 탑재
    setupTouchZoomSlider();

    // 지도 클릭 이벤트: 활동 목록 모드에서는 최초 중심점 복귀, 등록 모드에서는 좌표 등록
    state.map.on("click", (e) => {
        const listTab = document.getElementById("tabList");
        if (listTab && listTab.classList.contains("active")) {
            // 활동 목록 모드에서 빈 지도를 클릭한 경우 최초 지도 사이즈 및 나주시 중심점으로 복귀
            resetToInitialState();
            return;
        }

        if (state.userMode === "user") {
            showToast("활동 등록은 관리자 모드에서만 가능합니다.");
            return;
        }
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;
        openRegisterFormAt(lat, lng);
    });
}

// 부드러운 터치 수직 줌 스크롤 슬라이더 컨트롤러 생성
function setupTouchZoomSlider() {
    if (!state.map) return;

    const ZoomSliderControl = L.Control.extend({
        options: { position: "bottomright" },
        onAdd: function (map) {
            const container = L.DomUtil.create("div", "touch_zoom_slider_container");
            L.DomEvent.disableClickPropagation(container);
            L.DomEvent.disableScrollPropagation(container);

            // 확대 단추 (＋)
            const zoomInBtn = document.createElement("button");
            zoomInBtn.type = "button";
            zoomInBtn.className = "zoom_icon_btn";
            zoomInBtn.innerHTML = "＋";
            zoomInBtn.title = "확대";
            L.DomEvent.disableClickPropagation(zoomInBtn);
            zoomInBtn.addEventListener("click", (e) => {
                L.DomEvent.stopPropagation(e);
                if (map.getZoom() < map.getMaxZoom()) {
                    map.zoomIn(1, { animate: true });
                }
            });

            // 슬라이더 스크롤 트랙
            const track = document.createElement("div");
            track.className = "zoom_slider_track";

            // 터치 스크롤 레인지 슬라이더 (정수 줌 step 1 적용으로 소수점 타일 계산 에러 차단)
            const slider = document.createElement("input");
            slider.type = "range";
            slider.className = "zoom_range_input";
            slider.min = map.getMinZoom();
            slider.max = map.getMaxZoom();
            slider.step = 1;
            slider.value = Math.round(map.getZoom());

            // 터치/드래그 스크롤 시 정수 줌으로 안전하게 갱신
            slider.addEventListener("input", (e) => {
                const newZoom = Math.round(parseFloat(e.target.value));
                if (map.getZoom() !== newZoom) {
                    map.setZoom(newZoom, { animate: true });
                }
            });

            // 지도 상에서 줌이 일어날 때 슬라이더 노브 위치 정수형 동기화
            map.on("zoom zoomend", () => {
                slider.value = Math.round(map.getZoom());
            });

            // 축소 단추 (－)
            const zoomOutBtn = document.createElement("button");
            zoomOutBtn.type = "button";
            zoomOutBtn.className = "zoom_icon_btn";
            zoomOutBtn.innerHTML = "－";
            zoomOutBtn.title = "축소";
            L.DomEvent.disableClickPropagation(zoomOutBtn);
            zoomOutBtn.addEventListener("click", (e) => {
                L.DomEvent.stopPropagation(e);
                if (map.getZoom() > map.getMinZoom()) {
                    map.zoomOut(1, { animate: true });
                }
            });

            track.appendChild(slider);
            container.appendChild(zoomInBtn);
            container.appendChild(track);
            container.appendChild(zoomOutBtn);

            return container;
        }
    });

    state.map.addControl(new ZoomSliderControl());
}

// 특정 경위도 좌표에서 등록 폼 탭 열기
function openRegisterFormAt(lat, lng) {
    state.selectedLat = lat;
    state.selectedLng = lng;

    const display = document.getElementById("coordsDisplay");
    display.textContent = `위도: ${lat.toFixed(5)}, 경도: ${lng.toFixed(5)}`;
    applyStyles(display, {
        background: "#eff6ff",
        color: "#2563eb",
        borderColor: "#bfdbfe"
    });

    document.getElementById("inputLat").value = lat;
    document.getElementById("inputLng").value = lng;

    // 탭을 활동 등록으로 변경
    switchTab("add");
}

// 탭 스위칭 로직
function switchTab(tabType) {
    const listTab = document.getElementById("tabList");
    const addTab = document.getElementById("tabAdd");
    const listBtn = document.getElementById("tabListBtn");
    const addBtn = document.getElementById("tabAddBtn");

    if (tabType === "list") {
        listTab.classList.add("active");
        addTab.classList.remove("active");
        listBtn.classList.add("active");
        addBtn.classList.remove("active");
        applyStyles(listTab, { display: "flex" });
        applyStyles(addTab, { display: "none" });
    } else {
        addTab.classList.add("active");
        listTab.classList.remove("active");
        addBtn.classList.add("active");
        listBtn.classList.remove("active");
        applyStyles(addTab, { display: "flex" });
        applyStyles(listTab, { display: "none" });
    }
    updateTabBtnStyles();
}

// 나주시 행정구역 경계선 및 읍면동 정밀 데이터 획득 (공식 행정동 및 시군구 데이터 연동)
function fetchNajuBoundaries() {
    const cacheKey = "naju_umd_geojson_v4";
    const cachedData = localStorage.getItem(cacheKey);

    if (cachedData) {
        try {
            const geojson = JSON.parse(cachedData);
            // 최소 5개 이상의 features 행정구역 데이터가 있어야 정상 캐시로 판단하여 렌더링
            if (geojson && geojson.features && geojson.features.length > 5) {
                drawUmdBoundaries(geojson);
                hideMapLoader();
                return;
            }
        } catch (e) {
            console.error("캐시 데이터 파싱 에러", e);
            localStorage.removeItem(cacheKey);
        }
    }

    // 오픈소스 행정경계 저장소 데이터 주소 조합 (하이픈 제외)
    const repoPart = "Local_HangJeongDong";
    const mapRepoPart = "southkorea" + HYPHEN + "maps";

    const umdUrl = `https://raw.githubusercontent.com/raqoon886/${repoPart}/master/hangjeongdong_%EC%A0%84%EB%9D%BC%EB%82%A8%EB%8F%84.geojson`;
    const sggUrl = `https://raw.githubusercontent.com/southkorea/${mapRepoPart}/master/kostat/2018/json/skorea${HYPHEN}municipalities${HYPHEN}2018${HYPHEN}geo.json`;

    Promise.all([
        fetch(umdUrl).then(res => res.json()),
        fetch(sggUrl).then(res => res.json())
    ])
        .then(([umdData, sggData]) => {
            // 1. 나주시 행정동 필터링 (행정동 레벨 8)
            const umdFeatures = umdData.features.filter(f => {
                const code = f.properties.sgg || f.properties.sigungu || "";
                const name = f.properties.sggnm || f.properties.sigungunm || "";
                return name === "나주시" || code.toString() === "46170";
            }).map(f => {
                const cleanName = f.properties.dongnm || f.properties.adm_nm.split(" ").pop();
                return {
                    type: "Feature",
                    properties: {
                        name: cleanName,
                        adminLevel: "8",
                        type: "읍면동"
                    },
                    geometry: f.geometry
                };
            });

            // 2. 나주시 전체 시경계 필터링 (시군구 레벨 6)
            const sggFeature = sggData.features.find(f => {
                const code = f.properties.code || "";
                const name = f.properties.name || "";
                return name === "나주시" || code.toString() === "46170";
            });

            const finalFeatures = [...umdFeatures];
            if (sggFeature) {
                finalFeatures.push({
                    type: "Feature",
                    properties: {
                        name: "나주시",
                        adminLevel: "6",
                        type: "시경계"
                    },
                    geometry: sggFeature.geometry
                });
            }

            const geojson = {
                type: "FeatureCollection",
                features: finalFeatures
            };

            // 행정동 필터 개수가 정상적일 때만 정상 캐싱 및 렌더링
            if (finalFeatures.length > 5) {
                localStorage.setItem(cacheKey, JSON.stringify(geojson));
                drawUmdBoundaries(geojson);
            } else {
                throw new Error("정상적인 나주시 행정경계 개수가 아닙니다.");
            }
            hideMapLoader();
        })
        .catch(err => {
            console.error("경계 데이터 획득 에러, 정적 백업 데이터로 복원합니다", err);
            if (typeof NAJU_BACKUP_GEOJSON !== "undefined") {
                drawUmdBoundaries(NAJU_BACKUP_GEOJSON);
            } else {
                showToast("나주시 행정구역 경계를 불러오는 데 실패했습니다.");
            }
            hideMapLoader();
        });
}

// 지도 위에 정밀 읍면동 경계선 그리기 및 상호작용 설정
function drawUmdBoundaries(geojson) {
    if (state.umdLayer) {
        state.map.removeLayer(state.umdLayer);
    }

    state.umdLayer = L.geoJSON(geojson, {
        style: function (feature) {
            const level = feature.properties.adminLevel;
            if (level === "6") {
                // 나주시 전체 시 경계 스타일 (진하고 굵은 경계선)
                return {
                    color: "#1e3a8a",
                    weight: 3.5,
                    fillColor: "none",
                    fillOpacity: 0,
                    lineCap: "round",
                    lineJoin: "round",
                    interactive: false // 시경계선이 읍면동 클릭을 가로막지 않도록 인터랙티브 비활성화
                };
            } else {
                // 개별 읍면동 경계선 스타일 (연하고 얇은 점선)
                return {
                    color: "#818cf8",
                    weight: 1.2,
                    dashArray: "4, 4",
                    fillColor: "#e0e7ff",
                    fillOpacity: 0.2,
                    transition: "all 0.3s ease"
                };
            }
        },
        onEachFeature: function (feature, layer) {
            // 시경계(레벨6)는 단순 장식용 외곽선이므로 이벤트를 걸지 않고 조기 리턴
            if (feature.properties.adminLevel === "6") return;

            // 읍면동(레벨8)에 대해서만 마우스 및 클릭 이벤트 연동
            layer.on("mouseover", (e) => {
                const polygon = e.target;
                polygon.setStyle({
                    fillColor: "#818cf8",
                    fillOpacity: 0.5,
                    color: "#4f46e5",
                    weight: 1.8
                });

                layer.bindTooltip(feature.properties.name, {
                    direction: "center",
                    permanent: false,
                    className: "umd_tooltip"
                }).openTooltip();
            });

            layer.on("mouseout", (e) => {
                state.umdLayer.resetStyle(e.target);
            });

            layer.on("click", (e) => {
                L.DomEvent.stopPropagation(e);
                const listTab = document.getElementById("tabList");
                if (listTab && listTab.classList.contains("active")) {
                    resetToInitialState();
                    return;
                }
                if (state.userMode === "user") {
                    showToast("활동 등록은 관리자 모드에서만 가능합니다.");
                    return;
                }
                const lat = e.latlng.lat;
                const lng = e.latlng.lng;
                openRegisterFormAt(lat, lng);
            });
        }
    }).addTo(state.map);

    // 저장된 마커 재배치
    renderActivitiesOnMap();
}



// 다중 업로드 이미지 프리뷰 리스트 렌더링
function renderPreviewList() {
    const previewList = document.getElementById("imagePreviewList");
    if (!previewList) return;
    previewList.innerHTML = "";

    state.selectedImages.forEach((imgData, index) => {
        const wrapper = document.createElement("div");
        wrapper.className = "preview_image_wrapper";

        const img = document.createElement("img");
        img.src = imgData;
        img.alt = "업로드 이미지";

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "remove_btn";
        removeBtn.innerHTML = "×";

        removeBtn.addEventListener("click", () => {
            state.selectedImages.splice(index, 1);
            renderPreviewList();
        });

        wrapper.appendChild(img);
        wrapper.appendChild(removeBtn);
        previewList.appendChild(wrapper);
    });
}

// 이미지 미리보기 영역 숨김
function hideImagePreview() {
    const previewList = document.getElementById("imagePreviewList");
    if (previewList) previewList.innerHTML = "";
    state.selectedImages = [];
}

// 이벤트 핸들러 일괄 매핑
function setupEventListeners() {
    const listBtn = document.getElementById("tabListBtn");
    const addBtn = document.getElementById("tabAddBtn");
    const closeBtn = document.getElementById("closeOverlayBtn");
    const detailOverlay = document.getElementById("detailOverlay");
    const fileInput = document.getElementById("inputImage");
    const activityForm = document.getElementById("activityForm");
    const modeUserBtn = document.getElementById("modeUserBtn");
    const modeAdminBtn = document.getElementById("modeAdminBtn");
    const syncCloudBtn = document.getElementById("syncCloudBtn");

    listBtn.addEventListener("click", () => switchTab("list"));
    addBtn.addEventListener("click", () => switchTab("add"));

    modeUserBtn.addEventListener("click", () => switchUserMode("user"));
    modeAdminBtn.addEventListener("click", () => switchUserMode("admin"));

    if (syncCloudBtn) {
        syncCloudBtn.addEventListener("click", uploadLocalDataToFirebase);
    }

    // 오버레이 클릭 시 닫기
    closeBtn.addEventListener("click", hideDetailOverlay);
    detailOverlay.addEventListener("click", (e) => {
        if (e.target === detailOverlay) {
            hideDetailOverlay();
        }
    });

    // 이미지 캔버스 리사이징 및 획기적 용량 압축 (localStorage 5MB 제한 회피용)
    function compressImage(dataUrl, callback, maxWidth = 800, maxHeight = 800, quality = 0.7) {
        const img = new Image();
        img.onload = () => {
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width = Math.round((width * maxHeight) / height);
                    height = maxHeight;
                }
            }

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, width, height);

            // JPEG 0.7 품질로 압축하여 DataURL 크기를 30~80KB 수준으로 최소화
            const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
            callback(compressedDataUrl);
        };
        img.onerror = () => {
            // 에러 시 원본 사용
            callback(dataUrl);
        };
        img.src = dataUrl;
    }

    // 다중 파일 업로드 처리 (캔버스 자동 리사이징 및 압축 적용)
    fileInput.addEventListener("change", (e) => {
        const files = Array.from(e.target.files);
        let loadedCount = 0;

        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (event) => {
                // 캔버스 압축을 거쳐 용량을 99% 축소
                compressImage(event.target.result, (compressedUrl) => {
                    state.selectedImages.push(compressedUrl);
                    loadedCount++;
                    if (loadedCount === files.length) {
                        renderPreviewList();
                    }
                });
            };
            reader.readAsDataURL(file);
        });
        fileInput.value = ""; // 동일 파일 재선택 가능 처리
    });

    // 대표 스티커 카테고리 셀렉터 동작
    document.querySelectorAll(".sticker_option").forEach(opt => {
        opt.addEventListener("click", () => {
            document.querySelectorAll(".sticker_option").forEach(el => el.classList.remove("active"));
            opt.classList.add("active");

            const stickerKey = opt.dataset.sticker;
            state.selectedSticker = stickerKey;
        });
    });

    // BIGBANG 칩 클릭 바인딩
    document.querySelectorAll(".grade_chip").forEach(chip => {
        chip.addEventListener("click", () => {
            const val = chip.dataset.value;
            if (state.selectedGrades.includes(val)) {
                state.selectedGrades = state.selectedGrades.filter(g => g !== val);
                chip.classList.remove("active");
            } else {
                state.selectedGrades.push(val);
                chip.classList.add("active");
            }
        });
    });

    // 등록 폼 제출 및 완결 단추 클릭 이벤트 매핑
    activityForm.addEventListener("submit", (e) => {
        e.preventDefault();
        saveActivityRecord();
    });

    const saveBtn = document.getElementById("saveBtn");
    if (saveBtn) {
        saveBtn.addEventListener("click", (e) => {
            e.preventDefault();
            saveActivityRecord();
        });
    }

    // BIGBANG 필터 버튼 바인딩
    document.querySelectorAll(".filter_btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".filter_btn").forEach(el => el.classList.remove("active"));
            btn.classList.add("active");

            state.currentCategoryFilter = btn.dataset.bigbang;
            applyCategoryFilter();
        });
    });
}

// 상단 카테고리 필터를 '전체(all)'로 자동 리셋
function resetCategoryFilterToAll() {
    state.currentCategoryFilter = "all";
    document.querySelectorAll(".filter_btn").forEach(btn => {
        if (btn.dataset.bigbang === "all") {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });
}

// 활동 레코드 저장/수정 프로세스
function saveActivityRecord() {
    const title = document.getElementById("inputTitle").value.trim();
    const content = document.getElementById("inputContent").value.trim();

    if (state.selectedLat === null || state.selectedLng === null || isNaN(state.selectedLat) || isNaN(state.selectedLng)) {
        showToast("지도를 클릭하거나 위치가 지정되어 있어야 합니다!");
        return;
    }

    if (!title || !content) {
        showToast("모든 항목을 입력해 주세요.");
        return;
    }

    const images = state.selectedImages.length > 0 ? [...state.selectedImages] : [BACKUP_IMAGE];

    if (state.editingActivityId) {
        // 기존 활동 수정 업데이트 (불변 객체 배열 전면 교체)
        state.activities = state.activities.map(act => {
            if (act.id === state.editingActivityId) {
                return {
                    ...act,
                    title: title,
                    sticker: state.selectedSticker,
                    content: content,
                    images: images,
                    lat: Number(state.selectedLat),
                    lng: Number(state.selectedLng)
                };
            }
            return act;
        });
        showToast("활동 기록이 성공적으로 수정되었습니다!");
    } else {
        // 신규 활동 추가
        const newActivity = {
            id: "act_" + Date.now(),
            title: title,
            sticker: state.selectedSticker,
            content: content,
            images: images,
            lat: Number(state.selectedLat),
            lng: Number(state.selectedLng)
        };
        state.activities.unshift(newActivity);
        showToast("새로운 활동이 지도에 등록되었습니다!");
    }

    // 변경된 항목이 즉시 눈에 보이도록 상단 필터를 '전체'로 자동 전환
    resetCategoryFilterToAll();

    // 로컬스토리지 영구 저장 및 최신화
    saveActivities();
    resetForm();
    switchTab("list");
}

// 활동 수정 모드 개시
function startEditActivity(act) {
    state.editingActivityId = act.id;
    state.selectedLat = Number(act.lat);
    state.selectedLng = Number(act.lng);
    state.selectedSticker = act.sticker || "b_yuchoyium";

    // 기본 백업 이미지(BACKUP_IMAGE)는 제외하여 사용자가 새로 첨부하는 사진이 1순위 대표 이미지가 되도록 함
    state.selectedImages = act.images && act.images.length > 0
        ? act.images.filter(img => img !== BACKUP_IMAGE)
        : [];

    // 위치 표시 업데이트
    const display = document.getElementById("coordsDisplay");
    if (display) {
        display.textContent = `위도: ${Number(act.lat).toFixed(5)}, 경도: ${Number(act.lng).toFixed(5)}`;
        applyStyles(display, {
            background: "#eff6ff",
            color: "#2563eb",
            borderColor: "#bfdbfe"
        });
    }

    document.getElementById("inputLat").value = act.lat;
    document.getElementById("inputLng").value = act.lng;
    document.getElementById("inputTitle").value = act.title || "";
    document.getElementById("inputContent").value = act.content || "";

    // 스티커 셀렉터 UI 활성화
    document.querySelectorAll(".sticker_option").forEach(opt => {
        if (opt.dataset.sticker === state.selectedSticker) {
            opt.classList.add("active");
        } else {
            opt.classList.remove("active");
        }
    });

    // 업로드 이미지 프리뷰 렌더링
    renderPreviewList();

    // 등록 버튼 텍스트 변경
    const saveBtn = document.getElementById("saveBtn");
    if (saveBtn) saveBtn.textContent = "활동 내용 수정 완료";

    // 활동 등록(수정) 탭으로 이동
    switchTab("add");
    showToast("수정 모드로 전환되었습니다. 내용을 수정한 뒤 완결 단추를 눌러주세요.");
}

// 활동 폼 완벽 초기화
function resetForm() {
    const form = document.getElementById("activityForm");
    if (form) form.reset();

    const inputLat = document.getElementById("inputLat");
    if (inputLat) inputLat.value = "";
    const inputLng = document.getElementById("inputLng");
    if (inputLng) inputLng.value = "";
    const inputTitle = document.getElementById("inputTitle");
    if (inputTitle) inputTitle.value = "";
    const inputContent = document.getElementById("inputContent");
    if (inputContent) inputContent.value = "";

    state.editingActivityId = null;
    state.selectedImages = [];
    state.selectedSticker = "b_yuchoyium";
    state.selectedLat = null;
    state.selectedLng = null;
    hideImagePreview();

    // 스티커 셀렉터 UI 첫 항목으로 리셋
    document.querySelectorAll(".sticker_option").forEach(opt => {
        if (opt.dataset.sticker === "b_yuchoyium") {
            opt.classList.add("active");
        } else {
            opt.classList.remove("active");
        }
    });

    const display = document.getElementById("coordsDisplay");
    if (display) {
        display.textContent = "지도를 클릭하여 위치를 지정해 주세요.";
        applyStyles(display, {
            background: "rgba(241, 245, 249, 0.6)",
            color: "#64748b",
            borderColor: "rgba(226, 232, 240, 0.8)"
        });
    }

    const saveBtn = document.getElementById("saveBtn");
    if (saveBtn) saveBtn.textContent = "지도에 등록하기";
}

// 지도 위의 마커 재생성 (스마트 사진 클러스터 연동)
function renderActivitiesOnMap() {
    // 기존 마커 전체 및 클러스터 레이어 초기화
    if (state.markerClusterGroup) {
        state.markerClusterGroup.clearLayers();
    } else {
        state.markers.forEach(m => state.map.removeLayer(m));
    }
    state.markers = [];

    // 필터 조건에 부합하는 활동들을 마커로 맵핑
    state.activities.forEach(act => {
        if (shouldShowActivity(act)) {
            createMarkerForActivity(act);
        }
    });
}

// BIGBANG 스티커 필터 조건 확인
function shouldShowActivity(act) {
    if (!state.currentCategoryFilter || state.currentCategoryFilter === "all") {
        return true;
    }
    return act.sticker === state.currentCategoryFilter;
}

// 특정 활동에 대한 대표 이미지 썸네일 마커 제작 및 클러스터 그룹 연동
function createMarkerForActivity(act) {
    const sticker = STICKER_TYPES[act.sticker] || STICKER_TYPES.b_yuchoyium;

    // 대표 사진 이미지가 있는지 확인
    const hasImage = act.images && act.images.length > 0 && act.images[0];
    const thumbUrl = hasImage ? act.images[0] : null;

    let innerContent = "";
    if (thumbUrl && thumbUrl !== BACKUP_IMAGE) {
        // 실제 등록된 대표 사진 썸네일 렌더링
        innerContent = `<img src="${thumbUrl}" alt="${act.title}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block;" />`;
    } else {
        // 사진이 없는 경우 이모지 아이콘 적용
        innerContent = `<span style="font-size: 20px;">${sticker.emoji}</span>`;
    }

    // 대표 이미지 썸네일과 스티커 미니 코너 뱃지가 결합된 액자형 사진 마커 핀 (20% 확대 적용)
    const iconHtml = `
        <div class="custom_marker_pin" style="
            position: relative;
            width: 58px;
            height: 58px;
            border-radius: 50%;
            background: #ffffff;
            border: 3.5px solid ${sticker.color};
            box-shadow: 0 10px 24px rgba(0,0,0,0.25);
            display: flex;
            justify-content: center;
            align-items: center;
            cursor: pointer;
            transition: transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        ">
            ${innerContent}
            <!-- 스티커 카테고리 미니 코너 뱃지 (20% 확대) -->
            <div style="
                position: absolute;
                bottom: -3px;
                right: -3px;
                width: 24px;
                height: 24px;
                border-radius: 50%;
                background: #ffffff;
                border: 2px solid ${sticker.color};
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 13px;
                box-shadow: 0 3px 8px rgba(0,0,0,0.2);
                z-index: 5;
            ">${sticker.emoji}</div>
        </div>
    `;

    const customIcon = L.divIcon({
        html: iconHtml,
        className: "custom_leaflet_marker",
        iconSize: [58, 58],
        iconAnchor: [29, 29]
    });

    const marker = L.marker([act.lat, act.lng], { icon: customIcon });
    if (state.markerClusterGroup) {
        state.markerClusterGroup.addLayer(marker);
    } else {
        marker.addTo(state.map);
    }

    // 마커 클릭 시 우아하게 롤오버되는 오버레이 표시
    marker.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        showDetailOverlay(act);
    });

    // 마우스 호버 효과
    marker.on("mouseover", (e) => {
        const markerDom = e.target.getElement().querySelector(".custom_marker_pin");
        if (markerDom) {
            applyStyles(markerDom, {
                transform: "scale(1.15) translateY(-4px)",
                boxShadow: "0 8px 25px rgba(0,0,0,0.2)"
            });
        }
    });

    marker.on("mouseout", (e) => {
        const markerDom = e.target.getElement().querySelector(".custom_marker_pin");
        if (markerDom) {
            applyStyles(markerDom, {
                transform: "scale(1) translateY(0)",
                boxShadow: "0 4px 15px rgba(0,0,0,0.15)"
            });
        }
    });

    // 추후 삭제 등을 위해 배열 보관
    state.markers.push(marker);
    // 마커 객체 내에 활동 ID를 심어둠
    marker.activityId = act.id;
}

// 롤오버 상세 팝업 표시
function showDetailOverlay(act) {
    const overlay = document.getElementById("detailOverlay");
    const card = overlay.querySelector(".detail_card_wrapper");

    const sticker = STICKER_TYPES[act.sticker] || STICKER_TYPES.b_yuchoyium;

    const stickerBadge = document.getElementById("detailStickerBadge");
    if (stickerBadge) {
        stickerBadge.innerHTML = `<span style="font-size: 16px;">${sticker.emoji}</span> <span>${sticker.text}</span>`;
        applyStyles(stickerBadge, {
            background: "rgba(255, 255, 255, 0.95)",
            color: sticker.color,
            border: `1.5px solid ${sticker.color}30`
        });
    }

    document.getElementById("detailTitle").textContent = act.title;
    document.getElementById("detailContent").textContent = act.content;

    // 이미지 슬라이더 초기화
    state.currentSliderIndex = 0;
    const images = act.images && act.images.length > 0 ? act.images : [BACKUP_IMAGE];
    updateSliderView(images);

    // 모달을 지도 상자 내부 전용으로 부드럽게 활성화
    applyStyles(overlay, {
        display: "flex",
        position: "absolute",
        top: "0",
        left: "0",
        width: "100%",
        height: "100%",
        zIndex: "1000"
    });

    setTimeout(() => {
        applyStyles(overlay, { opacity: "1" });
        applyStyles(card, { transform: "scale(1)" });
    }, 50);

    // 팝업 열림 시 20초 무조작 타이머 시작
    startPopupInactivityTimer();
}

// 이미지 슬라이더 뷰 갱신
function updateSliderView(images) {
    const imgEl = document.getElementById("detailImage");
    const prevBtn = document.getElementById("slidePrevBtn");
    const nextBtn = document.getElementById("slideNextBtn");
    const dotsEl = document.getElementById("slideDots");

    if (!imgEl) return;

    imgEl.src = images[state.currentSliderIndex];

    if (images.length <= 1) {
        applyStyles(prevBtn, { display: "none" });
        applyStyles(nextBtn, { display: "none" });
        if (dotsEl) dotsEl.innerHTML = "";
    } else {
        applyStyles(prevBtn, { display: "flex" });
        applyStyles(nextBtn, { display: "flex" });

        // 화살표 리스너 클린 바인딩 (이벤트 중복 등록 방지)
        prevBtn.onclick = (e) => {
            e.stopPropagation();
            state.currentSliderIndex = (state.currentSliderIndex - 1 + images.length) % images.length;
            updateSliderView(images);
        };

        nextBtn.onclick = (e) => {
            e.stopPropagation();
            state.currentSliderIndex = (state.currentSliderIndex + 1) % images.length;
            updateSliderView(images);
        };

        // 도트 인디케이터 구성
        if (dotsEl) {
            dotsEl.innerHTML = "";
            images.forEach((_, idx) => {
                const dot = document.createElement("div");
                dot.className = "slide_dot" + (idx === state.currentSliderIndex ? " active" : "");
                dot.onclick = (e) => {
                    e.stopPropagation();
                    state.currentSliderIndex = idx;
                    updateSliderView(images);
                };
                dotsEl.appendChild(dot);
            });
        }
    }
}

// 상세 팝업 닫기
function hideDetailOverlay() {
    stopPopupInactivityTimer();
    const overlay = document.getElementById("detailOverlay");
    const card = overlay.querySelector(".detail_card_wrapper");

    applyStyles(overlay, { opacity: "0" });
    applyStyles(card, { transform: "scale(0.9)" });

    setTimeout(() => {
        overlay.style.display = "none";
    }, 400);
}

// 팝업 무조작 자동 닫힘 타이머 시작 (20초)
function startPopupInactivityTimer() {
    stopPopupInactivityTimer();

    // 17초 시점 (20초 3초 전) 안내 메시지
    popupNoticeTimer = setTimeout(() => {
        showToast("3초 후 화면이 전환됩니다.");
    }, 17000);

    // 20초 시점 팝업 자동 닫기
    popupInactivityTimer = setTimeout(() => {
        hideDetailOverlay();
    }, 20000);
}

// 팝업 타이머 정지
function stopPopupInactivityTimer() {
    if (popupNoticeTimer) clearTimeout(popupNoticeTimer);
    if (popupInactivityTimer) clearTimeout(popupInactivityTimer);
    popupNoticeTimer = null;
    popupInactivityTimer = null;
}

// 팝업 조작 시 20초 타이머 리셋
function resetPopupInactivityTimer() {
    const overlay = document.getElementById("detailOverlay");
    if (overlay && overlay.style.display !== "none") {
        startPopupInactivityTimer();
    }
}

// 화면 전체 무조작 자동 초기화 타이머 시작 (60초)
function startGlobalIdleTimer() {
    stopGlobalIdleTimer();

    // 57초 시점 (60초 3초 전) 안내 메시지
    idleNoticeTimer = setTimeout(() => {
        showToast("3초 후 화면이 전환됩니다.");
    }, 57000);

    // 60초 시점 초기 화면 복귀
    idleInactivityTimer = setTimeout(() => {
        resetToInitialState();
    }, 60000);
}

// 전역 무조작 타이머 정지
function stopGlobalIdleTimer() {
    if (idleNoticeTimer) clearTimeout(idleNoticeTimer);
    if (idleInactivityTimer) clearTimeout(idleInactivityTimer);
    idleNoticeTimer = null;
    idleInactivityTimer = null;
}

// 전역 조작 시 타이머 리셋
function resetGlobalIdleTimer() {
    startGlobalIdleTimer();
}

// 60초 무조작 시 초기 화면 전면 복귀 및 나주시 정중앙 포커싱 처리
function resetToInitialState() {
    hideDetailOverlay();
    resetCategoryFilterToAll();
    switchTab("list");
    resetForm();

    if (state.map) {
        if (state.umdLayer && typeof state.umdLayer.getBounds === "function" && state.umdLayer.getBounds().isValid()) {
            const isPortrait = window.matchMedia("(orientation: portrait), (max-width: 900px)").matches;
            if (isPortrait) {
                // 📱 세로모드: 하단 바텀시트에 가려지지 않도록 하단 220px 오프셋 패딩을 주어 노출 상단 영역 중앙에 타겟팅!
                state.map.flyToBounds(state.umdLayer.getBounds(), {
                    paddingTopLeft: [20, 20],
                    paddingBottomRight: [20, 220],
                    maxZoom: 11.5,
                    animate: true,
                    duration: 0.5
                });
            } else {
                state.map.flyToBounds(state.umdLayer.getBounds(), {
                    padding: [40, 40],
                    maxZoom: 11.5,
                    animate: true,
                    duration: 0.5
                });
            }
        } else {
            const isPortrait = window.matchMedia("(orientation: portrait), (max-width: 900px)").matches;
            let centerLat = isPortrait ? 34.9858 : 35.0158;
            state.map.flyTo([centerLat, 126.7815], 11, {
                animate: true,
                duration: 0.5
            });
        }
    }
    showToast("초기 화면으로 전환되었습니다.");
}

// 전역 조작 이벤트 트래커 설정
function setupGlobalIdleTracker() {
    const events = ["mousemove", "click", "keydown", "touchstart", "scroll"];
    events.forEach(evt => {
        window.addEventListener(evt, () => {
            resetGlobalIdleTimer();
            resetPopupInactivityTimer();
        }, { passive: true });
    });
}

// BIGBANG 필터가 클릭되었을 때 마커 및 목록 동기화
function applyCategoryFilter() {
    renderActivitiesOnMap();
    updateActivityList();
}

// 활동 리스트 동기화 및 렌더링
function updateActivityList() {
    const listContainer = document.getElementById("activityList");
    const countLabel = document.getElementById("activityCount");

    const filtered = state.activities.filter(shouldShowActivity);
    countLabel.textContent = filtered.length;

    listContainer.innerHTML = "";

    if (filtered.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty_message";
        const emptyNotice = state.userMode === "admin"
            ? "<p>선택된 영역의 활동 기록이 없습니다.</p><p>지도를 클릭하여 새 활동을 기록해 보세요!</p>"
            : "<p>선택된 영역의 활동 기록이 없습니다.</p>";
        empty.innerHTML = emptyNotice;
        applyStyles(empty, {
            textAlign: "center",
            padding: "40px 20px",
            color: "#94a3b8",
            fontSize: "13px"
        });
        listContainer.appendChild(empty);
        return;
    }

    filtered.forEach(act => {
        const sticker = STICKER_TYPES[act.sticker] || STICKER_TYPES.b_yuchoyium;

        const card = document.createElement("div");
        card.className = "activity_card";

        applyStyles(card, {
            background: "#ffffff",
            borderRadius: "16px",
            padding: "16px",
            marginBottom: "12px",
            border: "1px solid rgba(226, 232, 240, 0.8)",
            boxShadow: "0 4px 10px rgba(0,0,0,0.02)",
            cursor: "pointer",
            transition: "all 0.3s ease",
            display: "flex",
            gap: "12px",
            alignItems: "center",
            position: "relative"
        });

        // 호버 효과 부여
        card.addEventListener("mouseenter", () => {
            applyStyles(card, {
                transform: "translateY(-2px)",
                boxShadow: "0 6px 15px rgba(0,0,0,0.05)",
                borderColor: "#cbd5e1"
            });
        });
        card.addEventListener("mouseleave", () => {
            applyStyles(card, {
                transform: "translateY(0)",
                boxShadow: "0 4px 10px rgba(0,0,0,0.02)",
                borderColor: "rgba(226, 232, 240, 0.8)"
            });
        });

        // 썸네일 영역
        const thumb = document.createElement("div");
        applyStyles(thumb, {
            width: "60px",
            height: "60px",
            borderRadius: "12px",
            overflow: "hidden",
            background: "#f1f5f9",
            flexShrink: "0"
        });

        const img = document.createElement("img");
        img.src = act.images && act.images.length > 0 ? act.images[0] : BACKUP_IMAGE;
        applyStyles(img, {
            width: "100%",
            height: "100%",
            objectFit: "cover"
        });
        thumb.appendChild(img);

        // 텍스트 정보 영역
        const info = document.createElement("div");
        applyStyles(info, {
            flex: "1",
            overflow: "hidden"
        });

        const topRow = document.createElement("div");
        applyStyles(topRow, {
            display: "flex",
            alignItems: "center",
            gap: "6px",
            marginBottom: "4px"
        });

        const badge = document.createElement("span");
        badge.textContent = `${sticker.emoji} ${sticker.text}`;
        applyStyles(badge, {
            fontSize: "11px",
            fontWeight: "700",
            padding: "3px 8px",
            borderRadius: "8px",
            background: sticker.color + "15",
            color: sticker.color
        });

        topRow.appendChild(badge);

        const titleEl = document.createElement("h3");
        titleEl.textContent = act.title;
        applyStyles(titleEl, {
            margin: "0 0 2px 0",
            fontSize: "14px",
            fontWeight: "600",
            color: "#1e293b",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis"
        });

        info.appendChild(topRow);
        info.appendChild(titleEl);

        // 관리자 모드일 때만 카드 내 수정/삭제 버튼 추가
        if (state.userMode === "admin") {
            const btnGroup = document.createElement("div");
            applyStyles(btnGroup, {
                position: "absolute",
                top: "8px",
                right: "8px",
                display: "flex",
                gap: "6px",
                alignItems: "center"
            });

            // 수정 버튼 (✏️)
            const editBtn = document.createElement("button");
            editBtn.innerHTML = "✏️";
            editBtn.title = "활동 내용 수정";
            applyStyles(editBtn, {
                border: "1.5px solid #e2e8f0",
                background: "#ffffff",
                fontSize: "12px",
                borderRadius: "8px",
                cursor: "pointer",
                padding: "3px 6px",
                transition: "all 0.2s ease",
                boxShadow: "0 2px 4px rgba(0,0,0,0.03)"
            });

            editBtn.addEventListener("mouseenter", () => {
                applyStyles(editBtn, {
                    borderColor: "#3b82f6",
                    background: "#eff6ff"
                });
            });

            editBtn.addEventListener("mouseleave", () => {
                applyStyles(editBtn, {
                    borderColor: "#e2e8f0",
                    background: "#ffffff"
                });
            });

            editBtn.addEventListener("click", (e) => {
                L.DomEvent.stopPropagation(e);
                startEditActivity(act);
            });

            // 삭제 버튼 (×)
            const delBtn = document.createElement("button");
            delBtn.innerHTML = "×";
            delBtn.title = "활동 기록 삭제";
            applyStyles(delBtn, {
                border: "none",
                background: "none",
                fontSize: "18px",
                color: "#cbd5e1",
                cursor: "pointer",
                padding: "2px 4px",
                lineHeight: "1",
                transition: "color 0.2s"
            });

            delBtn.addEventListener("mouseenter", () => delBtn.style.color = "#ef4444");
            delBtn.addEventListener("mouseleave", () => delBtn.style.color = "#cbd5e1");

            delBtn.addEventListener("click", (e) => {
                L.DomEvent.stopPropagation(e);
                if (confirm("정말 이 활동 기록을 삭제하시겠습니까?")) {
                    deleteActivity(act.id);
                }
            });

            btnGroup.appendChild(editBtn);
            btnGroup.appendChild(delBtn);
            card.appendChild(btnGroup);
        }
        card.appendChild(thumb);
        card.appendChild(info);

        // 카드 클릭 시 해당 활동 상세 오버레이 및 맵 중심으로 비행 (세로모드 상단 시야 중심 보정)
        card.addEventListener("click", () => {
            showDetailOverlay(act);
            if (state.map) {
                const isPortrait = window.matchMedia("(orientation: portrait), (max-width: 900px)").matches;
                let targetLat = Number(act.lat);
                let targetLng = Number(act.lng);
                if (isPortrait) {
                    // 세로모드: 하단 바텀시트에 가려지지 않도록 위도를 약간 아래(-0.007)로 보정하여 상단 노출 지도 중앙에 마커 솟아오름!
                    targetLat = targetLat - 0.007;
                }
                state.map.flyTo([targetLat, targetLng], 14, {
                    animate: true,
                    duration: 0.6
                });
            }
        });

        listContainer.appendChild(card);
    });
}

// 활동 단건 삭제 처리
function deleteActivity(id) {
    state.activities = state.activities.filter(act => act.id !== id);
    resetCategoryFilterToAll();
    saveActivities();
    if (state.editingActivityId === id) {
        resetForm();
    }
    showToast("활동 기록이 삭제되었습니다.");
}

// 알림용 커스텀 토스트 팝업 띄우기
function showToast(msg) {
    const existing = document.getElementById("customToast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "customToast";
    toast.textContent = msg;

    applyStyles(toast, {
        position: "fixed",
        bottom: "40px",
        left: "50%",
        transform: "translateX(-50%) translateY(20px)",
        background: "rgba(15, 23, 42, 0.9)",
        color: "#ffffff",
        padding: "12px 24px",
        borderRadius: "12px",
        fontSize: "14px",
        zIndex: "2000",
        boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
        opacity: "0",
        transition: "all 0.3s ease",
        pointerEvents: "none"
    });

    document.body.appendChild(toast);

    setTimeout(() => {
        applyStyles(toast, {
            transform: "translateX(-50%) translateY(0)",
            opacity: "1"
        });
    }, 50);

    setTimeout(() => {
        applyStyles(toast, {
            transform: "translateX(-50%) translateY(-20px)",
            opacity: "0"
        });
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// 지도 로딩 레이어 페이드 아웃 및 제거
function hideMapLoader() {
    const loader = document.getElementById("mapLoader");
    if (loader) {
        applyStyles(loader, {
            opacity: "0",
            pointerEvents: "none"
        });
        setTimeout(() => {
            loader.style.display = "none";
        }, 400);
    }
}

// 📱 모바일 구글맵/카카오맵 스타일 3단계 바텀시트 손잡이 바 & 터치 인터랙션 연동
function setupBottomSheet() {
    const handle = document.getElementById("bottomSheetHandle");
    const sidePanel = document.getElementById("sidePanel");
    const hintText = document.getElementById("handleHintText");
    const closeBtn = document.getElementById("handleCloseBtn");
    if (!handle || !sidePanel) return;

    let startY = 0;
    let currentY = 0;
    let isDragging = false;

    function toggleState() {
        if (sidePanel.classList.contains("expanded")) {
            sidePanel.className = "half";
            if (hintText) hintText.textContent = "▲ 터치하여 크게 펼치기";
        } else if (sidePanel.classList.contains("half")) {
            sidePanel.className = "expanded";
            if (hintText) hintText.textContent = "▼ 터치하여 시트 접기";
        } else {
            sidePanel.className = "half";
            if (hintText) hintText.textContent = "▲ 터치하여 크게 펼치기";
        }
    }

    // 손잡이 바 클릭 시 토글
    handle.addEventListener("click", () => {
        if (isDragging) return;
        toggleState();
    });

    // 닫기 뱃지 직접 클릭 시 강제 접기
    if (closeBtn) {
        closeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (sidePanel.classList.contains("expanded")) {
                sidePanel.className = "half";
                if (hintText) hintText.textContent = "▲ 터치하여 크게 펼치기";
            } else {
                sidePanel.className = "collapsed";
                if (hintText) hintText.textContent = "▲ 터치하여 펼치기 / 접기";
            }
        });
    }

    // 손가락 터치 드래그 상하 스와이프 연동
    handle.addEventListener("touchstart", (e) => {
        startY = e.touches[0].clientY;
        isDragging = false;
    }, { passive: true });

    handle.addEventListener("touchmove", (e) => {
        currentY = e.touches[0].clientY;
        let deltaY = currentY - startY;
        if (Math.abs(deltaY) > 8) {
            isDragging = true;
        }
    }, { passive: true });

    handle.addEventListener("touchend", () => {
        if (!isDragging) return;
        let deltaY = currentY - startY;
        if (deltaY < -35) {
            // 위로 스와이프 올림
            if (sidePanel.classList.contains("collapsed")) {
                sidePanel.className = "half";
                if (hintText) hintText.textContent = "▲ 터치하여 크게 펼치기";
            } else {
                sidePanel.className = "expanded";
                if (hintText) hintText.textContent = "▼ 터치하여 시트 접기";
            }
        } else if (deltaY > 35) {
            // 아래로 스와이프 내림 (접기)
            if (sidePanel.classList.contains("expanded")) {
                sidePanel.className = "half";
                if (hintText) hintText.textContent = "▲ 터치하여 크게 펼치기";
            } else {
                sidePanel.className = "collapsed";
                if (hintText) hintText.textContent = "▲ 터치하여 펼치기 / 접기";
            }
        }
        isDragging = false;
    });
}
