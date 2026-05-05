# Abjad Platform – API Documentation

**Base URL:** `https://abjad-backend.vercel.app/api`

**Authentication:** All protected routes require a Bearer token in the `Authorization` header.
```
Authorization: Bearer <access_token>
```

---

## Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/send-otp` | Public | Send OTP to email |
| POST | `/auth/verify-otp` | Public | Verify OTP & receive tokens |
| POST | `/auth/refresh` | Public | Refresh access token |
| POST | `/auth/logout` | ✅ | Logout current session |
| POST | `/auth/logout-all` | ✅ | Logout all sessions |
| GET | `/auth/me` | ✅ | Get current user info |
| GET | `/auth/sessions` | ✅ | List active sessions |

---

## File Upload

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/upload` | ✅ | Upload file (photos, certificates, resumes, documents) |
| DELETE | `/upload` | ✅ | Delete file by publicId |

---

## Teacher – Profile

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/teacher/profile` | ✅ Teacher | Get profile |
| PATCH | `/teacher/profile/personal` | ✅ Teacher | Update personal info |
| PATCH | `/teacher/profile/professional` | ✅ Teacher | Update professional info |
| PATCH | `/teacher/profile/education` | ✅ Teacher | Update education |
| PATCH | `/teacher/profile/languages` | ✅ Teacher | Update languages |
| PATCH | `/teacher/profile/location` | ✅ Teacher | Update location preferences |
| PATCH | `/teacher/profile/salary` | ✅ Teacher | Update salary expectations |
| POST | `/teacher/profile/certifications` | ✅ Teacher | Add certification |
| DELETE | `/teacher/profile/certifications/:certId` | ✅ Teacher | Remove certification |
| POST | `/teacher/profile/certifications/:certId/upload` | ✅ Teacher | Upload certificate file |
| POST | `/teacher/profile/photo` | ✅ Teacher | Upload profile photo |
| POST | `/teacher/profile/resume` | ✅ Teacher | Upload resume |
| POST | `/teacher/profile/education/certificate` | ✅ Teacher | Upload education certificate |
| POST | `/teacher/profile/submit` | ✅ Teacher | Submit profile for approval |

---

## Teacher – Dashboard

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/teacher/dashboard` | ✅ Teacher | Get dashboard overview |

---

## Teacher – Jobs

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/jobs` | Public | Browse job listings |
| GET | `/jobs/recommendations` | ✅ Teacher | Get recommended jobs |
| GET | `/jobs/saved` | ✅ Teacher | Get saved jobs |
| GET | `/jobs/:jobId` | Public | Get job details |
| POST | `/jobs/:jobId/save` | ✅ Teacher | Save a job |
| DELETE | `/jobs/:jobId/save` | ✅ Teacher | Unsave a job |

---

## Teacher – Applications

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/applications` | ✅ Teacher | Apply to a job |
| GET | `/applications` | ✅ Teacher | List my applications |
| GET | `/applications/stats` | ✅ Teacher | Application statistics |
| GET | `/applications/:applicationId` | ✅ Teacher | Get application details |
| PATCH | `/applications/:applicationId/withdraw` | ✅ Teacher | Withdraw application |

---

## Teacher – Interviews

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/interviews` | ✅ Teacher | List interviews |
| GET | `/interviews/upcoming` | ✅ Teacher | Upcoming interviews |
| GET | `/interviews/:interviewId` | ✅ Teacher | Get interview details |
| PATCH | `/interviews/:interviewId/respond` | ✅ Teacher | Accept / reschedule / decline |
| PATCH | `/interviews/:interviewId/complete` | ✅ Teacher | Mark as completed |

---

## Teacher – Offers

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/offers` | ✅ Teacher | List offers |
| GET | `/offers/:offerId` | ✅ Teacher | Get offer details |
| PATCH | `/offers/:offerId/respond` | ✅ Teacher | Accept / decline / negotiate |

---

## Notifications

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/notifications` | ✅ | List notifications |
| GET | `/notifications/unread-count` | ✅ | Get unread count |
| PATCH | `/notifications/read-all` | ✅ | Mark all as read |
| PATCH | `/notifications/:notificationId/read` | ✅ | Mark one as read |
| DELETE | `/notifications/:notificationId` | ✅ | Delete notification |

---

## Support

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/support/tickets` | ✅ | Create support ticket |
| GET | `/support/tickets` | ✅ | List my tickets |
| GET | `/support/tickets/:ticketId` | ✅ | Get ticket details |
| POST | `/support/tickets/:ticketId/reply` | ✅ | Reply to ticket |
| PATCH | `/support/tickets/:ticketId/close` | ✅ | Close ticket |
| POST | `/support/feedback` | ✅ | Submit feedback |

---

## School – Profile

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/school/profile` | ✅ School | Get school profile |
| PATCH | `/school/profile/basic` | ✅ School | Update basic info |
| PATCH | `/school/profile/location` | ✅ School | Update location |
| PATCH | `/school/profile/contact` | ✅ School | Update contact info |
| PATCH | `/school/profile/admin-contact` | ✅ School | Update admin contact |
| POST | `/school/profile/logo` | ✅ School | Upload school logo |
| POST | `/school/profile/documents/:docType` | ✅ School | Upload document |
| POST | `/school/profile/submit` | ✅ School | Submit for verification |

