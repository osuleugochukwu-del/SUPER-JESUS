# Trade Avata v8 — Renko and Range Notes

## Native Renko Pips

Trade Avata's **Renko Pips** mode follows the cTrader-style core rule used as the product reference:
- continuation requires one brick-size move in the existing direction;
- reversal requires price to travel two brick sizes in the opposite direction before the reversal brick is confirmed;
- every confirmed brick has a fixed price size.

Production-quality Renko should process live ticks and reconstruct historical Renko from historical ticks when those data are available. Browser/demo reconstruction from OHLC bars is only an approximation because the exact intrabar tick path is unknown.

## Renko Time

**Renko Time is intentionally a separate Trade Avata mode.** cTrader's native Renko is price/pip based; Trade Avata must not label the time-bucket variant as if it were the same native cTrader construction. v8 therefore exposes Renko Pips and Renko Time as different period categories.

## Range Pips

Range Pips is also separate from Renko. Range bars are built around fixed high-low range behaviour, while Renko is directional brick movement.

## Replay

Replay should use the same construction engine as the live/history path. Exact Renko replay requires sufficiently granular source data, preferably ticks. No future ticks/bars may be used after the replay cursor.
