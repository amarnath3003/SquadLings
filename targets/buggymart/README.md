# BuggyMart

A deliberately broken, local shop for SquadLings agents to explore. Plain HTML, CSS and JavaScript with a small Node server; no build, new dependencies, API key, external assets, or network services required.

```sh
npm run buggymart
```

Open **http://127.0.0.1:3001**. Run the SquadLings dashboard separately with `npm run ui`, and give Onyx the shop URL and your testing task. The agents' browsers run on this machine, so they can reach the loopback URL directly. Use the same hostname throughout a run.

The store has six products, search, category filtering, price sorting, a product variant, cart quantities, a promo code, and simulated checkout. Prices are USD with tax included, plus $5 shipping. `SAVE10` should deduct 10% from the merchandise subtotal.

Use five agents to cover catalog/search, product details, cart operations, pricing/coupons, and checkout. Ask for reproducible steps, expected versus actual behavior, and severity. All bugs can be reached from the UI; no login, special browser size, source inspection, or real payment is needed. Keep the answer key out of agent prompts.

## Repeat a run

- **Reset demo** in the footer clears the current tab's cart, coupon and order and returns to the shop.
- State survives reloads/navigation using `sessionStorage`. Each independently opened tab/browser has its own state, so agents can work in parallel. Duplicating a tab may copy its initial session state; reset that tab before a fresh run.
- No shipping details are stored. Orders are simulated and the confirmation number is always `BM-1001`.
- A server restart does not clear open tabs; use **Reset demo** in each tab.

## Controls

```sh
npm run buggymart -- --port 3002
npm run buggymart -- --bugs none
npm run buggymart -- --bugs BM-02,BM-09
BUGGYMART_BUGS=none npm run buggymart
npm run test:buggymart
```

All 10 bugs are enabled by default. Restart with a different selection and reload existing tabs to apply it. Reset before comparing runs. The server listens only on `127.0.0.1`. There are no runtime mutation/admin endpoints.

## Maintainer answer key — spoilers

The exact triggers and expected/actual behavior are in [planted-bugs.json](planted-bugs.json). This file and this README are **not served by the website**. The frontend necessarily contains the failure logic and receives enabled IDs; this is a browser QA target, not a hidden-code benchmark.

| ID | Planted failure | Quick trigger |
| --- | --- | --- |
| BM-01 | Low-to-high sort runs backwards | Choose Price: low to high |
| BM-02 | Negative cart quantities and totals | Set a cart quantity to `-2` |
| BM-03 | Large lamp shows `undefined` and `$NaN` | Aurora Lamp → Size → Large |
| BM-04 | Remove reports success but keeps the item | Cart → Remove |
| BM-05 | Add once inserts two units | Add any product once; inspect cart |
| BM-06 | An empty cart can place an order | Reset → Cart → Checkout; fill fictional details |
| BM-07 | Category selection is ignored | Choose Audio; all six products remain |
| BM-08 | Special-character search shows an error page | Search `50%` or `🍕` |
| BM-09 | SAVE10 raises the total | Set Mug quantity to 1; apply SAVE10; $19 becomes $20.40 |
| BM-10 | Mug image is broken | Open the collection or Nimbus Mug detail |

BM-08 displays a simulated 500 error and stack trace in the page; its HTTP response is still 200. BM-10 intentionally returns 404 for the missing image. These are expected failures. Tests verify every bug with bugs on and off, normal checkout, reset, tab isolation, basic mobile fit, and that private files are not exposed. No model calls are made.

This is the simplified implementation of master.md §24 requested for the demo. The older spec's authentication, admin roles, keyboard traps, red-team pages, runtime switches, and automatic scorecard are not implemented.
