# Built REST API endpoint for user authentication

**Date:** 2026-02-01
**Category:** ALGORITHM
**Rating:** 8/10

## What Was Accomplished

Created a complete REST API authentication system with:
- User registration endpoint
- Login/logout endpoints
- JWT token generation and validation
- Password hashing with bcrypt
- Rate limiting to prevent brute force attacks

## Technical Details

**Stack:**
- Node.js + Express
- PostgreSQL database
- JWT for tokens
- bcrypt for password hashing

**Files Modified:**
- `src/api/auth/register.ts`
- `src/api/auth/login.ts`
- `src/middleware/authenticate.ts`
- `tests/api/auth.test.ts`

## Challenges Encountered

1. **Token Expiration:** Initially set tokens to expire after 1 hour, but this caused UX issues. Extended to 24 hours with refresh token strategy.

2. **Password Requirements:** Had to balance security (strong requirements) with usability (not too strict).

3. **Rate Limiting:** Implemented sliding window rate limiter to prevent brute force while allowing legitimate retries.

## Key Learnings

- JWT payload should be minimal - only include user ID and role
- Always hash passwords with high salt rounds (12+)
- Rate limiting is essential for auth endpoints
- Test error cases thoroughly (wrong password, expired token, etc.)

## Next Steps

- Add email verification for new registrations
- Implement password reset flow
- Add OAuth providers (Google, GitHub)
- Set up session management for admin panel

## Tags

#api #authentication #security #jwt #backend

---

*This is an example learning capture. Your actual learnings will contain your specific technical work and insights.*
