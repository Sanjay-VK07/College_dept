# Export Student Data to Excel Through Chatbot

## Feature Overview

A secure, role-based chatbot feature that enables authorized administrators to export complete student records as a dynamically generated Excel (`.xlsx`) file.

Administrators can simply ask the chatbot:

* “Download student data”
* “Export students to Excel”
* “Give me the student details in Excel”
* “Download all student records”

The chatbot detects the request, verifies authorization, and provides a secure Excel download action.

---

## 1. Backend Export Endpoint

**Endpoint:** `GET /api/admin/export-students`

**Controller:** `AdminController.exportStudentsExcel`

The endpoint:

* Generates a date-stamped filename such as `student_data_2026-08-30.xlsx`
* Calls the student export service
* Streams the generated Excel file to the frontend
* Uses the correct Excel MIME type:
  `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

---

## 2. Excel Generation Service

**Service:** `StudentDataExportService.generateExcel`

The export service generates the Excel workbook using a strict `StudentExportRow` DTO.

### Exported Metrics

* Student ID
* Student Name
* Email
* Phone Number
* Department / Branch
* Year
* Semester
* Section
* Registration Date
* Total Exams Assigned
* Completed Exams
* Progress (%)
* Best Mock Score
* Average Mock Score
* Average Accuracy (%)
* Practice Attempts

### Security and Privacy

The DTO acts as a whitelist, ensuring that internal or sensitive fields such as tokens, hashes, sessions, and other private database fields are never exported.

The generated worksheet includes readable column widths and graceful handling of empty student rosters.

---

## 3. Dual-Level Authorization

The feature uses two independent authorization layers.

### Level 1 — Chatbot Authorization

`AIChatService` verifies that the requesting user has the `ADMIN` role.

Non-admin users receive an access-denied response and no download action is generated.

### Level 2 — API Authorization

The export API route independently enforces:

`requireRoles(Role.ADMIN)`

This prevents users from bypassing chatbot authorization by directly calling the export endpoint.

---

## 4. Intent Detection

**Service:** `IntentService.classifyIntent`

The chatbot detects the new:

`EXPORT_STUDENT_DATA`

intent from requests such as:

* “Download student data”
* “Export students to Excel”
* “Give me the student details in Excel”
* “Download all student records”

This allows administrators to trigger the export using natural language.

---

## 5. Structured Chatbot Action

After successful authorization and validation, the chatbot responds:

> Student data export is ready. Click the button below to download the Excel file.

It also returns structured action metadata:

```typescript
{
  type: 'DOWNLOAD_STUDENT_EXCEL',
  downloadUrl: '/api/admin/export-students',
  fileName: 'student_data_YYYY-MM-DD.xlsx'
}
```

The frontend uses this structured metadata instead of relying on fragile text matching.

---

## 6. Frontend Download Experience

The following components support the export action:

* `AIChatMessage.tsx`
* `AIExaminationAssistant.tsx`

They render a dedicated **Download Excel** button with:

* Loading spinner
* Filename display
* Error handling
* Success confirmation

### Secure Download Process

`aiService.downloadStudentDataExcel` performs an authenticated API request using:

```text
Authorization: Bearer <token>
```

The response is received as a binary Blob, converted into an in-memory Blob URL, and downloaded directly by the browser.

No JWT tokens are exposed in:

* Query parameters
* Download URLs
* Browser history

### Quick Action

`AIQuickActions.tsx` includes an **Export Student Data** quick action for administrators.

---

## Validation Results

### Automated Tests

**Test File:** `src/tests/studentDataExport.test.ts`

* Test Suites: **1 passed**
* Tests: **10/10 passed**
* Snapshots: **0**

### TypeScript Validation

| Component | Command            | Result     |
| --------- | ------------------ | ---------- |
| Frontend  | `npx tsc --noEmit` | ✅ 0 errors |
| Backend   | `npx tsc --noEmit` | ✅ 0 errors |

---

## Final Outcome

The chatbot can now securely perform a real administrative operation through natural language.

**Flow:**

```text
Admin Request
     ↓
Intent Detection
     ↓
EXPORT_STUDENT_DATA
     ↓
Level 1 Authorization
     ↓
Structured Chatbot Action
     ↓
Download Excel Button
     ↓
Authenticated API Request
     ↓
Level 2 Authorization
     ↓
StudentDataExportService
     ↓
Prisma Database Query
     ↓
StudentExportRow DTO
     ↓
Excel Generation
     ↓
Secure .xlsx Download
```

This implementation provides a secure, scalable, and production-oriented integration between conversational AI, role-based access control, database analytics, and dynamic report generation.
