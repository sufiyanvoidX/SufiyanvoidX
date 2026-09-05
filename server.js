const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 5000;
const ROOT = path.join(__dirname, "public");
const MAX_TEXT_LENGTH = 120000;
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(payload));
}

function parseNumeric(value) {
  const match = String(value).replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function parseRange(rangeText) {
  if (!rangeText) return null;
  const cleaned = rangeText.replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
  const matches = cleaned.match(/(-?\d+(?:\.\d+)?)\s*(?:-|to)\s*(-?\d+(?:\.\d+)?)/i);
  if (matches) return { min: Number(matches[1]), max: Number(matches[2]), raw: rangeText.trim() };
  const upper = cleaned.match(/(?:<|≤|less than)\s*(-?\d+(?:\.\d+)?)/i);
  if (upper) return { min: -Infinity, max: Number(upper[1]), raw: rangeText.trim() };
  const lower = cleaned.match(/(?:>|≥|greater than)\s*(-?\d+(?:\.\d+)?)/i);
  if (lower) return { min: Number(lower[1]), max: Infinity, raw: rangeText.trim() };
  return null;
}

function classify(value, rangeText) {
  const range = parseRange(rangeText);
  if (!range) return { label: "Not classified", detail: "Reference range not provided", tone: "neutral" };
  if (value < range.min) return { label: "Low", detail: `Below report range ${range.raw}`, tone: "low" };
  if (value > range.max) return { label: "High", detail: `Above report range ${range.raw}`, tone: "high" };
  return { label: "Normal", detail: `Within report range ${range.raw}`, tone: "normal" };
}

function extractDate(text) {
  const match = text.match(/(?:date|collected|reported|performed)\s*[:\-]\s*(\d{1,4}[\/\-]\d{1,2}[\/\-]\d{1,4}|[A-Za-z]+\s+\d{1,2},?\s+\d{4})/i);
  return match ? match[1] : new Date().toISOString().slice(0, 10);
}

function extractFindings(text) {
  const findings = [];
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const skipped = /^(patient|name|date|dob|age|sex|mrn|medical|report|reference|specimen|observation|comment|physician|provider)\b/i;
  for (const line of lines) {
    if (skipped.test(line) && !/^\w[\w\s-]{1,35}\s*[:|]\s*[<>≤≥]?-?\d/.test(line)) continue;
    const rangeMatch = line.match(/(?:reference\s*(?:range)?|ref(?:erence)?\.?\s*range|normal\s*range)\s*[:=]?\s*([<>≤≥]?\s*-?\d+(?:\.\d+)?\s*(?:-|–|—|to)\s*-?\d+(?:\.\d+)?|[<>≤≥]\s*-?\d+(?:\.\d+)?)/i)
      || line.match(/[\(\[]\s*([<>≤≥]?\s*-?\d+(?:\.\d+)?\s*(?:-|–|—|to)\s*-?\d+(?:\.\d+)?|[<>≤≥]\s*-?\d+(?:\.\d+)?)\s*[\)\]]/i);
    const rangeText = rangeMatch ? rangeMatch[1] : null;
    const beforeRange = rangeMatch ? line.slice(0, rangeMatch.index) : line;
    const valueMatch = beforeRange.match(/(?:^|[:|])\s*([<>≤≥]?\s*-?\d+(?:\.\d+)?)\s*([a-zA-Z%µμ\/^0-9]+)?(?:\s|$)/)
      || beforeRange.match(/\s([<>≤≥]?\s*-?\d+(?:\.\d+)?)\s*([a-zA-Z%µμ\/^0-9]+)?(?:\s|$)/);
    if (!valueMatch) continue;
    const value = parseNumeric(valueMatch[1]);
    if (value === null) continue;
    const prefix = beforeRange.slice(0, valueMatch.index + (valueMatch[0].length - valueMatch[0].trimStart().length)).replace(/[:|]\s*$/, "").trim();
    const name = prefix.replace(/^[-•*]\s*/, "").replace(/\s*[:|]\s*$/, "").trim();
    if (!name || name.length > 60 || /^\d+$/.test(name)) continue;
    const unit = (valueMatch[2] || "").trim();
    const observation = beforeRange.slice(valueMatch.index + valueMatch[0].length).replace(/[()[\]]/g, "").replace(/\s{2,}/g, " ").replace(/\s*[-:|]\s*$/, "").trim();
    const classification = classify(value, rangeText);
    findings.push({
      id: `finding-${findings.length + 1}`,
      testName: name,
      value: String(value),
      unit,
      referenceRange: rangeText || "",
      date: extractDate(text),
      observation: observation || "Value extracted from source report.",
      classification: classification.label,
      classificationDetail: classification.detail,
      tone: classification.tone,
      provenance: "Report-extracted",
      verification: "AI extracted",
    });
  }
  return findings.slice(0, 80);
}

function createSummary(patient, findings) {
  if (!findings.length) {
    return "No structured findings were extracted. Review the source text and add findings manually before generating a summary.";
  }
  const counts = findings.reduce((acc, item) => {
    acc[item.classification] = (acc[item.classification] || 0) + 1;
    return acc;
  }, {});
  const parts = [];
  if (counts.Normal) parts.push(`${counts.Normal} ${counts.Normal === 1 ? "finding is" : "findings are"} within the reference range provided in the report`);
  if (counts.High) parts.push(`${counts.High} ${counts.High === 1 ? "finding is" : "findings are"} above the provided report range`);
  if (counts.Low) parts.push(`${counts.Low} ${counts.Low === 1 ? "finding is" : "findings are"} below the provided report range`);
  if (counts["Not classified"]) parts.push(`${counts["Not classified"]} ${counts["Not classified"] === 1 ? "finding has" : "findings have"} no report-provided reference range`);
  const subject = patient?.name ? `For ${patient.name}, ` : "";
  return `${subject}${parts.join("; ")}. This is a structured informational summary of the supplied data, not a diagnosis or treatment recommendation.`;
}

function detectConflicts(patient, findings) {
  const text = `${patient?.allergies || ""} ${patient?.medications || ""}`.toLowerCase();
  const allergies = (patient?.allergies || "").split(/[,;\n]/).map((item) => item.trim().toLowerCase()).filter(Boolean);
  return allergies.flatMap((allergy) => {
    const medication = (patient?.medications || "").split(/[,;\n]/).map((item) => item.trim()).find((item) => item.toLowerCase().includes(allergy));
    return medication ? [{ id: `conflict-${allergy}`, title: "Possible overlap to review", detail: `"${medication}" appears alongside allergy entry "${allergy}". Verify with a qualified professional.`, severity: "Review" }] : [];
  });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 300000) {
        req.destroy();
        reject(new Error("Request too large"));
      }
    });
    req.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); } catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

