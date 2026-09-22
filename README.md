This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Merchant-scoped SSE PoC

The device WebView reads `window.npayContext.deviceSerialNo`. The server maps
that value to a merchant and registers the SSE connection in that merchant's
channel. The built-in test values are:

- device serial: `deviceSerialNoMockData`
- merchant code: `merchantCodeMockData`
- bearer token: `test-merchant-token-001`

The PoC resolves these values through asynchronous mock APIs:

- `GET /api/mock/admin/devices?deviceSerialNo=...`
- `GET /api/mock/session/me` with the Vue2 Authorization header

The Vue2 test client sends a notification using the bearer token. A
`merchantCode` supplied in the request body is ignored.

```bash
curl -X POST http://localhost:3000/api/connect/notify \
  -H 'Authorization: Bearer test-merchant-token-001' \
  -H 'Content-Type: application/json' \
  -d '{"message":"결제가 시작되었습니다."}'
```

These mock APIs are for PoC only. Production should replace their URLs with the
admin device API and the real login/session verification API.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
