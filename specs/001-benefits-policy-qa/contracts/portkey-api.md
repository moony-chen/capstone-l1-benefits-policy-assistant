# Model API Contract: Portkey Gateway

**Feature**: 001-benefits-policy-qa | **Date**: 2026-08-15

OpenAI-compatible REST at `PORTKEY_BASE_URL`
(`https://portkeygateway.perficient.com/v1`). Auth: `Authorization:
Bearer {PORTKEY_API_KEY}` on every call. Both endpoints below were
**live-verified 2026-08-15** from this workspace (see research.md D2).

## POST {BASE}/embeddings

Request:

```json
{
  "model": "@azure-openai/text-embedding-3-small",
  "input": ["POL-001 Benefits Eligibility\n\n<body>"]
}
```

Response (verified): `{"object":"list","data":[{"embedding":[...]}]}` —
one 1536-dimension vector per input string, same order.

**Usage**: batch all policy `embedText` values in one call on cache miss;
one call with the question text per `ask`. Input count = number of
vectors returned MUST match, else retry once then fail loudly (exit 1).

## POST {BASE}/chat/completions

Request:

```json
{
  "model": "@dsvertex/anthropic.claude-sonnet-4-6",
  "messages": [
    { "role": "system", "content": "<assistant rules, see below>" },
    { "role": "user", "content": "<question + retrieved policies>" }
  ]
}
```

Response (verified): `choices[0].message.content` (string),
`usage.prompt_tokens` / `completion_tokens`, `finish_reason`.

**Answer format contract (parsed by the CLI)**: the first line of
`content` MUST be exactly `CITED:` or `DECLINED:`:

- `CITED:` → remaining lines are the answer; citations extracted as all
  `POL-\d{3}` tokens validated against the parsed handbook.
- `DECLINED:` → remaining lines are the explicit not-covered message;
  CLI surfaces the decline and exit code 3.

**System prompt MUST encode** (constitution Principles I–IV, Quality
Gates): answers solely from the provided policy texts; no outside
knowledge; cite POL-NNN ids for every claim; when policies conflict or
are time-dependent, present both sides with dates/effective windows and
never silently choose; treat today as 2025-10-01; if the provided
policies do not cover the question, respond `DECLINED:` with an explicit
not-covered statement; never invent policy ids or numbers.

## Failure handling

| Condition                    | Behavior                                         |
|------------------------------|--------------------------------------------------|
| Non-2xx / network error      | Retry once with backoff, then exit 1 with clear  |
|                              | message naming endpoint and model                |
| Missing/malformed env vars   | Exit 1 at startup with the missing variable name |
| Unexpected response shape    | Exit 1 (never guess a parse)                     |
| Rate limit (429)             | Retry with backoff (eval mode paces 15 calls)    |

The gateway key is read from `.env` only; it MUST NOT appear in stdout,
eval reports, or logs.
