#!/usr/bin/env python3
"""
Targeted API Performance Test
Tests the specific API endpoint that causes the 5-second delay when switching categories.
"""

import asyncio
import json
import time
import requests
from datetime import datetime
from playwright.async_api import async_playwright

class APIPerformanceTester:
    def __init__(self):
        self.results = {}
        self.screenshots = []
        
    async def direct_api_test(self):
        """Test the API endpoints directly"""
        print("="*60)
        print("DIRECT API PERFORMANCE TEST")
        print("="*60)
        
        # Test different category endpoints
        endpoints = [
            ('Food', 'http://localhost:3006/dev/places?type=food'),
            ('Bar', 'http://localhost:3006/dev/places?type=bar'),
            ('Cafe', 'http://localhost:3006/dev/places?type=cafe'),
            ('Cowork', 'http://localhost:3006/dev/places?type=cowork'),
            ('Dining', 'http://localhost:3006/dev/places?type=dining')
        ]
        
        for category, url in endpoints:
            print(f"\nTesting {category} endpoint: {url}")
            
            # Measure request time
            start_time = time.time()
            try:
                response = requests.get(url, timeout=30)
                end_time = time.time()
                duration = (end_time - start_time) * 1000  # Convert to milliseconds
                
                self.results[category] = {
                    'url': url,
                    'status_code': response.status_code,
                    'duration_ms': duration,
                    'response_size': len(response.content),
                    'success': response.status_code == 200
                }
                
                print(f"  Status: {response.status_code}")
                print(f"  Duration: {duration:.2f}ms ({duration/1000:.2f}s)")
                print(f"  Response Size: {len(response.content)} bytes")
                
                if response.status_code == 200:
                    try:
                        data = response.json()
                        print(f"  Data Length: {len(data)} items")
                    except:
                        print("  Could not parse JSON response")
                else:
                    print(f"  Error Response: {response.text[:200]}...")
                    
            except requests.exceptions.Timeout:
                print(f"  TIMEOUT: Request took longer than 30 seconds")
                self.results[category] = {
                    'url': url,
                    'status_code': 'TIMEOUT',
                    'duration_ms': 30000,
                    'response_size': 0,
                    'success': False,
                    'error': 'Timeout'
                }
            except Exception as e:
                print(f"  ERROR: {str(e)}")
                self.results[category] = {
                    'url': url,
                    'status_code': 'ERROR',
                    'duration_ms': 0,
                    'response_size': 0,
                    'success': False,
                    'error': str(e)
                }
                
    async def browser_based_test(self):
        """Test the category switching behavior in browser"""
        print("\n" + "="*60)
        print("BROWSER-BASED CATEGORY SWITCHING TEST")
        print("="*60)
        
        # Setup browser
        playwright = await async_playwright().start()
        browser = await playwright.chromium.launch(headless=False, devtools=True)
        context = await browser.new_context(viewport={'width': 1920, 'height': 1080})
        page = await context.new_page()
        
        # Track network requests
        network_requests = []
        
        def on_response(response):
            if '/dev/places' in response.url:
                request_data = {
                    'url': response.url,
                    'status': response.status,
                    'timing': None,  # We'll calculate this differently
                    'timestamp': time.time()
                }
                network_requests.append(request_data)
                print(f"API Request detected: {response.url} - Status: {response.status}")
        
        page.on('response', on_response)
        
        try:
            # Navigate to the application
            print("Navigating to application...")
            await page.goto('http://localhost:8084/')
            
            # Wait for initial load
            await page.wait_for_selector('text="Food"', timeout=10000)
            await page.wait_for_selector('text="Bar"', timeout=10000)
            
            # Take initial screenshot
            screenshot_initial = f"/tmp/api_test_initial_{int(time.time())}.png"
            await page.screenshot(path=screenshot_initial, full_page=True)
            self.screenshots.append(screenshot_initial)
            
            print("Initial page loaded successfully")
            
            # Clear network requests
            network_requests.clear()
            
            # Test category switch with precise timing
            print("Clicking on Bar category...")
            switch_start = time.time()
            
            # Click on Bar tab
            bar_tab = await page.query_selector('text="Bar"')
            if bar_tab:
                await bar_tab.click()
            else:
                print("Could not find Bar tab")
                return
                
            # Wait for API response
            print("Waiting for API response...")
            
            timeout_counter = 0
            api_completed = False
            while timeout_counter < 10 and not api_completed:  # 10 second timeout
                await asyncio.sleep(1)
                timeout_counter += 1
                
                # Check if we have API responses
                api_requests = [req for req in network_requests if 'type=bar' in req['url']]
                if api_requests:
                    api_completed = True
                    break
                    
            switch_end = time.time()
            total_switch_time = (switch_end - switch_start) * 1000
            
            # Take screenshot after switch
            screenshot_after = f"/tmp/api_test_after_{int(time.time())}.png"
            await page.screenshot(path=screenshot_after, full_page=True)
            self.screenshots.append(screenshot_after)
            
            print(f"Category switch completed in {total_switch_time:.2f}ms")
            
            # Analyze API requests
            if network_requests:
                print(f"\nAPI Requests captured: {len(network_requests)}")
                for req in network_requests:
                    print(f"  - {req['url']} (Status: {req['status']})")
            else:
                print("No API requests captured")
                
        except Exception as e:
            print(f"Error during browser test: {e}")
        finally:
            await browser.close()
            await playwright.stop()
            
    def analyze_results(self):
        """Analyze and report the performance test results"""
        print("\n" + "="*60)
        print("PERFORMANCE ANALYSIS SUMMARY")
        print("="*60)
        
        if not self.results:
            print("No results to analyze")
            return
            
        # Sort by duration
        sorted_results = sorted(
            self.results.items(),
            key=lambda x: x[1].get('duration_ms', 0),
            reverse=True
        )
        
        print("\nAPI Endpoint Performance (sorted by duration):")
        print("-" * 50)
        
        for category, result in sorted_results:
            if result['success']:
                duration_s = result['duration_ms'] / 1000
                print(f"{category:10} | {duration_s:6.2f}s | {result['status_code']:3} | {result['response_size']:8} bytes")
            else:
                print(f"{category:10} | ERROR   | {result.get('error', 'Unknown error')}")
                
        # Identify the slowest endpoint
        slowest = max(self.results.items(), key=lambda x: x[1].get('duration_ms', 0))
        if slowest[1]['success'] and slowest[1]['duration_ms'] > 3000:  # > 3 seconds
            print(f"\n🚨 SLOW ENDPOINT IDENTIFIED:")
            print(f"   Category: {slowest[0]}")
            print(f"   URL: {slowest[1]['url']}")
            print(f"   Duration: {slowest[1]['duration_ms']/1000:.2f} seconds")
            print(f"   This is likely causing the 5-second delay!")
            
        # Generate detailed report
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        report_file = f"/tmp/api_performance_report_{timestamp}.json"
        
        report_data = {
            'timestamp': timestamp,
            'direct_api_results': self.results,
            'screenshots': self.screenshots,
            'analysis': {
                'slowest_endpoint': slowest[0] if slowest else None,
                'slowest_duration_ms': slowest[1].get('duration_ms', 0) if slowest else 0,
                'total_endpoints_tested': len(self.results),
                'successful_requests': len([r for r in self.results.values() if r['success']]),
                'failed_requests': len([r for r in self.results.values() if not r['success']])
            }
        }
        
        with open(report_file, 'w') as f:
            json.dump(report_data, f, indent=2, default=str)
            
        print(f"\n📄 Detailed report saved to: {report_file}")
        
        if self.screenshots:
            print("📸 Screenshots captured:")
            for screenshot in self.screenshots:
                print(f"   - {screenshot}")
                
    async def run_comprehensive_test(self):
        """Run all performance tests"""
        print("Starting Comprehensive API Performance Analysis...")
        print("This will help identify the root cause of the 5-second delay")
        
        # Test 1: Direct API calls
        await self.direct_api_test()
        
        # Test 2: Browser-based category switching
        await self.browser_based_test()
        
        # Test 3: Analysis and reporting
        self.analyze_results()

async def main():
    tester = APIPerformanceTester()
    await tester.run_comprehensive_test()

if __name__ == "__main__":
    asyncio.run(main())