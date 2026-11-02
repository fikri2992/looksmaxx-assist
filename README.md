# Costume Buyer

A costume buyer for crews who can't afford one. Give it a brief and a shoot date. The agent remembers what the team owns and what things really cost, buys at the right moment through PayPal, and returns what didn't make the cut before the deadline.

Built for the PayPal AI Hackathon. Early prototype: PayPal runs in sandbox only, and purchases go through demo shops mirroring real Channel3 listings.

## Run

Needs Node 20+.

```sh
cp .env.example .env.local
node prototypes/costume-buyer/server.mjs
```

Fill in `.env.local`, then open http://localhost:8091.

## License

MIT
