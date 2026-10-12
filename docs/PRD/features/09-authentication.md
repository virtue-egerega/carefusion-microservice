# Feature PRD — Authentication

Status: Draft · Last updated: 2026-10-12
Depends on: `02-hospital-onboarding.md` (User, PasswordHistory, PersonalAccessToken)

## 1. Scope

Covers how staff (and any other User type) authenticate with CareFusion. Three operations:

| Operation | Who triggers it |
|---|---|
| Login | User, with their email and password |
| Change password | Authenticated user, voluntarily |
| Forgot / reset password | User who cannot log in; an admin initiates on their behalf (self-hosted, no email service assumed — token is returned to caller for manual relay) |

Patient login (NFC-card or PIN flow) is out of scope for v1.

## 2. Login

- Lookup user by `email` where `deletedAt IS NULL`.
- Reject if status is `RESTRICTED` or `NOTAPPROVED` (with a clear message).
- **Lockout**: if `loginAttempts >= 5` and `lastFailedAt` is within the last 10 minutes → 429 with retry-after.
- Compare submitted password against `User.password` (bcrypt).
- On failure: increment `loginAttempts`, record `lastFailedAt`. If `loginAttempts > 8` → set status to `RESTRICTED`.
- On success: reset `loginAttempts` to `0`, update `lastLogin`, store hashed refresh token in `User.refreshToken`, return `{ user, access_token, refresh_token }`.
- Tokens signed with env-var secrets and expiries (`JWT_ACCESS_TOKEN_SECRET` / `JWT_ACCESS_TOKEN_EXPIRES_IN`, `JWT_REFRESH_TOKEN_SECRET` / `JWT_REFRESH_TOKEN_EXPIRES_IN`).

## 3. Change Password

- Requires a valid access token (`Authorization: Bearer <token>`).
- Verify `currentPassword` against the stored hash.
- Reject if `newPassword` matches any of the last 5 entries in `PasswordHistory` for this user.
- Hash and save `newPassword` on `User.password`.
- Append the old password hash to `PasswordHistory`.
- Invalidate refresh token (`User.refreshToken = null`) — force re-login.

## 4. Forgot / Reset Password

**Forgot** (`POST /auth/forgot-password`):
- Accept `email`. If no user found, return 200 anyway (no enumeration).
- Generate a cryptographically random token (`crypto.randomBytes(32).toString('hex')`).
- Upsert a `PersonalAccessToken` row: `type = PASSWORDRESET`, `expiry = now + 1 hour`.
- Return `{ token, expiresAt }` to the caller (admin relays to the user out-of-band).

**Reset** (`POST /auth/reset-password`):
- Accept `token` and `newPassword`.
- Find the `PersonalAccessToken` where `token`, `type = PASSWORDRESET`, `deletedAt IS NULL`, `expiry > now`.
- If not found or expired → 400.
- Check `newPassword` against last 5 in `PasswordHistory`.
- Hash and save. Append old hash to `PasswordHistory`. Soft-delete the token. Reset `loginAttempts`.

## 5. APIs

| Endpoint | Method | Auth | Body |
|---|---|---|---|
| `/api/v1/auth/login` | POST | none | `{ email, password }` |
| `/api/v1/auth/change-password` | POST | Bearer JWT | `{ currentPassword, newPassword }` |
| `/api/v1/auth/forgot-password` | POST | none | `{ email }` |
| `/api/v1/auth/reset-password` | POST | none | `{ token, newPassword }` |

## 6. Guard

A `JwtAuthGuard` (custom, no Passport dependency) reads `Authorization: Bearer <token>`, verifies with `JWT_ACCESS_TOKEN_SECRET`, and attaches the decoded payload to `request.user`. Protected routes use `@UseGuards(JwtAuthGuard)`.
