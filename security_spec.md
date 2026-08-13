# Firestore Security Spec for AI Usage Tracking

## Data Invariants

1. `ai_usage_stats`: Each document corresponds to a valid user ID.
2. `ai_api_logs`: Each document logs an AI call with positive token counts.
3. Access controls allow authenticated users or admins to read/write usage metrics.

## Dirty Dozen Security Payloads

1. Negative token count injection
2. Unauthenticated user stat creation
3. Large payload injection in model string (> 200 chars)
4. Invalid endpoint URL format
5. Overwriting other user's usage stat without auth
6. Non-numeric latency values
7. Invalid status value outside allowed enum
8. Missing required userEmail field
9. Spoofed user ID path mismatch
10. Excessive list read without query filter
11. Attempting to clear usage logs without privileges
12. Malformed timestamp string

## Production Security Rules

Rules enforce schema validation, authenticated access, and ID sanitization.
