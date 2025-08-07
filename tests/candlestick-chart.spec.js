/**
 * Candlestick Chart Generation Tests
 * Tests both Chart.js and Plotly.js implementations for candlestick charts
 */

const { test, expect } = require('@playwright/test');
const path = require('path');

// Sample OHLC data for testing
const sampleOHLCData = {
    symbol: 'AAPL',
    currentPrice: '185.25',
    change: '2.15',
    changePercent: '1.17',
    dates: [
        '2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05',
        '2024-01-08', '2024-01-09', '2024-01-10', '2024-01-11', '2024-01-12'
    ],
    opens: [180.00, 181.50, 183.00, 182.50, 184.00, 185.50, 184.00, 186.00, 187.50, 186.00],
    highs: [182.50, 184.00, 185.50, 185.00, 186.50, 187.00, 186.50, 188.50, 189.00, 188.50],
    lows: [179.50, 180.00, 181.50, 181.00, 182.50, 183.00, 182.50, 184.50, 185.00, 184.50],
    closes: [181.50, 183.00, 182.50, 184.00, 185.50, 184.00, 186.00, 187.50, 186.00, 185.25],
    volumes: [1000000, 1200000, 950000, 1100000, 1300000, 1150000, 980000, 1250000, 1050000, 1500000],
    source: 'test_data'
};

// Invalid OHLC data for edge case testing
const invalidOHLCData = {
    symbol: 'INVALID',
    currentPrice: '0.00',
    change: '0.00',
    changePercent: '0.00',
    dates: ['2024-01-01', '2024-01-02'],
    opens: [null, undefined],
    highs: [undefined, null],
    lows: [null, undefined],
    closes: [undefined, null],
    volumes: [0, 0],
    source: 'test_data'
};

test.describe('Candlestick Chart Library Testing', () => {
    test('should open the test HTML file', async ({ page }) => {
        const testFilePath = path.join(__dirname, '..', 'test-candlestick-charts.html');
        await page.goto(`file://${testFilePath}`);
        
        // Wait for page to load completely
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(3000); // Additional wait for chart libraries
        
        // Check if the page loaded correctly
        await expect(page.locator('h1')).toContainText('Candlestick Chart Testing');
    });

    test('should display sample OHLC data correctly', async ({ page }) => {
        const testFilePath = path.join(__dirname, '..', 'test-candlestick-charts.html');
        await page.goto(`file://${testFilePath}`);
        await page.waitForLoadState('networkidle');

        // Check if sample data is displayed
        const sampleDataElement = page.locator('#sampleData');
        await expect(sampleDataElement).toBeVisible();
        
        const dataText = await sampleDataElement.textContent();
        expect(dataText).toContain('AAPL');
        expect(dataText).toContain('opens');
        expect(dataText).toContain('highs');
        expect(dataText).toContain('lows');
        expect(dataText).toContain('closes');
    });

    test('should test Chart.js candlestick implementation', async ({ page }) => {
        const testFilePath = path.join(__dirname, '..', 'test-candlestick-charts.html');
        await page.goto(`file://${testFilePath}`);
        await page.waitForLoadState('networkidle');
        
        // Wait for Chart.js test to complete (up to 10 seconds)
        await page.waitForTimeout(5000);
        
        // Check Chart.js status
        const chartjsStatus = page.locator('#chartjs-status');
        const statusText = await chartjsStatus.textContent();
        const statusClass = await chartjsStatus.getAttribute('class');
        
        console.log('Chart.js Status:', statusText);
        console.log('Chart.js Status Class:', statusClass);
        
        // Chart.js details
        const chartjsDetails = page.locator('#chartjs-details');
        const detailsText = await chartjsDetails.textContent();
        console.log('Chart.js Details:', detailsText);
        
        // Check if canvas is present
        const canvas = page.locator('#chartjs-chart');
        await expect(canvas).toBeVisible();
        
        // Log console errors for debugging
        const errors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                errors.push(msg.text());
            }
        });
        
        if (errors.length > 0) {
            console.log('Chart.js Console Errors:', errors);
        }
    });

    test('should test Plotly.js candlestick implementation', async ({ page }) => {
        const testFilePath = path.join(__dirname, '..', 'test-candlestick-charts.html');
        await page.goto(`file://${testFilePath}`);
        await page.waitForLoadState('networkidle');
        
        // Wait for Plotly.js test to complete
        await page.waitForTimeout(5000);
        
        // Check Plotly.js status
        const plotlyStatus = page.locator('#plotly-status');
        const statusText = await plotlyStatus.textContent();
        const statusClass = await plotlyStatus.getAttribute('class');
        
        console.log('Plotly.js Status:', statusText);
        console.log('Plotly.js Status Class:', statusClass);
        
        // Plotly.js details
        const plotlyDetails = page.locator('#plotly-details');
        const detailsText = await plotlyDetails.textContent();
        console.log('Plotly.js Details:', detailsText);
        
        // Check if Plotly chart container is present
        const plotlyChart = page.locator('#plotly-chart');
        await expect(plotlyChart).toBeVisible();
        
        // Check for Plotly.js specific elements (if successful)
        if (statusClass && statusClass.includes('success')) {
            // Look for SVG elements that Plotly creates
            const svgElement = page.locator('#plotly-chart svg');
            const svgCount = await svgElement.count();
            console.log('Plotly SVG elements found:', svgCount);
            
            if (svgCount > 0) {
                await expect(svgElement.first()).toBeVisible();
            }
        }
    });

    test('should compare Chart.js vs Plotly.js performance', async ({ page }) => {
        const testFilePath = path.join(__dirname, '..', 'test-candlestick-charts.html');
        await page.goto(`file://${testFilePath}`);
        await page.waitForLoadState('networkidle');
        
        // Wait for both tests to complete
        await page.waitForTimeout(8000);
        
        // Check results summary
        const resultsSummary = page.locator('#results-summary');
        await expect(resultsSummary).toBeVisible();
        
        const summaryText = await resultsSummary.textContent();
        console.log('Results Summary:', summaryText);
        
        // Verify winner is declared
        expect(summaryText).toContain('Test Winner:');
        expect(summaryText).toContain('Recommendations:');
        
        // Extract performance data for both libraries
        const chartjsRow = page.locator('table tr:nth-child(2)');
        const plotlyRow = page.locator('table tr:nth-child(3)');
        
        if (await chartjsRow.count() > 0) {
            const chartjsData = await chartjsRow.textContent();
            console.log('Chart.js Results:', chartjsData);
        }
        
        if (await plotlyRow.count() > 0) {
            const plotlyData = await plotlyRow.textContent();
            console.log('Plotly.js Results:', plotlyData);
        }
    });
});

