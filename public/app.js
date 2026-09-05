const samplePatient = {
  name: "Jane Miller", id: "PT-2024-001", age: 42, sex: "Female",
  symptoms: "Fatigue, occasional headaches", conditions: "None reported",
  allergies: "Penicillin", medications: "Vitamin D supplement"
};
const sampleFindings = [
  ["Hemoglobin","13.5","g/dL","12–16","Normal","Within report range 12–16","normal","CBC_September_05.pdf","Human verified"],
  ["White blood cells","7.2","10^3/uL","4.0–10.0","Normal","Within report range 4.0–10.0","normal","CBC_September_05.pdf","Human verified"],
  ["Platelets","410","10^3/uL","150–400","High","Above report range 150–400","high","CBC_September_05.pdf","AI extracted"],
  ["Hematocrit","40.1","%","36–46","Normal","Within report range 36–46","normal","CBC_September_05.pdf","Human verified"],
  ["MCV","88.4","fL","80–100","Normal","Within report range 80–100","normal","CBC_September_05.pdf","Human verified"],
  ["RDW","14.8","%","11.5–14.5","High","Above report range 11.5–14.5","high","CBC_September_05.pdf","AI extracted"],
  ["Neutrophils","58","%","40–70","Normal","Within report range 40–70","normal","CBC_September_05.pdf","Human verified"],
  ["Eosinophils","3.2","%","","Not classified","Reference range not provided","neutral","CBC_September_05.pdf","Human verified"]
].map((f, i) => ({ id:`finding-${i+1}`, testName:f[0], value:f[1], unit:f[2], referenceRange:f[3], classification:f[4], classificationDetail:f[5], tone:f[6], provenance:"Report-extracted", source:f[7], verification:f[8], observation:"Value extracted from source report." }));

const state = {
  patient: JSON.parse(localStorage.getItem("medlens-patient") || "null") || samplePatient,
  findings: JSON.parse(localStorage.getItem("medlens-findings") || "null") || sampleFindings,
  activeFilter: "all", editing: false, reportName: "Complete blood count",
  reportDate: "September 5, 2026", history: JSON.parse(localStorage.getItem("medlens-history") || "[]"), conflicts: JSON.parse(localStorage.getItem("medlens-conflicts") || "[]")
};
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[char]));

function showToast(message) {
  const toast = $("#toast"); toast.textContent = message; toast.classList.add("show");
  clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove("show"), 3200);
}
function openModal(id) { const modal = $(`#${id}`); modal.hidden = false; document.body.style.overflow = "hidden"; setTimeout(() => modal.querySelector("input,textarea,button")?.focus(), 50); }
function closeModals() { $$(".modal-backdrop").forEach((modal) => modal.hidden = true); document.body.style.overflow = ""; }

