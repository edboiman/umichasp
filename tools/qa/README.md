# Run UI checks

Serve the app folder with a local static HTTP server and open `tools/qa/browser-audit.html`. Click **Run complete audit**. It checks every route at six iframe viewport widths in light and dark mode, with additional population and interaction checks. The output is visible JSON.

Run `node tools/qa/verify-static.cjs` for JSON, asset-path, and mocked offline-cache checks. Run `node --check app.js` and `node --check sw.js` for syntax checks. The app has no build, lint, or type-check dependencies.

The full matrix calls the app router directly to avoid browser navigation throttling; five navigation tabs also run through real link clicks. This does not replace physical-device installation tests.
