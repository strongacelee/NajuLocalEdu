// 나주시 지역연계교육과정 운영 인포맵 핵심 스크립트
const HYPHEN = String.fromCharCode(45);

const STICKER_TYPES = {
    b_yuchoyium: { key: "B", emoji: "🏫", text: "B 유초이음", color: "#ec4899" },
    i_maeuljosa: { key: "I", emoji: "🔍", text: "I 마을조사", color: "#8b5cf6" },
    g_maeulyeongye: { key: "G", emoji: "🤝", text: "G 마을연계", color: "#3b82f6" },
    b_gongdong: { key: "B", emoji: "👥", text: "B 공동교육", color: "#10b981" },
    a_ai: { key: "A", emoji: "🤖", text: "A AI활용", color: "#f59e0b" },
    n_munjae: { key: "N", emoji: "🧩", text: "N 문제해결", color: "#ef4444" },
    g_governance: { key: "G", emoji: "🏛️", text: "G 거버넌스", color: "#06b6d4" }
};

const BACKUP_IMAGE = "https://images.unsplash.com/photo" + HYPHEN + "1618005182384" + HYPHEN + "a83a8bd57fbe?w=800";

let state = {
    map: null,
    umdLayer: null,
    activities: [],
    markers: [],
    selectedLat: null,
    selectedLng: null,
    selectedSticker: "b_yuchoyium",
    selectedImages: [],
    currentSliderIndex: 0,
    currentCategoryFilter: "all",
    userMode: "user",
    editingActivityId: null
};

let popupInactivityTimer = null;
let popupNoticeTimer = null;
let idleInactivityTimer = null;
let idleNoticeTimer = null;

window.addEventListener("DOMContentLoaded", () => {
    initApp();
});

function initApp() {
    loadActivities();
    applyGlobalStyles();
    switchTab("list");
    initMap();
    setupEventListeners();
    fetchNajuBoundaries();
    updateModeUI();
    setupGlobalIdleTracker();
    startGlobalIdleTimer();
}

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

const FIREBASE_API_URLS = [
    "https://najulocaledu-default-rtdb.firebaseio.com/activities.json",
    "https://najulocaledu-default-rtdb.asia-southeast1.firebasedatabase.app/activities.json"
];

let activeFirebaseUrl = FIREBASE_API_URLS[0];

function loadActivities() {
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

    fetchActivitiesFromFirebase();
    setInterval(() => fetchActivitiesFromFirebase(), 12000);
}

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
                } catch(e) {}
            }

            let mergedMap = new Map();
            cloudActivities.forEach(act => {
                if (act && act.id) mergedMap.set(act.id, act);
            });
            
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

                try {
                    localStorage.setItem("naju_activities", JSON.stringify(state.activities));
                } catch (e) {}

                syncToFirebaseCloud();
                updateActivityList();
                if (state.map) {
                    renderActivitiesOnMap();
                }
            } else if (!data) {
                syncToFirebaseCloud();
            }
        })
        .catch(err => {
            if (urlIndex + 1 < FIREBASE_API_URLS.length) {
                fetchActivitiesFromFirebase(urlIndex + 1);
            }
        });
}

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
        } catch (e) {}
    }
    showToast("동기화할 로컬 데이터가 없습니다.");
}

function jsonParseSafe(str, fallback) {
    try {
        return JSON.parse(str);
    } catch (e) {
        return fallback;
    }
}

function saveActivities() {
    try {
        localStorage.setItem("naju_activities", JSON.stringify(state.activities));
    } catch (e) {
        console.error("로컬 스토리지 저장 실패", e);
    }
    
    syncToFirebaseCloud();
    updateActivityList();
    if (state.map) {
        renderActivitiesOnMap();
    }
}

function applyStyles(element, styleObj) {
    if (!element) return;
    for (const key in styleObj) {
        element.style[key] = styleObj[key];
    }
}

