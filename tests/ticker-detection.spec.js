const { test, expect } = require('@playwright/test');
const { detectStockTickers } = require('../utils/ticker-detector');

test.describe('Stock Ticker Detection', () => {
    
    test.describe('Basic Requirements', () => {
        test('should detect AGX and CLS from "i bought AGX and CLS"', () => {
            const message = "i bought AGX and CLS";
            const result = detectStockTickers(message);
            expect(result).toEqual(expect.arrayContaining(['AGX', 'CLS']));
            expect(result).toHaveLength(2);
        });

        test('should detect OKLO from "i think of buying OKLO"', () => {
            const message = "i think of buying OKLO";
            const result = detectStockTickers(message);
            expect(result).toEqual(['OKLO']);
        });

        test('should return empty array for "bad day for trading"', () => {
            const message = "bad day for trading";
            const result = detectStockTickers(message);
            expect(result).toEqual([]);
        });
    });

    test.describe('Edge Cases', () => {
        test('should handle empty string', () => {
            const result = detectStockTickers("");
            expect(result).toEqual([]);
        });

        test('should handle string with only punctuation', () => {
            const result = detectStockTickers("!@#$%^&*()");
            expect(result).toEqual([]);
        });

        test('should filter out common words', () => {
            const message = "THE GOOD DAY FOR BUYING AAPL AND TSLA";
            const result = detectStockTickers(message);
            expect(result).toEqual(expect.arrayContaining(['AAPL', 'TSLA']));
            expect(result).not.toContain('THE');
            expect(result).not.toContain('GOOD');
            expect(result).not.toContain('DAY');
            expect(result).not.toContain('FOR');
            expect(result).not.toContain('AND');
        });

        test('should handle mixed case text but only detect uppercase tickers', () => {
            const message = "I bought AAPL and thinking about tsla";
            const result = detectStockTickers(message);
            expect(result).toEqual(['AAPL']);
            expect(result).not.toContain('tsla');
        });
    });

    test.describe('Multiple Tickers', () => {
        test('should detect comma-separated tickers', () => {
            const message = "CHEF, AGX, TPR, GEV, PRIM, VIK";
            const result = detectStockTickers(message);
            expect(result).toEqual(expect.arrayContaining(['CHEF', 'AGX', 'TPR', 'GEV', 'PRIM', 'VIK']));
            expect(result).toHaveLength(6);
        });

        test('should detect space-separated tickers', () => {
            const message = "AAPL TSLA MSFT GOOGL";
            const result = detectStockTickers(message);
            expect(result).toEqual(expect.arrayContaining(['AAPL', 'TSLA', 'MSFT', 'GOOGL']));
            expect(result).toHaveLength(4);
        });

        test('should handle mixed separators and spacing', () => {
            const message = "Trading CHEF , AGX ,TPR and OKLO today";
            const result = detectStockTickers(message);
            expect(result).toEqual(expect.arrayContaining(['CHEF', 'AGX', 'TPR', 'OKLO']));
            expect(result).toHaveLength(4);
        });

        test('should handle dollar sign prefix', () => {
            const message = "$AAPL is up, $TSLA down";
            const result = detectStockTickers(message);
            expect(result).toEqual(expect.arrayContaining(['AAPL', 'TSLA']));
            expect(result).toHaveLength(2);
        });
    });

    test.describe('Complex Messages', () => {
        test('should handle Hebrew mixed content', () => {
            const message = "מניות CHEF ו-AGX עולות היום";
            const result = detectStockTickers(message);
            expect(result).toEqual(expect.arrayContaining(['CHEF', 'AGX']));
            expect(result).toHaveLength(2);
        });

        test('should handle real trading message format', () => {
            const message = `❗ מניות שעשו / קרובות ל-ATH שלהן ויכולות להמשיך:
CHEF , AGX ,TPR , GEV , PRIM , VIK , OKLO , SMR , CLS , ECG`;
            const result = detectStockTickers(message);
            expect(result).toEqual(expect.arrayContaining([
                'CHEF', 'AGX', 'TPR', 'GEV', 'PRIM', 'VIK', 'OKLO', 'SMR', 'CLS', 'ECG'
            ]));
            expect(result.length).toBeGreaterThan(5);
        });

        test('should remove duplicates', () => {
            const message = "AAPL is great, bought more AAPL today";
            const result = detectStockTickers(message);
            expect(result).toEqual(['AAPL']);
            expect(result).toHaveLength(1);
        });
    });

    test.describe('Ticker Length Validation', () => {
        test('should detect 1-character tickers', () => {
            const message = "Stock F is good";
            const result = detectStockTickers(message);
            expect(result).toEqual(['F']);
        });

        test('should detect 5-character tickers', () => {
            const message = "GOOGL is a good stock";
            const result = detectStockTickers(message);
            expect(result).toEqual(['GOOGL']);
        });

        test('should ignore very long sequences', () => {
            const message = "VERYLONGSTOCKNAME is not valid";
            const result = detectStockTickers(message);
            expect(result).toEqual([]);
        });
    });

    test.describe('Performance', () => {
        test('should handle large messages efficiently', () => {
            // Generate exactly 60 unique ticker-like strings
            const largeTickers = [];
            for (let i = 0; i < 60; i++) {
                // Create unique 4-letter tickers: XB00 to XB59 style but with letters
                const prefix = 'X';
                const second = String.fromCharCode(66 + Math.floor(i / 26)); // B, C, D...
                const third = String.fromCharCode(66 + (i % 26)); // A-Z cycle  
                const fourth = String.fromCharCode(66 + ((i * 7) % 26)); // Different pattern
                largeTickers.push(`${prefix}${second}${third}${fourth}`);
            }
            const message = largeTickers.join(', ');
            
            const start = Date.now();
            const result = detectStockTickers(message);
            const duration = Date.now() - start;
            
            // Should detect most of the unique tickers
            expect(result.length).toBeGreaterThan(50);
            expect(duration).toBeLessThan(100); // Should complete in under 100ms
        });
    });
});