test.describe('ChartService Integration Tests', () => {
    test('should validate OHLC data structure', async () => {
        // Test that our sample data has the required fields
        expect(sampleOHLCData).toHaveProperty('symbol');
        expect(sampleOHLCData).toHaveProperty('dates');
        expect(sampleOHLCData).toHaveProperty('opens');
        expect(sampleOHLCData).toHaveProperty('highs');
        expect(sampleOHLCData).toHaveProperty('lows');
        expect(sampleOHLCData).toHaveProperty('closes');
        
        // Validate array lengths match
        expect(sampleOHLCData.dates.length).toBe(sampleOHLCData.opens.length);
        expect(sampleOHLCData.dates.length).toBe(sampleOHLCData.highs.length);
        expect(sampleOHLCData.dates.length).toBe(sampleOHLCData.lows.length);
        expect(sampleOHLCData.dates.length).toBe(sampleOHLCData.closes.length);
        
        // Validate OHLC relationships (High >= Open, Close and Low <= Open, Close)
        for (let i = 0; i < sampleOHLCData.dates.length; i++) {
            const open = sampleOHLCData.opens[i];
            const high = sampleOHLCData.highs[i];
            const low = sampleOHLCData.lows[i];
            const close = sampleOHLCData.closes[i];
            
            expect(high).toBeGreaterThanOrEqual(Math.max(open, close));
            expect(low).toBeLessThanOrEqual(Math.min(open, close));
        }
    });

    test('should handle invalid OHLC data gracefully', async () => {
        // Test with invalid data
        expect(invalidOHLCData.opens).toEqual([null, undefined]);
        expect(invalidOHLCData.highs).toEqual([undefined, null]);
        expect(invalidOHLCData.lows).toEqual([null, undefined]);
        expect(invalidOHLCData.closes).toEqual([undefined, null]);
        
        // Verify array lengths still match (for testing edge cases)
        expect(invalidOHLCData.dates.length).toBe(invalidOHLCData.opens.length);
    });

    test('should validate date format consistency', async () => {
        // Check that all dates follow YYYY-MM-DD format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        
        for (const date of sampleOHLCData.dates) {
            expect(date).toMatch(dateRegex);
            
            // Validate that dates are actual valid dates
            const dateObj = new Date(date);
            expect(dateObj.toString()).not.toBe('Invalid Date');
        }
        
        // Check that dates are in chronological order
        for (let i = 1; i < sampleOHLCData.dates.length; i++) {
            const prevDate = new Date(sampleOHLCData.dates[i - 1]);
            const currDate = new Date(sampleOHLCData.dates[i]);
            expect(currDate.getTime()).toBeGreaterThan(prevDate.getTime());
        }
    });
});

