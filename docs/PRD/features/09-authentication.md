# Feature PRD — Authentication

Status: Draft · Last updated: 2026-10-13
Depends on: `02-hospital-onboarding.md` (User, PasswordHistory, PersonalAccessToken), Redis (§9)

## 1. Scope

How staff (and any other `User` type) get into CareFusion. The product runs self-hosted and often
offline, so **there is no email or SMS channel**: every credential is handed over in person by an
admin.

| Operation | Who triggers it |
|---|---|
| Login | User, with email and password |
| First login / forced change | User signing in with a temporary password (§3) |
| Change password | Authenticated user, voluntarily |
| Admin password reset | Admin with `staff.password.reset`, for a user who can't log in (§4) |

There is **no self-service forgot-password**. Without a second channel to prove identity, the
admin's in-person check *is* that channel. The earlier `POST /auth/forgot-password` returned a
working reset token to any unauthenticated caller who knew an email address, and has been removed
along with `reset-password`.

Patient login (NFC card or PIN) is out of scope for v1. Patients created by reception get a
temporary password under the same forced-change rule, ready for when a patient portal exists.

## 2. Login

- Look up the user by `email` where `deletedAt IS NULL`.
- Reject if status is `RESTRICTED` or `NOTAPPROVED` (with a clear message).
- **Lockout**: if `loginAttempts >= 5` and the last failure was within 10 minutes, reject with a retry message.
- Compare the submitted password with `User.password` (bcrypt).
- On failure: increment `loginAttempts`. Above 8, set status to `RESTRICTED`.
- On success with `mustChangePassword = true`: see §3.
- On success otherwise: reset `loginAttempts`, update `lastLogin`, **remove the user's re-login
  flag** (§9.3), and return `{ user, mustChangePassword: false, staff, access_token }` with the
  refresh token in an httpOnly cookie.
