# Albion Royalty Token Platform

Frontend application for the Albion royalty token platform built with SvelteKit.

## Features

- 🔗 **Wallet Integration** - Connect Ethereum/L2 wallets
- 🎯 **Token Minting** - Mint royalty and payment tokens
- 💰 **Balance Tracking** - View token balances from connected wallets
- 📈 **Payout Payouts** - Claim payouts sent to your addresses
- 📚 **Educational Content** - Learn about the Albion platform

## Quick Start

1. **Install dependencies**

   ```bash
   npm ci
   ```

2. **Start development server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:5173](http://localhost:5173) in your browser. The app will automatically reload when you save changes.

## Development Commands

```bash
npm run dev          # Start development server with hot reloading
npm run build        # Build for production
npm run preview      # Preview production build
npm run check        # Run TypeScript and Svelte checks
npm run lint         # Run ESLint
npm run format       # Format code with Prettier
npm run test        # Run unit tests with Vitest
```

## Tech Stack

- **Frontend**: SvelteKit
- **Language**: TypeScript
- **Blockchain**: Ethereum/Layer 2 integration
- **Wallet**: Wagmi + Viem for Web3 connectivity
- **Build Tool**: Vite

## Architecture

- `src/routes/` - SvelteKit pages and API routes
- `src/lib/` - Reusable components and utilities
- `src/app.html` - HTML template

## Blockchain Integration

The application integrates with Ethereum and Layer 2 networks for:

- Smart contract interactions
- Wallet balance queries
- Transaction handling with proper error states
- Network switching capabilities

## Contributing

1. All blockchain transactions require proper error handling
2. Display transaction costs before execution
3. Implement loading states for async operations
4. Test on testnets before mainnet deployment