---

## School – Jobs

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/school/jobs` | ✅ School | Create job posting |
| GET | `/school/jobs` | ✅ School | List school's jobs |
| GET | `/school/jobs/:jobId` | ✅ School | Get job details |
| PATCH | `/school/jobs/:jobId` | ✅ School | Update job posting |
| POST | `/school/jobs/:jobId/publish` | ✅ School | Publish job |
| POST | `/school/jobs/:jobId/close` | ✅ School | Close job posting |
| DELETE | `/school/jobs/:jobId` | ✅ School | Delete job posting |
| GET | `/school/jobs/:jobId/stats` | ✅ School | Get job statistics |

---

## School – Candidates

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/school/candidates` | ✅ School | Search teacher candidates |
| GET | `/school/candidates/:teacherId` | ✅ School | View candidate profile |
| POST | `/school/candidates/:teacherId/notes` | ✅ School | Add note on candidate |
| GET | `/school/candidates/:teacherId/notes` | ✅ School | Get candidate notes |
| PATCH | `/school/candidates/notes/:noteId` | ✅ School | Update note |
| DELETE | `/school/candidates/notes/:noteId` | ✅ School | Delete note |

---

## School – Applications

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/school/applications` | ✅ School | List applications |
| GET | `/school/applications/:applicationId` | ✅ School | Get application details |
| PATCH | `/school/applications/:applicationId/status` | ✅ School | Update application status |
| GET | `/school/applications/jobs/:jobId/stats` | ✅ School | Get job application stats |

---

## School – Shortlists

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/school/shortlists` | ✅ School | Create shortlist |
| GET | `/school/shortlists` | ✅ School | List shortlists |
| GET | `/school/shortlists/:shortlistId` | ✅ School | Get shortlist details |
| PATCH | `/school/shortlists/:shortlistId` | ✅ School | Update shortlist |
| DELETE | `/school/shortlists/:shortlistId` | ✅ School | Delete shortlist |
| POST | `/school/shortlists/:shortlistId/teachers` | ✅ School | Add teacher to shortlist |
| DELETE | `/school/shortlists/:shortlistId/teachers/:teacherId` | ✅ School | Remove teacher from shortlist |

---

## School – Interviews

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/school/interviews` | ✅ School | Schedule interview |
| GET | `/school/interviews` | ✅ School | List interviews |
| GET | `/school/interviews/:interviewId` | ✅ School | Get interview details |
| PATCH | `/school/interviews/:interviewId` | ✅ School | Update interview |
| POST | `/school/interviews/:interviewId/cancel` | ✅ School | Cancel interview |
| POST | `/school/interviews/:interviewId/complete` | ✅ School | Mark as completed |

---

## School – Offers

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/school/offers` | ✅ School | Extend offer to teacher |
| GET | `/school/offers` | ✅ School | List offers |
| GET | `/school/offers/:offerId` | ✅ School | Get offer details |
| PATCH | `/school/offers/:offerId` | ✅ School | Update offer |
| POST | `/school/offers/:offerId/revoke` | ✅ School | Revoke offer |
| POST | `/school/offers/:offerId/negotiate` | ✅ School | Respond to negotiation |
| POST | `/school/offers/:offerId/confirm-hire` | ✅ School | Confirm hire |

---

## School – Dashboard & Analytics

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/school/dashboard` | ✅ School | Dashboard overview |
| GET | `/school/dashboard/analytics` | ✅ School | Platform analytics |
| GET | `/school/dashboard/jobs/:jobId/analytics` | ✅ School | Per-job analytics |

---

## School – Team Management

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/school/team` | ✅ School | List team members |
| POST | `/school/team` | ✅ School | Add team member |
| GET | `/school/team/me` | ✅ School | Get my role |
| PATCH | `/school/team/:memberId/role` | ✅ School | Update member role |
| DELETE | `/school/team/:memberId` | ✅ School | Remove team member |

---

## Admin

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/admin/stats` | ✅ Admin | Platform stats |
| GET | `/admin/schools` | ✅ Admin | List all schools |
| GET | `/admin/schools/:profileId` | ✅ Admin | Get school details |
| POST | `/admin/schools/:profileId/approve` | ✅ Admin | Approve school |
| POST | `/admin/schools/:profileId/reject` | ✅ Admin | Reject school |
| GET | `/admin/teachers` | ✅ Admin | List all teachers |
| GET | `/admin/teachers/:profileId` | ✅ Admin | Get teacher details |
| POST | `/admin/teachers/:profileId/approve` | ✅ Admin | Approve teacher |
| POST | `/admin/teachers/:profileId/reject` | ✅ Admin | Reject teacher |

---

**Total Endpoints: 98** across 15 modules.
