# TradersMind Discord Bot

A Discord bot that automatically detects stock tickers in messages and generates interactive buttons to view stock charts in dedicated user threads.

## System Requirements

- **Node.js**: Version 16.0.0 or higher
- **NPM**: Version 7.0.0 or higher (comes with Node.js)
- **Operating System**: Windows, macOS, or Linux
- **Memory**: At least 512MB RAM available
- **Disk Space**: ~200MB for dependencies

### Dependencies
- `discord.js`: Discord API library
- `axios`: HTTP client for API requests
- `puppeteer`: Headless browser for chart generation
- `dotenv`: Environment variable management

## How to Run

### 1. Clone and Install
```bash
git clone <repository-url>
cd tradersmind_discord
npm install
```

### 2. Environment Setup
Create a `.env` file in the root directory with:
```env
DISCORD_BOT_TOKEN=your_discord_bot_token_here
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_api_key_here
```

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
- ✅ Attach Files
- ✅ Embed Links
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
3. **Button Generation**: Creates clickable buttons for detected tickers (max 5 per message)
4. **User Interaction**: When user clicks a button:
   - Bot creates/reuses a dedicated thread for that user
   - Fetches real-time stock data from Alpha Vantage API
   - Generates chart using Puppeteer and Chart.js
   - Posts chart directly in user's thread
   - **No confirmation messages** - silent operation
5. **Thread Management**: 
   - Each user gets their own dedicated thread for charts
   - Threads auto-archive after 1 hour of inactivity
   - **Charts remain permanently** in threads (no auto-deletion)

### Improved Features

- **Better Ticker Detection**: Handles comma-separated lists and various formatting
- **Caching System**: Daily cache for stock data and charts to reduce API calls
- **Thread Organization**: Individual threads per user for organized chart viewing
- **Silent Operation**: No unnecessary confirmation messages
- **Persistent Charts**: Charts stay in threads permanently

## Usage Examples

### Stock Detection
The bot detects tickers in various formats:
```
CHEF, AGX, TPR, GEV, PRIM, VIK
$AAPL $TSLA $MSFT
Trading OKLO and SMR today
```

### Supported Message Formats
- Comma-separated: `CHEF, AGX, TPR`
- Space-separated: `AAPL TSLA MSFT`
- Mixed with text: `Trading OKLO today`
- Hebrew mixed content: `מניות CHEF ו-AGX עולות`
- Dollar prefix: `$AAPL is up today`

### User Experience
1. User types message with stock tickers
2. Bot responds with clickable buttons
3. User clicks desired ticker button
4. Chart appears instantly in their dedicated thread
5. No additional messages or confirmations

## API Limits & Caching

- **Alpha Vantage Free Tier**: 25 requests per day
- **Built-in Caching**: Same-day requests use cached data
- **Chart Caching**: Generated charts cached for same-day requests
- **Auto Cleanup**: Expired cache entries removed hourly

## Development

### File Structure
```
tradersmind_discord/
├── bot.js              # Main bot logic
├── package.json        # Dependencies and scripts
├── .env               # Environment variables (create this)
└── README.md          # This file
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

### Code Structure

The bot has been refactored into a modular architecture for better maintainability:

```
src/
├── index.js                    # Main entry point
├── config/
│   ├── environment.js          # Environment validation & config
│   └── discord.js              # Discord client setup
├── services/
│   ├── stockService.js         # Stock data fetching & caching
│   ├── chartService.js         # Chart generation
│   └── threadService.js        # Thread management
├── handlers/
│   ├── messageHandler.js       # Message event handling
│   ├── interactionHandler.js   # Button interaction handling
│   └── errorHandler.js         # Global error handling
├── utils/
│   ├── ticker-detector.js      # Ticker detection (moved from root)
│   └── logger.js               # Structured logging
└── constants/
    └── config.js               # Constants & configuration
```

**Benefits of new structure:**
- ✅ Better separation of concerns
- ✅ Improved testability
- ✅ Easier to maintain and extend
- ✅ Better error handling
- ✅ Structured logging
- ✅ Configuration management

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
The test suite validates:

**Required Test Cases:**
- ✅ `"i bought AGX and CLS"` → Detects `["AGX", "CLS"]`
- ✅ `"i think of buying OKLO"` → Detects `["OKLO"]`
- ✅ `"bad day for trading"` → Returns `[]` (no tickers)

**Additional Test Cases:**
- Multiple ticker formats (comma-separated, space-separated)
- Mixed content with Hebrew text
- Common word filtering (excludes "THE", "AND", "GOOD", etc.)
- Dollar sign prefixes (`$AAPL`)
- Edge cases (empty strings, punctuation only)
- Performance tests with large messages
- Duplicate removal
- Ticker length validation (1-5 characters)

### Test Files Structure
```
tests/
└── ticker-detection.spec.js    # Main test suite
utils/
└── ticker-detector.js          # Extracted testable function
playwright.config.js            # Test configuration
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