function navigate(view) {
  $$(".view").forEach((section) => section.classList.toggle("active-view", section.id === `view-${view}`));
  $$(".nav-item[data-view]").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  $$(".nav-item.patient-link").forEach((item) => item.classList.toggle("active-sub", item.dataset.view === view));
  const labelMap = { dashboard:"Dashboard", patients:"Patients", reports:"Reports", overview:"Patient overview", findings:"Medical findings", summary:"AI summary", provenance:"Source & provenance", timeline:"History & timeline" };
  $("#breadcrumb").textContent = labelMap[view] || view.charAt(0).toUpperCase() + view.slice(1).replace("-", " ");
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function syncPatientUI() {
  const p = state.patient;
  const initials = p.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  $("#patient-heading").textContent = p.name;
  $("#patient-id-display").textContent = p.id;
  $("#patient-age-display").textContent = `${p.age} years`;
  $("#patient-sex-display").textContent = p.sex;
  $("#patient-symptoms-display").textContent = p.symptoms || "None reported";
  $("#patient-conditions-display").textContent = p.conditions || "None reported";
  $("#patient-allergies-display").textContent = p.allergies || "None reported";
  $("#patient-medications-display").textContent = p.medications || "None reported";
  const patientEyebrow = $("#patient-eyebrow");
  if (patientEyebrow) patientEyebrow.textContent = `Patient record · ${p.id}`;
  const patientSubheading = $("#patient-subheading");
  if (patientSubheading) patientSubheading.textContent = `${p.age} years · ${p.sex} · Updated today`;
  const patientAvatar = $("#patient-avatar");
  if (patientAvatar) patientAvatar.textContent = initials;
  const eyebrowNames = $$("[data-patient-name]");
  eyebrowNames.forEach((el) => el.textContent = `Patient record · ${p.name}`);
  const reviewCount = state.findings.filter((item) => item.verification !== "Human verified").length;
  const overviewAlert = $("#overview-alert");
  if (overviewAlert) {
    if (reviewCount > 0) {
      overviewAlert.style.display = "flex";
      const strongEl = overviewAlert.querySelector("strong");
      if (strongEl) strongEl.textContent = `${reviewCount} ${reviewCount === 1 ? "item" : "items"} need your review`;
      const pEl = overviewAlert.querySelector("p");
      if (pEl) pEl.textContent = `There ${reviewCount === 1 ? "is" : "are"} findings awaiting human verification before this record is complete.`;
    } else {
      overviewAlert.style.display = "none";
    }
  }
  const latestReportName = $("#latest-report-name");
  if (latestReportName) latestReportName.textContent = state.reportName;
  const reportDateDisplay = $("#report-date-display");
  if (reportDateDisplay) reportDateDisplay.textContent = state.reportDate;
  const findingsHeading = $("#findings-heading");
  if (findingsHeading) findingsHeading.textContent = state.reportName;
  const findingsSubheading = $("#findings-subheading");
  if (findingsSubheading) findingsSubheading.textContent = `Report-extracted · ${state.reportDate}`;
  const sourceFileName = $("#source-file-name");
  if (sourceFileName) {
    const src = state.findings[0]?.source || "Source report";
    sourceFileName.textContent = src;
  }
}
function renderAttention() {
  const pending = state.findings.filter((item) => item.verification !== "Human verified");
  $("#attention-list").innerHTML = (pending.length ? pending.slice(0, 3) : [{ testName:"All findings reviewed", observation:"This record is ready for the next report." }]).map((item, i) => `
    <div class="attention-item"><span class="finding-dot ${i ? "purple" : ""}">${pending.length ? "!" : "✓"}</span><div><strong>${escapeHtml(item.testName)}</strong><small>${escapeHtml(item.classificationDetail || item.observation)}</small></div>${pending.length ? '<span class="badge badge-warning">Review</span>' : '<span class="badge badge-success">Complete</span>'}</div>`).join("");
  $("#verification-count").textContent = pending.length || 0;
}
function renderFindings() {
  const search = ($("#finding-search")?.value || "").toLowerCase();
  const filtered = state.findings.filter((item) => {
    const matchesFilter = state.activeFilter === "all" || (state.activeFilter === "review" ? item.verification !== "Human verified" : item.verification === "Human verified");
    return matchesFilter && `${item.testName} ${item.classification}`.toLowerCase().includes(search);
  });
  $("#findings-body").innerHTML = filtered.map((item) => {
    const tone = item.tone || "neutral";
    const verificationClass = item.verification === "Human verified" ? "done" : "pending";
    return `<tr data-id="${escapeHtml(item.id)}"><td class="finding-name">${state.editing ? `<input class="edit-input" data-field="testName" value="${escapeHtml(item.testName)}">` : escapeHtml(item.testName)}</td><td class="finding-value">${state.editing ? `<input class="edit-input" data-field="value" value="${escapeHtml(item.value)}">` : escapeHtml(item.value)} <em>${escapeHtml(item.unit)}</em></td><td>${state.editing ? `<input class="edit-input" data-field="referenceRange" value="${escapeHtml(item.referenceRange)}">` : (escapeHtml(item.referenceRange) || '<span class="source-label">Not provided</span>')}</td><td><span class="classification ${tone}">${escapeHtml(item.classification)}</span></td><td><span class="source-label"><i></i>${escapeHtml(item.source || "Source report")}</span></td><td><span class="verification ${verificationClass}">${item.verification === "Human verified" ? "✓ Human verified" : "◌ AI extracted"}</span></td><td><button class="row-menu verify-row" aria-label="Verify ${escapeHtml(item.testName)}">•••</button></td></tr>`;
  }).join("") || `<tr><td colspan="7"><div class="empty-state">No findings match this filter.</div></td></tr>`;
  $("#findings-footer").textContent = `Showing ${filtered.length} of ${state.findings.length} findings`;
  $("#all-count").textContent = state.findings.length;
  $("#review-count").textContent = state.findings.filter((item) => item.verification !== "Human verified").length;
  $("#verified-count").textContent = state.findings.filter((item) => item.verification === "Human verified").length;
  $("#save-findings").hidden = !state.editing;
}
function renderSummary() {
  $("#summary-copy").textContent = buildSummary(state.patient, state.findings);
  $("#finding-total").textContent = state.findings.length;
  $("#finding-review").textContent = state.findings.filter((item) => item.verification !== "Human verified").length;
  $("#finding-verified").textContent = state.findings.filter((item) => item.verification === "Human verified").length;
}
function buildSummary(patient, findings) {
  const counts = findings.reduce((acc, item) => { acc[item.classification] = (acc[item.classification] || 0) + 1; return acc; }, {});
  const parts = [];
  if (counts.Normal) parts.push(`${counts.Normal} ${counts.Normal === 1 ? "finding is" : "findings are"} within the reference range provided in the report`);
  if (counts.High) parts.push(`${counts.High} ${counts.High === 1 ? "finding is" : "findings are"} above the provided report range`);
  if (counts.Low) parts.push(`${counts.Low} ${counts.Low === 1 ? "finding is" : "findings are"} below the provided report range`);
  if (counts["Not classified"]) parts.push(`${counts["Not classified"]} ${counts["Not classified"] === 1 ? "finding has" : "findings have"} no report-provided reference range`);
  if (!parts.length) return `For ${patient.name}, no structured findings are available yet. Upload or paste a report to generate a summary.`;
  return `For ${patient.name}, ${parts.join("; ")}. This is a structured informational summary of the supplied data, not a diagnosis or treatment recommendation.`;
}
function renderProvenance() {
  const p = state.patient;
  const rows = [
    ["Patient identity", `${p.name} · ${p.age} years · ${p.sex}`, "Patient-provided", "patient"],
    ["Symptoms & conditions", `${p.symptoms || "None reported"} · ${p.conditions || "None reported"}`, "Patient-provided", "patient"],
    ["Laboratory findings", `${state.findings.length} values extracted from ${state.reportName}`, "Report-extracted", "report"],
    ["Plain-language summary", "Generated from structured findings only", "AI-generated", "ai"],
    ["Verified findings", `${state.findings.filter((item) => item.verification === "Human verified").length} findings confirmed by a reviewer`, "Human-verified", "verified"]
  ];
  $("#provenance-list").innerHTML = rows.map((row) => `<div class="provenance-row"><span class="prov-icon">${row[3] === "report" ? "▤" : row[3] === "ai" ? "✦" : row[3] === "verified" ? "✓" : "●"}</span><div><strong>${escapeHtml(row[0])}</strong><small>${escapeHtml(row[1])}</small></div><span class="source-tag ${row[3] === "patient" ? "patient-tag" : ""}">${escapeHtml(row[2])}</span></div>`).join("");
}
function renderConflicts() {
  const container = $("#conflict-banner-container");
  if (!container) return;
  const conflicts = state.conflicts || [];
  container.innerHTML = conflicts.map((c) => `<div class="record-alert conflict-banner"><span class="alert-mark">!</span><div><strong>${escapeHtml(c.title)}</strong><p>${escapeHtml(c.detail)}</p></div><span class="badge badge-warning">${escapeHtml(c.severity || "Review")}</span></div>`).join("");
}
function renderAll() { syncPatientUI(); renderAttention(); renderFindings(); renderSummary(); renderProvenance(); renderConflicts(); }
function persist() { localStorage.setItem("medlens-patient", JSON.stringify(state.patient)); localStorage.setItem("medlens-findings", JSON.stringify(state.findings)); localStorage.setItem("medlens-conflicts", JSON.stringify(state.conflicts || [])); }

function loadPatientForm(isNew) {
  const p = isNew ? { name:"", id:"", age:"", sex:"Female", symptoms:"", conditions:"", allergies:"", medications:"" } : state.patient;
  $("#patient-name").value = p.name; $("#patient-id").value = p.id; $("#patient-age").value = p.age; $("#patient-sex").value = p.sex;
  $("#patient-symptoms").value = p.symptoms; $("#patient-conditions").value = p.conditions; $("#patient-allergies").value = p.allergies; $("#patient-medications").value = p.medications;
  $("#patient-modal-title").textContent = isNew ? "Add new patient" : "Update patient record";
}
function classifyClient(value, rangeText) {
  const numbers = String(rangeText).replace(/[–—]/g, "-").match(/(-?\d+(?:\.\d+)?)\s*(?:-|to)\s*(-?\d+(?:\.\d+)?)/i);
  if (!numbers) return { label:"Not classified", tone:"neutral", detail:"Reference range not provided" };
  const n = Number(value); const min = Number(numbers[1]); const max = Number(numbers[2]);
  if (n < min) return { label:"Low", tone:"low", detail:`Below report range ${rangeText}` };
  if (n > max) return { label:"High", tone:"high", detail:`Above report range ${rangeText}` };
  return { label:"Normal", tone:"normal", detail:`Within report range ${rangeText}` };
}
async function processReport() {
  const text = $("#report-text").value.trim(); const error = $("#report-error"); error.textContent = "";
  if (!text) { error.textContent = "Add report text or choose a text file to continue."; return; }
  const button = $("#process-report-button"); button.disabled = true; button.innerHTML = "Processing…";
  try {
    const response = await fetch("/api/process-report", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ text, sourceName: $("#report-file").files[0]?.name || "Pasted report", patient: state.patient }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || "Unable to process report.");
    if (!result.findings.length) { error.textContent = "No numeric findings were found. Try a text format such as “Hemoglobin: 13.5 g/dL (12–16)”."; return; }
    state.findings = result.findings.map((item) => ({ ...item, source: result.sourceName }));
    state.reportName = result.sourceName.replace(/\.[^.]+$/, "") || "Processed report";
    state.reportDate = result.reportDate; state.conflicts = result.conflicts || []; persist(); closeModals(); renderAll(); navigate("findings"); showToast(`${state.findings.length} findings extracted. Human review is required.`);
  } catch (err) { error.textContent = "The report could not be processed. Check the text and try again."; }
  finally { button.disabled = false; button.innerHTML = 'Process report <span>→</span>'; }
}

