# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Albion royalty token platform frontend built with Svelte. This application enables users to:

- Learn about the Albion platform through static content
- Connect Ethereum/L2 wallets
- Mint royalty tokens
- Mint payment tokens
- View token balances from connected wallets
- Claim payouts sent to their addresses

## Architecture

- **Frontend**: Svelte application
- **Blockchain**: Ethereum or Layer 2 network integration
- **Wallet Integration**: Web3 wallet connectivity for token operations
- **Content**: Static educational content about the platform

## Development Commands

_Commands will be updated as the project structure is established. Typical Svelte patterns:_

- `npm ci` - Install dependencies
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm test` - Run tests
- `npm run lint` - Run linting
- `npm run format` - Format code

## Key Components

- Wallet connection and Web3 provider management
- Token minting interfaces (royalty and payment tokens)
- Balance display components
- Payout claiming functionality
- Static content pages for platform education

## Blockchain Integration

- Smart contract interactions for token operations
- Wallet balance queries
- Payout claim transactions
- Network switching between Ethereum mainnet and L2s
- Transaction status handling and user feedback

## Style Guide

### Design Philosophy

- **Clean Geometric Minimalism**: Simple shapes, clear hierarchy, generous whitespace
- **Tech Forward Modernism**: Contemporary, digital-first aesthetic
- **Restrained Palette**: Limited color usage for maximum impact
- **White Background**: Clean, uncluttered base with strategic color accents
- **No Gradients**: Flat design with solid colors only

### Typography

- **Primary Font**: FigTree (from Google Fonts)
- **Titles/Headings**: FigTree Extra Bold
- **Body Text**: FigTree Regular

### Color Palette

- **Black**: #000000 (primary text, strong emphasis)
- **White**: #ffffff (backgrounds, negative space)
- **Primary Blue**: #08bccc (CTAs, interactive elements, key accents)
- **Secondary Blue**: #283c84 (headers, navigation, secondary emphasis)
- **Light Gray**: #f8f4f4 (subtle backgrounds, borders, dividers)

### Usage Guidelines

- Prioritize whitespace and clean layouts over decorative elements
- Use color sparingly - primarily black text on white backgrounds
- Reserve blue colors for interactive elements and key information
- Employ geometric shapes and clean lines
- Maintain consistent spacing and alignment
- Avoid gradients, shadows, and visual effects

## Important Notes

- All blockchain transactions require proper error handling and user confirmation
- Token amounts should be validated both client-side and contract-side
- Always display transaction costs (gas fees) before execution
- Implement proper loading states for blockchain operations
- Test thoroughly on testnets before mainnet deployment