async function handleApi(req, res, url) {
  if (req.method === "POST" && url.pathname === "/api/process-report") {
    try {
      const body = await parseBody(req);
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (!text) return sendJson(res, 400, { error: "Report text is required." });
      if (text.length > MAX_TEXT_LENGTH) return sendJson(res, 413, { error: "Report text exceeds the allowed size." });
      const findings = extractFindings(text);
      return sendJson(res, 200, { findings, reportDate: extractDate(text), sourceName: String(body.sourceName || "Source report").slice(0, 120), summary: createSummary(body.patient || {}, findings), conflicts: detectConflicts(body.patient || {}, findings) });
    } catch (error) {
      return sendJson(res, 400, { error: "The report could not be processed safely." });
    }
  }
  if (req.method === "POST" && url.pathname === "/api/summary") {
    try {
      const body = await parseBody(req);
      if (!Array.isArray(body.findings)) return sendJson(res, 400, { error: "Findings are required." });
      return sendJson(res, 200, { summary: createSummary(body.patient || {}, body.findings.slice(0, 80)) });
    } catch {
      return sendJson(res, 400, { error: "The summary could not be generated." });
    }
  }
  if (req.method === "GET" && url.pathname === "/api/health") return sendJson(res, 200, { ok: true, service: "medlens" });
  return sendJson(res, 404, { error: "Not found" });
}

function serveStatic(req, res, url) {
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(ROOT, requested));
  if (!filePath.startsWith(ROOT)) return sendJson(res, 403, { error: "Forbidden" });
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Not found");
    }
    res.writeHead(200, { "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) return handleApi(req, res, url);
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });
  serveStatic(req, res, url);
});

server.listen(PORT, "0.0.0.0", () => console.log(`MedLens listening on port ${PORT}`));