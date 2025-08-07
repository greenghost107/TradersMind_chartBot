# TradersMind Discord Bot

A Discord bot that automatically detects stock tickers in messages and generates interactive buttons to view stock charts in dedicated user threads.

## Environment Setup Guide

### Development vs Production

**Development Environment:**
- Detailed logging enabled by default (`LOG_LEVEL=debug`)
- All operations logged including cache hits and API calls
- Use `npm run dev` for auto-restart during development
- Best for testing and debugging

**Production Environment:**
- Minimal logging enabled by default (`LOG_LEVEL=warn`)
- Only warnings and errors logged
- Set `NODE_ENV=production` in your environment
- Use `npm start` for production deployment
- Optimized for performance and reduced log noise

## Bot Functionality Overview

### Real-Time Message Scanning
The bot continuously monitors **all messages** posted in Discord channels where it has access. Every message is automatically scanned for potential stock ticker symbols using advanced pattern recognition.

### Intelligent Ticker Detection
- **Pattern Recognition**: Uses regex to identify 1-5 character uppercase sequences (e.g., AAPL, TSLA, CHEF, OKLO)
- **Smart Filtering**: Excludes common English words (THE, AND, FOR, etc.) to prevent false positives
- **Multiple Formats**: Detects tickers in various formats:
  - Comma-separated: `CHEF, AGX, TPR`
  - Space-separated: `AAPL TSLA MSFT`
  - Dollar prefixed: `$AAPL $TSLA`
  - Mixed with text: `Trading OKLO today`
  - Hebrew mixed content: `מניות CHEF ו-AGX עולות`

### Interactive Button System
- **Automatic Generation**: Creates clickable buttons for **every detected ticker** (up to 25 per message)
- **Multiple Rows**: Organizes buttons in rows of 5 for clean presentation
- **Instant Response**: Buttons appear immediately after message scanning

### Personal Thread Management
- **Individual Threads**: Each user gets their own dedicated thread for chart viewing
- **Thread Isolation**: Users can only see their own threads, ensuring privacy
- **Thread Reuse**: Same user clicking multiple tickers uses the same thread
- **Auto-Archive**: Threads automatically archive after 1 hour of inactivity

### Configurable Retention Policy
- **Automatic Cleanup**: Bot-created messages are automatically deleted after configurable hours (default: 26 hours)
- **Cache Management**: When messages are deleted, associated cached chart data is also removed
- **Storage Efficiency**: Prevents Discord channel clutter and reduces storage usage
- **Background Processing**: Cleanup happens automatically without user intervention
- **Customizable Duration**: Set `MESSAGE_RETENTION_HOURS` environment variable (1-168 hours)

### Real-Time Chart Generation
- **Live Data**: Fetches real-time stock prices using Yahoo Finance API as primary source with Alpha Vantage as fallback
- **Dual API Support**: Yahoo Finance for real-time data, Alpha Vantage backup for reliability
- **Interactive Charts**: Generates professional charts using Chart.js and Puppeteer
- **Instant Delivery**: Charts appear directly in user threads within seconds
- **Silent Operation**: No confirmation messages or unnecessary notifications

### Caching & Performance
- **Smart Caching**: Daily cache for stock data and generated charts
- **API Efficiency**: Reduces API calls by reusing same-day data
- **Automatic Cleanup**: Cached data is cleaned up when associated messages are deleted
- **Memory Management**: Expired cache entries are automatically removed

## System Requirements

- **Node.js**: Version 16.0.0 or higher
- **NPM**: Version 7.0.0 or higher (comes with Node.js)
- **Operating System**: Windows, macOS, or Linux
- **Memory**: At least 512MB RAM available
- **Disk Space**: ~200MB for dependencies

### Dependencies

**Runtime Dependencies:**
- `discord.js`: Discord API library for bot functionality
- `axios`: HTTP client for Alpha Vantage API requests
- `yahoo-finance2`: Primary data source for real-time stock prices
- `puppeteer`: Headless browser for chart generation
- `dotenv`: Environment variable management

**Development Dependencies:**
- `@playwright/test`: Testing framework for automated tests
- `nodemon`: Auto-restart development server

## How to Run

### 1. Clone and Install
```bash
git clone <repository-url>
cd tradersmind_discord
npm install
```

### 2. Environment Setup
Create a `.env` file in the root directory. You can copy from `.env.example`:
```bash
cp .env.example .env
```

#### Required Environment Variables
```env
DISCORD_BOT_TOKEN=your_discord_bot_token_here
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_api_key_here
```