- **Login is the only place permissions are read from the database.** The response lists the
  user's permissions and queues, which the frontend uses to decide what to show. The access token
  carries `organizationId`, `branchId` (the staff member's home branch), permission keys and duty
  profile ids, plus a unique token id (`jti`).
  Neither refresh nor ordinary requests read the database (§9).

## 3. Temporary Passwords and the Forced Change

A **temporary password** is a password an admin has seen. It's issued in exactly two situations:
when an admin **creates** an account, and when an admin **resets** one (§4). Either way:

1. The system generates it: 12 characters, every character class, no look-alike characters
   (`0/O`, `1/l/I`), cryptographically random.
2. It's returned **once**, in the admin's API response, and never stored or shown again. Only its
   bcrypt hash is kept.
3. The user is flagged `mustChangePassword = true`.
4. At login with that password, the user gets a **restricted session**: an access token carrying
   `passwordChangeRequired: true`, no permissions, no organisation, valid 30 minutes, and **no
   refresh token**. The login response says `mustChangePassword: true`.
5. `JwtAuthGuard` rejects that token on **every** route except `POST /auth/change-password` (403
   "You must change your temporary password before continuing"). This is enforced by the server;
   the frontend redirect is a convenience, not the control.
6. Changing the password clears the flag. The user then logs in again with their own password and
   gets a normal session.

**Why this is safe enough without email.** The admin does know the temporary password, so could
use it before the user does. But the only thing it allows is choosing a new password. If an admin
did that, the real user's first login would fail immediately and they'd go back to the admin, and
the issue is recorded (§5). A one-time setup code has exactly the same property, so it adds steps
without adding protection.

## 4. Admin Password Reset

`POST /staff/:id/reset-password`, requires `staff.password.reset`:
- An admin can't reset their own password this way; they use change-password.
- Only staff in the admin's own organisation can be reset.
- Issues a new temporary password (§3), returned once.
- Sets `mustChangePassword = true` and clears `loginAttempts`.
- Sets the user's re-login flag (§9.3, reason `PASSWORD_RESET`), so their current sessions end.
- Records the reset (§5).
- Does **not** change `status`. An account `RESTRICTED` after too many failed logins is
  re-activated separately through the staff update (`status = ACTIVE`), because accounts can be
  restricted for other reasons too.

## 5. Record-Keeping: Who Could Have Known a Password

| Event | Recorded as |
|---|---|
| Account created (first temporary password) | `HospitalStaff.createdBy` + `createdAt`: the creating admin is the issuer |
| Admin reset | A `PasswordHistory` row: the replaced hash, `changedBy` = the admin, `reason = ADMIN_RESET`, time |
| User's own change (forced or voluntary) | A `PasswordHistory` row: `changedBy` = the user, `reason = USER_CHANGE` |
| Duty profile auto-assigned at creation | `StaffAssignment.assignedBy` = the creating admin (previously recorded the new user as granting themselves) |

`PasswordHistory` also keeps serving its original purpose: a new password can't match any of the
last 5.

## 6. Change Password

- Requires a valid access token (a normal one, or the restricted one from §3).
- Verify `currentPassword` against the stored hash.
- Reject if `newPassword` matches any of the last 5 entries in `PasswordHistory`.
- Hash and save `newPassword`. Append the old hash to `PasswordHistory` (`USER_CHANGE`).
- Clear `mustChangePassword`. Set the re-login flag (§9.3, reason `PASSWORD_CHANGED`), forcing a
  fresh login with the new password.

## 7. APIs

| Endpoint | Method | Auth | Body |
|---|---|---|---|
| `/api/v1/auth/login` | POST | none | `{ email, password }` |
| `/api/v1/auth/change-password` | POST | Bearer JWT (normal or restricted) | `{ currentPassword, newPassword }` |
| `/api/v1/auth/refresh` | POST | refresh cookie | none; returns a new access token (§9.2) |
| `/api/v1/auth/logout` | POST | Bearer JWT + refresh cookie | none; ends this device's session (§9.4) |
| `/api/v1/staff` | POST | `staff.manage` | Staff details; response includes the one-time `temporaryPassword` |
| `/api/v1/staff/:id/reset-password` | POST | `staff.password.reset` | none; response includes the one-time `temporaryPassword` |

Every `/staff` route now requires `staff.manage` and is scoped to the caller's organisation.
`updatedBy` / `deletedBy` come from the token, not the request.

## 8. Guards

- **`JwtAuthGuard`** (custom, no Passport) reads `Authorization: Bearer <token>`, verifies it with
  `JWT_ACCESS_TOKEN_SECRET`, checks the revocation cache (§9.5), rejects restricted tokens (§3) on
  routes not marked `@AllowsPasswordChangeRequired()`, and attaches the payload to `request.user`.
- **`@Authorize(...keys)`** combines `JwtAuthGuard` with `PermissionsGuard`. Permissions come from
  the token only. The earlier per-request database re-check of approval permissions is removed:
  changing anyone's permissions now forces them to log in again (§9.3).

## 9. Sessions, Refresh and Revocation

**Rule: the database is read at login only.** Refresh and ordinary requests use the token plus a
**Redis** cache. Redis is a cache that survives restarts, so revocations aren't lost when the API
restarts.

### 9.1 Tokens

| Token | Lifetime | Carries | Where it lives |
|---|---|---|---|
| Access | `JWT_ACCESS_TOKEN_EXPIRES_IN` | `sub`, `type`, `organizationId`, `branchId`, permission keys, duty profile ids, `jti` | `Authorization` header |
| Refresh | `JWT_REFRESH_TOKEN_EXPIRES_IN` | `sub`, the same claims, its own `jti` | httpOnly cookie, expiring with the token |
| Password change only (§3) | `JWT_PASSWORD_CHANGE_TOKEN_EXPIRES_IN` | `sub`, `type`, `passwordChangeRequired`, `jti` | `Authorization` header |

Every lifetime is set in `.env`; nothing is hardcoded. A short access lifetime (minutes) is
recommended: refresh costs no database read, and it bounds how long a revoked token could survive.

`User.refreshToken` (a stored hash) is no longer needed and is removed. Refresh tokens are checked
against Redis, not the database.

### 9.2 Refresh

`POST /auth/refresh`: verify the refresh token's signature and expiry, check it isn't revoked and
the user has no re-login flag (§9.5), then issue a new access token **carrying the same claims**.
No database read. Updated permissions therefore only ever arrive through a new login.

### 9.3 Forced re-login: the re-login flag

Whenever something changes what a user may do or see, their user id goes into Redis:

```
relogin:user:<userId>  =  <reason code>      (no expiry)
```

It stays until that user **logs in successfully**, which deletes it. While it exists, every request
and every refresh by that user gets 401 with the reason, and the frontend sends them to login with
the matching message.

| Event | Who gets flagged | Reason |
|---|---|---|
| Admin resets a password (§4) | That user | `PASSWORD_RESET` |
| User changes their own password (§6) | That user | `PASSWORD_CHANGED` |
| Duty profile assigned to / removed from a user | That user | `ACCESS_CHANGED` |
| A duty profile's permissions or queues edited | **Every user holding that profile** | `ACCESS_CHANGED` |
| Staff role, department or status changed; account removed | That user | `ACCESS_CHANGED` / `ACCOUNT_DISABLED` |

**Why editing a profile logs out every holder.** The frontend builds its menus from the permissions
it received at login: if "Create user" isn't shown, the user can't reach that endpoint. Changing
permissions on the server alone would leave every holder's screen wrong. A new login is the only
way their UI picks up the change.

A deactivated or removed user can't log in, so their flag is never deleted, and that's intended.

### 9.4 Logout

`POST /auth/logout`: clear the refresh cookie and add **both** tokens' ids to the revocation cache,
each with a TTL equal to that token's remaining lifetime:

```
revoked:token:<jti>  =  LOGGED_OUT      (expires when the token would have)
```

Only this device's session ends. Entries remove themselves once the token couldn't be used anyway.

### 9.5 The check on every request and refresh

One Redis round trip (`MGET revoked:token:<jti> relogin:user:<sub>`). If either key exists, 401
with a machine-readable code:

| Code | Message shown |
|---|---|
| `ACCESS_CHANGED` | "Your access was changed by an administrator. Please log in again, **on every device you use**." |
| `PASSWORD_RESET` | "Your password was reset. Log in with the temporary password from your administrator, **on every device you use**." |
| `PASSWORD_CHANGED` | "Your password was changed. Please log in again **on every device you use**." |
| `ACCOUNT_DISABLED` | "Your account has been deactivated. Contact your administrator." |
| `LOGGED_OUT` | "You have been logged out." |
| `TOKEN_EXPIRED` | Not shown; the frontend refreshes silently |

## 10. Known Gaps

**10.1 One re-login clears the flag for every device (accepted, documented).** The re-login flag is
per user, and the first successful login deletes it. If the user is signed in on two devices, say
the ward PC and a phone, and logs in again on only one, the other device's old tokens stop being
caught:
- its access token works until it expires (`JWT_ACCESS_TOKEN_EXPIRES_IN`), and
- **its refresh token can keep issuing access tokens with the old permissions until it expires
  (`JWT_REFRESH_TOKEN_EXPIRES_IN`).**

After a permission change, that device keeps the old access. After a **password reset**, a device
that was lost or stolen *before* the reset stays signed in once the real user logs in elsewhere.
That's the serious case.

Current mitigation: **the user's responsibility.** Every forced re-login message tells them to log
in again on every device they use. Closing the gap needs per-session tracking (recording each
user's token ids at login, so a forced re-login can revoke each one individually). That's deferred.

## 11. Redis

**Redis is required infrastructure, like Postgres.** The API doesn't start without it
(`REDIS_URL`), and while it's down, authenticated requests fail with 503 rather than skipping the
revocation check. Allowing requests without the check would let revoked users back in during an
outage.

## 12. Configuration

| Variable | Purpose |
|---|---|
| `JWT_ACCESS_TOKEN_SECRET`, `JWT_ACCESS_TOKEN_EXPIRES_IN` | Access tokens |
| `JWT_REFRESH_TOKEN_SECRET`, `JWT_REFRESH_TOKEN_EXPIRES_IN` | Refresh tokens and the refresh cookie |
| `JWT_PASSWORD_CHANGE_TOKEN_EXPIRES_IN` | The restricted token from a temporary-password login (§3) |
| `REDIS_URL` | Revocation cache (§9) |