function applyGlobalStyles() {
    const container = document.getElementById("appContainer");
    const header = document.getElementById("mainHeader");
    const main = document.getElementById("mainContent");
    const mapWrapper = document.getElementById("mapWrapper");
    const sidePanel = document.getElementById("sidePanel");
    
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

    applyStyles(header, {
        zIndex: "10",
        padding: "20px 40px",
        display: "flex",
        justify: "space" + HYPHEN + "between",
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

    applyStyles(main, {
        flex: "1",
        display: "flex",
        position: "relative",
        zIndex: "5"
    });

    applyStyles(mapWrapper, {
        flex: "1",
        height: "100%",
        position: "relative",
        background: "#ffffff"
    });

    const mapEl = document.getElementById("map");
    applyStyles(mapEl, {
        width: "100%",
        height: "100%"
    });

    applyStyles(sidePanel, {
        display: "flex",
        flexDirection: "column",
        overflow: "hidden"
    });

    const tabs = document.querySelector(".panel_tabs");
    applyStyles(tabs, {
        display: "flex",
        background: "rgba(241, 245, 249, 0.8)",
        padding: "6px",
        margin: "16px 16px 8px 16px",
        borderRadius: "14px"
    });

    const filterLabel = document.querySelector(".filter_label");
    applyStyles(filterLabel, {
        fontSize: "12px",
        fontWeight: "600",
        color: "#64748b",
        marginRight: "12px",
        textTransform: "uppercase"
    });

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

    updateTabBtnStyles();
    
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
        width: "480px",
        borderRadius: "28px",
        border: "1px solid rgba(255, 255, 255, 0.7)",
        boxShadow: "0 24px 60px rgba(0, 0, 0, 0.15)",
        overflow: "hidden",
        position: "relative",
        transform: "scale(0.9)",
        transition: "transform 0.4s cubic" + HYPHEN + "bezier(0.34, 1.56, 0.64, 1)"
    });

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
            justify${HYPHEN}content: center;
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
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            background: rgba(15, 23, 42, 0.45) !important;
            backdrop${HYPHEN}filter: blur(10px) !important;
            webkit${HYPHEN}backdrop${HYPHEN}filter: blur(10px) !important;
            z${HYPHEN}index: 1000 !important;
            align${HYPHEN}items: center;
            justify${HYPHEN}content: center;
            padding: 20px;
            box${HYPHEN}sizing: border${HYPHEN}box;
            opacity: 0;
            border${HYPHEN}radius: 24px;
            transition: opacity 0.3s cubic${HYPHEN}bezier(0.16, 1, 0.3, 1);
            pointer${HYPHEN}events: auto;
        }

        .detail_card_wrapper {
            width: 88%;
            max${HYPHEN}width: 540px;
            max${HYPHEN}height: 90%;
            background: #ffffff;
            border${HYPHEN}radius: 24px;
            box${HYPHEN}shadow: 0 20px 60px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.5);
            display: flex;
            flex${HYPHEN}direction: column;
            overflow: hidden;
            position: relative;
            transform: scale(0.92);
            transition: transform 0.3s cubic${HYPHEN}bezier(0.16, 1, 0.3, 1);
        }

        .close_overlay_btn {
            position: absolute;
            top: 20px;
            right: 20px;
            z${HYPHEN}index: 30;
            width: 42px;
            height: 42px;
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
            width: 100%;
            height: 50% !important;
            flex: 0 0 50% !important;
            min${HYPHEN}height: 0;
            background: #0f172a;
            overflow: hidden;
        }

        .detail_sticker_badge {
            position: absolute;
            top: 20px;
            left: 20px;
            z${HYPHEN}index: 20;
            padding: 8px 18px;
            font${HYPHEN}size: 13px;
            font${HYPHEN}weight: 700;
            border${HYPHEN}radius: 24px;
            background: rgba(255, 255, 255, 0.92);
            backdrop${HYPHEN}filter: blur(12px);
            box${HYPHEN}shadow: 0 8px 20px rgba(0,0,0,0.15);
            border: 1px solid rgba(255, 255, 255, 0.8);
            display: inline${HYPHEN}flex;
            align${HYPHEN}items: center;
            gap: 6px;
        }

        .detail_image_container {
            width: 100%;
            height: 100%;
            position: relative;
        }

        .detail_image_container img {
            width: 100%;
            height: 100%;
            object${HYPHEN}fit: cover;
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
            flex: 1 1 50% !important;
            min${HYPHEN}height: 0;
            padding: 24px 28px;
            overflow${HYPHEN}y: auto;
            display: flex;
            flex${HYPHEN}direction: column;
            gap: 16px;
            background: #ffffff;
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
            left: 25px !important;
            right: auto !important;
            bottom: 25px !important;
            position: absolute !important;
            z${HYPHEN}index: 100 !important;
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

        /* 💻 가로 화면 (Landscape 데스크톱/태블릿) 지도 중앙 + 70% 불투명 반투명 플로팅 카드로 지정 */
        @media screen and (min-width: 901px) and (orientation: landscape) {
            #mainContent {
                position: relative !important;
                width: 100% !important;
                height: calc(100vh ${HYPHEN} 82px) !important;
                padding: 0 !important;
                margin: 0 !important;
                display: flex !important;
                overflow: hidden !important;
            }

            #mapWrapper {
                position: absolute !important;
                top: 0 !important;
                left: 0 !important;
                width: 100% !important;
                height: 100% !important;
                border${HYPHEN}radius: 0 !important;
                z${HYPHEN}index: 1 !important;
                flex: 1 1 100% !important;
            }

            #sidePanel {
                position: absolute !important;
                top: 20px !important;
                right: 25px !important;
                bottom: 25px !important;
                left: auto !important;
                width: 390px !important;
                height: auto !important;
                max${HYPHEN}height: calc(100% ${HYPHEN} 45px) !important;
                background: rgba(255, 255, 255, 0.70) !important;
                backdrop${HYPHEN}filter: blur(16px) !important;
                ${HYPHEN}webkit${HYPHEN}backdrop${HYPHEN}filter: blur(16px) !important;
                border${HYPHEN}radius: 24px !important;
                border: 1px solid rgba(255, 255, 255, 0.8) !important;
                box${HYPHEN}shadow: 0 16px 45px rgba(0, 0, 0, 0.12) !important;
                z${HYPHEN}index: 99 !important;
                display: flex !important;
                flex${HYPHEN}direction: column !important;
                overflow: hidden !important;
            }

            .bottom_sheet_handle {
                display: none !important;
            }

            .touch_zoom_slider_container {
                right: 435px !important;
                left: auto !important;
                bottom: 30px !important;
                position: absolute !important;
                z${HYPHEN}index: 100 !important;
            }
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
                position: relative !important;
                top: auto !important;
                left: auto !important;
                width: 100% !important;
                height: 100% !important;
                min${HYPHEN}height: 100% !important;
                border${HYPHEN}radius: 0 !important;
                flex: 1 1 100% !important;
                z${HYPHEN}index: 1 !important;
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

            .panel_tabs #tabListBtn {
                display: none !important;
            }

            #sidePanel {
                position: fixed !important;
                top: auto !important;
                bottom: 0 !important;
                left: 0 !important;
                right: auto !important;
                width: 100% !important;
                max${HYPHEN}height: none !important;
                z${HYPHEN}index: 9999 !important;
                background: #ffffff !important;
                backdrop${HYPHEN}filter: none !important;
                ${HYPHEN}webkit${HYPHEN}backdrop${HYPHEN}filter: none !important;
                border${HYPHEN}radius: 28px 28px 0 0 !important;
                border: none !important;
                box${HYPHEN}shadow: 0 ${HYPHEN}10px 40px rgba(0, 0, 0, 0.25) !important;
                transition: height 0.3s cubic${HYPHEN}bezier(0.16, 1, 0.3, 1) !important;
                display: flex !important;
                flex${HYPHEN}direction: column !important;
                overflow: hidden !important;
            }

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
            }

            .detail_overlay_container {
                padding: 12px !important;
            }

            .detail_card_wrapper {
                width: 100% !important;
                max${HYPHEN}width: 100% !important;
                height: 82vh !important;
                max${HYPHEN}height: 82vh !important;
                border${HYPHEN}radius: 28px !important;
            }

            .detail_hero_section {
                height: 44% !important;
                max${HYPHEN}height: 44% !important;
                flex: 0 0 44% !important;
            }

            .detail_card_body {
                height: 56% !important;
                max${HYPHEN}height: 56% !important;
                flex: 0 0 56% !important;
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

            .touch_zoom_slider_container {
                left: auto !important;
                right: 14px !important;
                bottom: 70px !important;
                position: absolute !important;
                z${HYPHEN}index: 100 !important;
            }
        }
    `;
    document.head.appendChild(styleEl);
}

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

function updateModeUI() {
    const userBtn = document.getElementById("modeUserBtn");
    const adminBtn = document.getElementById("modeAdminBtn");
    const tabAddBtn = document.getElementById("tabAddBtn");
    const mapInst = document.getElementById("mapInstruction");
    const syncCloudBtn = document.getElementById("syncCloudBtn");
    
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
        
        applyStyles(tabAddBtn, { display: "none" });
        if (syncCloudBtn) {
            applyStyles(syncCloudBtn, { display: "none" });
        }
        if (mapInst) {
            mapInst.innerHTML = "<p>💡 지도 위의 활동 스티커를 클릭하면 자세한 내용을 볼 수 있습니다.</p>";
        }
        
        const addTab = document.getElementById("tabAdd");
        if (addTab && addTab.classList.contains("active")) {
            switchTab("list");
        }
    }
    
    updateActivityList();
}

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

function initMap() {
    const isPortrait = window.matchMedia("(orientation: portrait), (max-width: 900px)").matches;
    const najuCenter = [35.016, 126.716];
    const initialZoom = isPortrait ? 10.4 : 11;
    
    state.map = L.map("map", {
        zoomControl: false,
        minZoom: 8,
        maxZoom: 19,
        touchZoom: true,
        bounceAtZoomLimits: false,
        attributionControl: true
    }).setView(najuCenter, initialZoom);

    if (state.map.attributionControl) {
        state.map.attributionControl.setPrefix("🗺️ 나주 지역연계 인포맵 | ");
    }

    setTimeout(() => {
        state.map.invalidateSize();
        if (!isPortrait) {
            state.map.panBy([-195, 0], { animate: false });
        }
    }, 200);

    const primaryTileUrl = "https://xdworld.vworld.kr/2d/Base/service/{z}/{x}/{y}.png";
    const secondaryTileUrl = "https://xdworld.vworld.kr/2d/white/service/{z}/{x}/{y}.png";
    const attribution = "&copy; 대한민국 국토교통부 VWorld 공간정보 오픈플랫폼";
    
    const mainTileLayer = L.tileLayer(primaryTileUrl, {
        attribution: attribution,
        maxZoom: 19,
        maxNativeZoom: 18
    }).addTo(state.map);

    mainTileLayer.on("tileerror", () => {
        if (!state.fallbackTileAdded) {
            state.fallbackTileAdded = true;
            L.tileLayer(secondaryTileUrl, {
                attribution: attribution,
                maxZoom: 19
            }).addTo(state.map);
        }
    });

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
                let sampleThumb = null;
                
                for (let i = 0; i < childMarkers.length; i++) {
                    const actId = childMarkers[i].activityId;
                    const actObj = state.activities.find(a => a.id === actId);
                    if (actObj && actObj.images && actObj.images.length > 0 && actObj.images[0] && actObj.images[0] !== BACKUP_IMAGE) {
                        sampleThumb = actObj.images[0];
                        break;
                    }
                }

                let thumbHtml = "";
                if (sampleThumb) {
                    thumbHtml = `<img src="${sampleThumb}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block;" />`;
                } else {
                    thumbHtml = `<span style="font-size: 18px;">🦚</span>`;
                }

                return L.divIcon({
                    html: `
                        <div class="peacock_cluster_wrapper" style="
                            position: relative;
                            width: 56px;
                            height: 56px;
                            border-radius: 50%;
                            background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
                            border: 3px solid #ffffff;
                            box-shadow: 0 10px 25px rgba(37, 99, 235, 0.4);
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            cursor: pointer;
                            transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                        ">
                            <div style="width: 44px; height: 44px; border-radius: 50%; overflow: hidden; background: #ffffff; display: flex; align-items: center; justify-content: center;">
                                ${thumbHtml}
                            </div>
                            <div style="
                                position: absolute;
                                top: -4px;
                                right: -4px;
                                background: #ef4444;
                                color: white;
                                font-size: 11px;
                                font-weight: 800;
                                width: 22px;
                                height: 22px;
                                border-radius: 50%;
                                border: 2px solid #ffffff;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                box-shadow: 0 2px 6px rgba(0,0,0,0.2);
                            ">${count}</div>
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

    setupTouchZoomSlider();
    
    state.map.on("click", (e) => {
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

function setupTouchZoomSlider() {
    if (!state.map) return;

    const ZoomSliderControl = L.Control.extend({
        options: { position: "bottomright" },
        onAdd: function (map) {
            const container = L.DomUtil.create("div", "touch_zoom_slider_container");
            L.DomEvent.disableClickPropagation(container);
            L.DomEvent.disableScrollPropagation(container);

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

            const track = document.createElement("div");
            track.className = "zoom_slider_track";

            const slider = document.createElement("input");
            slider.type = "range";
            slider.className = "zoom_range_input";
            slider.min = map.getMinZoom();
            slider.max = map.getMaxZoom();
            slider.step = 1;
            slider.value = Math.round(map.getZoom());

            slider.addEventListener("input", (e) => {
                const newZoom = Math.round(parseFloat(e.target.value));
                if (map.getZoom() !== newZoom) {
                    map.setZoom(newZoom, { animate: true });
                }
            });

            map.on("zoom zoomend", () => {
                slider.value = Math.round(map.getZoom());
            });

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
    
    switchTab("add");
}

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

function fetchNajuBoundaries() {
    const cacheKey = "naju_umd_geojson_v4";
    const cachedData = localStorage.getItem(cacheKey);
    
    if (cachedData) {
        try {
            const geojson = JSON.parse(cachedData);
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
    
    const repoPart = "Local_HangJeongDong";
    const mapRepoPart = "southkorea" + HYPHEN + "maps";
    
    const umdUrl = `https://raw.githubusercontent.com/raqoon886/${repoPart}/master/hangjeongdong_%EC%A0%84%EB%9D%BC%EB%82%A8%EB%8F%84.geojson`;
    const sggUrl = `https://raw.githubusercontent.com/southkorea/${mapRepoPart}/master/kostat/2018/json/skorea${HYPHEN}municipalities${HYPHEN}2018${HYPHEN}geo.json`;
    
    Promise.all([
        fetch(umdUrl).then(res => res.json()),
        fetch(sggUrl).then(res => res.json())
    ])
    .then(([umdData, sggData]) => {
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

function drawUmdBoundaries(geojson) {
    if (state.umdLayer) {
        state.map.removeLayer(state.umdLayer);
    }

    state.umdLayer = L.geoJSON(geojson, {
        style: function (feature) {
            const level = feature.properties.adminLevel;
            if (level === "6") {
                return {
                    color: "#1e3a8a",
                    weight: 3.5,
                    fillColor: "none",
                    fillOpacity: 0,
                    lineCap: "round",
                    lineJoin: "round",
                    interactive: false
                };
            } else {
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
            if (feature.properties.adminLevel === "6") return;

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

    renderActivitiesOnMap();
    resetToInitialState();
}

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

function hideImagePreview() {
    const previewList = document.getElementById("imagePreviewList");
    if (previewList) previewList.innerHTML = "";
    state.selectedImages = [];
}

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

    closeBtn.addEventListener("click", hideDetailOverlay);
    detailOverlay.addEventListener("click", (e) => {
        if (e.target === detailOverlay) {
            hideDetailOverlay();
        }
    });

    fileInput.addEventListener("change", (e) => {
        const files = Array.from(e.target.files);
        let loadedCount = 0;

        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (event) => {
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
        fileInput.value = "";
    });

    document.querySelectorAll(".sticker_option").forEach(opt => {
        opt.addEventListener("click", () => {
            document.querySelectorAll(".sticker_option").forEach(el => el.classList.remove("active"));
            opt.classList.add("active");

            const stickerKey = opt.dataset.sticker;
            state.selectedSticker = stickerKey;
        });
    });

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

    document.querySelectorAll(".filter_btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".filter_btn").forEach(el => el.classList.remove("active"));
            btn.classList.add("active");

            state.currentCategoryFilter = btn.dataset.bigbang;
            applyCategoryFilter();
        });
    });

    const searchAddrBtn = document.getElementById("searchAddressBtn");
    if (searchAddrBtn) {
        searchAddrBtn.addEventListener("click", searchLocationByAddress);
    }

    const exportBtn = document.getElementById("exportCSVBtn");
    if (exportBtn) {
        exportBtn.addEventListener("click", exportActivitiesToCSV);
    }

    const csvFileInput = document.getElementById("inputCSVFile");
    if (csvFileInput) {
        csvFileInput.addEventListener("change", handleCSVUpload);
    }

    const templateBtn = document.getElementById("downloadCSVTemplateBtn");
    if (templateBtn) {
        templateBtn.addEventListener("click", downloadCSVTemplate);
    }

    setupBottomSheet();
}

function searchLocationByAddress() {
    const inputAddr = document.getElementById("inputAddress");
    if (!inputAddr) return;
    const addressQuery = inputAddr.value.trim();

    if (!addressQuery) {
        showToast("찾으실 도로명 또는 지번 주소를 입력해 주세요.");
        return;
    }

    const searchBtn = document.getElementById("searchAddressBtn");
    if (searchBtn) searchBtn.textContent = "🔍 검색 중...";

    const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressQuery)}`;

    fetch(geocodeUrl)
        .then(res => res.json())
        .then(data => {
            if (searchBtn) searchBtn.textContent = "🔍 위치 찾기";
            if (data && data.length > 0) {
                const result = data[0];
                const lat = parseFloat(result.lat);
                const lng = parseFloat(result.lon);

                state.selectedLat = lat;
                state.selectedLng = lng;

                document.getElementById("inputLat").value = lat;
                document.getElementById("inputLng").value = lng;

                const display = document.getElementById("coordsDisplay");
                if (display) {
                    display.textContent = `📍 주소 위치가 산출되었습니다 (${result.display_name.split(",")[0]})`;
                    applyStyles(display, {
                        background: "#eff6ff",
                        color: "#2563eb",
                        borderColor: "#bfdbfe"
                    });
                }

                if (state.map) {
                    state.map.flyTo([lat, lng], 16, {
                        animate: true,
                        duration: 1.2
                    });
                }
                showToast("📍 검색된 주소 위치로 이동하였습니다!");
            } else {
                showToast("주소 검색 결과를 찾을 수 없습니다. 좀 더 정확한 도로명 주소를 입력해 주세요.");
            }
        })
        .catch(err => {
            if (searchBtn) searchBtn.textContent = "🔍 위치 찾기";
            showToast("주소 지오코딩 검색 중 에러가 발생했습니다.");
        });
}

function exportActivitiesToCSV() {
    if (!state.activities || state.activities.length === 0) {
        showToast("다운로드할 등록 데이터가 없습니다.");
        return;
    }

    let csvContent = "\uFEFFid,title,sticker,content,address,lat,lng,images\n";

    state.activities.forEach(act => {
        const id = act.id || "";
        const title = `"${(act.title || "").replace(/"/g, '""')}"`;
        const sticker = act.sticker || "b_yuchoyium";
        const content = `"${(act.content || "").replace(/"/g, '""')}"`;
        const address = `"${(act.address || "").replace(/"/g, '""')}"`;
        const lat = act.lat || "";
        const lng = act.lng || "";
        const imagesStr = `"${(act.images && act.images.length > 0 ? act.images.join(";") : "").replace(/"/g, '""')}"`;

        csvContent += `${id},${title},${sticker},${content},${address},${lat},${lng},${imagesStr}\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `naju_activities_export_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast("📤 현재 등록 데이터가 CSV 파일로 성공적으로 추출되었습니다!");
}

function handleCSVUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (evt) {
        const text = evt.target.result;
        const lines = text.split(/\r\n|\n/);
        if (lines.length <= 1) {
            showToast("CSV 파일에 읽을 데이터가 없습니다.");
            return;
        }

        let countUpdated = 0;
        let countInserted = 0;

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const cols = [];
            let inQuotes = false;
            let currentVal = "";

            for (let c = 0; c < line.length; c++) {
                const char = line[c];
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    cols.push(currentVal);
                    currentVal = "";
                } else {
                    currentVal += char;
                }
            }
            cols.push(currentVal);

            const cleanCols = cols.map(col => col.replace(/^"/, "").replace(/"$/, "").replace(/""/g, '"').trim());

            if (cleanCols.length < 3) continue;

            const rowId = cleanCols[0] || "";
            const title = cleanCols[1] || "무제 활동";
            const sticker = STICKER_TYPES[cleanCols[2]] ? cleanCols[2] : "b_yuchoyium";
            const content = cleanCols[3] || "";
            const address = cleanCols[4] || "";
            let lat = cleanCols[5];
            let lng = cleanCols[6];
            const imageStr = cleanCols[7] || "";
            const images = imageStr ? imageStr.split(";").map(s => s.trim()).filter(Boolean) : [BACKUP_IMAGE];

            if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
                lat = 35.016 + (Math.random() * 0.04 - 0.02);
                lng = 126.716 + (Math.random() * 0.04 - 0.02);
            }

            let existingIdx = -1;
            if (rowId) {
                existingIdx = state.activities.findIndex(act => act.id === rowId);
            }

            if (existingIdx !== -1) {
                const existingAct = state.activities[existingIdx];
                state.activities[existingIdx] = {
                    ...existingAct,
                    title: title,
                    sticker: sticker,
                    content: content,
                    address: address,
                    lat: Number(lat),
                    lng: Number(lng),
                    images: (imageStr && images.length > 0) ? images : existingAct.images
                };
                countUpdated++;
            } else {
                const newAct = {
                    id: rowId || ("act_csv_" + Date.now() + "_" + i),
                    title: title,
                    sticker: sticker,
                    content: content,
                    address: address,
                    lat: Number(lat),
                    lng: Number(lng),
                    images: images
                };
                state.activities.unshift(newAct);
                countInserted++;
            }
        }

        if (countUpdated > 0 || countInserted > 0) {
            saveActivities();
            switchTab("list");
            showToast(`🎉 수정 ${countUpdated}건, 신규 등록 ${countInserted}건이 한 번에 반영되었습니다!`);
        } else {
            showToast("유효한 데이터가 없습니다.");
        }
    };
    reader.readAsText(file, "utf-8");
}

function downloadCSVTemplate() {
    const csvContent = "\uFEFFid,title,sticker,content,address,lat,lng,images\n" +
        "act_sample_1,금성관,i_maeuljosa,나주 객사 조선시대 역사 탐방 마을조사,전남 나주시 금성관길 8,35.0315,126.7169,\n" +
        "act_sample_2,빛가람호수공원,b_yuchoyium,유초이음 생태 공원 탐방,전남 나주시 호수로 67,35.0210,126.7780,\n";

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sample_activities_template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("📥 CSV 기본 양식 샘플이 다운로드되었습니다.");
}

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

        const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
        callback(compressedDataUrl);
    };
    img.onerror = () => {
        callback(dataUrl);
    };
    img.src = dataUrl;
}

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

function startEditActivity(act) {
    state.editingActivityId = act.id;
    state.selectedLat = Number(act.lat);
    state.selectedLng = Number(act.lng);
    state.selectedSticker = act.sticker || "b_yuchoyium";

    state.selectedImages = act.images && act.images.length > 0
        ? act.images.filter(img => img !== BACKUP_IMAGE)
        : [];

    const display = document.getElementById("coordsDisplay");
    if (display) {
        display.textContent = "📍 수정할 지도 위치가 선택되었습니다.";
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

    const inputAddr = document.getElementById("inputAddress");
    if (inputAddr) inputAddr.value = act.address || "";

    document.querySelectorAll(".sticker_option").forEach(opt => {
        if (opt.dataset.sticker === state.selectedSticker) {
            opt.classList.add("active");
        } else {
            opt.classList.remove("active");
        }
    });

    renderPreviewList();

    const saveBtn = document.getElementById("saveBtn");
    if (saveBtn) saveBtn.textContent = "활동 내용 수정 완료";

    switchTab("add");
    showToast("수정 모드로 전환되었습니다. 내용을 수정한 뒤 완결 단추를 눌러주세요.");
}

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
    const inputAddr = document.getElementById("inputAddress");
    if (inputAddr) inputAddr.value = "";

    state.editingActivityId = null;
    state.selectedImages = [];
    state.selectedSticker = "b_yuchoyium";
    state.selectedLat = null;
    state.selectedLng = null;
    hideImagePreview();

    document.querySelectorAll(".sticker_option").forEach(opt => {
        if (opt.dataset.sticker === "b_yuchoyium") {
            opt.classList.add("active");
        } else {
            opt.classList.remove("active");
        }
    });

    const display = document.getElementById("coordsDisplay");
    if (display) {
        display.textContent = "지도를 클릭하거나 주소를 검색하면 위치가 설정됩니다.";
        applyStyles(display, {
            background: "rgba(241, 245, 249, 0.6)",
            color: "#64748b",
            borderColor: "rgba(226, 232, 240, 0.8)"
        });
    }

    const saveBtn = document.getElementById("saveBtn");
    if (saveBtn) saveBtn.textContent = "지도에 등록하기";
}

function renderActivitiesOnMap() {
    if (state.markerClusterGroup) {
        state.markerClusterGroup.clearLayers();
    } else {
        state.markers.forEach(m => state.map.removeLayer(m));
    }
    state.markers = [];

    state.activities.forEach(act => {
        if (shouldShowActivity(act)) {
            createMarkerForActivity(act);
        }
    });
}

function shouldShowActivity(act) {
    if (!state.currentCategoryFilter || state.currentCategoryFilter === "all") {
        return true;
    }
    return act.sticker === state.currentCategoryFilter;
}

function createMarkerForActivity(act) {
    const sticker = STICKER_TYPES[act.sticker] || STICKER_TYPES.b_yuchoyium;

    const hasImage = act.images && act.images.length > 0 && act.images[0];
    const thumbUrl = hasImage ? act.images[0] : null;

    let innerContent = "";
    if (thumbUrl && thumbUrl !== BACKUP_IMAGE) {
        innerContent = `<img src="${thumbUrl}" alt="${act.title}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block;" />`;
    } else {
        innerContent = `<span style="font-size: 20px;">${sticker.emoji}</span>`;
    }

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
            justify: center;
            align-items: center;
            cursor: pointer;
            transition: transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        ">
            ${innerContent}
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

    marker.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        showDetailOverlay(act);
    });

    marker.on("mouseover", (e) => {
        const markerDom = e.target.getElement().querySelector(".custom_marker_pin");
        if (markerDom) {
            applyStyles(markerDom, {
                transform: "scale(1.25) translateY(-6px)",
                boxShadow: "0 12px 30px rgba(0,0,0,0.3)"
            });
        }
    });

    marker.on("mouseout", (e) => {
        const markerDom = e.target.getElement().querySelector(".custom_marker_pin");
        if (markerDom) {
            applyStyles(markerDom, {
                transform: "scale(1) translateY(0)",
                boxShadow: "0 10px 24px rgba(0,0,0,0.25)"
            });
        }
    });

    marker.activityId = act.id;

    if (state.markerClusterGroup) {
        state.markerClusterGroup.addLayer(marker);
    } else {
        marker.addTo(state.map);
    }
    state.markers.push(marker);
}

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

    const detailAddr = document.getElementById("detailAddress");
    if (detailAddr) {
        detailAddr.textContent = act.address || "나주시 지역 연계 활동 장소";
    }

    document.getElementById("detailContent").textContent = act.content;

    state.currentSliderIndex = 0;
    const images = act.images && act.images.length > 0 ? act.images : [BACKUP_IMAGE];
    updateSliderView(images);

    applyStyles(overlay, { display: "flex" });

    setTimeout(() => {
        applyStyles(overlay, { opacity: "1" });
        applyStyles(card, { transform: "scale(1)" });
    }, 50);

    startPopupInactivityTimer();
}

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