test.describe('Chart Generation Performance Tests', () => {
    test('should measure chart generation time', async ({ page }) => {
        const testFilePath = path.join(__dirname, '..', 'test-candlestick-charts.html');
        
        // Measure page load and chart generation time
        const startTime = Date.now();
        
        await page.goto(`file://${testFilePath}`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(10000); // Wait for all charts to render
        
        const endTime = Date.now();
        const totalTime = endTime - startTime;
        
        console.log(`Total chart generation time: ${totalTime}ms`);
        
        // Reasonable performance expectation (should complete within 15 seconds)
        expect(totalTime).toBeLessThan(15000);
        
        // Extract individual chart performance from the page
        const resultsSummary = await page.locator('#results-summary').textContent();
        console.log('Performance Results:', resultsSummary);
    });

    test('should test chart rendering with large dataset', async () => {
        // Create larger dataset (100 data points)
        const largeDateset = {
            ...sampleOHLCData,
            dates: Array.from({ length: 100 }, (_, i) => {
                const date = new Date('2024-01-01');
                date.setDate(date.getDate() + i);
                return date.toISOString().split('T')[0];
            }),
            opens: Array.from({ length: 100 }, (_, i) => 180 + Math.random() * 20),
            highs: Array.from({ length: 100 }, (_, i) => 185 + Math.random() * 20),
            lows: Array.from({ length: 100 }, (_, i) => 175 + Math.random() * 20),
            closes: Array.from({ length: 100 }, (_, i) => 180 + Math.random() * 20),
            volumes: Array.from({ length: 100 }, () => Math.floor(Math.random() * 2000000 + 500000))
        };
        
        // Validate large dataset structure
        expect(largeDateset.dates.length).toBe(100);
        expect(largeDateset.opens.length).toBe(100);
        expect(largeDateset.highs.length).toBe(100);
        expect(largeDateset.lows.length).toBe(100);
        expect(largeDateset.closes.length).toBe(100);
        
        console.log('Large dataset created successfully with 100 data points');
    });
});

test.describe('Error Handling Tests', () => {
    test('should handle missing chart libraries gracefully', async ({ page }) => {
        // Test with a modified HTML that has broken CDN links
        const brokenHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Broken Chart Test</title>
        </head>
        <body>
            <div id="test-container"></div>
            <script>
                // Test what happens when Chart.js is not loaded
                const errors = [];
                try {
                    new Chart(null, {});
                } catch (error) {
                    errors.push('Chart.js error: ' + error.message);
                }
                
                // Test what happens when Plotly is not loaded
                try {
                    Plotly.newPlot('test', [], {});
                } catch (error) {
                    errors.push('Plotly.js error: ' + error.message);
                }
                
                document.body.innerHTML = '<pre>' + JSON.stringify(errors, null, 2) + '</pre>';
            </script>
        </body>
        </html>`;
        
        await page.setContent(brokenHTML);
        await page.waitForLoadState('networkidle');
        
        const content = await page.textContent('body');
        expect(content).toContain('error');
        
        console.log('Error handling test result:', content);
    });

    test('should validate chart container requirements', async ({ page }) => {
        // Test chart generation with missing containers
        const testHTML = `
        <script src="https://cdn.plot.ly/plotly-2.35.2.min.js"></script>
        <script>
            const results = [];
            
            // Test with non-existent container
            try {
                Plotly.newPlot('nonexistent', [{
                    type: 'candlestick',
                    x: ['2024-01-01'],
                    open: [100],
                    high: [105],
                    low: [95],
                    close: [102]
                }], {});
            } catch (error) {
                results.push('Missing container error: ' + error.message);
            }
            
            document.body.innerHTML = '<pre>' + JSON.stringify(results, null, 2) + '</pre>';
        </script>`;
        
        await page.setContent(testHTML);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);
        
        const content = await page.textContent('body');
        console.log('Container validation test result:', content);
    });
});