// Recovered without behavioral changes from admin 0.3.22; see docs/SOURCE_INTEGRATION_20261026.md.
import { formatCourseText } from "./course-presentation.js";

var adminClient = String.raw`(() => {
  // esbuild may add its server-side function-name helper inside a function
  // serialized with toString(). The embedded browser client supplies a no-op
  // equivalent so that helper never leaks as an undefined global.
  const __name = (target) => target;
  const formatCourseText = ${formatCourseText.toString()};
  const shown = (course, field) => formatCourseText(course, field, state.viewerRegion);

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  const number = (value) => Number(value || 0).toLocaleString("ko-KR");
  const formatDate = (value) => value ? new Date(value).toLocaleString("ko-KR") : "—";
  const icons = {
    lock: '<svg class="icon" viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
    trash: '<svg class="icon" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></svg>',
    edit: '<svg class="icon" viewBox="0 0 24 24"><path d="m4 16-1 5 5-1L19 9l-4-4zM13 7l4 4"/></svg>',
    history: '<svg class="icon" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></svg>'
  };
  const countryMeta = {
    KR: { name: "한국", en: "Korea", flag: "🇰🇷" },
    JP: { name: "일본", en: "Japan", flag: "🇯🇵" },
    CN: { name: "중국", en: "China", flag: "🇨🇳" },
    TW: { name: "대만", en: "Taiwan", flag: "🇹🇼" },
    PH: { name: "필리핀", en: "Philippines", flag: "🇵🇭" },
    VN: { name: "베트남", en: "Vietnam", flag: "🇻🇳" },
    TH: { name: "태국", en: "Thailand", flag: "🇹🇭" },
    MY: { name: "말레이시아", en: "Malaysia", flag: "🇲🇾" },
    ID: { name: "인도네시아", en: "Indonesia", flag: "🇮🇩" }
  };
  const categoryLabels = {
    all: "전체 카테고리", course_name: "골프장 이름", address: "주소", region_city: "지역·도시",
    contact: "연락처", website: "웹사이트", segment_name: "코스 이름", hole_par: "코스 홀 구성·PAR",
    segment_add: "코스 추가", segment_delete: "코스 삭제", duplicate_merge: "중복 골프장 병합",
    operating_status: "운영 상태", other: "기타"
  };
  const requestStatusLabels = { pending: "접수", processing: "처리중", on_hold: "보류", completed: "완료", rejected: "반려" };
  const reviewStatusLabels = { new: "미반영", applied: "반영됨", update: "수정필요" };
  const state = {
    viewerRegion: "KR",
    token: sessionStorage.getItem("ymg.course-admin") || "",
    overview: null,
    country: null,
    courseOffset: 0,
    courseNext: null,
    courseQuery: "",
    deletedOffset: 0,
    deletedNext: null,
    deletedQuery: "",
    catalogRows: [],
    requestStatus: "open",
    requestCategory: "all",
    requestRows: []
  };

  async function api(path, options = {}) {
    path += (path.includes("?") ? "&" : "?") + "viewer_region=" + encodeURIComponent(state.viewerRegion);
    const response = await fetch(path, {
      ...options,
      headers: {
        Authorization: "Bearer " + state.token,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      }
    });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) {
      if (response.status === 401) lock();
      const messages = {
        unauthorized: "관리자 토큰이 올바르지 않습니다.", admin_not_configured: "관리자 토큰이 설정되지 않았습니다.",
        invalid_course: "골프장 이름·주소·코스·홀별 PAR를 확인하세요.", course_changed: "다른 변경이 먼저 저장됐습니다. 다시 열어 주세요.",
        invalid_localization: "언어별 이름·주소의 길이와 내용을 확인하세요.", invalid_region_group: "목록 지역을 확인하세요.", invalid_request: "입력 내용을 확인하세요.", golfcore_scorecard_unavailable: "완전한 홀별 PAR 자료가 없습니다.",
        golfcore_unavailable: "GolfCore에 연결하지 못했습니다.", country_locked: "국가 잠금을 먼저 해제하세요.", invalid_unlock_phrase: "잠금해제를 정확히 입력하세요.",
        invalid_delete_phrase: "골프장 삭제를 정확히 입력하세요.", course_already_deleted: "이미 삭제 목록에 있는 골프장입니다.", course_not_deleted: "삭제 목록에서 골프장을 찾을 수 없습니다.", course_not_found: "골프장을 찾을 수 없습니다."
      };
      throw new Error(messages[data.error] || data.error || "요청을 처리하지 못했습니다.");
    }
    return data;
  }

  function toast(text, error) {
    $("#toast-text").textContent = text;
    $("#toast").classList.toggle("error", Boolean(error));
    $("#toast").classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => $("#toast").classList.remove("show"), 2600);
  }

  function setHeader(title, description) {
    $(".topbar h1").textContent = title;
    $(".topbar .page-description").textContent = description;
  }

  function showView(view) {
    $$(".view").forEach((item) => { item.hidden = item.id !== view + "-view"; });
    $(".main").classList.toggle("detail-mode", ["course", "deleted"].includes(view));
    $$(".nav-button").forEach((button) => button.removeAttribute("aria-current"));
    if (view === "dashboard") $("#dashboard-nav").setAttribute("aria-current", "page");
    if (view === "users") $("#users-nav").setAttribute("aria-current", "page");
    if (view === "rounds") $("#rounds-nav").setAttribute("aria-current", "page");
    if (view === "request") $("#requests-nav").setAttribute("aria-current", "page");
    if (["country", "course", "deleted", "import"].includes(view)) $("#courses-nav").setAttribute("aria-current", "page");
  }

  let confirmHandler = null;
  function closeConfirm() {
    confirmHandler = null;
    $("#confirm-modal").classList.remove("open");
    $("#confirm-modal").setAttribute("aria-hidden", "true");
  }

  function openConfirm({ title, message, confirmLabel = "확인", danger = false, phrase = "", onConfirm }) {
    $("#confirm-title").textContent = title;
    $("#confirm-message").textContent = message;
    $("#confirm-ok").textContent = confirmLabel;
    $("#confirm-ok").className = "button " + (danger ? "danger" : "primary");
    const wrap = $("#confirm-input-wrap");
    const input = $("#confirm-input");
    wrap.hidden = !phrase;
    input.value = "";
    input.placeholder = phrase;
    $("#confirm-ok").disabled = Boolean(phrase);
    confirmHandler = onConfirm;
    input.oninput = () => { $("#confirm-ok").disabled = input.value !== phrase; };
    $("#confirm-modal").classList.add("open");
    $("#confirm-modal").setAttribute("aria-hidden", "false");
    if (phrase) setTimeout(() => input.focus(), 30);
  }

  function adminCountryName(code) {
    const meta = countryMeta[code] || { name: code, en: code };
    return code === "KR" ? meta.name : meta.en + " (" + meta.name + ")";
  }

  function requestStatusClass(status) {
    return status === "pending" ? "received" : status === "on_hold" ? "hold" : status;
  }

  function openDrawer(title, subtitle) {
    $("#review-title").textContent = title;
    $("#review-subtitle").textContent = subtitle || "";
    $("#review-content").replaceChildren();
    $("#review-footer").replaceChildren();
    $("#review-drawer").classList.add("open");
    $("#review-drawer").setAttribute("aria-hidden", "false");
  }

  function closeDrawer() {
    $("#review-drawer").classList.remove("open");
    $("#review-drawer").setAttribute("aria-hidden", "true");
  }

  function footerButton(label, className, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button " + className;
    button.textContent = label;
    button.addEventListener("click", handler);
    $("#review-footer").append(button);
    return button;
  }

  function lock() {
    state.token = "";
    sessionStorage.removeItem("ymg.course-admin");
    $("#login-modal").classList.add("open");
    $("#login-modal").setAttribute("aria-hidden", "false");
  }

  async function login() {
    const token = $("#admin-token").value.trim() || state.token;
    if (!token) return;
    state.token = token;
    $("#login-error").textContent = "";
    try {
      await api("/admin/api/session");
      sessionStorage.setItem("ymg.course-admin", token);
      $("#login-modal").classList.remove("open");
      $("#login-modal").setAttribute("aria-hidden", "true");
      await loadOverview();
      await openDashboard();
    } catch (error) {
      $("#login-error").textContent = error.message;
    }
  }

  async function loadOverview() {
    state.overview = await api("/admin/api/overview");
    renderCountryList();
    renderDashboardOverview();
    $("#request-count").textContent = number(state.overview.totals.open_requests);
  }

  function renderCountryList() {
    const countries = state.overview.countries;
    $("#total-public").textContent = number(state.overview.totals.public_count);
    $("#total-private").textContent = number(state.overview.totals.private_count);
    $("#country-count").textContent = countries.filter((country) => country.enabled).length + "개";
    $("#course-count").textContent = number(state.overview.totals.public_count + state.overview.totals.private_count) + "개";
    $("#country-list").innerHTML = countries.map((country) => {
      const meta = countryMeta[country.code];
      return '<article class="country-tile' + (country.enabled ? '' : ' disabled-country') + '">' +
        '<button class="country-open" type="button" data-country="' + country.code + '"><span class="flag">' + meta.flag + '</span><span class="country-copy"><strong>' + escapeHtml(adminCountryName(country.code)) + '</strong><span>' + country.code + '</span></span><span class="country-arrow">›</span></button>' +
        '<div class="country-stats"><span><small>전체</small><strong>' + number(country.public_count + country.private_count) + '</strong></span><span><small>공용</small><strong>' + number(country.public_count) + '</strong></span><span><small>개인</small><strong>' + number(country.private_count) + '</strong></span></div>' +
        '<div class="country-actions"><span class="country-state">' + (country.enabled ? '사용' : '미사용') + '</span>' +
        '<button class="square-control' + (country.locked ? '' : ' unlocked') + '" type="button" data-country-lock="' + country.code + '" title="' + (country.locked ? '잠금 해제' : '다시 잠그기') + '">' + icons.lock + '</button>' +
        '<label class="switch" title="국가 사용 상태"><input type="checkbox" data-country-toggle="' + country.code + '"' + (country.enabled ? ' checked' : '') + (country.locked ? ' disabled' : '') + '><span class="switch-track"></span></label></div></article>';
    }).join("");
    $$("[data-country]", $("#country-list")).forEach((button) => button.addEventListener("click", () => openCountry(button.dataset.country)));
    $$('[data-country-lock]', $("#country-list")).forEach((button) => button.addEventListener("click", async () => {
      const code = button.dataset.countryLock;
      const country = state.overview.countries.find((item) => item.code === code);
      if (!country.locked) {
        try { await api("/admin/api/countries/" + code, { method: "PATCH", body: JSON.stringify({ action: "lock" }) }); await loadOverview(); toast("국가 설정을 잠갔습니다."); }
        catch (error) { toast(error.message, true); }
        return;
      }
      openConfirm({ title: adminCountryName(code) + " 잠금 해제", message: "상태 변경을 허용하려면 아래에 잠금해제를 입력하세요.", confirmLabel: "잠금 해제", phrase: "잠금해제", onConfirm: async () => {
        await api("/admin/api/countries/" + code, { method: "PATCH", body: JSON.stringify({ action: "unlock", confirmation: $("#confirm-input").value }) });
        closeConfirm(); await loadOverview(); toast("잠금을 해제했습니다.");
      }});
    }));
    $$('[data-country-toggle]', $("#country-list")).forEach((input) => input.addEventListener("change", async () => {
      const next = input.checked;
      input.disabled = true;
      try { await api("/admin/api/countries/" + input.dataset.countryToggle, { method: "PATCH", body: JSON.stringify({ action: "set_enabled", enabled: next }) }); await loadOverview(); toast(next ? "국가를 사용으로 변경했습니다." : "국가를 미사용으로 변경했습니다."); }
      catch (error) { input.checked = !next; input.disabled = false; toast(error.message, true); }
    }));
  }

  function renderDashboardOverview() {
    if (!state.overview) return;
    const countries = state.overview.countries;
    const totalCourses = state.overview.totals.public_count + state.overview.totals.private_count;
    const newReviews = countries.reduce((sum, country) => sum + Number(country.catalog_new_count || 0), 0);
    const updateReviews = countries.reduce((sum, country) => sum + Number(country.catalog_update_count || 0), 0);
    $("#dashboard-country-count").textContent = number(countries.length);
    $("#dashboard-active-country-count").textContent = "사용 " + countries.filter((country) => country.enabled).length + "개국";
    $("#dashboard-course-count").textContent = number(totalCourses);
    $("#dashboard-course-breakdown").textContent = "공용 " + number(state.overview.totals.public_count) + " · 개인 " + number(state.overview.totals.private_count);
    $("#dashboard-request-count").textContent = number(state.overview.totals.open_requests);
    $("#dashboard-request-breakdown").textContent = "미완료 요청";
    $("#dashboard-import-count").textContent = number(newReviews + updateReviews);
    $("#dashboard-import-breakdown").textContent = "미반영 " + number(newReviews) + " · 수정필요 " + number(updateReviews);
    $("#dashboard-country-table").innerHTML = countries.map((country) => '<tr class="dashboard-country-row" tabindex="0" data-dashboard-country="' + country.code + '"><td><span class="course-main">' + countryMeta[country.code].flag + ' ' + escapeHtml(adminCountryName(country.code)) + '</span></td><td>' + number(country.public_count + country.private_count) + '</td><td>' + number(country.public_count) + '</td><td>' + number(country.private_count) + '</td><td>' + number(country.open_request_count || 0) + '</td><td><span class="status-pill' + (country.enabled ? '' : ' warning') + '">' + (country.enabled ? '사용' : '미사용') + '</span></td></tr>').join("");
    $$("[data-dashboard-country]").forEach((row) => row.addEventListener("click", () => openCountry(row.dataset.dashboardCountry)));
    const quality = countries.slice(0, 4).map((country) => {
      const sync = country.sync || {};
      const saved = Number(sync.saved || 0);
      const scorecards = Number(sync.scorecards || 0);
      const total = Math.max(saved, 1);
      const progress = Math.max(2, Math.min(100, Math.round(scorecards / total * 100)));
      return '<div class="quality-row"><div class="quality-label"><span>' + escapeHtml(adminCountryName(country.code)) + '</span><strong>스코어카드 ' + number(scorecards) + ' / 전체 ' + number(saved) + '</strong></div><div class="quality-track"><div class="quality-fill' + (sync.last_error ? ' amber' : '') + '" style="width:' + progress + '%"></div></div></div>';
    }).join("");
    $("#dashboard-quality-list").innerHTML = quality || '<div class="empty-row">수집 상태가 없습니다.</div>';
  }

  async function openDashboard() {
    showView("dashboard");
    setHeader("대시보드", "골프장 데이터 운영 현황과 우선 처리 항목을 확인합니다.");
    const data = await api("/admin/api/requests?status=open&category=all&offset=0");
    state.requestRows = data.requests;
    const tasks = data.requests.slice(0, 4);
    $("#dashboard-task-list").innerHTML = tasks.length ? tasks.map((request) => '<button class="dashboard-task" type="button" data-task="' + request.request_id + '"><span class="task-marker' + (request.status === "processing" ? '' : ' amber') + '">' + escapeHtml(requestStatusLabels[request.status]) + '</span><span class="task-copy"><strong>' + escapeHtml(categoryLabels[request.category] || request.category) + '</strong><span>' + escapeHtml(request.course_name || "골프장 미지정") + ' · ' + escapeHtml(request.description) + '</span></span><span class="task-count">1</span></button>').join("") : '<div class="empty-row">처리할 요청이 없습니다.</div>';
    $$("[data-task]").forEach((button) => button.addEventListener("click", () => openRequest(data.requests.find((item) => item.request_id === button.dataset.task))));
    $("#dashboard-recent-requests").innerHTML = tasks.length ? tasks.map((request) => '<button class="recent-request" type="button" data-recent="' + request.request_id + '"><span><strong>' + escapeHtml(request.course_name || "골프장 미지정") + '</strong><span>' + escapeHtml(categoryLabels[request.category] || request.category) + ' · ' + escapeHtml(formatDate(request.created_at)) + '</span></span><span class="request-status ' + requestStatusClass(request.status) + '">' + escapeHtml(requestStatusLabels[request.status]) + '</span></button>').join("") : '<div class="empty-row">최근 요청이 없습니다.</div>';
    $$("[data-recent]").forEach((button) => button.addEventListener("click", () => openRequest(data.requests.find((item) => item.request_id === button.dataset.recent))));
  }

  function openCountryList() {
    showView("country");
    setHeader("골프장 관리", "운영 국가별 공용·개인 골프장 현황을 확인합니다.");
  }

  async function openCountry(code) {
    state.country = code;
    state.courseOffset = 0;
    state.courseQuery = "";
    const country = state.overview.countries.find((item) => item.code === code);
    const meta = countryMeta[code];
    $("#detail-flag").textContent = meta.flag;
    $("#detail-country").textContent = adminCountryName(code);
    $("#detail-public").textContent = number(country.public_count);
    $("#detail-private").textContent = number(country.private_count);
    showView("course");
    setHeader("골프장 관리", adminCountryName(code) + " 전체 등록 골프장을 이름순으로 확인합니다.");
    $("#course-search").value = "";
    $("#course-table").innerHTML = '<tr><td colspan="7" class="empty-row">골프장 목록을 불러오는 중입니다.</td></tr>';
    $("#course-range").textContent = "불러오는 중";
    try {
      await loadCourses(0);
    } catch (error) {
      $("#course-table").innerHTML = '<tr><td colspan="7" class="empty-row">골프장 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</td></tr>';
      $("#course-range").textContent = "불러오기 실패";
      toast(error.message, true);
    }
  }

  async function loadCourses(offset) {
    state.courseOffset = offset || 0;
    const query = new URLSearchParams({ country: state.country, status: "all", q: state.courseQuery, offset: String(state.courseOffset) });
    const data = await api("/admin/api/courses?" + query);
    state.courseNext = data.next_offset;
    const rows = data.courses.map((course) => {
      const segments = course.segments || [];
      return '<tr class="course-row" tabindex="0" data-course="' + course.course_id + '"><td><span class="course-main">' + escapeHtml(shown(course, "name")) + '</span></td><td title="' + escapeHtml(shown(course, "address")) + '">' + escapeHtml(shown(course, "address") || "—") + '</td><td><span class="course-main">' + number(segments.length) + '개</span></td><td><span class="type-pill' + (course.managed_by_admin ? '' : ' private') + '">' + (course.managed_by_admin ? "공용" : "개인") + '</span></td><td><span class="status-pill' + (course.active ? '' : ' warning') + '">' + (course.active ? "사용" : "미사용") + '</span></td><td>' + number(course.round_count) + '</td><td>' + (course.open_request_count ? '<span class="request-count-pill">' + number(course.open_request_count) + '</span>' : '—') + '</td></tr>';
    }).join("");
    const blankCount = Math.max(0, 10 - data.courses.length);
    const blanks = Array.from({ length: blankCount }, (_, index) => '<tr class="course-placeholder" aria-hidden="true"><td colspan="7">' + (!data.courses.length && index === 0 ? '<span>등록된 골프장이 없습니다.</span>' : '&nbsp;') + '</td></tr>').join("");
    $("#course-table").innerHTML = rows + blanks;
    $$("[data-course]", $("#course-table")).forEach((row) => row.addEventListener("click", () => showCourse(row.dataset.course)));
    const start = data.courses.length ? state.courseOffset + 1 : 0;
    const end = state.courseOffset + data.courses.length;
    $("#course-range").textContent = number(start) + "–" + number(end) + " / 전체 " + number(data.total_count || 0) + "개";
    const pagination = $("#course-pagination");
    const currentPage = data.current_page || Math.floor(state.courseOffset / 10) + 1;
    const pageCount = data.page_count || 1;
    const from = Math.max(1, Math.min(currentPage - 2, pageCount - 4));
    const to = Math.min(pageCount, from + 4);
    let pages = "";
    for (let page = from; page <= to; page++) pages += '<button class="page-button' + (page === currentPage ? ' active' : '') + '" type="button" data-course-page="' + page + '" aria-label="' + page + '페이지">' + page + '</button>';
    pagination.innerHTML = '<button class="page-button" id="course-prev" type="button" aria-label="이전 페이지">‹</button>' + pages + '<button class="page-button" id="course-next" type="button" aria-label="다음 페이지">›</button>';
    $("#course-prev").disabled = state.courseOffset === 0;
    $("#course-next").disabled = state.courseNext === null;
    $("#course-prev").addEventListener("click", () => loadCourses(Math.max(0, state.courseOffset - 10)));
    $("#course-next").addEventListener("click", () => loadCourses(state.courseNext));
    $$('[data-course-page]', pagination).forEach((button) => button.addEventListener('click', () => loadCourses((Number(button.dataset.coursePage) - 1) * 10)));
  }

  async function openDeletedCourses() {
    state.deletedOffset = 0;
    state.deletedQuery = "";
    const meta = countryMeta[state.country];
    $("#deleted-flag").textContent = meta.flag;
    $("#deleted-country").textContent = adminCountryName(state.country) + " 삭제 목록";
    $("#deleted-search").value = "";
    showView("deleted");
    $("#deleted-table").innerHTML = '<tr><td colspan="5" class="empty-row">삭제 목록을 불러오는 중입니다.</td></tr>';
    try { await loadDeletedCourses(0); }
    catch (error) { $("#deleted-table").innerHTML = '<tr><td colspan="5" class="empty-row">삭제 목록을 불러오지 못했습니다.</td></tr>'; toast(error.message, true); }
  }

  async function loadDeletedCourses(offset) {
    state.deletedOffset = offset || 0;
    const query = new URLSearchParams({ country: state.country, q: state.deletedQuery, offset: String(state.deletedOffset) });
    const data = await api("/admin/api/courses/deleted?" + query);
    state.deletedNext = data.next_offset;
    const rows = data.courses.map((course) => '<tr><td><span class="course-main">' + escapeHtml(shown(course, "name")) + '</span></td><td title="' + escapeHtml(shown(course, "address")) + '">' + escapeHtml(shown(course, "address") || "—") + '</td><td>' + escapeHtml(formatDate(course.deleted_at)) + '</td><td><span class="status-pill' + (course.previous_active ? '' : ' warning') + '">' + (course.previous_active ? "사용" : "미사용") + '</span></td><td class="restore-cell"><button class="button secondary compact" type="button" data-restore-course="' + course.course_id + '">복구</button></td></tr>').join("");
    const blankCount = Math.max(0, 10 - data.courses.length);
    const blanks = Array.from({ length: blankCount }, (_, index) => '<tr class="course-placeholder" aria-hidden="true"><td colspan="5">' + (!data.courses.length && index === 0 ? '<span>삭제된 골프장이 없습니다.</span>' : '&nbsp;') + '</td></tr>').join("");
    $("#deleted-table").innerHTML = rows + blanks;
    $$('[data-restore-course]', $("#deleted-table")).forEach((button) => button.addEventListener("click", () => {
      const course = data.courses.find((item) => item.course_id === button.dataset.restoreCourse);
      openConfirm({ title: "골프장을 복구할까요?", message: shown(course, "name") + " 골프장을 일반 목록으로 복구합니다.", confirmLabel: "복구", onConfirm: async () => {
        await api("/admin/api/courses/" + course.course_id + "/restore", { method: "PATCH" });
        closeConfirm(); await loadOverview(); await loadDeletedCourses(Math.max(0, state.deletedOffset - (state.deletedOffset && data.courses.length === 1 ? 10 : 0))); toast("골프장을 복구했습니다.");
      }});
    }));
    const start = data.courses.length ? state.deletedOffset + 1 : 0;
    const end = state.deletedOffset + data.courses.length;
    $("#deleted-range").textContent = number(start) + "–" + number(end) + " / 전체 " + number(data.total_count || 0) + "개";
    const pagination = $("#deleted-pagination");
    const currentPage = data.current_page || Math.floor(state.deletedOffset / 10) + 1;
    const pageCount = data.page_count || 1;
    const from = Math.max(1, Math.min(currentPage - 2, pageCount - 4));
    const to = Math.min(pageCount, from + 4);
    let pages = "";
    for (let page = from; page <= to; page++) pages += '<button class="page-button' + (page === currentPage ? ' active' : '') + '" type="button" data-deleted-page="' + page + '">' + page + '</button>';
    pagination.innerHTML = '<button class="page-button" id="deleted-prev" type="button" aria-label="이전 페이지">‹</button>' + pages + '<button class="page-button" id="deleted-next" type="button" aria-label="다음 페이지">›</button>';
    $("#deleted-prev").disabled = state.deletedOffset === 0;
    $("#deleted-next").disabled = state.deletedNext === null;
    $("#deleted-prev").addEventListener("click", () => loadDeletedCourses(Math.max(0, state.deletedOffset - 10)));
    $("#deleted-next").addEventListener("click", () => loadDeletedCourses(state.deletedNext));
    $$('[data-deleted-page]', pagination).forEach((button) => button.addEventListener("click", () => loadDeletedCourses((Number(button.dataset.deletedPage) - 1) * 10)));
  }

  async function showCourse(id) {
    try {
      const data = await api("/admin/api/courses/" + id);
      const course = data.course;
      openDrawer(shown(course, "name"), "골프장 정보");
      $("#review-content").innerHTML = '<section class="drawer-section"><div class="drawer-section-head"><div><h3>기본 정보</h3><div class="fine">주소와 운영 정보를 확인합니다.</div></div></div><div class="drawer-section-body"><div class="detail-list">' +
        detailRow("국가", adminCountryName(course.country_code)) + detailRow("전체 주소", shown(course,"address") || "—") + detailRow("전화", course.phone || "—") + detailRow("웹사이트", course.website || "—") + detailRow("등록 유형", course.managed_by_admin ? "공용" : "개인") + detailRow("사용 상태", course.active ? "사용" : "미사용") + detailRow("라운드 횟수", number(course.round_count)) + detailRow("미처리 요청", number(course.open_request_count)) + '</div></div></section>' +
        '<section class="drawer-section"><div class="drawer-section-head"><div><h3>코스·홀 구성</h3><div class="fine">9홀 단위 코스와 PAR 합계입니다.</div></div></div><div class="drawer-section-body"><div class="segment-list">' + course.segments.map((segment) => '<div class="segment-editor"><div class="segment-title"><strong>' + escapeHtml(segment.name) + '</strong><span class="type-pill">PAR ' + segment.pars.reduce((a, b) => a + b, 0) + '</span></div><div class="par-editor"><div class="par-grid">' + segment.pars.map((par, index) => '<span class="par-head">' + (index + 1) + '</span>').join("") + '<span class="par-head">합계</span></div><div class="par-grid">' + segment.pars.map((par) => '<span class="par-value">' + par + '</span>').join("") + '<span class="par-value par-total">' + segment.pars.reduce((a, b) => a + b, 0) + '</span></div></div></div>').join("") + '</div></div></section>';
      footerButton("변경 이력", "secondary", () => showHistory(course));
      footerButton("삭제", "danger", () => openConfirm({ title: "골프장을 삭제할까요?", message: shown(course, "name") + " 골프장을 삭제 목록으로 이동합니다. 복구하기 전까지 앱과 일반 목록에 표시되지 않습니다.", confirmLabel: "삭제 목록으로 이동", danger: true, phrase: "골프장 삭제", onConfirm: async () => {
        await api("/admin/api/courses/" + course.course_id, { method: "DELETE", body: JSON.stringify({ confirmation: "골프장 삭제" }) });
        closeConfirm(); closeDrawer(); await loadOverview(); await loadCourses(Math.max(0, state.courseOffset - (state.courseOffset && $("#course-table").querySelectorAll('[data-course]').length === 1 ? 10 : 0))); toast("삭제 목록으로 이동했습니다.");
      }}));
      footerButton("수정", "primary", () => renderCourseEditor(course, { mode: "edit" }));
    } catch (error) { toast(error.message, true); }
  }

  function detailRow(label, value) {
    return '<div class="detail-row"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></div>';
  }

  async function showHistory(course) {
    const data = await api("/admin/api/courses/" + course.course_id + "/history");
    openDrawer(shown(course, "name"), "변경 이력");
    $("#review-content").innerHTML = '<section class="drawer-section"><div class="drawer-section-head"><div><h3>관리자 변경 기록</h3><div class="fine">최신 변경부터 표시합니다.</div></div></div><div class="drawer-section-body"><div class="history-list">' + (data.changes.length ? data.changes.map((change) => '<div class="history-item"><strong>' + escapeHtml(change.action) + '</strong><span>' + escapeHtml(formatDate(change.created_at)) + '</span></div>').join("") : '<div class="empty-row">변경 이력이 없습니다.</div>') + '</div></div></section>';
      footerButton("닫기", "secondary", closeDrawer);
  }

  function renderParSegment(segment, index, removable, compare) {
    const heads = segment.pars.map((_, hole) => '<span class="par-head">' + (hole + 1) + '</span>').join("") + '<span class="par-head">합계</span>';
    const plus = segment.pars.map((_, hole) => '<button class="par-control" type="button" data-segment="' + index + '" data-hole="' + hole + '" data-delta="1">+</button>').join("") + '<span class="par-spacer"></span>';
    const values = segment.pars.map((par) => '<span class="par-value">' + par + '</span>').join("") + '<span class="par-value par-total">' + segment.pars.reduce((a, b) => a + b, 0) + '</span>';
    const minus = segment.pars.map((_, hole) => '<button class="par-control minus" type="button" data-segment="' + index + '" data-hole="' + hole + '" data-delta="-1">−</button>').join("") + '<span class="par-spacer"></span>';
    const compareBlock = compare ? '<div class="request-compare"><div class="request-value"><span>기존</span><strong>' + escapeHtml(compare.old ? compare.old.name + " · " + compare.old.pars.join(", ") : "기존 코스 없음") + '</strong></div><div class="request-value requested"><span>신규</span><strong>' + escapeHtml(segment.name + " · " + segment.pars.join(", ")) + '</strong></div></div><div class="form-field wide" style="margin-top:9px"><label>이 코스 적용</label><select class="form-select" data-apply="' + index + '"><option value="true"' + (segment.apply ? ' selected' : '') + '>적용</option><option value="false"' + (!segment.apply ? ' selected' : '') + '>미적용</option></select></div>' : "";
    return compareBlock + '<div class="course-config"><div class="course-config-head"><input class="form-input" data-segment-name="' + index + '" value="' + escapeHtml(segment.name) + '" aria-label="코스 이름">' + (removable ? '<button class="mini-danger" type="button" data-remove-segment="' + index + '">코스 삭제</button>' : '') + '</div><div class="par-editor"><div class="par-grid">' + heads + '</div><div class="par-grid">' + plus + '</div><div class="par-grid">' + values + '</div><div class="par-grid">' + minus + '</div></div></div>';
  }

  function renderCourseEditor(course, context) {
    course.localization ||= {name:{ko:"",en:"",local:""},address:{ko:"",en:"",local:""}};
    const existing = context.review && context.review.existing;
    const segments = (course.segments || [{ name: "OUT", pars: Array(9).fill(4) }]).map((segment) => ({ name: segment.name, pars: segment.pars.slice(), apply: true, oldIndex: existing ? existing.segments.findIndex((old) => old.name.toLowerCase() === segment.name.toLowerCase()) : -1 }));
    const missingActions = {};
    const title = context.request ? "요청사항 반영" : context.review ? (existing ? "기존·신규 비교" : "신규 골프장 검토") : context.mode === "create" ? "골프장 추가" : "골프장 수정";
    openDrawer(course.name || "새 골프장", title);
    function draw() {
      const compareNotice = context.review ? '<div class="compare-summary"><span class="compare-badge new">신규·변경 코스</span>' + (existing ? '<span class="compare-badge removed">원본에서 없는 코스 확인</span>' : '') + '</div>' : "";
      const missing = existing ? existing.segments.map((old, oldIndex) => ({ old, oldIndex })).filter((item) => !segments.some((segment) => segment.oldIndex === item.oldIndex)).map((item) => '<div class="request-compare"><div class="request-value"><span>기존 코스</span><strong>' + escapeHtml(item.old.name + " · " + item.old.pars.join(", ")) + '</strong></div><div class="request-value requested"><span>수집 자료</span><strong>GolfCore에 없음</strong></div></div><div class="form-field wide" style="margin:9px 0 12px"><label>기존 코스 처리</label><select class="form-select" data-missing="' + item.oldIndex + '"><option value="keep">유지</option><option value="delete"' + (missingActions[item.oldIndex] === "delete" ? ' selected' : '') + '>삭제</option></select></div>').join("") : "";
      $("#review-content").innerHTML = compareNotice + '<section class="drawer-section course-basic-section"><div class="drawer-section-head"><div><h3>골프장 기본 정보</h3><div class="fine">지역과 도시를 나누지 않고 확인된 전체 주소를 한 칸에 입력합니다.</div></div></div><div class="drawer-section-body"><div class="form-grid">' +
        formInput("골프장 이름", "edit-name", course.name || "", true) + formCombo("국가", "edit-country", Object.keys(countryMeta).map((code) => [code, adminCountryName(code)]), course.country_code || state.country) + formInput("전체 주소", "edit-address", course.address || "", true) + formInput("전화", "edit-phone", course.phone || "") + formInput("웹사이트", "edit-website", course.website || "", true) + formCombo("앱 사용 상태", "edit-active", [["true", "사용"], ["false", "미사용"]], course.active === false ? "false" : "true") + '</div></div></section>' +
        '<section class="drawer-section"><div class="drawer-section-head"><div><h3>언어별 이름·주소</h3><div class="fine">확인된 표기를 입력하세요. 비어 있는 번역은 확보된 표기로 표시합니다.</div></div></div><div class="drawer-section-body"><div class="form-grid">' + ['name','address'].map(field => ['ko','en','local'].map(lang => formInput((field === 'name' ? '이름 · ' : '주소 · ') + ({ko:'한국어',en:'영어',local:'현지어'})[lang], 'translation-'+field+'-'+lang, course.localization[field]?.[lang] || '',true)).join('')).join('') + '</div></div></section>' +
        '<section class="drawer-section"><div class="drawer-section-head"><div><h3>코스·홀 구성 수정</h3><div class="fine">1–9번과 합계를 확인하며 +/− 버튼으로 PAR를 조정합니다.</div></div></div><div class="drawer-section-body">' + segments.map((segment, index) => renderParSegment(segment, index, segments.length > 1, context.review && existing ? { old: segment.oldIndex >= 0 ? existing.segments[segment.oldIndex] : null } : null)).join("") + missing + '<button class="button secondary new-segment-button" id="add-nine-hole" type="button">+ 9홀 코스 추가</button></div></section>' + (context.request ? '<section class="drawer-section"><div class="drawer-section-head"><div><h3>요청 완료 메모</h3></div></div><div class="drawer-section-body"><textarea class="form-textarea" id="request-complete-note">' + escapeHtml(context.request.admin_note || "") + '</textarea></div></section>' : "");
      [["#edit-name", "name"], ["#edit-address", "address"], ["#edit-phone", "phone"], ["#edit-website", "website"]].forEach((entry) => $(entry[0]).addEventListener("input", (event) => { course[entry[1]] = event.target.value; }));
      for (const field of ['name','address']) for (const lang of ['ko','en','local']) $("#translation-"+field+"-"+lang).addEventListener('input', event => { course.localization[field] ||= {}; course.localization[field][lang] = event.target.value; });
      bindCustomCombo("edit-country");
      bindCustomCombo("edit-active");
      $("#edit-country").addEventListener('change', event => { course.country_code = event.target.value; });
      $("#edit-active").addEventListener("change", (event) => { course.active = event.target.value === "true"; });
      if (context.request) $("#request-complete-note").addEventListener("input", (event) => { context.request.admin_note = event.target.value; });
      $$('[data-segment-name]').forEach((input) => input.addEventListener("input", () => { segments[Number(input.dataset.segmentName)].name = input.value; }));
      $$('[data-delta]').forEach((button) => button.addEventListener("click", () => { const segment = segments[Number(button.dataset.segment)]; const hole = Number(button.dataset.hole); segment.pars[hole] = Math.max(3, Math.min(7, segment.pars[hole] + Number(button.dataset.delta))); draw(); }));
      $$('[data-remove-segment]').forEach((button) => button.addEventListener("click", () => { segments.splice(Number(button.dataset.removeSegment), 1); draw(); }));
      $$('[data-apply]').forEach((select) => select.addEventListener("change", () => { segments[Number(select.dataset.apply)].apply = select.value === "true"; }));
      $$('[data-missing]').forEach((select) => select.addEventListener("change", () => { missingActions[select.dataset.missing] = select.value; }));
      $("#add-nine-hole").addEventListener("click", () => { segments.push({ name: "COURSE " + (segments.length + 1), pars: Array(9).fill(4), apply: true, oldIndex: -1 }); draw(); });
    }
    draw();
    footerButton("취소", "secondary", closeDrawer);
    const save = footerButton(context.request ? "수정 적용 후 요청 완료" : context.review ? "선택 내용 반영" : context.mode === "create" ? "골프장 추가" : "변경 저장", "primary", async () => {
      save.disabled = true;
      try {
        let finalSegments = segments.map((segment) => ({ name: segment.name, pars: segment.pars }));
        if (existing) {
          finalSegments = [];
          existing.segments.forEach((old, oldIndex) => {
            const draft = segments.find((segment) => segment.oldIndex === oldIndex);
            if (draft) finalSegments.push(draft.apply ? { name: draft.name, pars: draft.pars } : old);
            else if (missingActions[oldIndex] !== "delete") finalSegments.push(old);
          });
          segments.filter((segment) => segment.oldIndex < 0 && segment.apply).forEach((segment) => finalSegments.push({ name: segment.name, pars: segment.pars }));
        }
        const payload = {
          name: $("#edit-name").value, country_code: $("#edit-country").value, region: course.region || "",
          city: course.city || "", address: $("#edit-address").value, phone: $("#edit-phone").value,
          website: $("#edit-website").value, latitude: course.latitude ?? null, longitude: course.longitude ?? null,
          localization: course.localization,
          segments: finalSegments, active: $("#edit-active").value === "true"
        };
        if (context.request) {
          await api("/admin/api/requests/" + context.request.request_id, { method: "PATCH", body: JSON.stringify({ status: "completed", admin_note: $("#request-complete-note").value, course: { ...payload, version: course.version } }) });
        } else if (context.review) {
          await api("/admin/api/golfcore/import", { method: "POST", body: JSON.stringify({ ...payload, slug: context.review.slug, ...(existing ? { version: existing.version } : {}) }) });
        } else if (context.mode === "create") {
          await api("/admin/api/courses", { method: "POST", body: JSON.stringify(payload) });
        } else {
          await api("/admin/api/courses/" + course.course_id, { method: "PUT", body: JSON.stringify({ ...payload, version: course.version }) });
        }
        closeDrawer();
        toast(context.request ? "수정 반영과 요청 완료 처리를 마쳤습니다." : "저장했습니다.");
        await loadOverview();
        if (state.country) await loadCourses(state.courseOffset);
        if (context.review) await loadCatalog();
        if (context.request) await loadRequests();
      } catch (error) { toast(error.message, true); save.disabled = false; }
    });
  }

  function formInput(label, id, value, wide) {
    return '<div class="form-field' + (wide ? ' wide' : '') + '"><label for="' + id + '">' + escapeHtml(label) + '</label><input class="form-input" id="' + id + '" value="' + escapeHtml(value) + '"></div>';
  }

  function formSelect(label, id, options, value) {
    return '<div class="form-field"><label for="' + id + '">' + escapeHtml(label) + '</label><select class="form-select" id="' + id + '">' + options.map((option) => '<option value="' + escapeHtml(option[0]) + '"' + (String(option[0]) === String(value) ? ' selected' : '') + '>' + escapeHtml(option[1]) + '</option>').join("") + '</select></div>';
  }

  function formCombo(label, id, options, value) {
    const selected = options.find((option) => String(option[0]) === String(value)) || options[0];
    return '<div class="form-field"><label id="' + id + '-label">' + escapeHtml(label) + '</label><div class="custom-combo" id="' + id + '-combo"><input id="' + id + '" type="hidden" value="' + escapeHtml(selected[0]) + '"><button class="combo-trigger" type="button" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="' + id + '-label ' + id + '-value"><span id="' + id + '-value">' + escapeHtml(selected[1]) + '</span><svg class="icon" viewBox="0 0 24 24"><path d="m7 10 5 5 5-5"/></svg></button><div class="combo-menu" role="listbox" hidden>' + options.map((option) => '<button class="combo-option' + (String(option[0]) === String(selected[0]) ? ' selected' : '') + '" type="button" role="option" aria-selected="' + String(String(option[0]) === String(selected[0])) + '" data-combo-value="' + escapeHtml(option[0]) + '">' + escapeHtml(option[1]) + '<svg class="icon" viewBox="0 0 24 24"><path d="m5 12 4 4L19 7"/></svg></button>').join("") + '</div></div></div>';
  }

  function bindCustomCombo(id) {
    const root = $("#" + id + "-combo");
    const input = $("#" + id);
    const trigger = $(".combo-trigger", root);
    const menu = $(".combo-menu", root);
    const options = $$(".combo-option", root);
    const close = () => { menu.hidden = true; trigger.setAttribute("aria-expanded", "false"); root.classList.remove("open"); };
    const open = () => { menu.hidden = false; trigger.setAttribute("aria-expanded", "true"); root.classList.add("open"); const selected = $(".combo-option.selected", root) || options[0]; setTimeout(() => selected && selected.focus(), 0); };
    trigger.addEventListener("click", () => menu.hidden ? open() : close());
    trigger.addEventListener("keydown", (event) => { if (["ArrowDown", "Enter", " "].includes(event.key)) { event.preventDefault(); open(); } });
    options.forEach((option, index) => {
      option.addEventListener("click", () => {
        options.forEach((item) => { item.classList.remove("selected"); item.setAttribute("aria-selected", "false"); });
        option.classList.add("selected"); option.setAttribute("aria-selected", "true");
        input.value = option.dataset.comboValue;
        $("#" + id + "-value").textContent = option.textContent.trim();
        input.dispatchEvent(new Event("change", { bubbles: true }));
        close(); trigger.focus();
      });
      option.addEventListener("keydown", (event) => {
        if (event.key === "Escape") { event.preventDefault(); close(); trigger.focus(); }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); options[(index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length].focus(); }
      });
    });
    root.addEventListener("focusout", () => setTimeout(() => { if (!root.contains(document.activeElement)) close(); }, 0));
  }

  function openImport() {
    const meta = countryMeta[state.country];
    $("#import-flag").textContent = meta.flag;
    $("#import-country").textContent = adminCountryName(state.country) + " GolfCore 가져오기";
    showView("import");
    setHeader("GolfCore 가져오기", "선택한 국가의 전체 수집 자료를 이름순으로 확인합니다.");
    $("#run-import").disabled = false;
    $("#import-results").innerHTML = '<div class="import-placeholder">전체 자료 조회를 누르면 이 국가의 GolfCore 비교 결과가 표시됩니다.</div>';
  }

  async function loadCatalog() {
    const collected = new Map();
    let offset = 0;
    do {
      const data = await api("/admin/api/golfcore/catalog?" + new URLSearchParams({country:state.country,status:"all",q:"",offset:String(offset)}));
      data.courses.forEach(c => collected.set(c.slug,c));
      offset = data.next_offset;
    } while (offset !== null);
    state.catalogRows = [...collected.values()];
    $("#import-results").innerHTML = '<div class="import-result-head"><strong>GolfCore 비교 결과</strong><span>' + number(state.catalogRows.length) + '개</span></div><div class="table-scroll"><table class="course-table import-course-table"><thead><tr><th>골프장 이름</th><th>전체 주소</th><th>반영 상태</th><th style="text-align:right">관리</th></tr></thead><tbody>' + (state.catalogRows.length ? state.catalogRows.map((course) => '<tr><td><span class="course-main">' + escapeHtml(shown(course, "name")) + '</span></td><td title="' + escapeHtml(shown(course, "address")) + '">' + escapeHtml(shown(course, "address") || "—") + '</td><td><span class="import-status ' + (course.review_status === "applied" ? "reflected" : course.review_status === "new" ? "missing" : "update") + '">' + reviewStatusLabels[course.review_status] + '</span></td><td style="text-align:right">' + (course.review_status === "applied" ? '<span class="fine">완료</span>' : '<button class="button secondary" type="button" data-review-slug="' + escapeHtml(course.slug) + '">검토</button>') + '</td></tr>').join("") : '<tr><td colspan="4" class="empty-row">이 국가의 수집 자료가 없습니다.</td></tr>') + '</tbody></table></div>';
    $$('[data-review-slug]').forEach((button) => button.addEventListener("click", () => reviewCatalog(button.dataset.reviewSlug)));
  }

  async function runImport() {
    const button = $("#run-import");
    button.disabled = true;
    try {
      await api("/admin/api/golfcore/sync", { method: "POST", body: JSON.stringify({ country_code: state.country }) });
      await loadCatalog();
      toast("최신 수집 자료를 불러왔습니다.");
    } catch (error) { toast(error.message, true); }
    finally { button.disabled = false; }
  }

  async function reviewCatalog(slug) {
    try {
      const data = await api("/admin/api/golfcore/catalog/" + encodeURIComponent(slug));
      renderCourseEditor({ ...data.draft, active: data.existing ? data.existing.active : true }, { review: { slug: slug, existing: data.existing } });
    } catch (error) { toast(error.message, true); }
  }

  function setupRequestFilters() {
    const statuses = [["open", "미완료"], ["pending", "접수"], ["processing", "처리중"], ["on_hold", "보류"], ["completed", "완료"], ["rejected", "반려"], ["all", "전체"]];
    $("#request-status-filters").innerHTML = statuses.map((item) => '<button class="request-filter" type="button" data-request-status="' + item[0] + '" aria-pressed="' + String(state.requestStatus === item[0]) + '">' + item[1] + '</button>').join("");
    $$("[data-request-status]").forEach((button) => button.addEventListener("click", () => { state.requestStatus = button.dataset.requestStatus; loadRequests(); }));
    $("#request-category-filter").innerHTML = Object.entries(categoryLabels).map((item) => '<option value="' + item[0] + '">' + escapeHtml(item[1]) + '</option>').join("");
    $("#request-category-filter").value = state.requestCategory;
  }

  async function loadRequests() {
    showView("request");
    setHeader("요청사항", "완료 전 요청을 검토하고 상태·메모·반영 결과를 관리합니다.");
    setupRequestFilters();
    const data = await api("/admin/api/requests?" + new URLSearchParams({ status: state.requestStatus, category: state.requestCategory, offset: "0" }));
    state.requestRows = data.requests;
    const open = data.requests.filter((item) => !["completed", "rejected"].includes(item.status)).length;
    const processing = data.requests.filter((item) => item.status === "processing").length;
    $("#request-open-count").textContent = number(open);
    $("#request-processing-count").textContent = number(processing);
    $("#request-summary").innerHTML = '<span>현재 조건</span><strong>' + number(data.requests.length) + '개 요청</strong>';
    $("#request-range").textContent = number(data.requests.length) + "개 요청";
    $("#request-table").innerHTML = data.requests.length ? data.requests.map((request, index) => '<tr class="request-row ' + (["completed", "rejected"].includes(request.status) ? "completed" : "clickable") + '" ' + (!["completed", "rejected"].includes(request.status) ? 'data-request="' + request.request_id + '" tabindex="0"' : '') + '><td>REQ-' + String(index + 1).padStart(4, "0") + '</td><td>' + escapeHtml(categoryLabels[request.category] || request.category) + '</td><td>' + escapeHtml(request.course_name || "—") + '</td><td>—</td><td title="' + escapeHtml(request.description) + '">' + escapeHtml(request.description) + '</td><td><span class="request-status ' + requestStatusClass(request.status) + '">' + escapeHtml(requestStatusLabels[request.status]) + '</span></td><td>' + escapeHtml(formatDate(request.created_at)) + '</td></tr>').join("") : '<tr><td colspan="7" class="empty-row">조건에 맞는 요청사항이 없습니다.</td></tr>';
    $$('[data-request]').forEach((row) => row.addEventListener("click", () => openRequest(data.requests.find((item) => item.request_id === row.dataset.request))));
  }

  function openRequest(request) {
    openDrawer(request.course_name || "골프장 요청", (categoryLabels[request.category] || request.category) + " · " + requestStatusLabels[request.status]);
    const requested = request.requested_value ? JSON.stringify(request.requested_value, null, 2) : "별도 입력값 없음";
    $("#review-content").innerHTML = '<section class="drawer-section"><div class="drawer-section-head"><div><h3>요청 내용</h3><div class="fine">요청자와 접수 내용을 확인합니다.</div></div></div><div class="drawer-section-body"><div class="detail-list">' + detailRow("요청자", request.requester_name) + detailRow("골프장", request.course_name || "미지정") + detailRow("카테고리", categoryLabels[request.category] || request.category) + detailRow("접수일", formatDate(request.created_at)) + '</div><div class="request-compare" style="margin-top:12px"><div class="request-value"><span>요청 설명</span><strong>' + escapeHtml(request.description) + '</strong></div><div class="request-value requested"><span>요청 값</span><strong>' + escapeHtml(requested) + '</strong></div></div></div></section><section class="drawer-section"><div class="drawer-section-head"><div><h3>처리 정보</h3><div class="fine">상태를 바꿀 때 관리자 메모를 남깁니다.</div></div></div><div class="drawer-section-body"><div class="form-grid">' + formSelect("상태 변경", "request-state", Object.entries(requestStatusLabels), request.status) + '<div class="form-field wide"><label for="request-note">처리 메모</label><textarea class="form-textarea" id="request-note">' + escapeHtml(request.admin_note || "") + '</textarea></div></div></div></section>';
    footerButton("취소", "secondary", closeDrawer);
    if (request.course_id) footerButton("골프장 정보에서 처리", "secondary", async () => { const data = await api("/admin/api/courses/" + request.course_id); renderCourseEditor(data.course, { request: request }); });
    const save = footerButton("상태·메모 저장", "primary", async () => {
      save.disabled = true;
      try {
        await api("/admin/api/requests/" + request.request_id, { method: "PATCH", body: JSON.stringify({ status: $("#request-state").value, admin_note: $("#request-note").value }) });
        closeDrawer(); toast("요청사항을 저장했습니다."); await Promise.all([loadOverview(), loadRequests()]);
      } catch (error) { toast(error.message, true); save.disabled = false; }
    });
  }

  function openUsers() {
    showView("users");
    setHeader("사용자", "사용자 관리 기능은 다음 단계에서 연결합니다.");
  }

  function openRounds() {
    showView("rounds");
    setHeader("라운드", "라운드 관리 기능은 다음 단계에서 연결합니다.");
  }

  function openNewCourse() {
    renderCourseEditor({
      name: "", country_code: state.country || "PH", region: "", region_group: "", city: "", address: "",
      phone: "", website: "", latitude: null, longitude: null, active: true,
      localization: { name: { ko: "", en: "", local: "" }, address: { ko: "", en: "", local: "" } },
      segments: [{ name: "OUT", pars: Array(9).fill(4) }]
    }, { mode: "create" });
  }

  $("#admin-login").addEventListener("click", login);
  $("#admin-token").addEventListener("keydown", (event) => { if (event.key === "Enter") login(); });
  $("#dashboard-nav").addEventListener("click", openDashboard);
  $("#users-nav").addEventListener("click", openUsers);
  $("#rounds-nav").addEventListener("click", openRounds);
  $("#requests-nav").addEventListener("click", loadRequests);
  $("#courses-nav").addEventListener("click", openCountryList);
  $("#dashboard-countries").addEventListener("click", openCountryList);
  $("#dashboard-courses").addEventListener("click", openCountryList);
  $("#dashboard-requests").addEventListener("click", loadRequests);
  $("#dashboard-all-requests").addEventListener("click", loadRequests);
  $("#dashboard-all-countries").addEventListener("click", openCountryList);
  $("#dashboard-imports").addEventListener("click", openCountryList);
  $("#country-back").addEventListener("click", openCountryList);
  $("#open-deleted").addEventListener("click", openDeletedCourses);
  $("#deleted-back").addEventListener("click", () => openCountry(state.country));
  $("#add-course").addEventListener("click", openNewCourse);
  $("#course-search").addEventListener("input", (event) => {
    state.courseQuery = event.target.value.trim();
    clearTimeout(loadCourses.searchTimer);
    loadCourses.searchTimer = setTimeout(() => loadCourses(0).catch((error) => toast(error.message, true)), 250);
  });
  $("#deleted-search").addEventListener("input", (event) => {
    state.deletedQuery = event.target.value.trim();
    clearTimeout(loadDeletedCourses.searchTimer);
    loadDeletedCourses.searchTimer = setTimeout(() => loadDeletedCourses(0).catch((error) => toast(error.message, true)), 250);
  });
  $("#import-back").addEventListener("click", () => openCountry(state.country));
  $("#run-import").addEventListener("click", runImport);
  $("#request-category-filter").addEventListener("change", (event) => { state.requestCategory = event.target.value; loadRequests(); });
  $("#review-close").addEventListener("click", closeDrawer);
  $("#review-drawer").addEventListener("click", (event) => { if (event.target === $("#review-drawer")) closeDrawer(); });
  $("#confirm-cancel").addEventListener("click", closeConfirm);
  $("#confirm-modal").addEventListener("click", (event) => { if (event.target === $("#confirm-modal")) closeConfirm(); });
  $("#confirm-ok").addEventListener("click", async () => {
    if (!confirmHandler) return;
    const action = confirmHandler;
    $("#confirm-ok").disabled = true;
    try { await action(); }
    catch (error) { toast(error.message, true); $("#confirm-ok").disabled = false; }
  });
  $("#logout").addEventListener("click", lock);
  $("#side-logout").addEventListener("click", lock);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") { closeDrawer(); closeConfirm(); } });

  setupRequestFilters();
  if (state.token) { $("#admin-token").value = state.token; login(); }
  else lock();
})();`;


export { adminClient };
