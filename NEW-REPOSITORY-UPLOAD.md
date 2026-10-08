# Upload Trade Avata v10.1 Full Native Final Parity to a new GitHub repository

1. Create a new empty GitHub repository.
2. Extract the ZIP package.
3. Open the extracted `TRADE-AVATA-V10.1-FULL-NATIVE-FINAL` folder.
4. Upload **everything inside it**, including the `.github` folder.
5. Commit the files to the `main` branch.
6. Open **Settings → Pages**.
7. Set **Source** to **GitHub Actions**.
8. Open the **Actions** tab and wait for `Deploy Trade Avata Chart`.

The deployment workflow runs:

- `npm test`
- `npm run verify`
- `npm run stress`
- `npm run stress:full-native`
- `npm run stress:native-v3`
- `npm run stress:parity`

before GitHub Pages deployment.

After the deployment is green, test the live site in this order:

1. Candles + Home + Return Live
2. Bid / Ask / Last Price labels and editable line styles
3. candle countdown directly under the current-price label
4. major round-number grid levels and right-side price labels
5. several ordinary timeframes repeatedly
6. Heiken Ashi
7. Renko Pips values
8. Renko Time values
9. EMA/other price indicators during timeframe changes
10. RSI / MACD / Stochastic pane ranges, guide levels and pane resizing
11. crosshair price/time labels and magnet mode
12. drawings + long/short risk-reward tools
13. replay
14. multi-chart layout/range/crosshair synchronization
15. mobile pinch zoom, price-axis drag and small-pane layouts
16. screenshot/share flows

Do not remove or rename the `.github`, `src`, `assets`, `public`, `server`, `scripts`, `tests` or `engines` folders.
