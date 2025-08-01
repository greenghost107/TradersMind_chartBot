/**
 * Stock ticker detection utility
 * Extracts stock ticker symbols from text messages
 */

function detectStockTickers(message) {
    // Improved pattern using word boundaries to handle comma-separated lists better
    const tickerPattern = /\b([A-Z]{1,5})\b/g;
    const matches = [];
    let match;
    
    // Common words to exclude (not stock tickers)
    const excludeWords = new Set([
        'ATH', 'WH', 'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HER', 'WAS', 'ONE', 'OUR', 'OUT', 'DAY', 'GET', 'HAS', 'HIM', 'HIS', 'HOW', 'ITS', 'MAY', 'NEW', 'NOW', 'OLD', 'SEE', 'TWO', 'WAY', 'WHO', 'BOY', 'DID', 'DOWN', 'EACH', 'EVEN', 'FROM', 'GIVE', 'GOOD', 'HAVE', 'HERE', 'INTO', 'JUST', 'KNOW', 'LIKE', 'LOOK', 'MADE', 'MAKE', 'MAN', 'MANY', 'MORE', 'MOST', 'MOVE', 'MUCH', 'MUST', 'NEED', 'ONLY', 'OVER', 'OWN', 'PUT', 'RIGHT', 'SAID', 'SAME', 'SAY', 'SHE', 'SHOW', 'SOME', 'TAKE', 'THAN', 'THEM', 'THESE', 'THEY', 'THIS', 'TIME', 'VERY', 'WANT', 'WATER', 'WELL', 'WERE', 'WHAT', 'WHEN', 'WHERE', 'WHICH', 'WILL', 'WITH', 'WORK', 'WOULD', 'WRITE', 'YEAR', 'YOUR', 'LONG', 'SHORT', 'BUY', 'SELL', 'BAD', 'GOOD', 'THINK', 'BOUGHT', 'BUYING', 'TRADING'
    ]);
    
    while ((match = tickerPattern.exec(message)) !== null) {
        const ticker = match[1];
        // Filter out common words and ensure reasonable ticker length
        if (ticker.length >= 1 && ticker.length <= 5 && !excludeWords.has(ticker)) {
            matches.push(ticker);
        }
    }
    
    return [...new Set(matches)];
}

module.exports = { detectStockTickers };