function startPopupInactivityTimer() {
    stopPopupInactivityTimer();

    popupNoticeTimer = setTimeout(() => {
        showToast("3초 후 화면이 전환됩니다.");
    }, 17000);

    popupInactivityTimer = setTimeout(() => {
        hideDetailOverlay();
    }, 20000);
}

function stopPopupInactivityTimer() {
    if (popupNoticeTimer) clearTimeout(popupNoticeTimer);
    if (popupInactivityTimer) clearTimeout(popupInactivityTimer);
    popupNoticeTimer = null;
    popupInactivityTimer = null;
}

function resetPopupInactivityTimer() {
    const overlay = document.getElementById("detailOverlay");
    if (overlay && overlay.style.display !== "none") {
        startPopupInactivityTimer();
    }
}

function startGlobalIdleTimer() {
    stopGlobalIdleTimer();

    idleNoticeTimer = setTimeout(() => {
        showToast("3초 후 화면이 전환됩니다.");
    }, 57000);

    idleInactivityTimer = setTimeout(() => {
        resetToInitialState();
    }, 60000);
}

function stopGlobalIdleTimer() {
    if (idleNoticeTimer) clearTimeout(idleNoticeTimer);
    if (idleInactivityTimer) clearTimeout(idleInactivityTimer);
    idleNoticeTimer = null;
    idleInactivityTimer = null;
}