document.addEventListener("click", (event) => {
  const nav = event.target.closest("[data-view]"); if (nav) { navigate(nav.dataset.view); return; }
  const link = event.target.closest("[data-view-link]"); if (link) { navigate(link.dataset.viewLink); return; }
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action === "new-report") { $("#report-text").value = ""; $("#report-file").value = ""; $("#report-error").textContent = ""; openModal("report-modal"); }
  if (action === "edit-patient") { loadPatientForm(false); openModal("patient-modal"); }
  if (action === "new-patient") { loadPatientForm(true); openModal("patient-modal"); }
  if (action === "close-modal") closeModals();
  if (action === "compare") { showToast("Select two reports from the timeline to compare them."); }
  if (action === "help") { showToast("Help center: Contact support@medlens.app for assistance."); }
  if (action === "settings") { showToast("Settings panel coming soon."); }
  if (action === "notifications") { showToast("You have 3 pending review items."); }
  if (action === "workspace") { showToast("Workspace switcher: You are in Dr. Rivera's Care workspace."); }
  if (action === "report-actions") { showToast("Report options: Export, archive, or delete from here."); }
  if (action === "patient-filter") { showToast("Filter options will appear here."); }
  if (event.target.closest(".segment")) { $$(".segment").forEach((item) => item.classList.remove("active")); event.target.closest(".segment").classList.add("active"); state.activeFilter = event.target.closest(".segment").dataset.filter; renderFindings(); }
  if (event.target.closest(".verify-row")) { const row = event.target.closest("tr"); const finding = state.findings.find((item) => item.id === row.dataset.id); if (finding) { finding.verification = "Human verified"; persist(); renderAll(); showToast(`${finding.testName} marked as human verified.`); } }
  if (event.target.closest("#toggle-edit")) { state.editing = !state.editing; event.target.closest("#toggle-edit").textContent = state.editing ? "Cancel editing" : "Edit findings"; renderFindings(); }
  if (event.target.closest("#save-findings")) { $$("#findings-body tr").forEach((row) => { const finding = state.findings.find((item) => item.id === row.dataset.id); if (!finding) return; row.querySelectorAll(".edit-input").forEach((input) => finding[input.dataset.field] = input.value.trim()); const result = classifyClient(finding.value, finding.referenceRange); Object.assign(finding, { ...result, verification:"Human verified" }); }); state.editing = false; $("#toggle-edit").textContent = "Edit findings"; persist(); renderAll(); showToast("Findings saved and marked for human review completion."); }
});
$("#report-file").addEventListener("change", async (event) => { const file = event.target.files[0]; if (!file) return; if (file.size > 10 * 1024 * 1024) { $("#report-error").textContent = "Files must be smaller than 10 MB."; event.target.value = ""; return; } if (file.type.startsWith("text/") || /\.(txt|csv)$/i.test(file.name)) $("#report-text").value = await file.text(); else $("#report-error").textContent = "PDF and image files are accepted for the interface, but this MVP requires pasted or text-extracted report content."; });
$("#drop-zone").addEventListener("click", () => $("#report-file").click());
$("#process-report-button").addEventListener("click", processReport);
$("#finding-search").addEventListener("input", renderFindings);
$("#patient-search")?.addEventListener("input", (event) => {
  const term = event.target.value.toLowerCase();
  $$("#view-patients tbody tr").forEach((row) => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(term) ? "" : "none";
  });
});
$("#timeline-filter")?.addEventListener("change", (event) => {
  const filter = event.target.value;
  $$("#view-timeline .timeline-item").forEach((item) => {
    if (filter === "All activity") { item.style.display = ""; return; }
    const isVerified = item.querySelector(".badge-success");
    if (filter === "Verified only") { item.style.display = isVerified ? "" : "none"; }
    else { item.style.display = ""; }
  });
});
$("#patient-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = $("#patient-name").value.trim();
  const id = $("#patient-id").value.trim();
  const age = Number($("#patient-age").value);
  if (!name || !id || !age) return;
  state.patient = { name, id, age, sex:$("#patient-sex").value, symptoms:$("#patient-symptoms").value.trim(), conditions:$("#patient-conditions").value.trim(), allergies:$("#patient-allergies").value.trim(), medications:$("#patient-medications").value.trim() };
  persist(); closeModals(); renderAll(); showToast("Patient information updated.");
});
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeModals(); });
renderAll();
