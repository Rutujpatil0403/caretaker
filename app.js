(() => {
  const MAX_ROOMS = 74;
  const FEVER_THRESHOLD_C = 38.0;
  const MIN_VALID_TEMP_C = 34.0;
  const MAX_VALID_TEMP_C = 43.0;
  const CURE_DAYS_REQUIRED = 3;
  const MORTALITY_BENCHMARK_PCT = 15.0;
  const STORAGE_KEY = "quarantine_care_mvp_v1";

  const FIRST_NAMES = [
    "Aarav", "Priya", "Rohan", "Ananya", "Vikram", "Sneha", "Kabir", "Meera",
    "Arjun", "Diya", "Siddharth", "Neha", "Karan", "Pooja", "Aditya", "Kavya",
    "Rahul", "Ishita", "Nikhil", "Riya", "Varun", "Tanvi", "Manish", "Shreya"
  ];
  const LAST_NAMES = [
    "Sharma", "Verma", "Patel", "Nair", "Reddy", "Gupta", "Iyer", "Mehta",
    "Kapoor", "Joshi", "Malhotra", "Bose", "Kulkarni", "Rao", "Das", "Singh"
  ];

  let activeRole = "nurse";
  let nurseFilter = "pending_temp";
  let doctorFilter = "ready_doctor";
  let searchQuery = "";
  let state = loadState();

  // ---------------- State Initialization & Persistence ----------------
  function createInitialState() {
    const currentDay = 5;
    const patients = [];

    for (let room = 1; room <= MAX_ROOMS; room++) {
      const first = FIRST_NAMES[(room * 3) % FIRST_NAMES.length];
      const last = LAST_NAMES[(room * 5) % LAST_NAMES.length];
      const name = `${first} ${last}`;
      const age = 22 + ((room * 7) % 52);
      const id = `PT-${1000 + room}`;

      // Create realistic mix across the 74 occupied rooms:
      // Rooms 1..8: 3 consecutive fever-free days, temp logged today -> Eligible for Discharge
      // Rooms 9..28: Pending nurse temp today (various fever histories)
      // Rooms 29..52: Temp logged today -> Ready for Doctor visit
      // Rooms 53..70: Already visited by Doctor today
      // Rooms 71..74: Doctor already approved Discharge -> Pending Admin checkout
      let logs = [];
      let visitedToday = false;
      let dischargeApproved = false;
      let admittedDay = 1;
      let doctorNote = "";

      if (room <= 8) {
        logs = [
          { day: 1, tempC: 39.1, by: "Nurse Maya", note: "High fever on admission" },
          { day: 2, tempC: 38.4, by: "Nurse Maya", note: "Responding to antipyretics" },
          { day: 3, tempC: 37.3, by: "Nurse Kiran", note: "Fever subsided" },
          { day: 4, tempC: 37.0, by: "Nurse Kiran", note: "Stable" },
          { day: 5, tempC: 36.8, by: "Nurse Maya", note: "Day 3 normal temperature" }
        ];
      } else if (room <= 28) {
        admittedDay = room % 2 === 0 ? 1 : 2;
        if (room % 3 === 0) {
          // 2 days no fever so far, awaiting Day 5 check
          logs = [
            { day: 2, tempC: 38.8, by: "Nurse Kiran", note: "Mild chills" },
            { day: 3, tempC: 37.4, by: "Nurse Maya", note: "Afebrile" },
            { day: 4, tempC: 37.1, by: "Nurse Kiran", note: "Improving" }
          ];
        } else {
          logs = [
            { day: 2, tempC: 39.2, by: "Nurse Maya", note: "Persistent fever" },
            { day: 3, tempC: 38.7, by: "Nurse Maya", note: "Continued fever" },
            { day: 4, tempC: 38.3, by: "Nurse Kiran", note: "Slight improvement" }
          ];
        }
      } else if (room <= 52) {
        const hasFeverToday = room % 4 !== 0;
        logs = [
          { day: 2, tempC: 38.9, by: "Nurse Kiran", note: "" },
          { day: 3, tempC: 38.5, by: "Nurse Maya", note: "" },
          { day: 4, tempC: hasFeverToday ? 38.2 : 37.2, by: "Nurse Maya", note: "" },
          { day: 5, tempC: hasFeverToday ? (room % 5 === 0 ? 39.6 : 38.4) : 37.1, by: "Nurse Kiran", note: hasFeverToday ? "Monitor closely" : "Normal" }
        ];
      } else if (room <= 70) {
        logs = [
          { day: 2, tempC: 39.0, by: "Nurse Maya", note: "" },
          { day: 3, tempC: 38.4, by: "Nurse Kiran", note: "" },
          { day: 4, tempC: 37.8, by: "Nurse Maya", note: "" },
          { day: 5, tempC: 37.4, by: "Nurse Kiran", note: "Vitals stable" }
        ];
        visitedToday = true;
        doctorNote = "Continue hydration & supportive therapy";
      } else {
        logs = [
          { day: 1, tempC: 38.8, by: "Nurse Maya", note: "" },
          { day: 2, tempC: 38.1, by: "Nurse Kiran", note: "" },
          { day: 3, tempC: 37.1, by: "Nurse Maya", note: "" },
          { day: 4, tempC: 36.9, by: "Nurse Kiran", note: "" },
          { day: 5, tempC: 36.7, by: "Nurse Maya", note: "3 full days fever-free" }
        ];
        visitedToday = true;
        dischargeApproved = true;
        doctorNote = "3 consecutive fever-free days confirmed. Approved for discharge.";
      }

      patients.push({
        id,
        room,
        name,
        age,
        admittedDay,
        logs,
        visitedToday,
        dischargeApproved,
        doctorNote
      });
    }

    // Historical resolved cases so Head Doctor Dashboard is meaningful out of the box
    const resolvedCases = [];
    for (let i = 1; i <= 34; i++) {
      resolvedCases.push({
        id: `PT-0${900 + i}`,
        name: `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[(i + 2) % LAST_NAMES.length]}`,
        room: ((i * 3) % MAX_ROOMS) + 1,
        outcome: "cured",
        admittedDay: 1,
        resolvedDay: 4 + (i % 2),
        noFeverDaysAtResolution: 3,
        note: "Completed 3-day no-fever protocol"
      });
    }
    for (let i = 1; i <= 5; i++) {
      resolvedCases.push({
        id: `PT-080${i}`,
        name: `${FIRST_NAMES[(i + 7) % FIRST_NAMES.length]} ${LAST_NAMES[(i + 4) % LAST_NAMES.length]}`,
        room: i * 11,
        outcome: "deceased",
        admittedDay: 1,
        resolvedDay: 2 + (i % 3),
        noFeverDaysAtResolution: 0,
        note: "Severe acute respiratory complication"
      });
    }

    return {
      currentDay,
      nextPatientSeq: 1075,
      patients,
      resolvedCases
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.patients)) return parsed;
      }
    } catch (_) {
      // Fallback to default seed data
    }
    return createInitialState();
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {
      // Ignore quota errors
    }
  }

  // ---------------- Clinical & Workflow Helpers ----------------
  function getTodayLog(patient) {
    return patient.logs.find((l) => l.day === state.currentDay) || null;
  }

  function getLatestLog(patient) {
    if (!patient.logs.length) return null;
    return patient.logs[patient.logs.length - 1];
  }

  function getConsecutiveNoFeverDays(patient) {
    const sorted = [...patient.logs].sort((a, b) => b.day - a.day);
    let streak = 0;
    let expectedDay = null;
    for (const entry of sorted) {
      if (expectedDay !== null && entry.day !== expectedDay) break;
      if (entry.tempC < FEVER_THRESHOLD_C) {
        streak += 1;
        expectedDay = entry.day - 1;
      } else {
        break;
      }
    }
    return streak;
  }

  function getPatientWorkflowState(patient) {
    if (patient.dischargeApproved) return "discharge_pending";
    const todayLog = getTodayLog(patient);
    if (!todayLog) return "pending_temp";
    if (!patient.visitedToday) return "ready_doctor";
    return "visited";
  }

  function getMetrics() {
    const occupied = state.patients.length;
    const vacant = MAX_ROOMS - occupied;
    const pendingTemp = state.patients.filter((p) => getPatientWorkflowState(p) === "pending_temp").length;
    const readyDoctor = state.patients.filter((p) => getPatientWorkflowState(p) === "ready_doctor").length;
    const visitedToday = state.patients.filter((p) => getPatientWorkflowState(p) === "visited").length;
    const dischargePending = state.patients.filter((p) => getPatientWorkflowState(p) === "discharge_pending").length;
    const eligibleForDischarge = state.patients.filter(
      (p) => !p.dischargeApproved && getConsecutiveNoFeverDays(p) >= CURE_DAYS_REQUIRED
    ).length;

    const curedCount = state.resolvedCases.filter((c) => c.outcome === "cured").length;
    const deceasedCount = state.resolvedCases.filter((c) => c.outcome === "deceased").length;
    const totalResolved = curedCount + deceasedCount;
    const mortalityRate = totalResolved ? (deceasedCount / totalResolved) * 100 : 0;
    const cureRate = totalResolved ? (curedCount / totalResolved) * 100 : 100;

    const avgStay = totalResolved
      ? state.resolvedCases.reduce((sum, c) => sum + Math.max(1, c.resolvedDay - c.admittedDay), 0) / totalResolved
      : 0;

    return {
      occupied,
      vacant,
      pendingTemp,
      readyDoctor,
      visitedToday,
      dischargePending,
      eligibleForDischarge,
      curedCount,
      deceasedCount,
      totalResolved,
      mortalityRate,
      cureRate,
      avgStay
    };
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function showToast(message, type = "info") {
    const container = document.getElementById("toastContainer");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 3400);
  }

  function openModal(title, subtitle, bodyHtml) {
    document.getElementById("modalTitle").textContent = title;
    document.getElementById("modalSubtitle").textContent = subtitle;
    document.getElementById("modalBody").innerHTML = bodyHtml;
    document.getElementById("modalOverlay").classList.remove("hidden");
  }

  function closeModal() {
    document.getElementById("modalOverlay").classList.add("hidden");
  }

  function renderHistoryChips(patient) {
    if (!patient.logs.length) return `<span class="panel-desc">No readings yet</span>`;
    return `<div class="history-strip">${patient.logs
      .map((l) => {
        const isFever = l.tempC >= FEVER_THRESHOLD_C;
        return `<span class="history-day">Day ${l.day}: <strong class="${isFever ? "temp-fever" : "temp-normal"}" style="padding:1px 4px;border-radius:4px;">${l.tempC.toFixed(1)}°C</strong></span>`;
      })
      .join("")}</div>`;
  }

  // ---------------- Global Alerts & KPI Strip ----------------
  function renderTopStatus() {
    document.getElementById("currentDayLabel").textContent = `Day ${state.currentDay}`;
    const m = getMetrics();

    const alertBar = document.getElementById("globalAlertBar");
    if (m.mortalityRate > MORTALITY_BENCHMARK_PCT) {
      alertBar.className = "global-alert danger";
      alertBar.innerHTML = `
        <span>ALERT: Facility mortality rate is <strong>${m.mortalityRate.toFixed(1)}%</strong>, exceeding the <strong>15.0% benchmark</strong>. Immediate clinical review recommended.</span>
        <button class="btn btn-sm btn-danger" id="jumpHeadDoctorBtn">Open Quality Dashboard</button>
      `;
      document.getElementById("jumpHeadDoctorBtn").onclick = () => switchRole("head_doctor");
    } else if (m.occupied >= MAX_ROOMS && m.dischargePending > 0) {
      alertBar.className = "global-alert warning";
      alertBar.innerHTML = `
        <span>CAPACITY NOTICE: All ${MAX_ROOMS}/${MAX_ROOMS} rooms occupied. <strong>${m.dischargePending} patient(s)</strong> approved by doctors are waiting for Admin checkout to free beds.</span>
        <button class="btn btn-sm btn-outline" id="jumpAdminBtn">Process Discharges</button>
      `;
      document.getElementById("jumpAdminBtn").onclick = () => switchRole("admin");
    } else {
      alertBar.className = "global-alert hidden";
      alertBar.innerHTML = "";
    }

    const tempsTakenToday = m.occupied - m.pendingTemp - m.dischargePending;
    const activeNeedsCare = m.occupied - m.dischargePending;

    document.getElementById("summaryStrip").innerHTML = `
      <div class="kpi-card">
        <div class="kpi-label">Bed Occupancy</div>
        <div class="kpi-value ${m.occupied >= MAX_ROOMS ? "warn" : "ok"}">${m.occupied} / ${MAX_ROOMS}</div>
        <div class="kpi-sub">${m.vacant} vacant room(s) available</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Nurse Temps Today</div>
        <div class="kpi-value">${tempsTakenToday} / ${activeNeedsCare}</div>
        <div class="kpi-sub">${m.pendingTemp} room(s) still pending check</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Doctor Visits Queue</div>
        <div class="kpi-value ${m.readyDoctor > 0 ? "warn" : "ok"}">${m.readyDoctor}</div>
        <div class="kpi-sub">${m.visitedToday} visited today · ${m.eligibleForDischarge} cured (3d+)</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Pending Discharges</div>
        <div class="kpi-value ${m.dischargePending > 0 ? "warn" : ""}">${m.dischargePending}</div>
        <div class="kpi-sub">Awaiting Admin Staff bed release</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Mortality vs. 15% Target</div>
        <div class="kpi-value ${m.mortalityRate > MORTALITY_BENCHMARK_PCT ? "danger" : "ok"}">${m.mortalityRate.toFixed(1)}%</div>
        <div class="kpi-sub">Success rate: ${m.cureRate.toFixed(1)}% (${m.curedCount}/${m.totalResolved})</div>
      </div>
    `;
  }

  // ---------------- Role 1: Nurse View ----------------
  function renderNurseView() {
    const m = getMetrics();
    const list = state.patients
      .filter((p) => !p.dischargeApproved)
      .filter((p) => {
        const wf = getPatientWorkflowState(p);
        if (nurseFilter === "pending_temp") return wf === "pending_temp";
        if (nurseFilter === "recorded") return wf === "ready_doctor" || wf === "visited";
        return true;
      })
      .filter((p) => matchesSearch(p))
      .sort((a, b) => a.room - b.room);

    const pendingCount = m.pendingTemp;
    const recordedCount = m.readyDoctor + m.visitedToday;
    const allCount = state.patients.filter((p) => !p.dischargeApproved).length;

    return `
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">Nurse Station — Daily Temperature Tracking</h2>
            <p class="panel-desc">Record each patient's temperature once per day. Logging a reading automatically notifies Doctors that the patient is ready for visit.</p>
          </div>
        </div>
        <div class="panel-body">
          <div class="toolbar">
            <div class="tabs">
              <button class="tab-btn ${nurseFilter === "pending_temp" ? "active" : ""}" data-nfilter="pending_temp">
                Pending Temp Today <span class="count-pill">${pendingCount}</span>
              </button>
              <button class="tab-btn ${nurseFilter === "recorded" ? "active" : ""}" data-nfilter="recorded">
                Recorded Today <span class="count-pill">${recordedCount}</span>
              </button>
              <button class="tab-btn ${nurseFilter === "all" ? "active" : ""}" data-nfilter="all">
                All Active Rooms <span class="count-pill">${allCount}</span>
              </button>
            </div>
            <input type="text" id="searchBox" class="search-input" placeholder="Search Room # or Patient..." value="${escapeHtml(searchQuery)}" />
          </div>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Patient</th>
                  <th>Status Today</th>
                  <th>Today's Temp</th>
                  <th>No-Fever Streak</th>
                  <th>Recent Readings</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${list.length ? list.map((p) => {
                  const wf = getPatientWorkflowState(p);
                  const todayLog = getTodayLog(p);
                  const streak = getConsecutiveNoFeverDays(p);
                  const statusBadge = wf === "pending_temp"
                    ? `<span class="status-badge badge-amber">Pending Temp</span>`
                    : wf === "ready_doctor"
                    ? `<span class="status-badge badge-blue">Ready for Doctor</span>`
                    : `<span class="status-badge badge-emerald">Visited by Doctor</span>`;

                  const tempDisplay = todayLog
                    ? `<span class="temp-chip ${todayLog.tempC >= FEVER_THRESHOLD_C ? "temp-fever" : "temp-normal"}">${todayLog.tempC.toFixed(1)}°C</span>`
                    : `<span class="panel-desc">Not recorded</span>`;

                  return `
                    <tr>
                      <td><strong>Room ${p.room}</strong></td>
                      <td><strong>${escapeHtml(p.name)}</strong><br><span class="panel-desc">${p.id} · Age ${p.age}</span></td>
                      <td>${statusBadge}</td>
                      <td>${tempDisplay}</td>
                      <td>${streak >= 3 ? `<span class="status-badge badge-emerald">${streak} days (Cure Met)</span>` : `${streak} / 3 days`}</td>
                      <td>${renderRecentMini(p)}</td>
                      <td>
                        ${wf === "pending_temp"
                          ? `<button class="btn btn-sm btn-primary" data-action="log-temp" data-id="${p.id}">Log Temperature</button>`
                          : `<button class="btn btn-sm btn-outline" data-action="log-temp" data-id="${p.id}">View / Override</button>`
                        }
                      </td>
                    </tr>
                  `;
                }).join("") : `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-light);">No patients match this filter.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    `;
  }

  function openNurseTempModal(patientId) {
    const p = state.patients.find((x) => x.id === patientId);
    if (!p) return;
    const todayLog = getTodayLog(p);
    const isDuplicate = Boolean(todayLog);

    openModal(
      `Record Temperature — Room ${p.room}`,
      `${p.name} (${p.id}) · Facility Day ${state.currentDay}`,
      `
        ${isDuplicate ? `
          <div class="inline-alert warn">
            Duplicate Check Guard: Today's temperature (<strong>${todayLog.tempC.toFixed(1)}°C</strong>) was already recorded by ${escapeHtml(todayLog.by)}. Submitting below will override today's reading.
          </div>
        ` : `
          <div class="inline-alert info">
            Fever threshold: <strong>≥ 38.0°C (100.4°F)</strong>. Readings below 38.0°C count toward the 3-day no-fever cure criterion.
          </div>
        `}
        <div class="form-group">
          <label>Previous Temperature History</label>
          ${renderHistoryChips(p)}
        </div>
        <form id="nurseTempForm">
          <div class="form-group">
            <label for="tempInput">Temperature (°C) — Valid range 34.0°C to 43.0°C</label>
            <input type="number" step="0.1" id="tempInput" class="form-control" value="${todayLog ? todayLog.tempC.toFixed(1) : "37.2"}" required />
          </div>
          <div class="form-group">
            <label for="nurseNoteInput">Nurse Observation / Override Reason (Optional)</label>
            <input type="text" id="nurseNoteInput" class="form-control" placeholder="e.g., Patient rested, no chills" value="${todayLog ? escapeHtml(todayLog.note) : ""}" />
          </div>
          <div id="tempFormError" class="inline-alert error hidden"></div>
          <div class="action-group" style="justify-content:flex-end;">
            <button type="button" class="btn btn-outline" id="cancelModalBtn">Cancel</button>
            <button type="submit" class="btn btn-primary">${isDuplicate ? "Confirm Override" : "Save Temperature"}</button>
          </div>
        </form>
      `
    );

    document.getElementById("cancelModalBtn").onclick = closeModal;
    document.getElementById("nurseTempForm").onsubmit = (e) => {
      e.preventDefault();
      const val = parseFloat(document.getElementById("tempInput").value);
      const note = document.getElementById("nurseNoteInput").value.trim();
      const errBox = document.getElementById("tempFormError");

      if (Number.isNaN(val) || val < MIN_VALID_TEMP_C || val > MAX_VALID_TEMP_C) {
        errBox.textContent = `Invalid input: Temperature must be between ${MIN_VALID_TEMP_C}°C and ${MAX_VALID_TEMP_C}°C.`;
        errBox.classList.remove("hidden");
        return;
      }

      const existingIdx = p.logs.findIndex((l) => l.day === state.currentDay);
      const entry = { day: state.currentDay, tempC: val, by: "Nurse (Active)", note };
      if (existingIdx >= 0) {
        p.logs[existingIdx] = entry;
      } else {
        p.logs.push(entry);
      }

      saveState();
      closeModal();
      if (val >= 39.5) {
        showToast(`High fever alert (${val.toFixed(1)}°C) logged for Room ${p.room}!`, "error");
      } else {
        showToast(`Room ${p.room} temp (${val.toFixed(1)}°C) saved → Ready for Doctor.`, "success");
      }
      renderApp();
    };
  }

  // ---------------- Role 2: Doctor View ----------------
  function renderDoctorView() {
    const m = getMetrics();
    const list = state.patients
      .filter((p) => !p.dischargeApproved)
      .filter((p) => {
        const wf = getPatientWorkflowState(p);
        const streak = getConsecutiveNoFeverDays(p);
        if (doctorFilter === "ready_doctor") return wf === "ready_doctor";
        if (doctorFilter === "eligible") return streak >= CURE_DAYS_REQUIRED;
        if (doctorFilter === "pending_temp") return wf === "pending_temp";
        if (doctorFilter === "visited") return wf === "visited";
        return true;
      })
      .filter((p) => matchesSearch(p))
      .sort((a, b) => {
        // Prioritize eligible for discharge & high fevers first
        const aElig = getConsecutiveNoFeverDays(a) >= CURE_DAYS_REQUIRED ? 1 : 0;
        const bElig = getConsecutiveNoFeverDays(b) >= CURE_DAYS_REQUIRED ? 1 : 0;
        if (bElig !== aElig) return bElig - aElig;
        return a.room - b.room;
      });

    return `
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">Doctor Rounds — Visits &amp; Discharge Decisions</h2>
            <p class="panel-desc">Visit patients only after today's temperature is logged. Approve discharge as soon as a patient hits 3 consecutive fever-free days.</p>
          </div>
        </div>
        <div class="panel-body">
          <div class="toolbar">
            <div class="tabs">
              <button class="tab-btn ${doctorFilter === "ready_doctor" ? "active" : ""}" data-dfilter="ready_doctor">
                Ready for Visit <span class="count-pill">${m.readyDoctor}</span>
              </button>
              <button class="tab-btn ${doctorFilter === "eligible" ? "active" : ""}" data-dfilter="eligible">
                Eligible for Discharge (3d+) <span class="count-pill">${m.eligibleForDischarge}</span>
              </button>
              <button class="tab-btn ${doctorFilter === "pending_temp" ? "active" : ""}" data-dfilter="pending_temp">
                Awaiting Nurse Temp <span class="count-pill">${m.pendingTemp}</span>
              </button>
              <button class="tab-btn ${doctorFilter === "visited" ? "active" : ""}" data-dfilter="visited">
                Visited Today <span class="count-pill">${m.visitedToday}</span>
              </button>
            </div>
            <input type="text" id="searchBox" class="search-input" placeholder="Search Room # or Patient..." value="${escapeHtml(searchQuery)}" />
          </div>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Patient</th>
                  <th>Today's Temp</th>
                  <th>No-Fever Streak</th>
                  <th>Clinical Trend</th>
                  <th>Visit Status</th>
                  <th>Doctor Actions</th>
                </tr>
              </thead>
              <tbody>
                ${list.length ? list.map((p) => {
                  const wf = getPatientWorkflowState(p);
                  const todayLog = getTodayLog(p);
                  const streak = getConsecutiveNoFeverDays(p);
                  const canDischarge = streak >= CURE_DAYS_REQUIRED;

                  const tempBadge = todayLog
                    ? `<span class="temp-chip ${todayLog.tempC >= FEVER_THRESHOLD_C ? "temp-fever" : "temp-normal"}">${todayLog.tempC.toFixed(1)}°C</span>`
                    : `<span class="status-badge badge-amber">No Temp Today</span>`;

                  const streakBadge = canDischarge
                    ? `<span class="status-badge badge-emerald">${streak} / 3 Days — Cure Met</span>`
                    : `<span class="status-badge badge-slate">${streak} / 3 Days</span>`;

                  const visitBadge = wf === "pending_temp"
                    ? `<span class="status-badge badge-amber">Locked (Wait Nurse)</span>`
                    : wf === "ready_doctor"
                    ? `<span class="status-badge badge-blue">Ready for Visit</span>`
                    : `<span class="status-badge badge-emerald">Visited Today</span>`;

                  return `
                    <tr>
                      <td><strong>Room ${p.room}</strong></td>
                      <td><strong>${escapeHtml(p.name)}</strong><br><span class="panel-desc">${p.id} · Admitted Day ${p.admittedDay}</span></td>
                      <td>${tempBadge}</td>
                      <td>${streakBadge}</td>
                      <td>${renderRecentMini(p)}</td>
                      <td>${visitBadge}</td>
                      <td>
                        <div class="action-group">
                          <button class="btn btn-sm ${wf === "ready_doctor" ? "btn-blue" : "btn-outline"}" data-action="doctor-visit" data-id="${p.id}">
                            ${wf === "visited" ? "Update Note" : "Review & Visit"}
                          </button>
                          ${canDischarge && todayLog ? `<button class="btn btn-sm btn-emerald" data-action="quick-discharge" data-id="${p.id}">Approve Discharge</button>` : ""}
                        </div>
                      </td>
                    </tr>
                  `;
                }).join("") : `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-light);">No patients in this queue.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    `;
  }

  function openDoctorVisitModal(patientId) {
    const p = state.patients.find((x) => x.id === patientId);
    if (!p) return;
    const todayLog = getTodayLog(p);
    const streak = getConsecutiveNoFeverDays(p);
    const canDischarge = streak >= CURE_DAYS_REQUIRED;

    openModal(
      `Doctor Review — Room ${p.room}`,
      `${p.name} (${p.id}) · Streak: ${streak} consecutive fever-free day(s)`,
      `
        ${!todayLog ? `
          <div class="inline-alert error">
            Workflow Constraint: Today's temperature has NOT been recorded by a nurse yet. Doctor visit completion is locked until a temperature reading is available to prevent wasted/premature visits.
          </div>
        ` : canDischarge ? `
          <div class="inline-alert ok">
            Cure Criterion Met: Patient has <strong>${streak} consecutive days</strong> without fever (&lt; 38.0°C). Ready to approve for Admin discharge.
          </div>
        ` : `
          <div class="inline-alert info">
            Today's Temperature: <strong>${todayLog.tempC.toFixed(1)}°C</strong> (${todayLog.tempC >= FEVER_THRESHOLD_C ? "Fever Active" : "Afebrile"}). Patient needs ${CURE_DAYS_REQUIRED - streak} more fever-free day(s) for standard discharge.
          </div>
        `}
        <div class="form-group">
          <label>Full Temperature History</label>
          ${renderHistoryChips(p)}
        </div>
        <div class="form-group">
          <label for="doctorNoteInput">Treatment / Visit Notes</label>
          <textarea id="doctorNoteInput" rows="3" class="form-control" placeholder="Enter clinical observations or medication updates...">${escapeHtml(p.doctorNote)}</textarea>
        </div>
        <div id="docConstraintMsg" class="inline-alert error hidden"></div>
        <div class="action-group" style="justify-content:space-between;margin-top:14px;">
          <button type="button" class="btn btn-sm btn-danger" id="markDeceasedBtn">Record Mortality</button>
          <div class="action-group">
            <button type="button" class="btn btn-outline" id="cancelDocBtn">Cancel</button>
            <button type="button" class="btn btn-blue" id="saveVisitBtn" ${!todayLog ? "disabled" : ""}>Mark Visited Today</button>
            <button type="button" class="btn btn-emerald" id="approveDischargeBtn" ${!todayLog ? "disabled" : ""}>Approve Discharge</button>
          </div>
        </div>
      `
    );

    document.getElementById("cancelDocBtn").onclick = closeModal;

    document.getElementById("saveVisitBtn").onclick = () => {
      p.doctorNote = document.getElementById("doctorNoteInput").value.trim();
      p.visitedToday = true;
      saveState();
      closeModal();
      showToast(`Doctor visit logged for Room ${p.room}.`, "success");
      renderApp();
    };

    document.getElementById("approveDischargeBtn").onclick = () => {
      if (!canDischarge) {
        const msg = document.getElementById("docConstraintMsg");
        msg.textContent = `Blocked: Patient only has ${streak}/3 consecutive fever-free days. Standard protocol requires 3 full days without fever before discharge.`;
        msg.classList.remove("hidden");
        return;
      }
      p.doctorNote = document.getElementById("doctorNoteInput").value.trim() || "Cleared after 3-day no-fever protocol";
      p.visitedToday = true;
      p.dischargeApproved = true;
      saveState();
      closeModal();
      showToast(`Room ${p.room} approved for discharge → Sent to Admin Staff queue.`, "success");
      renderApp();
    };

    document.getElementById("markDeceasedBtn").onclick = () => {
      const note = document.getElementById("doctorNoteInput").value.trim() || "Mortality recorded during treatment";
      state.resolvedCases.unshift({
        id: p.id,
        name: p.name,
        room: p.room,
        outcome: "deceased",
        admittedDay: p.admittedDay,
        resolvedDay: state.currentDay,
        noFeverDaysAtResolution: streak,
        note
      });
      state.patients = state.patients.filter((x) => x.id !== p.id);
      saveState();
      closeModal();
      showToast(`Outcome recorded for ${p.name} (Room ${p.room} now vacant).`, "error");
      renderApp();
    };
  }

  // ---------------- Role 3: Admin Staff View ----------------
  function renderAdminView() {
    const m = getMetrics();
    const pendingDischarges = state.patients
      .filter((p) => p.dischargeApproved)
      .sort((a, b) => a.room - b.room);

    const occupiedRooms = new Set(state.patients.map((p) => p.room));
    const vacantRooms = [];
    for (let r = 1; r <= MAX_ROOMS; r++) {
      if (!occupiedRooms.has(r)) vacantRooms.push(r);
    }

    const roomTiles = [];
    for (let r = 1; r <= MAX_ROOMS; r++) {
      const p = state.patients.find((x) => x.room === r);
      if (!p) {
        roomTiles.push(`
          <div class="room-tile room-vacant" data-action="room-inspect" data-room="${r}" title="Room ${r}: Vacant">
            <div class="r-num">R${r}</div>
            <div class="r-state">Vacant</div>
          </div>
        `);
      } else {
        const wf = getPatientWorkflowState(p);
        const label = wf === "pending_temp"
          ? "Need Temp"
          : wf === "ready_doctor"
          ? "Wait Doc"
          : wf === "visited"
          ? "Visited"
          : "Discharge!";
        roomTiles.push(`
          <div class="room-tile room-${wf}" data-action="room-inspect" data-room="${r}" title="Room ${r}: ${escapeHtml(p.name)} (${label})">
            <div class="r-num">R${r}</div>
            <div class="r-state">${label}</div>
          </div>
        `);
      }
    }

    return `
      <div class="two-col">
        <section class="panel">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">Pending Discharges Queue (${pendingDischarges.length})</h2>
              <p class="panel-desc">Patients cleared by Doctors. Complete checkout to immediately free up rooms.</p>
            </div>
          </div>
          <div class="panel-body">
            ${pendingDischarges.length ? `
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Room</th>
                      <th>Patient</th>
                      <th>No-Fever Streak</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${pendingDischarges.map((p) => `
                      <tr>
                        <td><strong>Room ${p.room}</strong></td>
                        <td><strong>${escapeHtml(p.name)}</strong><br><span class="panel-desc">${p.id} · Stay: ${Math.max(1, state.currentDay - p.admittedDay)}d</span></td>
                        <td><span class="status-badge badge-emerald">${getConsecutiveNoFeverDays(p)} Days</span></td>
                        <td>
                          <button class="btn btn-sm btn-emerald" data-action="admin-checkout" data-id="${p.id}">
                            Complete Discharge
                          </button>
                        </td>
                      </tr>
                    `).join("")}
                  </tbody>
                </table>
              </div>
            ` : `<div class="inline-alert info">No discharges pending right now. Doctors must approve discharge first.</div>`}
          </div>
        </section>

        <section class="panel">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">Admit New Patient</h2>
              <p class="panel-desc">Capacity limit: ${MAX_ROOMS} beds (${m.vacant} vacant).</p>
            </div>
          </div>
          <div class="panel-body">
            ${vacantRooms.length === 0 ? `
              <div class="inline-alert error">
                Facility Full (${MAX_ROOMS}/${MAX_ROOMS} occupied): Admissions are locked until a pending discharge is completed.
              </div>
            ` : `
              <form id="admitForm">
                <div class="form-group">
                  <label for="admitName">Patient Full Name</label>
                  <input type="text" id="admitName" class="form-control" placeholder="e.g., Rohan Kulkarni" required />
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                  <div class="form-group">
                    <label for="admitAge">Age</label>
                    <input type="number" id="admitAge" class="form-control" min="1" max="110" value="35" required />
                  </div>
                  <div class="form-group">
                    <label for="admitRoom">Assign Vacant Room</label>
                    <select id="admitRoom" class="form-control">
                      ${vacantRooms.map((r) => `<option value="${r}">Room ${r} (Vacant)</option>`).join("")}
                    </select>
                  </div>
                </div>
                <button type="submit" class="btn btn-primary" style="width:100%;">Admit Patient to Room</button>
              </form>
            `}
          </div>
        </section>
      </div>

      <section class="panel">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">74-Room Live Occupancy Map</h2>
            <p class="panel-desc">Click any room tile to inspect patient status.</p>
          </div>
        </div>
        <div class="panel-body">
          <div class="room-legend">
            <span class="legend-item"><span class="legend-dot" style="background:#fde68a;border:1px solid #d97706;"></span> Pending Temp</span>
            <span class="legend-item"><span class="legend-dot" style="background:#bfdbfe;border:1px solid #2563eb;"></span> Ready for Doctor</span>
            <span class="legend-item"><span class="legend-dot" style="background:#a7f3d0;border:1px solid #059669;"></span> Visited Today</span>
            <span class="legend-item"><span class="legend-dot" style="background:#4ade80;border:1px solid #15803d;"></span> Discharge Pending</span>
            <span class="legend-item"><span class="legend-dot" style="background:#f8fafc;border:1px dashed #94a3b8;"></span> Vacant</span>
          </div>
          <div class="room-grid">${roomTiles.join("")}</div>
        </div>
      </section>
    `;
  }

  // ---------------- Role 4: Head Doctor Quality Dashboard ----------------
  function renderHeadDoctorView() {
    const m = getMetrics();
    const activeTotal = Math.max(1, m.occupied - m.dischargePending);
    const tempsPct = Math.round(((activeTotal - m.pendingTemp) / activeTotal) * 100);
    const visitsPct = Math.round((m.visitedToday / activeTotal) * 100);
    const mortalityAbove = m.mortalityRate > MORTALITY_BENCHMARK_PCT;

    return `
      <div class="two-col">
        <section class="panel">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">Treatment Quality vs. 85% / 15% Benchmark</h2>
              <p class="panel-desc">Real-time outcome tracking across all resolved cases (${m.totalResolved} total).</p>
            </div>
          </div>
          <div class="panel-body">
            <div class="inline-alert ${mortalityAbove ? "error" : "ok"}">
              ${mortalityAbove
                ? `Warning: Mortality rate (${m.mortalityRate.toFixed(1)}%) exceeds the 15.0% benchmark. Investigate severe cases immediately.`
                : `On Target: Cure rate is ${m.cureRate.toFixed(1)}% (Benchmark ≥ 85.0%) and Mortality is ${m.mortalityRate.toFixed(1)}% (Limit ≤ 15.0%).`
              }
            </div>

            <div class="metric-bar-wrap">
              <div class="metric-bar-labels">
                <span><strong>Success / Cure Rate</strong> (Target ≥ 85%)</span>
                <strong>${m.cureRate.toFixed(1)}% (${m.curedCount} cured)</strong>
              </div>
              <div class="progress-track">
                <div class="progress-fill" style="width:${Math.min(100, m.cureRate)}%;background:var(--emerald);"></div>
              </div>
            </div>

            <div class="metric-bar-wrap" style="margin-top:16px;">
              <div class="metric-bar-labels">
                <span><strong>Mortality Rate</strong> (Threshold ≤ 15%)</span>
                <strong>${m.mortalityRate.toFixed(1)}% (${m.deceasedCount} deceased)</strong>
              </div>
              <div class="progress-track">
                <div class="progress-fill" style="width:${Math.min(100, m.mortalityRate)}%;background:${mortalityAbove ? "var(--rose)" : "var(--amber)"};"></div>
              </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:18px;">
              <div class="kpi-card" style="box-shadow:none;">
                <div class="kpi-label">Avg Length of Stay</div>
                <div class="kpi-value" style="font-size:20px;">${m.avgStay.toFixed(1)} days</div>
                <div class="kpi-sub">Across resolved patients</div>
              </div>
              <div class="kpi-card" style="box-shadow:none;">
                <div class="kpi-label">Cured Waiting Checkout</div>
                <div class="kpi-value" style="font-size:20px;">${m.dischargePending}</div>
                <div class="kpi-sub">Doctor cleared, Admin pending</div>
              </div>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">Today's Operational Completion</h2>
              <p class="panel-desc">Track whether understaffed nurse &amp; doctor rounds are on schedule for Day ${state.currentDay}.</p>
            </div>
          </div>
          <div class="panel-body">
            <div class="metric-bar-wrap">
              <div class="metric-bar-labels">
                <span>Nurse Temperatures Completed</span>
                <strong>${activeTotal - m.pendingTemp} / ${activeTotal} (${tempsPct}%)</strong>
              </div>
              <div class="progress-track">
                <div class="progress-fill" style="width:${tempsPct}%;background:var(--primary);"></div>
              </div>
            </div>

            <div class="metric-bar-wrap" style="margin-top:16px;">
              <div class="metric-bar-labels">
                <span>Doctor Visits Completed</span>
                <strong>${m.visitedToday} / ${activeTotal} (${visitsPct}%)</strong>
              </div>
              <div class="progress-track">
                <div class="progress-fill" style="width:${visitsPct}%;background:var(--blue);"></div>
              </div>
            </div>

            <div class="inline-alert info" style="margin-top:18px;margin-bottom:0;">
              <strong>Tip for Evaluation:</strong> Switch to <strong>Doctor</strong> → open any patient → click <em>Record Mortality</em> twice to test the live <strong>&gt;15% Mortality Alert</strong>, or click <strong>+ Next Day</strong> in the header to simulate multi-day recovery.
            </div>
          </div>
        </section>
      </div>

      <section class="panel">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">Resolved Cases Audit Log (Latest 15)</h2>
            <p class="panel-desc">Full visibility into cured discharges and fatalities for clinical quality review.</p>
          </div>
        </div>
        <div class="panel-body">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Patient ID</th>
                  <th>Name</th>
                  <th>Room</th>
                  <th>Outcome</th>
                  <th>Stay Duration</th>
                  <th>No-Fever Days</th>
                  <th>Clinical Note</th>
                </tr>
              </thead>
              <tbody>
                ${state.resolvedCases.slice(0, 15).map((c) => `
                  <tr>
                    <td><strong>${escapeHtml(c.id)}</strong></td>
                    <td>${escapeHtml(c.name)}</td>
                    <td>Room ${c.room}</td>
                    <td>
                      <span class="status-badge ${c.outcome === "cured" ? "badge-emerald" : "badge-rose"}">
                        ${c.outcome === "cured" ? "Cured &amp; Discharged" : "Deceased"}
                      </span>
                    </td>
                    <td>${Math.max(1, c.resolvedDay - c.admittedDay)} day(s)</td>
                    <td>${c.noFeverDaysAtResolution} day(s)</td>
                    <td>${escapeHtml(c.note)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    `;
  }

  // ---------------- View 5: App Flow & Logical Constraints ----------------
  function renderWorkflowView() {
    return `
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">End-to-End Daily Clinical &amp; Admin Workflow</h2>
            <p class="panel-desc">Visual overview of screens, state transitions, and built-in logical constraints for engineering handoff.</p>
          </div>
        </div>
        <div class="panel-body">
          <div class="flow-steps">
            <div class="flow-card">
              <span class="flow-step-num">Step 1 · Admin</span>
              <h3>Admit to Vacant Room</h3>
              <p>Admin admits patient to 1 of 74 rooms. Blocked automatically if occupancy = 74/74. Patient enters Nurse queue.</p>
            </div>
            <div class="flow-card">
              <span class="flow-step-num">Step 2 · Nurse</span>
              <h3>Record Daily Temp</h3>
              <p>Nurse logs temperature (34–43°C). Duplicate same-day entries trigger an override guard. Status moves to Ready for Doctor.</p>
            </div>
            <div class="flow-card">
              <span class="flow-step-num">Step 3 · Doctor</span>
              <h3>Visit &amp; Evaluate Cure</h3>
              <p>Doctor visit is locked until Nurse logs today's temp. App auto-counts consecutive &lt;38.0°C days and flags 3/3 days as Discharge Eligible.</p>
            </div>
            <div class="flow-card">
              <span class="flow-step-num">Step 4 · Admin</span>
              <h3>Execute Bed Release</h3>
              <p>Admin receives instant Pending Discharge notification, completes checkout, and frees the bed for new admissions.</p>
            </div>
            <div class="flow-card">
              <span class="flow-step-num">Step 5 · Head Doc</span>
              <h3>Monitor 85% / 15% KPI</h3>
              <p>Dashboard computes live Cure vs. Mortality rates from resolved cases and triggers a red alert banner if Mortality &gt; 15%.</p>
            </div>
          </div>

          <h3 style="font-size:15px;margin-bottom:10px;">Active Logical Constraints Enforced in This Prototype</h3>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Constraint Area</th>
                  <th>Rule Enforced in App</th>
                  <th>Problem Solved</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Duplicate Temp Guard</strong></td>
                  <td>1 temp reading per patient per day; re-entry prompts explicit override confirmation.</td>
                  <td>Stops nurses from measuring the same patient multiple times in one day.</td>
                </tr>
                <tr>
                  <td><strong>Visit Sequencing Lock</strong></td>
                  <td>Doctor cannot mark "Visited Today" or "Approve Discharge" until today's temp is logged.</td>
                  <td>Stops doctors from visiting patients prematurely without temp data.</td>
                </tr>
                <tr>
                  <td><strong>3-Day Cure Protocol</strong></td>
                  <td>Discharge blocked if consecutive no-fever (&lt;38.0°C) days &lt; 3.</td>
                  <td>Enforces consistent medical discharge criteria across all doctors.</td>
                </tr>
                <tr>
                  <td><strong>74-Bed Capacity Cap</strong></td>
                  <td>Admissions disabled at 74/74 occupancy until Admin completes a pending discharge.</td>
                  <td>Prevents overbooking and accelerates bed turnover.</td>
                </tr>
                <tr>
                  <td><strong>Mortality Threshold Alert</strong></td>
                  <td>Global red alert triggers automatically whenever Mortality Rate exceeds 15.0%.</td>
                  <td>Gives the Head Doctor real-time visibility against the 85% success benchmark.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    `;
  }

  // ---------------- Shared Helpers & Event Wiring ----------------
  function renderRecentMini(patient) {
    const last3 = patient.logs.slice(-3);
    if (!last3.length) return `<span class="panel-desc">No logs</span>`;
    return last3
      .map((l) => `<span class="panel-desc">D${l.day}: <strong>${l.tempC.toFixed(1)}°</strong></span>`)
      .join(" · ");
  }

  function matchesSearch(patient) {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return (
      String(patient.room).includes(q) ||
      patient.name.toLowerCase().includes(q) ||
      patient.id.toLowerCase().includes(q)
    );
  }

  function switchRole(role) {
    activeRole = role;
    searchQuery = "";
    document.querySelectorAll(".role-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.role === role);
    });
    renderApp();
  }

  function inspectRoom(roomNum) {
    const p = state.patients.find((x) => x.room === roomNum);
    if (!p) {
      openModal(`Room ${roomNum} — Vacant`, "Ready for new admission", `<p class="panel-desc">Use the Admit New Patient form on the Admin tab to assign a patient to Room ${roomNum}.</p>`);
      return;
    }
    const streak = getConsecutiveNoFeverDays(p);
    openModal(
      `Room ${roomNum} — ${p.name}`,
      `${p.id} · Age ${p.age} · Admitted Day ${p.admittedDay}`,
      `
        <div class="form-group">
          <label>Current Status</label>
          <p><strong>${getPatientWorkflowState(p).replace("_", " ").toUpperCase()}</strong> · Consecutive No-Fever Days: <strong>${streak}</strong></p>
        </div>
        <div class="form-group">
          <label>Temperature History</label>
          ${renderHistoryChips(p)}
        </div>
        <div class="form-group">
          <label>Doctor Notes</label>
          <p class="panel-desc">${escapeHtml(p.doctorNote || "No notes recorded yet.")}</p>
        </div>
      `
    );
  }

  function bindDynamicEvents() {
    const searchBox = document.getElementById("searchBox");
    if (searchBox) {
      searchBox.oninput = (e) => {
        searchQuery = e.target.value;
        const caret = e.target.selectionStart;
        renderMainOnly();
        const freshBox = document.getElementById("searchBox");
        if (freshBox) {
          freshBox.focus();
          freshBox.setSelectionRange(caret, caret);
        }
      };
    }

    document.querySelectorAll("[data-nfilter]").forEach((btn) => {
      btn.onclick = () => {
        nurseFilter = btn.dataset.nfilter;
        renderApp();
      };
    });

    document.querySelectorAll("[data-dfilter]").forEach((btn) => {
      btn.onclick = () => {
        doctorFilter = btn.dataset.dfilter;
        renderApp();
      };
    });

    document.querySelectorAll("[data-action='log-temp']").forEach((btn) => {
      btn.onclick = () => openNurseTempModal(btn.dataset.id);
    });

    document.querySelectorAll("[data-action='doctor-visit']").forEach((btn) => {
      btn.onclick = () => openDoctorVisitModal(btn.dataset.id);
    });

    document.querySelectorAll("[data-action='quick-discharge']").forEach((btn) => {
      btn.onclick = () => {
        const p = state.patients.find((x) => x.id === btn.dataset.id);
        if (!p) return;
        p.visitedToday = true;
        p.dischargeApproved = true;
        p.doctorNote = p.doctorNote || "Approved for discharge (3+ fever-free days)";
        saveState();
        showToast(`Room ${p.room} approved for discharge → Admin queue updated.`, "success");
        renderApp();
      };
    });

    document.querySelectorAll("[data-action='admin-checkout']").forEach((btn) => {
      btn.onclick = () => {
        const p = state.patients.find((x) => x.id === btn.dataset.id);
        if (!p) return;
        state.resolvedCases.unshift({
          id: p.id,
          name: p.name,
          room: p.room,
          outcome: "cured",
          admittedDay: p.admittedDay,
          resolvedDay: state.currentDay,
          noFeverDaysAtResolution: getConsecutiveNoFeverDays(p),
          note: p.doctorNote || "Discharged after 3-day no-fever criterion"
        });
        state.patients = state.patients.filter((x) => x.id !== p.id);
        saveState();
        showToast(`${p.name} discharged! Room ${p.room} is now Vacant.`, "success");
        renderApp();
      };
    });

    document.querySelectorAll("[data-action='room-inspect']").forEach((tile) => {
      tile.onclick = () => inspectRoom(Number(tile.dataset.room));
    });

    const admitForm = document.getElementById("admitForm");
    if (admitForm) {
      admitForm.onsubmit = (e) => {
        e.preventDefault();
        if (state.patients.length >= MAX_ROOMS) {
          showToast("Facility is at 74/74 capacity.", "error");
          return;
        }
        const name = document.getElementById("admitName").value.trim();
        const age = parseInt(document.getElementById("admitAge").value, 10);
        const room = parseInt(document.getElementById("admitRoom").value, 10);
        if (!name || Number.isNaN(age) || Number.isNaN(room)) return;

        const newId = `PT-${state.nextPatientSeq++}`;
        state.patients.push({
          id: newId,
          room,
          name,
          age,
          admittedDay: state.currentDay,
          logs: [],
          visitedToday: false,
          dischargeApproved: false,
          doctorNote: ""
        });
        saveState();
        showToast(`Admitted ${name} to Room ${room} → Added to Nurse queue.`, "success");
        renderApp();
      };
    }
  }

  function renderMainOnly() {
    const main = document.getElementById("mainContent");
    if (activeRole === "nurse") main.innerHTML = renderNurseView();
    else if (activeRole === "doctor") main.innerHTML = renderDoctorView();
    else if (activeRole === "admin") main.innerHTML = renderAdminView();
    else if (activeRole === "head_doctor") main.innerHTML = renderHeadDoctorView();
    else main.innerHTML = renderWorkflowView();

    bindDynamicEvents();
  }

  function renderApp() {
    renderTopStatus();
    renderMainOnly();
  }

  // Static Header & Modal Listeners
  document.querySelectorAll(".role-btn").forEach((btn) => {
    btn.onclick = () => switchRole(btn.dataset.role);
  });

  document.getElementById("advanceDayBtn").onclick = () => {
    state.currentDay += 1;
    state.patients.forEach((p) => {
      if (!p.dischargeApproved) {
        p.visitedToday = false;
      }
    });
    saveState();
    showToast(`Advanced to Facility Day ${state.currentDay}. Daily Nurse & Doctor queues reset.`, "info");
    renderApp();
  };

  document.getElementById("resetDemoBtn").onclick = () => {
    state = createInitialState();
    saveState();
    showToast("Facility demo data reset to Day 5 (74/74 occupied).", "info");
    renderApp();
  };

  document.getElementById("modalCloseBtn").onclick = closeModal;
  document.getElementById("modalOverlay").onclick = (e) => {
    if (e.target.id === "modalOverlay") closeModal();
  };
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  renderApp();
})();
