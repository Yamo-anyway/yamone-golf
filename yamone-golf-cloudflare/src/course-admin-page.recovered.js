// Recovered without behavioral changes from admin 0.3.22; see docs/SOURCE_INTEGRATION_20261026.md.
import { adminClient } from "./course-admin-client.recovered.js";
const __name = (target, value) => Object.defineProperty(target, "name", { value, configurable: true });

var html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Yamone Golf \xB7 \uACE8\uD504\uC7A5 \uB370\uC774\uD130 \uAD00\uB9AC\uC790</title>
  <style>
    :root {
      color-scheme: light;
      --forest-950: #0b2d25;
      --forest-900: #113c31;
      --forest-800: #175141;
      --forest-700: #236a56;
      --forest-600: #327d67;
      --forest-200: #cce5d9;
      --forest-100: #e8f2ed;
      --forest-50: #f3f8f5;
      --cream: #f7f6f0;
      --surface: #ffffff;
      --ink: #17211e;
      --muted: #6b7873;
      --line: #dfe5e1;
      --line-strong: #cbd5d0;
      --ocean: #d8f0f3;
      --ocean-line: #b9dde2;
      --land: #e6eee8;
      --land-line: #bdcec5;
      --amber: #b46b16;
      --amber-soft: #fff2d7;
      --shadow: 0 12px 34px rgba(17, 60, 49, 0.08);
      --shadow-soft: 0 4px 16px rgba(17, 60, 49, 0.06);
      font-family: Inter, Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    * { box-sizing: border-box; }
    html { min-width: 320px; background: var(--cream); }
    body { margin: 0; color: var(--ink); background: var(--cream); }
    button, input { font: inherit; -webkit-appearance: none; appearance: none; }
    button { cursor: pointer; }

    .icon {
      width: 20px;
      height: 20px;
      display: inline-block;
      flex: 0 0 auto;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .app-shell {
      min-height: 100vh;
      display: grid;
      grid-template-columns: 252px minmax(0, 1fr);
    }

    .sidebar {
      position: sticky;
      top: 0;
      height: 100vh;
      padding: 28px 18px 20px;
      display: flex;
      flex-direction: column;
      color: #eaf5f0;
      background:
        radial-gradient(circle at 12% 8%, rgba(118, 185, 153, 0.24), transparent 24%),
        linear-gradient(168deg, var(--forest-800), var(--forest-950) 78%);
    }

    .brand { display: flex; align-items: center; gap: 12px; padding: 0 10px 28px; }
    .brand-mark {
      width: 42px;
      height: 42px;
      display: grid;
      place-items: center;
      border-radius: 14px;
      color: var(--forest-950);
      background: #d8eee3;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.4);
    }
    .brand-mark .icon { width: 25px; height: 25px; stroke-width: 2; }
    .brand-title { font-weight: 900; letter-spacing: .08em; font-size: 14px; }
    .brand-subtitle { margin-top: 3px; color: #aec9bd; font-size: 12px; }

    .nav-label { padding: 0 12px 8px; color: #8fb0a2; font-size: 11px; font-weight: 800; letter-spacing: .12em; }
    .nav-list { display: grid; gap: 6px; }
    .nav-button {
      width: 100%;
      min-height: 48px;
      display: flex;
      align-items: center;
      gap: 12px;
      border: 0;
      border-radius: 13px;
      padding: 0 13px;
      color: #c5d9d0;
      background: transparent;
      text-align: left;
      font-weight: 750;
      transition: .18s ease;
    }
    .nav-button:hover { color: white; background: rgba(255,255,255,.07); }
    .nav-button[aria-current="page"] {
      color: white;
      background: rgba(255,255,255,.14);
      box-shadow: inset 3px 0 #99d8b9;
    }
    .nav-text { flex: 1; }
    .nav-count {
      min-width: 25px;
      padding: 3px 7px;
      border-radius: 999px;
      color: #fff6da;
      background: rgba(239,177,69,.22);
      font-size: 11px;
      text-align: center;
    }

    .sidebar-note {
      margin-top: auto;
      padding: 15px;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 14px;
      color: #bed2c9;
      background: rgba(255,255,255,.05);
      font-size: 12px;
      line-height: 1.55;
    }
    .sidebar-note strong { display: block; margin-bottom: 4px; color: white; font-size: 13px; }
    .session { margin-top: 14px; display: flex; align-items: center; gap: 10px; }
    .avatar {
      width: 34px;
      height: 34px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      color: var(--forest-950);
      background: #d8eee3;
      font-size: 12px;
      font-weight: 900;
    }
    .session-meta { min-width: 0; flex: 1; }
    .session-meta strong, .session-meta span { display: block; }
    .session-meta span { margin-top: 2px; color: #91aea1; font-size: 11px; }
    .lock-button { border: 0; padding: 6px; color: #bcd2c8; background: transparent; }

    .main { min-width: 0; padding: 28px clamp(20px, 3.2vw, 48px) 52px; }
    .main.detail-mode .topbar { display: none; }
    .topbar {
      min-height: 52px;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 20px;
      margin-bottom: 24px;
    }
    .breadcrumb { margin-bottom: 7px; color: var(--muted); font-size: 12px; font-weight: 700; }
    h1, h2, h3, p { margin-top: 0; }
    h1 { margin-bottom: 5px; font-size: clamp(25px, 3vw, 34px); line-height: 1.2; letter-spacing: -.035em; }
    h2 { margin-bottom: 5px; font-size: 19px; letter-spacing: -.02em; }
    .page-description { margin: 0; color: var(--muted); font-size: 14px; }
    .sample-badge {
      padding: 7px 10px;
      border-radius: 999px;
      color: var(--amber);
      background: var(--amber-soft);
      font-size: 11px;
      font-weight: 850;
      white-space: nowrap;
    }

    .card {
      border: 1px solid var(--line);
      border-radius: 18px;
      background: var(--surface);
      box-shadow: var(--shadow-soft);
    }
    .card-head {
      min-height: 76px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      padding: 17px 20px;
      border-bottom: 1px solid #edf0ee;
    }
    .card-head h2 { margin: 0 0 4px; }
    .fine { color: var(--muted); font-size: 11px; line-height: 1.5; }

    .button {
      width: auto;
      height: 42px;
      min-height: 42px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      border: 1px solid transparent;
      border-radius: 11px;
      padding: 0 16px;
      font-weight: 800;
      line-height: 1;
      white-space: nowrap;
      transition: .16s ease;
    }
    .button:hover { transform: translateY(-1px); }
    .button:active { transform: translateY(0); }
    .button.primary { color: white; background: var(--forest-800); }
    .button.primary:hover { background: var(--forest-900); }
    .button.secondary { color: var(--forest-900); border-color: var(--line-strong); background: white; }
    .button:disabled { cursor: not-allowed; opacity: .42; transform: none; }
    .button:focus-visible, .nav-button:focus-visible, .country-open:focus-visible {
      outline: 3px solid rgba(35,106,86,.22);
      outline-offset: 2px;
    }

    .view[hidden] { display: none; }
    .country-card { overflow: hidden; }
    .country-table-head,
    .country-entry {
      display: grid;
      grid-template-columns: minmax(210px, 1.6fr) minmax(72px, .52fr) minmax(72px, .52fr) 58px 58px 74px;
      align-items: center;
      gap: 10px;
    }
    .country-table-head {
      min-height: 34px;
      padding: 0 20px;
      border-bottom: 1px solid var(--line);
      color: var(--muted);
      background: #fafbf9;
      font-size: 10px;
      font-weight: 850;
      letter-spacing: .02em;
    }
    .country-table-head span:nth-child(2),
    .country-table-head span:nth-child(3) { text-align: right; }
    .country-table-head span:nth-child(n+4) { text-align: center; }
    .country-list { padding: 0 18px; }
    .country-entry {
      min-height: 44px;
      border-bottom: 1px solid #edf0ee;
      padding: 0 2px;
      color: var(--ink);
      background: white;
      transition: .16s ease;
    }
    .country-entry:last-child { border-bottom: 0; }
    .country-entry:hover { background: var(--forest-50); }
    .country-open {
      min-width: 0;
      min-height: 43px;
      display: flex;
      align-items: center;
      gap: 11px;
      border: 0;
      padding: 0;
      color: var(--ink);
      background: transparent;
      text-align: left;
    }
    .flag {
      width: 26px;
      height: 26px;
      display: grid;
      place-items: center;
      flex: 0 0 auto;
      border-radius: 8px;
      background: #f2f6f3;
      font-size: 15px;
    }
    .country-copy { min-width: 0; }
    .country-copy strong, .country-copy span { display: block; }
    .country-copy strong { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
    .country-copy span { display: none; }
    .country-number { text-align: right; font-size: 13px; font-weight: 800; font-variant-numeric: tabular-nums; }
    .country-summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin: 10px 18px 12px;
      padding: 10px 12px;
      border-radius: 13px;
      color: var(--muted);
      background: #f7f9f7;
      font-size: 11px;
    }
    .country-summary strong { color: var(--ink); font-size: 15px; }

    .square-control {
      width: 34px;
      height: 34px;
      display: grid;
      place-items: center;
      justify-self: center;
      border: 1px solid var(--line-strong);
      border-radius: 9px;
      color: var(--forest-800);
      background: white;
      transition: .16s ease;
    }
    .square-control:hover { border-color: #9fb7ad; background: var(--forest-50); }
    .square-control.danger { color: #b85242; }
    .square-control:disabled { cursor: not-allowed; color: #a8b0ad; border-color: #e5e9e7; background: #f5f6f5; }
    .square-control .icon { width: 16px; height: 16px; }

    .switch {
      width: 40px;
      height: 22px;
      display: inline-flex;
      justify-self: center;
      position: relative;
      cursor: pointer;
    }
    .switch input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
    .switch-track {
      width: 40px;
      height: 22px;
      display: block;
      border-radius: 999px;
      background: #c9d1cd;
      box-shadow: inset 0 0 0 1px rgba(16,47,38,.08);
      transition: .18s ease;
    }
    .switch-track::after {
      content: "";
      position: absolute;
      top: 3px;
      left: 3px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: white;
      box-shadow: 0 2px 5px rgba(10,35,28,.23);
      transition: .18s ease;
    }
    .switch input:checked + .switch-track { background: var(--forest-700); }
    .switch input:checked + .switch-track::after { transform: translateX(18px); }
    .switch input:focus-visible + .switch-track { outline: 3px solid rgba(35,106,86,.22); outline-offset: 2px; }

    .head-summary { display: flex; align-items: center; gap: 8px; }
    .head-count {
      min-width: 116px;
      height: 42px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      border: 1px solid var(--line);
      border-radius: 11px;
      padding: 0 12px;
      color: var(--muted);
      background: #fafbf9;
      font-size: 10px;
      font-weight: 750;
    }
    .head-count strong { color: var(--ink); font-size: 14px; }

    .detail-head {
      min-height: 58px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      margin-bottom: 12px;
      padding: 0;
    }
    .detail-title { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
    .back-button {
      width: 42px;
      height: 42px;
      display: grid;
      place-items: center;
      border: 1px solid var(--line-strong);
      border-radius: 11px;
      color: var(--forest-900);
      background: white;
    }
    .detail-title .flag { width: 34px; height: 34px; font-size: 19px; }
    .detail-title h2 { margin: 0 0 3px; }
    .detail-path { color: var(--muted); font-size: 11px; }
    .detail-side { display: flex; align-items: center; gap: 8px; }
    .inline-total { height: 42px; display: inline-flex; align-items: center; gap: 7px; border-left: 1px solid var(--line); padding: 0 4px 0 14px; color: var(--muted); font-size: 10px; font-weight: 750; }
    .inline-total strong { color: var(--ink); font-size: 14px; }

    .course-card { overflow: hidden; }
    .table-scroll { overflow-x: auto; }
    .course-table { width: 100%; border-collapse: collapse; }
    .registered-course-table { min-width: 940px; table-layout: fixed; }
    .registered-course-table th:nth-child(1) { width: 24%; }
    .registered-course-table th:nth-child(2) { width: 12%; }
    .registered-course-table th:nth-child(3) { width: 26%; }
    .registered-course-table th:nth-child(4) { width: 21%; }
    .registered-course-table th:nth-child(5) { width: 9%; }
    .registered-course-table th:nth-child(6) { width: 8%; }
    .import-course-table { min-width: 880px; table-layout: fixed; }
    .import-course-table th:nth-child(1) { width: 30%; }
    .import-course-table th:nth-child(2) { width: 45%; }
    .import-course-table th:nth-child(3) { width: 13%; }
    .import-course-table th:nth-child(4) { width: 12%; }
    .course-table th {
      height: 34px;
      padding: 0 12px;
      color: var(--muted);
      background: #fafbf9;
      font-size: 10px;
      font-weight: 850;
      text-align: left;
      white-space: nowrap;
    }
    .course-table td { height: 40px; max-height: 40px; overflow: hidden; padding: 6px 12px; border-top: 1px solid #edf0ee; font-size: 11px; vertical-align: middle; white-space: nowrap; text-overflow: ellipsis; }
    .course-main { overflow: hidden; font-weight: 850; text-overflow: ellipsis; }
    .course-sub { display: block; margin-top: 2px; color: var(--muted); font-size: 9px; font-weight: 600; line-height: 1.35; }
    .course-row { cursor: pointer; transition: background .14s ease; }
    .course-row:hover, .course-row:focus-visible { background: var(--forest-50); outline: none; }
    .type-pill { display: inline-flex; align-items: center; height: 24px; border-radius: 999px; padding: 0 8px; color: var(--forest-800); background: var(--forest-100); font-size: 9px; font-weight: 850; }
    .type-pill.private { color: #765c1d; background: #fff2d7; }
    .status-pill { display: inline-flex; align-items: center; gap: 6px; color: var(--forest-800); font-size: 10px; font-weight: 800; }
    .status-pill::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: #46a078; }
    .status-pill.warning { color: #a36318; }
    .status-pill.warning::before { background: #d49322; }
    .table-footer { min-height: 46px; display: flex; align-items: center; justify-content: space-between; gap: 15px; padding: 6px 12px; border-top: 1px solid var(--line); color: var(--muted); font-size: 10px; }
    .pagination { display: flex; gap: 5px; }
    .page-button { width: 34px; height: 34px; border: 1px solid var(--line); border-radius: 9px; color: var(--muted); background: white; font-size: 11px; font-weight: 800; }
    .page-button.active { color: white; border-color: var(--forest-800); background: var(--forest-800); }

    .import-panel { overflow: hidden; }
    .import-controls { padding: 17px 18px; border-bottom: 1px solid var(--line); }
    .import-control-head { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
    .import-control-head h2 { margin: 0 0 4px; }
    .region-picker { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 14px; }
    .region-choice {
      height: 36px;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      border: 1px solid var(--line-strong);
      border-radius: 10px;
      padding: 0 11px;
      color: var(--muted);
      background: white;
      font-size: 11px;
      font-weight: 800;
    }
    .region-choice::before { content: ""; width: 14px; height: 14px; border: 1.5px solid #9ba9a3; border-radius: 4px; background: white; }
    .region-choice[aria-pressed="true"] { color: var(--forest-800); border-color: #8eb9a5; background: var(--forest-50); }
    .region-choice[aria-pressed="true"]::before { border-color: var(--forest-700); background: var(--forest-700) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m5 12 4 4L19 6'/%3E%3C/svg%3E") center/11px no-repeat; }
    .import-placeholder { padding: 46px 20px; color: var(--muted); text-align: center; font-size: 12px; }
    .import-result-head { min-height: 44px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 12px; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 10px; }
    .import-result-head strong { color: var(--ink); font-size: 12px; }
    .import-status { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 850; }
    .import-status::before { content: ""; width: 7px; height: 7px; border-radius: 50%; }
    .import-status.reflected { color: var(--forest-700); }
    .import-status.reflected::before { background: #46a078; }
    .import-status.missing { color: #b46b16; }
    .import-status.missing::before { background: #dc971d; }
    .import-status.update { color: #b85242; }
    .import-status.update::before { background: #c96252; }
    .button.table-action { height: 32px; min-height: 32px; border-radius: 8px; padding: 0 11px; font-size: 10px; }

    .request-card { overflow: hidden; }
    .request-toolbar { min-height: 58px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; border-bottom: 1px solid var(--line); }
    .request-filters { display: flex; flex-wrap: wrap; gap: 6px; }
    .request-filter { height: 34px; border: 1px solid var(--line); border-radius: 9px; padding: 0 11px; color: var(--muted); background: white; font-size: 10px; font-weight: 800; }
    .request-filter[aria-pressed="true"] { color: white; border-color: var(--forest-800); background: var(--forest-800); }
    .filter-select { height: 36px; min-width: 210px; border: 1px solid var(--line-strong); border-radius: 9px; padding: 0 32px 0 10px; color: var(--ink); background: white; font-size: 10px; font-weight: 750; }
    .request-summary { display: flex; gap: 7px; padding: 11px 14px; border-bottom: 1px solid var(--line); background: #fafbf9; }
    .request-stat { display: inline-flex; align-items: center; gap: 6px; height: 30px; border-radius: 9px; padding: 0 10px; color: var(--muted); background: white; font-size: 9px; font-weight: 800; }
    .request-stat strong { color: var(--ink); font-size: 12px; }
    .request-table { min-width: 1050px; table-layout: fixed; }
    .request-table th:nth-child(1) { width: 8%; }
    .request-table th:nth-child(2) { width: 16%; }
    .request-table th:nth-child(3) { width: 23%; }
    .request-table th:nth-child(4) { width: 11%; }
    .request-table th:nth-child(5) { width: 18%; }
    .request-table th:nth-child(6) { width: 12%; }
    .request-table th:nth-child(7) { width: 12%; }
    .request-row.clickable { cursor: pointer; transition: background .14s ease; }
    .request-row.clickable:hover, .request-row.clickable:focus-visible { background: var(--forest-50); outline: none; }
    .request-row.completed { color: #8b9591; background: #fbfcfb; }
    .category-chip { display: inline-flex; align-items: center; height: 24px; border-radius: 999px; padding: 0 8px; color: #3f5f53; background: #edf3f0; font-size: 9px; font-weight: 850; }
    .request-status { display: inline-flex; align-items: center; gap: 6px; height: 24px; border-radius: 999px; padding: 0 8px; font-size: 9px; font-weight: 850; }
    .request-status::before { content: ""; width: 6px; height: 6px; border-radius: 50%; }
    .request-status.received { color: #8a641d; background: #fff4dc; }
    .request-status.received::before { background: #d69520; }
    .request-status.processing { color: #285d80; background: #e7f3fb; }
    .request-status.processing::before { background: #4287b5; }
    .request-status.hold { color: #765c1d; background: #f5edda; }
    .request-status.hold::before { background: #9b7b31; }
    .request-status.completed { color: #286a56; background: #e5f2ec; }
    .request-status.completed::before { background: #3e9976; }
    .request-status.rejected { color: #9a5045; background: #fff0ed; }
    .request-status.rejected::before { background: #bf6658; }

    .dashboard-stack { display: grid; gap: 14px; }
    .dashboard-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .metric-card {
      min-height: 92px;
      display: flex;
      align-items: center;
      gap: 13px;
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 15px;
      color: var(--ink);
      background: white;
      box-shadow: var(--shadow-soft);
    }
    button.metric-card { width: 100%; text-align: left; }
    button.metric-card:hover { border-color: #a9c6b8; background: var(--forest-50); }
    .metric-icon { width: 40px; height: 40px; display: grid; place-items: center; flex: 0 0 auto; border-radius: 12px; color: var(--forest-800); background: var(--forest-100); }
    .metric-icon.amber { color: #9c631d; background: #fff1d7; }
    .metric-icon.blue { color: #285d80; background: #e5f2fa; }
    .metric-icon.rose { color: #a55347; background: #fff0ed; }
    .metric-copy span, .metric-copy strong, .metric-copy small { display: block; }
    .metric-copy span { color: var(--muted); font-size: 9px; font-weight: 800; }
    .metric-copy strong { margin-top: 3px; font-size: 22px; line-height: 1.1; font-variant-numeric: tabular-nums; }
    .metric-copy small { margin-top: 4px; color: var(--muted); font-size: 9px; }
    .dashboard-grid { display: grid; grid-template-columns: minmax(0, 1.08fr) minmax(320px, .92fr); gap: 14px; }
    .dashboard-bottom { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(300px, .65fr); gap: 14px; }
    .dashboard-card { overflow: hidden; }
    .dashboard-card-head { min-height: 58px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--line); }
    .dashboard-card-head h2 { margin: 0 0 3px; font-size: 15px; }
    .dashboard-link { border: 0; padding: 4px; color: var(--forest-700); background: transparent; font-size: 10px; font-weight: 850; }
    .task-list { display: grid; }
    .dashboard-task { min-height: 52px; display: grid; grid-template-columns: 32px minmax(0,1fr) auto; align-items: center; gap: 10px; border: 0; border-bottom: 1px solid #edf0ee; padding: 7px 15px; color: var(--ink); background: white; text-align: left; }
    .dashboard-task:last-child { border-bottom: 0; }
    .dashboard-task:hover { background: var(--forest-50); }
    .task-marker { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 9px; color: var(--forest-800); background: var(--forest-100); font-size: 10px; font-weight: 900; }
    .task-marker.amber { color: #9b611a; background: #fff1d7; }
    .task-marker.rose { color: #a45145; background: #fff0ed; }
    .task-copy strong, .task-copy span { display: block; }
    .task-copy strong { font-size: 11px; }
    .task-copy span { margin-top: 2px; color: var(--muted); font-size: 9px; }
    .task-count { min-width: 28px; color: var(--ink); font-size: 14px; font-weight: 900; text-align: right; }
    .quality-list { display: grid; gap: 15px; padding: 16px; }
    .quality-row { display: grid; gap: 6px; }
    .quality-label { display: flex; justify-content: space-between; gap: 12px; font-size: 10px; font-weight: 800; }
    .quality-label span { color: var(--muted); }
    .quality-track { height: 7px; overflow: hidden; border-radius: 999px; background: #edf1ef; }
    .quality-fill { height: 100%; border-radius: inherit; background: var(--forest-600); }
    .quality-fill.amber { background: #d4982d; }
    .dashboard-country-table { min-width: 760px; table-layout: fixed; }
    .dashboard-country-table th:nth-child(1) { width: 30%; }
    .dashboard-country-table th:nth-child(2) { width: 17%; }
    .dashboard-country-table th:nth-child(3), .dashboard-country-table th:nth-child(4) { width: 13%; }
    .dashboard-country-table th:nth-child(5) { width: 14%; }
    .dashboard-country-table th:nth-child(6) { width: 13%; }
    .dashboard-country-row { cursor: pointer; }
    .dashboard-country-row:hover, .dashboard-country-row:focus-visible { background: var(--forest-50); outline: none; }
    .recent-list { display: grid; }
    .recent-request { min-height: 55px; display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: center; gap: 10px; border: 0; border-bottom: 1px solid #edf0ee; padding: 8px 14px; color: var(--ink); background: white; text-align: left; }
    .recent-request:last-child { border-bottom: 0; }
    .recent-request:hover { background: var(--forest-50); }
    .recent-request strong, .recent-request span { display: block; }
    .recent-request strong { overflow: hidden; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
    .recent-request span { margin-top: 3px; color: var(--muted); font-size: 9px; }

    .drawer-backdrop {
      position: fixed;
      z-index: 80;
      inset: 0;
      visibility: hidden;
      background: rgba(7,27,22,.42);
      opacity: 0;
      transition: .2s ease;
    }
    .drawer-backdrop.open { visibility: visible; opacity: 1; }
    .drawer {
      position: absolute;
      top: 0;
      right: 0;
      width: min(760px, 100vw);
      height: 100%;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      background: #f8faf8;
      box-shadow: -20px 0 60px rgba(7,27,22,.2);
      transform: translateX(100%);
      transition: transform .24s ease;
    }
    .drawer-backdrop.open .drawer { transform: none; }
    .drawer-head {
      min-height: 76px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 15px 20px;
      border-bottom: 1px solid var(--line);
      background: white;
    }
    .drawer-head h2 { margin: 0 0 4px; }
    .drawer-content { min-height: 0; padding: 18px 20px 30px; overflow-y: auto; }
    .drawer-footer { min-height: 68px; display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 12px 20px; border-top: 1px solid var(--line); background: white; }
    .drawer-section { margin-bottom: 14px; border: 1px solid var(--line); border-radius: 15px; background: white; overflow: hidden; }
    .drawer-section.course-basic-section { position: relative; z-index: 4; overflow: visible; }
    .drawer-section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 13px 15px; border-bottom: 1px solid var(--line); }
    .drawer-section-head h3 { margin: 0; font-size: 14px; }
    .drawer-section-body { padding: 15px; }
    .review-meta { display: grid; grid-template-columns: 1.3fr .7fr .7fr; gap: 9px; }
    .review-field { min-width: 0; padding: 10px 12px; border-radius: 10px; background: #f6f8f6; }
    .review-field span, .review-field strong { display: block; }
    .review-field span { color: var(--muted); font-size: 9px; font-weight: 750; }
    .review-field strong { margin-top: 4px; overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
    .review-field.wide { grid-column: 1 / -1; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 11px; }
    .form-field { min-width: 0; }
    .form-field.wide { grid-column: 1 / -1; }
    .form-field > label, .form-label { display: block; margin-bottom: 6px; color: var(--muted); font-size: 9px; font-weight: 850; }
    .form-input, .form-textarea, .form-select {
      width: 100%;
      border: 1px solid var(--line-strong);
      border-radius: 9px;
      padding: 0 10px;
      color: var(--ink);
      background: white;
      font-size: 11px;
      outline: none;
    }
    .form-input, .form-select { height: 38px; }
    .form-textarea { min-height: 88px; padding-top: 10px; resize: vertical; line-height: 1.5; }
    .form-input:focus, .form-textarea:focus, .form-select:focus { border-color: #72a590; box-shadow: 0 0 0 3px rgba(35,106,86,.10); }
    .custom-combo { position: relative; }
    .combo-trigger {
      width: 100%; height: 38px; display: flex; align-items: center; justify-content: space-between; gap: 10px;
      border: 1px solid var(--line-strong); border-radius: 9px; padding: 0 10px 0 12px;
      color: var(--ink); background: white; font-size: 11px; text-align: left; outline: none;
    }
    .combo-trigger .icon { width: 16px; height: 16px; color: var(--muted); transition: transform .16s ease; }
    .custom-combo.open .combo-trigger { border-color: #72a590; box-shadow: 0 0 0 3px rgba(35,106,86,.10); }
    .custom-combo.open .combo-trigger .icon { transform: rotate(180deg); }
    .combo-menu {
      position: absolute; z-index: 30; top: calc(100% + 6px); right: 0; left: 0; max-height: 230px; overflow-y: auto;
      border: 1px solid var(--line-strong); border-radius: 11px; padding: 5px; background: white; box-shadow: 0 16px 38px rgba(7,27,22,.16);
    }
    .combo-menu[hidden] { display: none; }
    .combo-option {
      width: 100%; min-height: 34px; display: flex; align-items: center; justify-content: space-between; gap: 10px;
      border: 0; border-radius: 8px; padding: 7px 9px; color: var(--ink); background: white; font-size: 11px; text-align: left;
    }
    .combo-option:hover, .combo-option:focus-visible { background: var(--forest-50); outline: none; }
    .combo-option .icon { width: 15px; height: 15px; color: var(--forest-700); opacity: 0; }
    .combo-option.selected { color: var(--forest-800); background: var(--forest-100); font-weight: 850; }
    .combo-option.selected .icon { opacity: 1; }
    .localized-fields { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 7px; }
    .localized-field span { display: block; margin-bottom: 4px; color: var(--muted); font-size: 8px; font-weight: 800; }
    .detail-list { display: grid; gap: 8px; }
    .detail-row { min-height: 40px; display: grid; grid-template-columns: 112px minmax(0,1fr); align-items: center; gap: 12px; border-bottom: 1px solid #edf0ee; padding: 6px 2px; }
    .detail-row:last-child { border-bottom: 0; }
    .detail-row span { color: var(--muted); font-size: 9px; font-weight: 800; }
    .detail-row strong { overflow-wrap: anywhere; font-size: 11px; line-height: 1.45; }
    .course-config { margin-top: 10px; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
    .course-config:first-child { margin-top: 0; }
    .course-config-head { min-height: 46px; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 7px 10px; background: #f8faf8; }
    .course-config-head .form-input { max-width: 340px; }
    .mini-danger { height: 32px; border: 1px solid #e4c1bb; border-radius: 8px; padding: 0 10px; color: #a55043; background: #fff8f6; font-size: 9px; font-weight: 850; }
    .request-compare { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .request-value { min-height: 86px; border: 1px solid var(--line); border-radius: 11px; padding: 11px; background: #fafbf9; }
    .request-value.requested { border-color: #a8d2bf; background: var(--forest-50); }
    .request-value span, .request-value strong { display: block; }
    .request-value span { color: var(--muted); font-size: 9px; font-weight: 800; }
    .request-value strong { margin-top: 7px; font-size: 12px; line-height: 1.5; }
    .history-list { display: grid; gap: 9px; }
    .history-item { position: relative; padding: 0 0 10px 19px; border-bottom: 1px solid #edf0ee; }
    .history-item:last-child { padding-bottom: 0; border-bottom: 0; }
    .history-item::before { content: ""; position: absolute; top: 4px; left: 2px; width: 8px; height: 8px; border-radius: 50%; background: var(--forest-600); }
    .history-item strong, .history-item span { display: block; }
    .history-item strong { font-size: 10px; }
    .history-item span { margin-top: 3px; color: var(--muted); font-size: 9px; line-height: 1.45; }
    .segment-list { display: grid; gap: 11px; }
    .segment-editor { border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
    .segment-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 11px; background: #f8faf8; }
    .segment-title strong { font-size: 12px; }
    .par-editor { padding: 11px; overflow-x: auto; }
    .par-grid {
      min-width: 588px;
      display: grid;
      grid-template-columns: repeat(9, minmax(48px, 1fr)) 66px;
      gap: 6px;
      align-items: center;
    }
    .par-grid + .par-grid { margin-top: 5px; }
    .par-head { color: var(--muted); font-size: 10px; font-weight: 850; text-align: center; }
    .par-control {
      width: 100%;
      height: 34px;
      display: grid;
      place-items: center;
      border: 1px solid var(--line-strong);
      border-radius: 9px;
      color: var(--forest-800);
      background: white;
      font-size: 20px;
      font-weight: 700;
      line-height: 1;
    }
    .par-control:hover { border-color: #83aa98; background: var(--forest-50); }
    .par-control.minus { color: #8e5d53; }
    .par-value {
      height: 38px;
      display: grid;
      place-items: center;
      border-radius: 9px;
      color: var(--forest-950);
      background: var(--forest-100);
      font-size: 15px;
      font-weight: 900;
      font-variant-numeric: tabular-nums;
    }
    .par-total { color: white; background: var(--forest-800); }
    .par-spacer { height: 34px; }
    .new-segment-button { width: 100%; margin-top: 11px; border-style: dashed; }

    .compare-summary { display: flex; gap: 8px; margin-bottom: 14px; }
    .compare-badge { display: inline-flex; align-items: center; gap: 6px; height: 32px; border-radius: 9px; padding: 0 10px; font-size: 10px; font-weight: 850; }
    .compare-badge.removed { color: #9c4f43; background: #fff0ed; }
    .compare-badge.new { color: #276d58; background: var(--forest-100); }
    .compare-table-head,
    .compare-row { display: grid; grid-template-columns: 92px minmax(0, 1fr) minmax(0, 1fr) 142px; gap: 9px; align-items: stretch; }
    .compare-table-head { padding: 0 0 7px; color: var(--muted); font-size: 9px; font-weight: 850; }
    .compare-row { padding: 8px 0; border-top: 1px solid #edf0ee; }
    .compare-label { padding: 9px 2px; color: var(--muted); font-size: 10px; font-weight: 800; }
    .compare-cell { min-height: 48px; padding: 9px 10px; border: 1px solid var(--line); border-radius: 10px; background: #fafbf9; font-size: 11px; line-height: 1.45; }
    .compare-cell.changed { border-color: #e6b1a8; background: #fff7f5; }
    .compare-cell.new { border-color: #a8d2bf; background: var(--forest-50); }
    .compare-cell strong, .compare-cell span { display: block; }
    .compare-cell span { margin-top: 3px; color: var(--muted); font-size: 9px; }
    .change-tag { display: inline-flex!important; width: max-content; margin: 0 0 5px!important; border-radius: 999px; padding: 2px 6px; font-size: 8px!important; font-weight: 850; }
    .change-tag.removed { color: #a34f42; background: #ffe5e0; }
    .change-tag.new { color: #236a56; background: #dceddf; }
    .change-tag.changed { color: #9a601d; background: #fff0d1; }
    .decision-cell { display: flex; align-items: center; justify-content: center; }
    .decision-static { color: var(--muted); font-size: 9px; font-weight: 750; }
    .decision-control { display: grid; grid-template-columns: 1fr 1fr; width: 136px; height: 34px; padding: 3px; border: 1px solid var(--line); border-radius: 9px; background: #f0f3f1; }
    .decision-button { border: 0; border-radius: 6px; padding: 0 6px; color: var(--muted); background: transparent; font-size: 9px; font-weight: 850; }
    .decision-button[aria-pressed="true"][data-decision-value="apply"] { color: white; background: var(--forest-700); box-shadow: 0 2px 5px rgba(17,60,49,.18); }
    .decision-button[aria-pressed="true"][data-decision-value="skip"] { color: #8c4e43; background: #fff0ed; box-shadow: inset 0 0 0 1px #ebc7c0; }
    .drawer-selection { margin-right: auto; color: var(--muted); font-size: 10px; }
    .drawer-selection strong { margin-left: 4px; color: var(--ink); font-size: 13px; }

    .modal-backdrop {
      position: fixed;
      z-index: 90;
      inset: 0;
      display: none;
      place-items: center;
      padding: 24px;
      background: rgba(7,27,22,.46);
      backdrop-filter: blur(3px);
    }
    .modal-backdrop.open { display: grid; }
    .modal-panel {
      width: min(470px, 100%);
      border: 1px solid rgba(255,255,255,.72);
      border-radius: 20px;
      background: white;
      box-shadow: 0 28px 90px rgba(7,27,22,.26);
      animation: modal-in .18s ease;
    }
    @keyframes modal-in { from { opacity: 0; transform: translateY(8px) scale(.985); } to { opacity: 1; transform: none; } }
    .modal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 22px 22px 17px; border-bottom: 1px solid var(--line); }
    .modal-head h2 { margin: 0 0 5px; }
    .icon-button {
      width: 38px;
      height: 38px;
      display: grid;
      place-items: center;
      border: 1px solid var(--line);
      border-radius: 11px;
      color: var(--muted);
      background: white;
    }
    .modal-body { padding: 20px 22px 22px; }
    .search-shell { position: relative; }
    .search-shell .icon { position: absolute; top: 50%; left: 13px; width: 17px; height: 17px; color: #83908b; transform: translateY(-50%); }
    .search-input {
      width: 100%;
      height: 42px;
      border: 1px solid var(--line-strong);
      border-radius: 11px;
      padding: 0 13px 0 40px;
      color: var(--ink);
      background: white;
      outline: none;
    }
    .search-input:focus { border-color: #72a590; box-shadow: 0 0 0 3px rgba(35,106,86,.10); }
    .review-select {
      width: 100%;
      min-height: 38px;
      border: 1px solid var(--line-strong);
      border-radius: 9px;
      padding: 0 32px 0 10px;
      color: var(--ink);
      background: white;
      font-size: 11px;
      font-weight: 750;
    }
    .review-hint { display: block; margin-top: 5px; color: var(--muted); font-size: 9px; font-weight: 600; }

    .toast {
      position: fixed;
      z-index: 120;
      right: 28px;
      bottom: 28px;
      display: flex;
      align-items: center;
      gap: 10px;
      border-radius: 13px;
      padding: 12px 15px;
      color: white;
      background: var(--forest-950);
      box-shadow: 0 16px 42px rgba(7,27,22,.28);
      font-size: 12px;
      font-weight: 750;
      opacity: 0;
      pointer-events: none;
      transform: translateY(10px);
      transition: .2s ease;
    }
    .toast.show { opacity: 1; transform: none; }

    @media (max-width: 1120px) {
      .country-table-head,
      .country-entry { grid-template-columns: minmax(190px, 1.45fr) 72px 72px 52px 52px 64px; }
      .detail-head { align-items: flex-start; flex-direction: column; }
      .detail-side { width: 100%; justify-content: flex-end; }
      .dashboard-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .dashboard-grid, .dashboard-bottom { grid-template-columns: 1fr; }
    }

    @media (max-width: 760px) {
      .app-shell { grid-template-columns: 1fr; }
      .sidebar { position: sticky; z-index: 40; height: auto; padding: 12px 14px; }
      .brand { padding: 0 3px 10px; }
      .brand-subtitle, .nav-label, .sidebar-note, .session { display: none; }
      .nav-list { display: flex; gap: 5px; overflow-x: auto; }
      .nav-button { min-width: max-content; min-height: 42px; padding: 0 11px; }
      .nav-button .icon { display: none; }
      .main { padding: 22px 14px 38px; }
      .topbar { align-items: flex-start; flex-direction: column; }
      .dashboard-metrics { grid-template-columns: 1fr 1fr; gap: 8px; }
      .metric-card { min-height: 82px; padding: 12px; }
      .country-card { overflow-x: auto; }
      .country-table-head, .country-entry { min-width: 690px; grid-template-columns: minmax(190px, 1.45fr) 72px 72px 52px 52px 64px; gap: 7px; }
      .country-table-head { padding: 0 12px; }
      .country-list { padding: 0 10px; }
      .country-entry { min-height: 44px; }
      .flag { width: 26px; height: 26px; font-size: 15px; }
      .country-number { font-size: 12px; }
      .card-head { padding: 15px; }
      .course-table { min-width: 760px; }
      .head-summary { width: 100%; flex-wrap: wrap; }
      .import-control-head { align-items: flex-start; flex-direction: column; }
      .request-toolbar { align-items: stretch; flex-direction: column; }
      .filter-select { width: 100%; }
      .drawer { width: 100vw; }
      .drawer-content { padding: 14px 12px 24px; }
      .review-meta { grid-template-columns: 1fr; }
      .form-grid, .request-compare, .localized-fields { grid-template-columns: 1fr; }
      .compare-table-head,
      .compare-row { min-width: 760px; }
      .drawer-section-body.compare-body { overflow-x: auto; }
    }
    .table-scroll { max-height: 360px; overflow: auto; }
    .course-table th { position: sticky; top: 0; z-index: 3; }
    .country-list { max-height: 360px; overflow-y: auto; }
    .login-panel { width: min(430px, calc(100vw - 28px)); }
    .login-error { min-height: 18px; margin-top: 8px; color: #a55043; font-size: 11px; }
    .empty-row { padding: 28px !important; color: var(--muted); text-align: center; font-size: 11px; }

    .placeholder-card { min-height: 300px; display: grid; place-content: center; justify-items: center; padding: 40px; text-align: center; }
    .placeholder-card h2 { margin: 12px 0 5px; }
    .placeholder-card p { margin: 0; color: var(--muted); font-size: 12px; }
    .placeholder-icon { width: 54px; height: 54px; display: grid; place-items: center; border-radius: 17px; background: var(--forest-100); font-size: 25px; }

    .country-table-head { display: none; }
    .country-list { max-height: none; display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 12px; padding: 16px 18px 18px; overflow: visible; }
    .country-tile { overflow: hidden; border: 1px solid var(--line); border-radius: 15px; background: white; box-shadow: var(--shadow-soft); transition: .16s ease; }
    .country-tile:hover { border-color: #abc1b7; transform: translateY(-1px); }
    .country-tile.disabled-country { background: #f6f7f6; }
    .country-tile .country-open { width: 100%; min-height: 64px; padding: 12px 14px; }
    .country-tile .country-copy span { display: block; margin-top: 3px; color: var(--muted); font-size: 9px; }
    .country-arrow { margin-left: auto; color: #82908a; font-size: 22px; }
    .country-stats { display: grid; grid-template-columns: repeat(3,1fr); border-top: 1px solid #edf0ee; border-bottom: 1px solid #edf0ee; }
    .country-stats span { display: grid; gap: 2px; padding: 10px 12px; border-right: 1px solid #edf0ee; }
    .country-stats span:last-child { border-right: 0; }
    .country-stats small { color: var(--muted); font-size: 9px; font-weight: 750; }
    .country-stats strong { font-size: 15px; }
    .country-actions { min-height: 50px; display: flex; align-items: center; justify-content: flex-end; gap: 9px; padding: 8px 12px; }
    .country-state { margin-right: auto; color: var(--muted); font-size: 10px; font-weight: 800; }
    .square-control.unlocked { color: #9a601d; border-color: #e5c78d; background: #fff8ea; }
    .switch:has(input:disabled) { cursor: not-allowed; opacity: .58; }

    .course-toolbar { min-height: 58px; display: flex; align-items: center; gap: 14px; border-bottom: 1px solid var(--line); padding: 8px 12px; }
    .course-toolbar .search-shell { width: min(440px,100%); }
    .course-toolbar > span { margin-left: auto; color: var(--muted); font-size: 10px; font-weight: 750; }
    .course-card .table-scroll { height: 434px; max-height: 434px; overflow: auto; }
    .registered-course-table { min-width: 1100px; }
    .registered-course-table th:nth-child(1) { width: 21%; }
    .registered-course-table th:nth-child(2) { width: 39%; }
    .registered-course-table th:nth-child(3) { width: 7%; }
    .registered-course-table th:nth-child(4) { width: 8%; }
    .registered-course-table th:nth-child(5) { width: 8%; }
    .registered-course-table th:nth-child(6) { width: 7%; }
    .registered-course-table th:nth-child(7) { width: 10%; }
    .registered-course-table tbody tr { height: 40px; }
    .registered-course-table td { height: 40px; max-height: 40px; padding-top: 4px; padding-bottom: 4px; }
    .registered-course-table th:nth-child(n+3), .registered-course-table td:nth-child(n+3) { text-align: center; }
    .course-placeholder td { height: 40px; color: var(--muted); background: #fcfdfc; text-align: center !important; }
    .deleted-course-table { min-width: 960px; table-layout: fixed; }
    .deleted-course-table th:nth-child(1) { width: 22%; }
    .deleted-course-table th:nth-child(2) { width: 43%; }
    .deleted-course-table th:nth-child(3) { width: 16%; }
    .deleted-course-table th:nth-child(4) { width: 10%; }
    .deleted-course-table th:nth-child(5) { width: 9%; }
    .deleted-course-table tbody tr { height: 40px; }
    .deleted-course-table td { height: 40px; max-height: 40px; padding-top: 4px; padding-bottom: 4px; }
    .deleted-course-table th:nth-child(n+3), .deleted-course-table td:nth-child(n+3) { text-align: center; }
    .button.compact { min-height: 30px; height: 30px; border-radius: 8px; padding: 0 11px; font-size: 10px; }
    .request-count-pill { min-width: 23px; height: 23px; display: inline-grid; place-items: center; border-radius: 999px; color: #9c4f43; background: #fff0ed; font-size: 10px; font-weight: 900; }
    .page-button:disabled { cursor: not-allowed; opacity: .4; }
    .button.danger { color: white; border-color: #a84e40; background: #a84e40; }
    .button.danger:hover { background: #913f34; }

    .drawer-backdrop { display: grid; place-items: center; padding: 24px; backdrop-filter: blur(3px); }
    .drawer { position: relative; top: auto; right: auto; width: min(920px,calc(100vw - 48px)); height: min(820px,calc(100vh - 48px)); border: 1px solid rgba(255,255,255,.72); border-radius: 20px; box-shadow: 0 28px 90px rgba(7,27,22,.26); transform: translateY(10px) scale(.985); opacity: 0; }
    .drawer-backdrop.open .drawer { transform: none; opacity: 1; }
    .drawer-head { border-radius: 20px 20px 0 0; }
    .drawer-footer { border-radius: 0 0 20px 20px; }
    .confirm-body { display: grid; gap: 16px; }
    .confirm-input-wrap { display: grid; gap: 7px; }
    .confirm-input-wrap[hidden] { display: none; }
    .confirm-input-wrap label { color: var(--muted); font-size: 10px; font-weight: 800; }
    .confirm-actions { display: flex; justify-content: flex-end; gap: 8px; }

    @media (max-width: 980px) { .country-list { grid-template-columns: repeat(2,minmax(0,1fr)); } }
    @media (max-width: 620px) {
      .country-list { min-width: 0; grid-template-columns: 1fr; padding: 12px; }
      .country-card { overflow: visible; }
      .drawer-backdrop { padding: 10px; }
      .drawer { width: calc(100vw - 20px); height: calc(100vh - 20px); border-radius: 16px; }
      .detail-side { display: grid; grid-template-columns: 1fr 1fr; }
      .detail-side .button { justify-content: center; }
      .course-toolbar { align-items: stretch; flex-direction: column; }
      .course-toolbar > span { margin-left: 0; }
    }
  </style>
</head>
<body>
  <div class="modal-backdrop open" id="login-modal" aria-hidden="false">
    <section class="modal-panel login-panel" role="dialog" aria-modal="true" aria-labelledby="login-title">
      <div class="modal-head"><div><h2 id="login-title">\uAD00\uB9AC\uC790 \uC778\uC99D</h2><p class="page-description">\uAD00\uB9AC\uC790 \uD1A0\uD070\uC740 \uC774 \uBE0C\uB77C\uC6B0\uC800 \uD0ED\uC5D0\uB9CC \uBCF4\uAD00\uB429\uB2C8\uB2E4.</p></div></div>
      <div class="modal-body">
        <div class="form-field wide"><label for="admin-token">\uAD00\uB9AC\uC790 \uD1A0\uD070</label><input class="form-input" id="admin-token" type="password" autocomplete="off" spellcheck="false"></div>
        <div class="login-error" id="login-error"></div>
        <div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="button primary" id="admin-login" type="button">\uAD00\uB9AC \uD654\uBA74 \uC5F4\uAE30</button></div>
      </div>
    </section>
  </div>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">
          <svg class="icon" viewBox="0 0 24 24"><path d="M5 21V4m0 1c5-3 8 3 14 0v9c-6 3-9-3-14 0"/><path d="M3 21h5"/></svg>
        </div>
        <div><div class="brand-title">YAMONE GOLF</div><div class="brand-subtitle">Course Admin</div></div>
      </div>

      <div class="nav-label">MANAGEMENT</div>
      <nav class="nav-list" aria-label="\uAD00\uB9AC\uC790 \uBA54\uB274">
        <button class="nav-button" id="dashboard-nav" aria-current="page" type="button">
          <svg class="icon" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>
          <span class="nav-text">\uB300\uC2DC\uBCF4\uB4DC</span>
        </button>
        <button class="nav-button" id="users-nav" type="button">
          <svg class="icon" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v2M16 5a3 3 0 0 1 0 6M18 14a4 4 0 0 1 3 4v2"/></svg>
          <span class="nav-text">\uC0AC\uC6A9\uC790</span>
        </button>
        <button class="nav-button" id="rounds-nav" type="button">
          <svg class="icon" viewBox="0 0 24 24"><path d="M5 21V4m0 1c5-3 8 3 14 0v9c-6 3-9-3-14 0"/><path d="M3 21h5M12 18h8"/></svg>
          <span class="nav-text">\uB77C\uC6B4\uB4DC</span>
        </button>
        <button class="nav-button" id="requests-nav" type="button">
          <svg class="icon" viewBox="0 0 24 24"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 9h8M8 13h5"/></svg>
          <span class="nav-text">\uC694\uAD6C\uC0AC\uD56D</span><span class="nav-count" id="request-count">0</span>
        </button>
        <button class="nav-button" id="courses-nav" type="button">
          <svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>
          <span class="nav-text">\uACE8\uD504\uC7A5</span>
        </button>
      </nav>

      <div class="sidebar-note"><strong>\uC6B4\uC601 \uB300\uC2DC\uBCF4\uB4DC</strong>\uCC98\uB9AC\uD560 \uC694\uCCAD\uACFC \uB370\uC774\uD130 \uD488\uC9C8, \uAD6D\uAC00\uBCC4 \uB4F1\uB85D \uD604\uD669\uC744 \uD55C \uD654\uBA74\uC5D0\uC11C \uD655\uC778\uD569\uB2C8\uB2E4.</div>
      <div class="session">
        <div class="avatar">YG</div>
        <div class="session-meta"><strong>\uAD00\uB9AC\uC790</strong><span>\uC6B4\uC601 \uC911</span></div>
        <button class="lock-button" id="side-logout" type="button" title="\uAD00\uB9AC \uD654\uBA74 \uC7A0\uAE08">
          <svg class="icon" viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
        </button>
      </div>
    </aside>

    <main class="main">
      <header class="topbar">
        <div>
          <h1>\uB300\uC2DC\uBCF4\uB4DC</h1>
          <p class="page-description">\uACE8\uD504\uC7A5 \uB370\uC774\uD130 \uC6B4\uC601 \uD604\uD669\uACFC \uC6B0\uC120 \uCC98\uB9AC \uD56D\uBAA9\uC744 \uD655\uC778\uD569\uB2C8\uB2E4.</p>
        </div>
        <button class="button secondary" id="logout" type="button">\uC7A0\uAE08</button>
      </header>

      <section class="view" id="dashboard-view">
        <div class="dashboard-stack">
          <div class="dashboard-metrics">
            <button class="metric-card" id="dashboard-countries" type="button">
              <span class="metric-icon"><svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg></span>
              <span class="metric-copy"><span>\uC9C0\uC6D0 \uAD6D\uAC00</span><strong id="dashboard-country-count">9</strong><small id="dashboard-active-country-count">\uC0AC\uC6A9 9\uAC1C\uAD6D</small></span>
            </button>
            <button class="metric-card" id="dashboard-courses" type="button">
              <span class="metric-icon blue"><svg class="icon" viewBox="0 0 24 24"><path d="M5 21V4m0 1c5-3 8 3 14 0v9c-6 3-9-3-14 0"/><path d="M3 21h5"/></svg></span>
              <span class="metric-copy"><span>\uB4F1\uB85D \uACE8\uD504\uC7A5</span><strong id="dashboard-course-count">0</strong><small id="dashboard-course-breakdown">\uACF5\uC6A9 0 \xB7 \uAC1C\uC778 0</small></span>
            </button>
            <button class="metric-card" id="dashboard-requests" type="button">
              <span class="metric-icon amber"><svg class="icon" viewBox="0 0 24 24"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 9h8M8 13h5"/></svg></span>
              <span class="metric-copy"><span>\uBBF8\uC644\uB8CC \uC694\uCCAD</span><strong id="dashboard-request-count">0</strong><small id="dashboard-request-breakdown">\uCC98\uB9AC\uC911 0 \xB7 \uBCF4\uB958 0</small></span>
            </button>
            <button class="metric-card" id="dashboard-imports" type="button">
              <span class="metric-icon rose"><svg class="icon" viewBox="0 0 24 24"><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M4 17v3h16v-3"/></svg></span>
              <span class="metric-copy"><span>GolfCore \uAC80\uD1A0</span><strong id="dashboard-import-count">0</strong><small id="dashboard-import-breakdown">\uBBF8\uBC18\uC601 0 \xB7 \uC218\uC815\uD544\uC694 0</small></span>
            </button>
          </div>

          <div class="dashboard-grid">
            <article class="card dashboard-card">
              <div class="dashboard-card-head"><div><h2>\uC624\uB298 \uCC98\uB9AC\uD560 \uD56D\uBAA9</h2><div class="fine">\uBBF8\uC644\uB8CC \uC791\uC5C5\uC744 \uC6B0\uC120\uC21C\uC704\uB300\uB85C \uD655\uC778\uD569\uB2C8\uB2E4.</div></div><button class="dashboard-link" id="dashboard-all-requests" type="button">\uC804\uCCB4 \uC694\uCCAD \uBCF4\uAE30</button></div>
              <div class="task-list" id="dashboard-task-list"></div>
            </article>
            <article class="card dashboard-card">
              <div class="dashboard-card-head"><div><h2>\uB370\uC774\uD130 \uD488\uC9C8</h2><div class="fine">\uAD6D\uAC00\uBCC4 \uC6D0\uBCF8 \uC218\uC9D1 \uC0C1\uD0DC\uC640 \uC624\uB958\uB97C \uD655\uC778\uD569\uB2C8\uB2E4.</div></div><span class="sample-badge">\uC6B4\uC601</span></div>
              <div class="quality-list" id="dashboard-quality-list"></div>
            </article>
          </div>

          <div class="dashboard-bottom">
            <article class="card dashboard-card">
              <div class="dashboard-card-head"><div><h2>\uAD6D\uAC00\uBCC4 \uB4F1\uB85D \uD604\uD669</h2><div class="fine">\uAD6D\uAC00\uB97C \uC120\uD0DD\uD558\uBA74 \uD574\uB2F9 \uACE8\uD504\uC7A5 \uBAA9\uB85D\uC73C\uB85C \uC774\uB3D9\uD569\uB2C8\uB2E4.</div></div><button class="dashboard-link" id="dashboard-all-countries" type="button">\uC804\uCCB4 \uAD6D\uAC00 \uAD00\uB9AC</button></div>
              <div class="table-scroll"><table class="course-table dashboard-country-table"><thead><tr><th>\uAD6D\uAC00</th><th>\uC804\uCCB4</th><th>\uACF5\uC6A9</th><th>\uAC1C\uC778</th><th>\uBBF8\uC644\uB8CC \uC694\uCCAD</th><th>\uC0AC\uC6A9</th></tr></thead><tbody id="dashboard-country-table"></tbody></table></div>
            </article>
            <article class="card dashboard-card">
              <div class="dashboard-card-head"><div><h2>\uCD5C\uADFC \uC694\uCCAD</h2><div class="fine">\uC644\uB8CC \uC804 \uC694\uCCAD\uC744 \uBC14\uB85C \uCC98\uB9AC\uD569\uB2C8\uB2E4.</div></div></div>
              <div class="recent-list" id="dashboard-recent-requests"></div>
            </article>
          </div>
        </div>
      </section>

      <section class="view" id="users-view" hidden>
        <article class="card placeholder-card"><div class="placeholder-icon">👤</div><h2>사용자 관리</h2><p>메뉴 위치만 먼저 확정했습니다. 상세 기능은 다음 단계에서 설계합니다.</p></article>
      </section>

      <section class="view" id="rounds-view" hidden>
        <article class="card placeholder-card"><div class="placeholder-icon">⛳</div><h2>라운드 관리</h2><p>메뉴 위치만 먼저 확정했습니다. 상세 기능은 다음 단계에서 설계합니다.</p></article>
      </section>

      <section class="view" id="country-view" hidden>
        <article class="card country-card">
          <div class="card-head">
            <div><h2>\uB4F1\uB85D \uAD6D\uAC00</h2><div class="fine">9\uAC1C \uC6B4\uC601 \uAD6D\uAC00 \xB7 \uD589\uC815\uAD6C\uC5ED \uAE30\uC900 2026-10-01</div></div>
            <div class="head-summary">
              <div class="head-count"><span>\uB4F1\uB85D \uACF5\uC6A9</span><strong id="total-public">1,496</strong></div>
              <div class="head-count"><span>\uB4F1\uB85D \uAC1C\uC778</span><strong id="total-private">293</strong></div>
            </div>
          </div>

          <div class="country-list" id="country-list"></div>
          <div class="country-summary"><span>\uC571 \uC0AC\uC6A9 \uAD6D\uAC00</span><strong id="country-count">2\uAC1C</strong><span>\uC804\uCCB4 \uACE8\uD504\uC7A5</span><strong id="course-count">1,789\uAC1C</strong></div>
        </article>
      </section>

      <section class="view" id="course-view" hidden>
        <div class="detail-head">
          <div class="detail-title">
            <button class="back-button" id="country-back" type="button" aria-label="\uAD6D\uAC00 \uBAA9\uB85D\uC73C\uB85C \uB3CC\uC544\uAC00\uAE30"><svg class="icon" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg></button>
            <span class="flag" id="detail-flag">\u{1F1F0}\u{1F1F7}</span>
            <div><h2 id="detail-country">\uD55C\uAD6D</h2></div>
            <span class="inline-total">\uACF5\uC6A9 <strong id="detail-public">1,284</strong></span>
            <span class="inline-total">\uAC1C\uC778 <strong id="detail-private">247</strong></span>
          </div>
          <div class="detail-side">
            <button class="button secondary" id="open-deleted" type="button"><svg class="icon" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14"/></svg>삭제 목록</button>
            <button class="button secondary" id="add-course" type="button"><svg class="icon" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>골프장 추가</button>
          </div>
        </div>

        <article class="card course-card">
          <div class="course-toolbar"><div class="search-shell"><svg class="icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input class="search-input" id="course-search" type="search" placeholder="골프장 이름 또는 주소 검색" autocomplete="off"></div><span>한 페이지 10개</span></div>
          <div class="table-scroll">
            <table class="course-table registered-course-table">
              <thead><tr><th>\uC774\uB984</th><th>\uC8FC\uC18C</th><th>\uCF54\uC2A4 \uC218</th><th>\uB4F1\uB85D \uC720\uD615</th><th>\uC0AC\uC6A9 \uC0C1\uD0DC</th><th>\uB77C\uC6B4\uB4DC</th><th>\uBBF8\uCC98\uB9AC \uC694\uCCAD</th></tr></thead>
              <tbody id="course-table"></tbody>
            </table>
          </div>
          <div class="table-footer"><span id="course-range">0 / 0\uAC1C</span><div class="pagination" id="course-pagination"></div></div>
        </article>
      </section>

      <section class="view" id="deleted-view" hidden>
        <div class="detail-head">
          <div class="detail-title">
            <button class="back-button" id="deleted-back" type="button" aria-label="골프장 목록으로 돌아가기"><svg class="icon" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg></button>
            <span class="flag" id="deleted-flag">🇵🇭</span>
            <div><h2 id="deleted-country">Philippines (필리핀) 삭제 목록</h2></div>
          </div>
        </div>

        <article class="card course-card">
          <div class="course-toolbar"><div class="search-shell"><svg class="icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input class="search-input" id="deleted-search" type="search" placeholder="골프장 이름 또는 주소 검색" autocomplete="off"></div><span>한 페이지 10개</span></div>
          <div class="table-scroll">
            <table class="course-table deleted-course-table">
              <thead><tr><th>이름</th><th>주소</th><th>삭제일</th><th>기존 상태</th><th>관리</th></tr></thead>
              <tbody id="deleted-table"></tbody>
            </table>
          </div>
          <div class="table-footer"><span id="deleted-range">0 / 0개</span><div class="pagination" id="deleted-pagination"></div></div>
        </article>
      </section>

      <section class="view" id="import-view" hidden>
        <div class="detail-head">
          <div class="detail-title">
            <button class="back-button" id="import-back" type="button" aria-label="\uAD6D\uAC00 \uACE8\uD504\uC7A5 \uBAA9\uB85D\uC73C\uB85C \uB3CC\uC544\uAC00\uAE30"><svg class="icon" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg></button>
            <span class="flag" id="import-flag">\u{1F1F0}\u{1F1F7}</span>
            <div><h2 id="import-country">\uD55C\uAD6D GolfCore \uAC00\uC838\uC624\uAE30</h2></div>
          </div>
        </div>

        <article class="card import-panel">
          <div class="import-controls">
            <div class="import-control-head">
              <div><h2>국가 전체 자료</h2><div class="fine">선택한 국가의 모든 골프장을 한 목록으로 확인합니다.</div></div>
              <button class="button primary" id="run-import" type="button"><svg class="icon" viewBox="0 0 24 24"><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M4 17v3h16v-3"/></svg>전체 자료 조회</button>
            </div>
          </div>
          <div id="import-results"><div class="import-placeholder">전체 자료 조회를 누르면 이 국가의 GolfCore 비교 결과가 표시됩니다.</div></div>
        </article>
      </section>

      <section class="view" id="request-view" hidden>
        <article class="card request-card">
          <div class="card-head">
            <div><h2>\uACE8\uD504\uC7A5 \uC694\uCCAD\uC0AC\uD56D</h2><div class="fine">\uC644\uB8CC \uC804 \uC694\uCCAD\uC744 \uC120\uD0DD\uD574 \uAC80\uD1A0\uD558\uACE0 \uC0C1\uD0DC\xB7\uBA54\uBAA8\xB7\uBC18\uC601 \uACB0\uACFC\uB97C \uAD00\uB9AC\uD569\uB2C8\uB2E4.</div></div>
            <div class="head-summary"><div class="head-count"><span>\uBBF8\uC644\uB8CC</span><strong id="request-open-count">0</strong></div><div class="head-count"><span>\uCC98\uB9AC\uC911</span><strong id="request-processing-count">0</strong></div></div>
          </div>
          <div class="request-toolbar">
            <div class="request-filters" id="request-status-filters"></div>
            <select class="filter-select" id="request-category-filter" aria-label="\uC694\uCCAD \uCE74\uD14C\uACE0\uB9AC \uC120\uD0DD"></select>
          </div>
          <div class="request-summary" id="request-summary"></div>
          <div class="table-scroll">
            <table class="course-table request-table">
              <thead><tr><th>\uC694\uCCAD\uBC88\uD638</th><th>\uCE74\uD14C\uACE0\uB9AC</th><th>\uACE8\uD504\uC7A5</th><th>\uAD6D\uAC00</th><th>\uC694\uCCAD \uB0B4\uC6A9</th><th>\uC0C1\uD0DC</th><th>\uC811\uC218\uC77C</th></tr></thead>
              <tbody id="request-table"></tbody>
            </table>
          </div>
          <div class="table-footer"><span id="request-range">0\uAC1C \uC694\uCCAD</span><span>\uC644\uB8CC \uAC74\uC740 \uBAA9\uB85D\uC5D0\uC11C \uD655\uC778\uB9CC \uAC00\uB2A5</span></div>
        </article>
      </section>
    </main>
  </div>

  <div class="drawer-backdrop" id="review-drawer" aria-hidden="true">
    <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="review-title">
      <div class="drawer-head">
        <div><h2 id="review-title">\uC815\uBCF4 \uD655\uC778</h2><div class="fine" id="review-subtitle">\uACE8\uD504\uC7A5 \uC815\uBCF4\uB97C \uD655\uC778\uD569\uB2C8\uB2E4.</div></div>
        <button class="icon-button" id="review-close" type="button" aria-label="\uD31D\uC5C5 \uB2EB\uAE30"><svg class="icon" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
      </div>
      <div class="drawer-content" id="review-content"></div>
      <div class="drawer-footer" id="review-footer"></div>
    </aside>
  </div>

  <div class="modal-backdrop" id="confirm-modal" aria-hidden="true">
    <section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div class="modal-head">
        <div><h2 id="confirm-title">\uAD6D\uAC00\uB97C \uC0AD\uC81C\uD560\uAE4C\uC694?</h2><p class="page-description" id="confirm-message">\uC7A0\uAE08\uC774 \uD574\uC81C\uB41C \uAD6D\uAC00\uB9CC \uC0AD\uC81C\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.</p></div>
      </div>
      <div class="modal-body confirm-body">
        <div class="confirm-input-wrap" id="confirm-input-wrap" hidden><label for="confirm-input">확인 문구</label><input class="form-input" id="confirm-input" type="text" autocomplete="off" spellcheck="false"></div>
        <div class="confirm-actions"><button class="button secondary" id="confirm-cancel" type="button">\uCDE8\uC18C</button><button class="button primary" id="confirm-ok" type="button">\uD655\uC778</button></div>
      </div>
    </section>
  </div>

  <div class="toast" id="toast"><svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></svg><span id="toast-text">\uBCC0\uACBD\uD588\uC2B5\uB2C8\uB2E4.</span></div>


  <script>${adminClient}<\/script>
</body>
</html>`;
function adminPage() {
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      "Referrer-Policy": "no-referrer",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "X-Frame-Options": "DENY"
    }
  });
}
__name(adminPage, "adminPage");


export { adminPage };