function resetGlobalIdleTimer() {
    startGlobalIdleTimer();
}

function resetToInitialState() {
    hideDetailOverlay();
    resetCategoryFilterToAll();
    switchTab("list");
    resetForm();

    if (state.map) {
        if (state.umdLayer && typeof state.umdLayer.getBounds === "function" && state.umdLayer.getBounds().isValid()) {
            const isPortrait = window.matchMedia("(orientation: portrait), (max-width: 900px)").matches;
            if (isPortrait) {
                state.map.flyToBounds(state.umdLayer.getBounds(), {
                    paddingTopLeft: [20, 20],
                    paddingBottomRight: [20, 360],
                    maxZoom: 11.5,
                    animate: true,
                    duration: 0.5
                });
            } else {
                state.map.flyToBounds(state.umdLayer.getBounds(), {
                    paddingTopLeft: [30, 30],
                    paddingBottomRight: [435, 30],
                    maxZoom: 11.5,
                    animate: true,
                    duration: 0.5
                });
            }
        } else {
            const isPortrait = window.matchMedia("(orientation: portrait), (max-width: 900px)").matches;
            let centerLat = isPortrait ? 34.9658 : 35.0158;
            state.map.flyTo([centerLat, 126.7815], 11, {
                animate: true,
                duration: 0.5
            });
        }
    }
    showToast("초기 화면으로 전환되었습니다.");
}