#### Optional Environment Variables
```env
# Environment Type
NODE_ENV=development              # Options: development, production (default: development)

# Logging Configuration
LOG_LEVEL=info                    # Options: debug, info, warn, error
                                  # Default: debug in development, warn in production

# Message Retention Policy
MESSAGE_RETENTION_HOURS=26        # How long to keep bot messages (0.1-168 hours, default: 26)

# Caching Configuration
CACHE_TTL_HOURS=24               # How long to cache stock data (hours, default: 24)

# Performance Limits
MAX_TICKERS_PER_MESSAGE=25       # Maximum buttons per message (default: 25)
CHART_TIMEOUT_SECONDS=30         # Chart generation timeout (default: 30)

# Thread Management
THREAD_CLEANUP_HOURS=1           # Thread cleanup interval (default: 1)
```

**Environment Variable Details:**

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `DISCORD_BOT_TOKEN` | **Required** | - | Your Discord bot token |
| `ALPHA_VANTAGE_API_KEY` | **Required** | - | Alpha Vantage API key for fallback data |
| `NODE_ENV` | Optional | `development` | Environment type (affects default log level) |
| `LOG_LEVEL` | Optional | `debug`/`warn` | Logging verbosity level |
| `MESSAGE_RETENTION_HOURS` | Optional | `26` | Auto-delete bot messages after X hours |
| `CACHE_TTL_HOURS` | Optional | `24` | Cache stock data for X hours |
| `MAX_TICKERS_PER_MESSAGE` | Optional | `25` | Maximum ticker buttons per message |
| `CHART_TIMEOUT_SECONDS` | Optional | `30` | Timeout for chart generation |
| `THREAD_CLEANUP_HOURS` | Optional | `1` | Cleanup thread interval |

### 3. Get Required API Keys

**Discord Bot Token:**
1. Go to https://discord.com/developers/applications
2. Click "New Application" → Enter name → Create
3. Go to "Bot" section → Click "Add Bot"
4. Copy the token and add to `.env` file

**Alpha Vantage API Key:**
1. Visit https://www.alphavantage.co/support/#api-key
2. Sign up for free account
3. Copy your API key and add to `.env` file

### 4. Discord Bot Permissions
When adding the bot to your server, ensure these permissions:
- ✅ Send Messages
- ✅ Create Public Threads
- ✅ Send Messages in Threads
- ✅ Embed Links
- ✅ Attach Files
- ✅ Read Message History
- ✅ Use External Emojis

**Bot Intents Required:**
- ✅ Message Content Intent (in Discord Developer Portal)

### 5. Start the Bot
```bash
npm start
```

For development with auto-restart:
```bash
npm run dev
```

## How It Works

### Current Bot Flow

1. **Message Scanning**: Bot monitors all messages for stock tickers using improved regex pattern
2. **Ticker Detection**: Detects 1-5 character uppercase sequences (e.g., AAPL, TSLA, CHEF, OKLO)
3. **Button Generation**: Creates clickable buttons for detected tickers (max 25 per message)
4. **User Interaction**: When user clicks a button:
   - Bot creates/reuses a dedicated thread for that user
   - Fetches real-time stock data using Yahoo Finance (with Alpha Vantage fallback)
   - Generates chart using Puppeteer and Chart.js
   - Posts chart directly in user's thread
   - **No confirmation messages** - silent operation
5. **Thread Management**: 
   - Each user gets their own dedicated thread for charts
   - Threads auto-archive after 1 hour of inactivity
   - **Charts remain permanently** in threads (no auto-deletion)


## Usage Examples

1. User types message with stock tickers (e.g., "I'm buying AAPL and TSLA")
2. Bot responds with clickable ticker buttons
3. User clicks desired ticker button
4. Chart appears instantly in their dedicated thread
5. No additional messages or confirmations needed

## API Limits & Caching

- **Yahoo Finance**: Primary data source (no strict daily limits)
- **Alpha Vantage**: Fallback API with free tier limit of 25 requests per day
- **Intelligent Fallback**: Automatically switches to Alpha Vantage if Yahoo Finance fails
- **Built-in Caching**: Same-day requests use cached data to minimize API calls
- **Chart Caching**: Generated charts cached for same-day requests
- **Auto Cleanup**: Expired cache entries removed hourly

## Development

