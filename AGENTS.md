# Clinot AI - Setup & Commands

## First Time Setup
```bash
npm install
npm run setup
npm run dev
```

## Development
```bash
npm run dev          # Start dev server on http://localhost:3000
npm run build        # Production build
npm run start        # Start production server
npm run lint         # Run linter
```

## Database
```bash
npm run db:generate  # Generate Prisma client
npm run db:push      # Push schema to database
npm run db:seed      # Seed with demo data
npm run setup        # Full setup (generate + push + seed)
```

## Login
Demo credentials: `admin@clinot.ai` / `admin123`

## Architecture
- Next.js 14 App Router with TypeScript
- SQLite (via Prisma) - no external DB required
- Tailwind CSS for styling
- Recharts for analytics charts
- JSON Web Tokens for auth

## Project Structure
- `src/app/` - Pages and API routes
- `src/components/` - React components
- `src/lib/` - Utilities, auth, DB client
- `prisma/schema.prisma` - Database schema
- Landing page at `/`, Dashboard at `/dashboard`, Chat at `/chat`
