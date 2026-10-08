# Trade Avata v8 — Indicator Security

Trade Avata does **not** treat arbitrary user JavaScript as a safe indicator format.

The rule is:
1. First-party reviewed indicator code can run in the trusted application.
2. User/third-party indicator specifications should use a restricted declarative API/language.
3. Any permitted executable extension belongs in an isolated Worker/WASM/sandbox path with explicit resource limits and a permission model.
4. Proprietary/private indicators may execute on the secure backend with only calculated outputs sent to the browser.
5. Browser code should maintain a restrictive CSP and avoid `eval()`/arbitrary dynamic code execution.
6. Broker credentials/tokens are unrelated to indicator scripts and must remain protected on the secure broker gateway.

The included `indicator-security.js` is a build-gate foundation. It is not a substitute for full production sandboxing, auditing and resource isolation.