### File Structure
```
tradersmind_discord/
├── src/                          # Main source directory
│   ├── index.js                  # Main entry point
│   ├── config/
│   │   ├── environment.js        # Environment validation & config
│   │   └── discord.js            # Discord client setup
│   ├── constants/
│   │   └── config.js             # Constants & configuration
│   ├── handlers/
│   │   ├── messageHandler.js     # Message event handling
│   │   ├── interactionHandler.js # Button interaction handling
│   │   └── errorHandler.js       # Global error handling
│   ├── services/
│   │   ├── stockService.js       # Stock data fetching & caching (Alpha Vantage)
│   │   ├── yahooFinanceService.js# Yahoo Finance fallback service
│   │   ├── chartService.js       # Chart generation with Puppeteer
│   │   ├── threadService.js      # Thread management
│   │   ├── messageTrackingService.js # Message tracking for retention
│   │   └── retentionService.js   # Message cleanup & retention policy
│   └── utils/
│       ├── ticker-detector.js    # Ticker detection logic
│       └── logger.js             # Structured logging
├── tests/                        # Test suites
│   ├── ticker-detection.spec.js  # Ticker detection tests
│   ├── retention-policy.spec.js  # Retention policy tests
│   ├── yahoo-fallback.spec.js    # Yahoo Finance fallback tests
│   ├── bot-integration.spec.js   # Full bot integration tests
│   ├── fixtures/
│   │   └── test-users.js         # Test user data
│   └── mocks/
│       └── discord-mock.js       # Discord API mocks
├── utils/                        # Utility files (legacy)
│   └── ticker-detector.js        # Ticker detection (for backwards compatibility)
├── bot.js                        # Legacy main file (kept for backwards compatibility)
├── package.json                  # Dependencies and scripts
├── playwright.config.js          # Test configuration
├── .env.example                  # Environment template
└── README.md                     # This file
```

### Key Functions
- `detectStockTickers()`: Improved ticker detection with word filtering
- `fetchStockData()`: API calls with caching
- `generateChart()`: Puppeteer-based chart generation
- `getOrCreateUserThread()`: Thread management per user

### Scripts
```bash
npm start          # Production start (new structure)
npm run start:old  # Production start (legacy bot.js)
npm run dev        # Development with nodemon (new structure)
npm run dev:old    # Development with nodemon (legacy bot.js)
npm test           # Run tests
```


## Testing

### Running Tests
The project includes comprehensive tests for the ticker detection functionality using Playwright:

```bash
# Install test dependencies (if not already installed)
npm install

# Run all tests
npm test

# Run tests with detailed output
npx playwright test --reporter=list

# Run tests in headed mode (with browser)
npx playwright test --headed
```

### Test Coverage
The comprehensive test suite includes:

**Ticker Detection Tests (`ticker-detection.spec.js`):**
- ✅ `"i bought AGX and CLS"` → Detects `["AGX", "CLS"]`
- ✅ `"i think of buying OKLO"` → Detects `["OKLO"]`
- ✅ `"bad day for trading"` → Returns `[]` (no tickers)
- Multiple ticker formats (comma-separated, space-separated)
- Mixed content with Hebrew text
- Common word filtering (excludes "THE", "AND", "GOOD", etc.)
- Dollar sign prefixes (`$AAPL`)
- Edge cases (empty strings, punctuation only)
- Performance tests with large messages
- Duplicate removal and ticker length validation

**Bot Integration Tests (`bot-integration.spec.js`):**
- Full bot workflow testing
- Message handling and button generation
- Thread creation and management
- Error handling scenarios

**Retention Policy Tests (`retention-policy.spec.js`):**
- Message cleanup functionality
- Retention time validation
- Cache cleanup when messages deleted

**Yahoo Finance Fallback Tests (`yahoo-fallback.spec.js`):**
- Primary API failure scenarios
- Automatic fallback to Alpha Vantage
- Data consistency between APIs

### Test Files Structure
```
tests/
├── ticker-detection.spec.js     # Ticker detection logic tests
├── bot-integration.spec.js      # Full bot integration tests  
├── retention-policy.spec.js     # Message retention tests
├── yahoo-fallback.spec.js       # API fallback tests
├── fixtures/
│   └── test-users.js            # Test user data
└── mocks/
    └── discord-mock.js          # Discord API mocks
playwright.config.js             # Test configuration
```

### Example Test Output
```
Running 15 tests using 1 worker

✓ should detect AGX and CLS from "i bought AGX and CLS"
✓ should detect OKLO from "i think of buying OKLO"  
✓ should return empty array for "bad day for trading"
✓ should handle comma-separated tickers
✓ should filter out common words
...

15 passed (2.3s)
```

## Troubleshooting

### Common Issues
1. **Bot doesn't respond**: Check Message Content Intent is enabled
2. **Permission errors**: Verify bot has thread creation permissions
3. **API errors**: Check Alpha Vantage API key and daily limits
4. **Chart generation fails**: Ensure sufficient memory for Puppeteer

### Logs
The bot provides detailed console logging for debugging:
- `📊 Detected: AAPL, TSLA` - Tickers found
- `🌐 Fetching fresh data for AAPL...` - API calls
- `💾 Cached fresh data for AAPL` - Caching operations
- `📊 Charts sent to username` - Successful operations