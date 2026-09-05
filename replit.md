# MedLens

MedLens is a lightweight clinical information intelligence MVP. It uses a Node.js HTTP server and a vanilla HTML/CSS/JavaScript frontend; no package installation is required.

## Run

```bash
npm run dev
```

The Replit workflow runs the server on `process.env.PORT` (port 5000 in preview). The application serves the dashboard at `/` and the report-processing API at `/api/process-report`.

## MVP behavior

- Patient information is marked as Patient-provided and saved in browser local storage.
- Report text is processed through a server endpoint. Findings use only reference ranges present in the supplied report.
- Findings can be edited and marked Human verified.
- The dashboard shows flagged findings, provenance, an informational AI summary, conflicts, and report history.
- This MVP intentionally does not diagnose, prescribe, or infer missing clinical reference ranges.