function setupGlobalIdleTracker() {
    const events = ["mousemove", "click", "keydown", "touchstart", "scroll"];
    events.forEach(evt => {
        window.addEventListener(evt, () => {
            resetGlobalIdleTimer();
            resetPopupInactivityTimer();
        }, { passive: true });
    });
}

function applyCategoryFilter() {
    renderActivitiesOnMap();
    updateActivityList();
}

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

        const addrEl = document.createElement("div");
        addrEl.textContent = act.address ? `📍 ${act.address}` : "📍 나주시 지역 연계 활동 장소";
        applyStyles(addrEl, {
            fontSize: "12px",
            color: "#64748b",
            marginTop: "3px",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis"
        });
        info.appendChild(addrEl);

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

        card.addEventListener("click", () => {
            showDetailOverlay(act);
            if (state.map) {
                const isPortrait = window.matchMedia("(orientation: portrait), (max-width: 900px)").matches;
                let targetLat = Number(act.lat);
                let targetLng = Number(act.lng);
                let targetZoom = isPortrait ? 15 : 14;

                if (isPortrait) {
                    targetLat = targetLat - 0.0055;
                }
                state.map.flyTo([targetLat, targetLng], targetZoom, {
                    animate: true,
                    duration: 0.6
                });
                if (!isPortrait) {
                    setTimeout(() => {
                        if (state.map) state.map.panBy([-195, 0], { animate: true, duration: 0.3 });
                    }, 650);
                }
            }
        });

        listContainer.appendChild(card);
    });
}

function deleteActivity(id) {
    state.activities = state.activities.filter(act => act.id !== id);
    resetCategoryFilterToAll();
    saveActivities();
    if (state.editingActivityId === id) {
        resetForm();
    }
    showToast("활동 기록이 삭제되었습니다.");
}

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

    handle.addEventListener("click", () => {
        if (isDragging) return;
        toggleState();
    });

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
            if (sidePanel.classList.contains("collapsed")) {
                sidePanel.className = "half";
                if (hintText) hintText.textContent = "▲ 터치하여 크게 펼치기";
            } else {
                sidePanel.className = "expanded";
                if (hintText) hintText.textContent = "▼ 터치하여 시트 접기";
            }
        } else if (deltaY > 35) {
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
